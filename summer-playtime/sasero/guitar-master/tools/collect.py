#!/usr/bin/env python3
"""Collect and label training frames — the 40 minutes that buys automatic detection.

Two modes.

    python tools/collect.py capture -d 4            # grab varied frames while you play
    python tools/collect.py label                   # click 4 corners per frame

You click only FOUR points per frame — the two ends of the board and its two edges — not
every fret. The fret law (u(n) = 1 - 2^(-n/12)) derives everything else, and the trainer
expands those 4 corners into a dozen supervised points along the board edges, so the model
degrades gracefully when your hand covers part of the neck instead of failing outright.

Capture deliberately spaces frames out over time so you get genuine variety (position,
angle, hand placement, lighting) rather than 200 near-identical frames, which would teach
the model nothing.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import tkinter as tk
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageTk

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fretguide.capture import Camera
from fretguide.geometry import (
    apply_homography,
    corners_uv,
    fret_u,
    grid_lines,
    solve_homography,
)
from fretguide.types import UV

DATA = Path("dataset")
PROMPTS = [
    "1/4  NUT end  x  LOW E side  (thickest string edge)",
    "2/4  NUT end  x  HIGH E side (thinnest string edge)",
    "3/4  FRET {f}  x  HIGH E side",
    "4/4  FRET {f}  x  LOW E side",
]

class View:
    """Our own zoom/pan, deliberately not OpenCV's.

    Two bugs came from letting the Qt window zoom: mouse coordinates stopped matching
    image pixels (so drags landed in the wrong place), and Qt's own pan consumed the
    click. Owning the transform fixes both — and because the view is rendered with
    warpAffine, it can pan PAST the edge of the image, which is the only way to reach a
    fret endpoint that lies outside the frame.
    """

    def __init__(self, img_w: int, img_h: int, view_w: int, view_h: int) -> None:
        self.iw, self.ih = img_w, img_h
        self.vw, self.vh = view_w, view_h
        self.fit()

    def fit(self) -> None:
        self.zoom = min(self.vw / self.iw, self.vh / self.ih)
        self.ox = (self.iw - self.vw / self.zoom) / 2.0
        self.oy = (self.ih - self.vh / self.zoom) / 2.0

    def to_img(self, vx: float, vy: float) -> tuple[float, float]:
        return self.ox + vx / self.zoom, self.oy + vy / self.zoom

    def to_view(self, ix: float, iy: float) -> tuple[float, float]:
        return (ix - self.ox) * self.zoom, (iy - self.oy) * self.zoom

    def zoom_at(self, vx: float, vy: float, factor: float) -> None:
        """Zoom keeping the image point under the cursor fixed."""
        ix, iy = self.to_img(vx, vy)
        self.zoom = float(np.clip(self.zoom * factor, 0.05, 40.0))
        self.ox, self.oy = ix - vx / self.zoom, iy - vy / self.zoom

    def pan_by_view(self, dvx: float, dvy: float) -> None:
        self.ox -= dvx / self.zoom
        self.oy -= dvy / self.zoom

    def render(self, img):
        """Rasterise the current view. Areas outside the image come back dark grey."""
        M = np.float32([[self.zoom, 0, -self.ox * self.zoom],
                        [0, self.zoom, -self.oy * self.zoom]])
        return cv2.warpAffine(img, M, (self.vw, self.vh), flags=cv2.INTER_LINEAR,
                              borderMode=cv2.BORDER_CONSTANT, borderValue=(35, 35, 35))


#: Frets carrying position-marker inlays on a typical guitar; 12 is a double marker.
INLAY_FRETS = (3, 5, 7, 9, 12, 15, 17, 19, 21)


# --------------------------------------------------------------------------- #
# capture
# --------------------------------------------------------------------------- #


def cmd_capture(args) -> int:
    out = DATA / "frames"
    out.mkdir(parents=True, exist_ok=True)
    existing = len(list(out.glob("*.png")))
    w, h = (int(x) for x in args.size.lower().split("x"))

    print(f"Capturing {args.n} frames every {args.interval:.1f}s into {out}/ "
          f"({existing} already there)")
    print("PLAY NORMALLY and vary things between shots — move up and down the neck, shift")
    print("how you sit, change the angle a bit, try a lamp on and off. Variety is the whole")
    print("point; 200 identical frames teach the model nothing.\n")
    print("SPACE = grab one now    Q = stop\n")

    with Camera(args.device, w, h) as cam:
        n, last = 0, 0.0
        while n < args.n:
            f = cam.read()
            if f is None:
                break
            view = cv2.cvtColor(f.gray, cv2.COLOR_GRAY2BGR)
            due = time.monotonic() - last >= args.interval
            cv2.putText(view, f"{n}/{args.n} captured   {'READY' if due else '...'}",
                        (12, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8,
                        (0, 255, 0) if due else (0, 200, 255), 2, cv2.LINE_AA)
            cv2.imshow("capture - play normally, vary position", cv2.resize(view, None, fx=0.6, fy=0.6))
            k = cv2.waitKey(1) & 0xFF
            if k in (27, ord("q")):
                break
            if due or k == ord(" "):
                # reject blurry frames outright — they poison a keypoint dataset
                sharp = cv2.Laplacian(f.gray, cv2.CV_64F).var()
                if sharp < args.min_sharp:
                    continue
                path = out / f"f{existing + n:04d}.png"
                cv2.imwrite(str(path), f.gray)
                n += 1
                last = time.monotonic()
        cv2.destroyAllWindows()
    print(f"\nsaved {n} frames. Now run:  .venv/bin/python tools/collect.py label")
    return 0


# --------------------------------------------------------------------------- #
# label
# --------------------------------------------------------------------------- #

def propagate(prev_gray, prev_frets, gray, min_inliers: int = 12):
    """Carry the previous frame's hand-corrected frets onto this frame.

    Consecutive captured frames are seconds apart, so the previous frame's corrected frets
    are a far better starting point than the rigid law — but the guitar has moved, so they
    have to be warped, not copied. A homography is estimated between the two frames and the
    fret endpoints are mapped through it.

    Crucially, features are only taken from INSIDE the previous board outline. Matching the
    whole frame would lock onto the static room and the frets would not follow the guitar —
    the exact failure that made the first tracker useless.

    Returns warped frets, or None if the match wasn't confident (then fall back to copying).
    """
    ns = sorted(prev_frets)
    quad = np.float32([prev_frets[ns[0]][0], prev_frets[ns[0]][1],
                       prev_frets[ns[-1]][1], prev_frets[ns[-1]][0]])
    centre = quad.mean(axis=0)
    grown = (centre + (quad - centre) * 1.10).astype(np.int32)
    mask = np.zeros(prev_gray.shape[:2], np.uint8)
    cv2.fillConvexPoly(mask, grown, 255)

    sift = cv2.SIFT_create(nfeatures=2500)
    kp1, d1 = sift.detectAndCompute(prev_gray, mask)
    kp2, d2 = sift.detectAndCompute(gray, None)
    if d1 is None or d2 is None or len(kp1) < 8 or len(kp2) < 8:
        return None
    raw = cv2.BFMatcher().knnMatch(d1, d2, k=2)
    good = [m for m, n in (p for p in raw if len(p) == 2) if m.distance < 0.75 * n.distance]
    if len(good) < min_inliers:
        return None
    src = np.float32([kp1[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    dst = np.float32([kp2[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
    H, inl = cv2.findHomography(src, dst, cv2.RANSAC, 4.0)
    if H is None or inl is None or int(inl.sum()) < min_inliers:
        return None

    out = {}
    for n in ns:
        p = cv2.perspectiveTransform(
            np.float32(prev_frets[n]).reshape(-1, 1, 2), H).reshape(-1, 2)
        if not np.isfinite(p).all():
            return None
        out[n] = [[float(p[0][0]), float(p[0][1])], [float(p[1][0]), float(p[1][1])]]
    # sanity: the board should not have exploded or collapsed
    h, w = gray.shape[:2]
    allp = np.array([q for n in out for q in out[n]])
    if allp[:, 0].min() < -0.5 * w or allp[:, 0].max() > 1.5 * w:
        return None
    if allp[:, 1].min() < -0.5 * h or allp[:, 1].max() > 1.5 * h:
        return None
    return out



def draw_prediction(canvas, H, far_fret, to_view):
    """Grid plus PREDICTED inlay-dot positions, drawn through the view transform.

    The inlay circles are the useful check: counting fret wires by eye is error-prone, but
    if the circles land on your real dots the geometry is right.
    """
    from fretguide.geometry import fret_centre_u

    for a, b in grid_lines(H, far_fret):
        if np.isfinite([a.x, a.y, b.x, b.y]).all():
            p0, p1 = to_view(a.x, a.y), to_view(b.x, b.y)
            cv2.line(canvas, (int(p0[0]), int(p0[1])), (int(p1[0]), int(p1[1])),
                     (0, 230, 255), 1, cv2.LINE_AA)

    for n in INLAY_FRETS:
        if n > far_fret:
            continue
        u = fret_centre_u(n)
        for v in ((0.30, 0.70) if n == 12 else (0.5,)):   # 12 is a double marker
            p = apply_homography(H, UV(u, v))[0]
            if not np.isfinite(p).all():
                continue
            c = to_view(p[0], p[1])
            cv2.circle(canvas, (int(c[0]), int(c[1])), 8, (18, 18, 18), 2, cv2.LINE_AA)
            cv2.circle(canvas, (int(c[0]), int(c[1])), 8, (90, 120, 255), 1, cv2.LINE_AA)


ARROWS = {81: "left", 82: "up", 83: "right", 84: "down",
          65361: "left", 65362: "up", 65363: "right", 65364: "down",
          2424832: "left", 2490368: "up", 2555904: "right", 2621440: "down"}


class LabelApp:
    """Tkinter labelling UI.

    Deliberately NOT OpenCV's window. OpenCV's Qt viewport pans on left-drag whenever its
    internal zoom exceeds 1, and zooms on the wheel — both unconditional, both fighting our
    own zoom/pan, and `WINDOW_GUI_NORMAL` only removes the toolbar. Owning the toolkit is
    the only way to guarantee left-click edits and never pans.

    Mouse contract, fixed:
        left      place / drag a point — never pans, at any zoom
        wheel     zoom, anchored under the cursor
        wheel-click drag   pan (the only thing that moves the image)
    """

    def __init__(self, frames, labels, labels_path, far_fret, view_w, no_carry, redo):
        self.frames, self.labels, self.labels_path = frames, labels, labels_path
        self.far_fret, self.no_carry = far_fret, no_carry
        self.vw, self.vh = view_w, int(view_w * 9 / 16)
        self.prev_gray, self.prev_frets = None, None
        self.todo = [f for f in frames if f.name not in labels] if not redo else list(frames)
        self.i = -1
        self.quit_all = False

        self.root = tk.Tk()
        self.root.title("FretGuide — label")
        self.canvas = tk.Canvas(self.root, width=self.vw, height=self.vh,
                                highlightthickness=0, bg="#232323")
        self.canvas.pack()
        self.status = tk.Label(self.root, text="", anchor="w", font=("TkDefaultFont", 10),
                               bg="#141414", fg="#f0f0f0")
        self.status.pack(fill="x")
        self.help = tk.Label(self.root, anchor="w", justify="left", bg="#141414", fg="#9a9a9a",
                             font=("TkDefaultFont", 9),
                             text=("left = place/drag    wheel = zoom    WHEEL-CLICK drag = pan    0 = fit\n"
                                   "phase1: [ ] far fret · U undo · Enter->frets    "
                                   "phase2: , . select · E end · arrows nudge · A/Z add/remove · C corners · Enter save\n"
                                   "S skip · D delete · Q save+quit"))
        self.help.pack(fill="x")

        c = self.canvas
        c.bind("<Button-1>", self.on_left_down)
        c.bind("<B1-Motion>", self.on_left_drag)
        c.bind("<ButtonRelease-1>", self.on_left_up)
        c.bind("<Button-2>", self.on_pan_down)      # wheel click
        c.bind("<B2-Motion>", self.on_pan_move)
        c.bind("<ButtonRelease-2>", self.on_pan_up)
        c.bind("<Button-4>", lambda e: self.on_wheel(e, 1))    # X11 wheel up
        c.bind("<Button-5>", lambda e: self.on_wheel(e, -1))   # X11 wheel down
        c.bind("<MouseWheel>", lambda e: self.on_wheel(e, 1 if e.delta > 0 else -1))
        self.root.bind("<Key>", self.on_key)
        c.focus_set()

        self.next_frame()

    # -- frame lifecycle ---------------------------------------------------- #

    def next_frame(self, save: bool = False, delete: bool = False):
        if save and self.frets:
            self.labels[self.path.name] = {
                "frets": {str(n): self.frets[n] for n in sorted(self.frets)},
                "far_fret": int(max(self.frets)),
            }
            self.labels_path.write_text(json.dumps(self.labels, indent=1))
            self.prev_gray = self.gray
            self.prev_frets = {n: [list(v[0]), list(v[1])] for n, v in self.frets.items()}
        if delete:
            self.path.unlink()
            self.labels.pop(self.path.name, None)
            self.labels_path.write_text(json.dumps(self.labels, indent=1))

        self.i += 1
        if self.i >= len(self.todo):
            self.root.quit()
            return
        self.path = self.todo[self.i]
        self.gray = cv2.imread(str(self.path), cv2.IMREAD_GRAYSCALE)
        if self.gray is None:
            self.next_frame()
            return
        self.img = cv2.cvtColor(self.gray, cv2.COLOR_GRAY2BGR)
        self.view = View(self.gray.shape[1], self.gray.shape[0], self.vw, self.vh)
        self.pts, self.frets = [], {}
        self.phase, self.sel, self.end_mode = 1, 0, 0
        self.drag = None
        self.panning = None
        self.seeded = ""

        prev = self.labels.get(self.path.name)
        if prev and isinstance(prev, dict) and "frets" in prev:
            self.frets = {int(k): [list(map(float, v[0])), list(map(float, v[1]))]
                          for k, v in prev["frets"].items()}
            self.far_fret, self.phase, self.seeded = int(prev.get("far_fret", self.far_fret)), 2, "reopened"
        elif self.prev_frets is not None and not self.no_carry:
            w = propagate(self.prev_gray, self.prev_frets, self.gray)
            self.frets = w if w is not None else {n: [list(p[0]), list(p[1])]
                                                  for n, p in self.prev_frets.items()}
            self.far_fret, self.phase = max(self.frets), 2
            self.seeded = "carried+warped" if w is not None else "carried (match failed)"
        if self.frets:
            self.sel = min(self.frets)
        self.render()

    # -- geometry helpers --------------------------------------------------- #

    def handles(self):
        if self.phase == 1:
            return [((i,), p[0], p[1]) for i, p in enumerate(self.pts)]
        return [((n, e), self.frets[n][e][0], self.frets[n][e][1])
                for n in sorted(self.frets) for e in (0, 1)]

    def quad_ok(self):
        q = self.pts
        if len(q) != 4:
            return False
        s = []
        for i in range(4):
            a, b, cc = np.array(q[i]), np.array(q[(i + 1) % 4]), np.array(q[(i + 2) % 4])
            s.append(np.sign(np.cross(b - a, cc - b)))
        return abs(sum(s)) == 4

    # -- events ------------------------------------------------------------- #

    def on_wheel(self, e, direction):
        self.view.zoom_at(e.x, e.y, 1.25 if direction > 0 else 1 / 1.25)
        self.render()

    def on_pan_down(self, e):
        self.panning = (e.x, e.y)

    def on_pan_move(self, e):
        if self.panning:
            self.view.pan_by_view(e.x - self.panning[0], e.y - self.panning[1])
            self.panning = (e.x, e.y)
            self.render()

    def on_pan_up(self, e):
        self.panning = None

    def on_left_down(self, e):
        for key, hx, hy in self.handles():
            vx, vy = self.view.to_view(hx, hy)
            if abs(vx - e.x) < 12 and abs(vy - e.y) < 12:
                self.drag = key
                if self.phase == 2:
                    self.sel = key[0]
                self.render()
                return
        if self.phase == 1 and len(self.pts) < 4:
            self.pts.append(list(self.view.to_img(e.x, e.y)))
            self.render()

    def on_left_drag(self, e):
        if self.drag is None:
            return
        ix, iy = self.view.to_img(e.x, e.y)
        if self.phase == 1:
            self.pts[self.drag[0]] = [ix, iy]
        else:
            self.frets[self.drag[0]][self.drag[1]] = [ix, iy]
        self.render()

    def on_left_up(self, e):
        self.drag = None

    def on_key(self, e):
        k, sym = e.char.lower(), e.keysym
        if k == "s":
            return self.next_frame()
        if k == "d":
            return self.next_frame(delete=True)
        if k == "q":
            self.quit_all = True
            return self.root.quit()
        if k == "0":
            self.view.fit()
        elif k in ("+", "="):
            self.view.zoom_at(self.vw / 2, self.vh / 2, 1.25)
        elif k == "-":
            self.view.zoom_at(self.vw / 2, self.vh / 2, 1 / 1.25)
        elif self.phase == 1:
            if k == "[":
                self.far_fret = max(5, self.far_fret - 1)
            elif k == "]":
                self.far_fret = min(24, self.far_fret + 1)
            elif k == "u" and self.pts:
                self.pts.pop()
            elif sym in ("Return", "KP_Enter") and self.quad_ok():
                H = solve_homography(corners_uv(self.far_fret), self.pts)
                self.frets = {n: [list(map(float, apply_homography(H, UV(fret_u(n), v))[0]))
                                  for v in (0.0, 1.0)] for n in range(self.far_fret + 1)}
                self.phase, self.sel = 2, 0
        else:
            step = 1.0 / max(self.view.zoom, 0.2)   # one on-screen pixel at any zoom
            if sym in ("Left", "Right", "Up", "Down") and self.frets:
                dx = -step if sym == "Left" else step if sym == "Right" else 0.0
                dy = -step if sym == "Up" else step if sym == "Down" else 0.0
                for end in ((0, 1) if self.end_mode == 0 else (self.end_mode - 1,)):
                    self.frets[self.sel][end][0] += dx
                    self.frets[self.sel][end][1] += dy
            elif k == ",":
                ns = sorted(self.frets)
                self.sel = ns[(ns.index(self.sel) - 1) % len(ns)]
            elif k == ".":
                ns = sorted(self.frets)
                self.sel = ns[(ns.index(self.sel) + 1) % len(ns)]
            elif k == "e":
                self.end_mode = (self.end_mode + 1) % 3
            elif k == "c":
                self.phase = 1
            elif k == "a":
                n = max(self.frets) + 1
                if n <= 24 and n - 2 in self.frets:
                    p2, p1 = self.frets[n - 2], self.frets[n - 1]
                    self.frets[n] = [[p1[i][0] + (p1[i][0] - p2[i][0]) * 0.94,
                                      p1[i][1] + (p1[i][1] - p2[i][1]) * 0.94] for i in (0, 1)]
            elif k == "z" and len(self.frets) > 4:
                self.frets.pop(max(self.frets))
                self.sel = min(self.sel, max(self.frets))
            elif sym in ("Return", "KP_Enter"):
                return self.next_frame(save=True)
        self.render()

    # -- drawing ------------------------------------------------------------ #

    def render(self):
        canvas = self.view.render(self.img)
        tv = self.view.to_view

        if self.phase == 1:
            if len(self.pts) >= 2:
                poly = np.int32([tv(p[0], p[1]) for p in self.pts])
                cv2.polylines(canvas, [poly], len(self.pts) == 4,
                              (90, 220, 90) if (len(self.pts) < 4 or self.quad_ok()) else (60, 60, 245),
                              2, cv2.LINE_AA)
            if self.quad_ok():
                try:
                    draw_prediction(canvas, solve_homography(corners_uv(self.far_fret), self.pts),
                                    self.far_fret, tv)
                except Exception:
                    pass
            for i, p in enumerate(self.pts):
                v = tv(p[0], p[1])
                cv2.circle(canvas, (int(v[0]), int(v[1])), 5, (60, 60, 245), -1, cv2.LINE_AA)
                cv2.putText(canvas, str(i + 1), (int(v[0]) + 8, int(v[1]) - 8),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (60, 60, 245), 2, cv2.LINE_AA)
            msg = (PROMPTS[len(self.pts)].format(f=self.far_fret) if len(self.pts) < 4
                   else ("corners cross over — drag into a simple 4-sided shape" if not self.quad_ok()
                         else f"far edge = FRET {self.far_fret}   ([ / ])   Enter -> adjust frets"))
        else:
            for n in sorted(self.frets):
                a, b = self.frets[n]
                p0, p1 = tv(a[0], a[1]), tv(b[0], b[1])
                chosen = (n == self.sel)
                col = (90, 255, 90) if chosen else ((120, 160, 255) if n in INLAY_FRETS
                                                    else (0, 230, 255))
                cv2.line(canvas, (int(p0[0]), int(p0[1])), (int(p1[0]), int(p1[1])),
                         col, 2 if chosen else 1, cv2.LINE_AA)
                for end, p in ((0, p0), (1, p1)):
                    r = 5 if (chosen and self.end_mode in (0, end + 1)) else 3
                    cv2.circle(canvas, (int(p[0]), int(p[1])), r + 1, (18, 18, 18), -1, cv2.LINE_AA)
                    cv2.circle(canvas, (int(p[0]), int(p[1])), r, col, -1, cv2.LINE_AA)
                mid = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
                cv2.putText(canvas, str(n), (int(mid[0]) - 6, int(mid[1]) + 4),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.42, col, 1, cv2.LINE_AA)
            ends = ("both ends", "low-E end", "high-E end")[self.end_mode]
            msg = (f"fret {self.sel} of 0-{max(self.frets)} ( , / . )   arrows move {ends} (E)   "
                   f"Enter = save" + (f"   [{self.seeded}]" if self.seeded else ""))

        rgb = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB)
        self.photo = ImageTk.PhotoImage(Image.fromarray(rgb))
        self.canvas.delete("all")
        self.canvas.create_image(0, 0, anchor="nw", image=self.photo)
        done = len(self.labels)
        self.status.config(
            text=f"  {self.path.name}   [{self.i + 1}/{len(self.todo)}]   "
                 f"phase {self.phase}   {self.view.zoom:.1f}x   labelled {done}   |   {msg}")

    def run(self):
        self.root.mainloop()
        self.labels_path.write_text(json.dumps(self.labels, indent=1))
        self.root.destroy()
        return len(self.labels)


def cmd_label(args) -> int:
    frames = sorted((DATA / "frames").glob("*.png"))
    if not frames:
        print("no frames yet — run `collect.py capture` first")
        return 1
    labels_path = DATA / "labels.json"
    labels = json.loads(labels_path.read_text()) if labels_path.exists() else {}
    print(f"{len(labels)}/{len(frames)} already labelled\n")
    print("left = place/drag (never pans)   wheel = zoom   WHEEL-CLICK drag = pan   0 = fit")
    app = LabelApp(frames, labels, labels_path, args.far_fret, args.view_width,
                   args.no_carry, args.redo)
    n = app.run()
    print(f"\n{n} labelled frames in {labels_path}")
    print("  " + ("enough to train a first model" if n >= 100 else f"aim for ~150; {150 - n} to go"))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("capture", help="grab varied frames from the camera")
    c.add_argument("-d", "--device", default="4")
    c.add_argument("--size", default="1920x1080")
    c.add_argument("-n", type=int, default=180)
    c.add_argument("--interval", type=float, default=2.5)
    c.add_argument("--min-sharp", type=float, default=60.0)
    c.set_defaults(func=cmd_capture)

    lab = sub.add_parser("label", help="click 4 corners per frame")
    lab.add_argument("--redo", action="store_true", help="re-label frames already done")
    lab.add_argument("--no-carry", action="store_true",
                   help="do not seed each frame from the previous one")
    lab.add_argument("--view-width", type=int, default=1500, help="window width in px")
    lab.add_argument("--far-fret", type=int, default=12,
                   help="which fret points 3/4 sit on (adjustable live with [ and ])")
    lab.set_defaults(func=cmd_label)

    args = ap.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
