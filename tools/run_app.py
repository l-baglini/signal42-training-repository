#!/usr/bin/env python3
"""FretGuide — finger-placement dots on live video of your own fretboard.

    python tools/run_app.py -d 4                       # trained model, no enrolment
    python tools/run_app.py -d 4 --backend enrollment  # the old match-to-reference path

Two backends:

  model       (default) A trained net finds the fretboard in every frame from scratch.
              Nothing to click, nothing stuck to the guitar, no reference image. Move the
              guitar, walk about, put it down and pick it up -- each frame is posed on its
              own, so there is nothing to lose lock on.
  enrollment  The earlier path: SIFT-match each frame against one enrolled reference
              photo. Kept because it needs no trained model, but it must be re-enrolled
              whenever the camera or the lighting changes, and that rigidity is exactly
              what the model backend exists to remove.

Keys
  1..7      chords: G Am Bm C D Em F#dim
  s         cycle curated scale boxes
  a         cycle generated scales (any root, whole neck)
  g         toggle the fret/string grid
  f         toggle finger numbers
  m         toggle mirror (if you prefer a mirror-image view)
  d         toggle debug (predicted keypoints and board outline)
  - / =     shrink / grow the dots
  SPACE     freeze/unfreeze
  r         reset temporal smoothing
  q / ESC   quit

The overlay is composited on the frame its pose was computed from, and nothing is drawn
unless the pose passes the trust gate — a dimmed frame with NO LOCK is correct behaviour,
not a bug. v1's failure mode was confidently drawing a wrong overlay.
"""

from __future__ import annotations

import argparse
import sys
import time
from collections import deque
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # repo root, so `fretguide` imports

from fretguide import render
from fretguide.capture import Camera
from fretguide.content import CHORD_IDS, SCALE_IDS, resolve_selection
from fretguide.types import Selection, TrackerStatus

GENERATED = [
    "G major", "E minor", "A minor pentatonic", "E minor pentatonic",
    "C major", "A major", "D dorian", "E blues", "A major pentatonic",
]


class ModelBackend:
    """Per-frame pose from the trained net. No state that can go stale."""

    def __init__(self, model_path: str, device: str, max_fret: int, smooth: bool,
                 min_conf: float):
        from fretguide.predict import FretboardModel

        self.m = FretboardModel.from_ir(model_path, device=device, max_fret=max_fret,
                                        min_conf=min_conf, smooth=smooth)
        self.max_fret = max_fret
        self.last: object | None = None
        self.n_posed = self.n_total = 0

    def update(self, gray, t):
        p = self.m(gray, t)
        self.last = p
        self.n_total += 1
        # A TrackerStatus, not a string: render.draw_hud reads .locked/.inliers/.spread, and
        # both backends have to speak the same language to the same HUD.
        n_kp = 2 * (self.max_fret + 1)
        fields = {"kp": f"{p.n_keypoints}/{n_kp}", "conf": f"{p.mean_conf:.2f}"}
        self.n_posed += p.H is not None
        return p.H, TrackerStatus(locked=p.H is not None, inliers=p.n_keypoints,
                                  spread=p.mean_conf, reason=p.reason, fields=fields)

    def timing(self) -> str:
        p = self.last
        return f"net {p.infer_ms:.0f}ms" if p is not None else ""

    def debug_points(self):
        p = self.last
        if p is None:
            return np.zeros((0, 2))
        return p.pts[p.conf >= self.m.min_conf]

    def reset(self):
        self.m.reset()

    def summary(self) -> str:
        if not self.n_total:
            return ""
        return (f"posed {self.n_posed}/{self.n_total} frames "
                f"({self.n_posed/self.n_total*100:.0f}%)")


class EnrollmentBackend:
    """The earlier match-to-reference tracker, kept for comparison."""

    def __init__(self, path: str, match_width: int, rematch_ms: float, smooth: bool):
        from fretguide.tracker import Enrollment, FretboardTracker, TrackerConfig

        enr = Enrollment.load(path)
        self.enr = enr
        self.max_fret = enr.max_fret
        self.t = FretboardTracker(enr, TrackerConfig(
            match_width=match_width, rematch_interval=rematch_ms / 1000.0, smooth=smooth))

    def update(self, gray, t):
        return self.t.update(gray, t)

    def timing(self) -> str:
        return f"sift {self.t.last_match_ms:.0f}ms lk {self.t.last_lk_ms:.1f}ms"

    def debug_points(self):
        return self.t.last_inlier_pts

    def reset(self):
        self.t.reset()

    def summary(self) -> str:
        return f"re-anchors {self.t.n_matches}, LK propagations {self.t.n_lk}"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("-d", "--device", default="0", help="camera device")
    ap.add_argument("--size", default="1920x1080")
    ap.add_argument("--backend", choices=("auto", "model", "enrollment"), default="auto")
    ap.add_argument("--model", default="models/fretnet.xml")
    ap.add_argument("--infer-device", default="AUTO",
                    help="OpenVINO device: AUTO, CPU, GPU, NPU (see tools/export.py)")
    ap.add_argument("--max-fret", type=int, default=12)
    ap.add_argument("--min-conf", type=float, default=0.15)
    ap.add_argument("--dot-scale", type=float, default=1.0,
                    help="dot size multiplier; also adjustable live with - and =")
    ap.add_argument("--enrollment", default="enrollment.npz")
    ap.add_argument("--display-width", type=int, default=1280)
    ap.add_argument("--match-width", type=int, default=1280,
                    help="enrollment backend: width frames are downscaled to for SIFT")
    ap.add_argument("--rematch-ms", type=float, default=150.0)
    ap.add_argument("--debug", action="store_true")
    ap.add_argument("--no-smooth", action="store_true")
    args = ap.parse_args()

    backend_kind = args.backend
    if backend_kind == "auto":
        backend_kind = "model" if Path(args.model).exists() else "enrollment"
        print(f"backend: {backend_kind} (auto)")

    try:
        if backend_kind == "model":
            back = ModelBackend(args.model, args.infer_device, args.max_fret,
                                not args.no_smooth, args.min_conf)
            print(f"model {args.model} on {args.infer_device}, max fret {args.max_fret}")
        else:
            back = EnrollmentBackend(args.enrollment, args.match_width,
                                     args.rematch_ms, not args.no_smooth)
            print(f"enrollment {args.enrollment}: {len(back.enr.kp_xy)} features, "
                  f"max fret {back.max_fret}")
    except FileNotFoundError as e:
        print(e)
        if backend_kind == "model":
            print("Train one:   python tools/train.py")
            print("Export it:   python tools/export.py --checkpoint models/best.pt")
            print("Or use the older path:  --backend enrollment")
        else:
            print("Run tools/enroll.py first, or use --backend model.")
        return 1

    w, h = (int(x) for x in args.size.lower().split("x"))
    sel = Selection("chord", "G")
    scale_i, gen_i = 0, 0
    show_grid, show_fingers, mirror, frozen = True, True, False, False
    debug = args.debug
    dot_scale = float(args.dot_scale)
    frame_times: deque[float] = deque(maxlen=40)
    held = None

    print(__doc__)
    with Camera(args.device, w, h) as cam:
        print(f"camera {cam.width}x{cam.height}, raw-YUV: {cam.raw_yuv}")
        win = "FretGuide"
        cv2.namedWindow(win, cv2.WINDOW_NORMAL | cv2.WINDOW_GUI_NORMAL)
        cv2.resizeWindow(win, args.display_width,
                         int(args.display_width * cam.height / cam.width))

        while True:
            t_loop = time.perf_counter()
            if not frozen or held is None:
                f = cam.read()
                if f is None:
                    print("camera read failed")
                    break
                # The pose belongs to THIS frame; keep them together so the overlay is
                # never composited onto a newer frame than it was computed from.
                H, status = back.update(f.gray, f.t)
                held = (f.gray, H, status)
            gray, H, status = held

            view = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
            resolved = resolve_selection(sel, max_fret=back.max_fret)
            name = resolved.name if resolved else f"<unknown: {sel.id}>"

            if H is not None and resolved is not None:
                if show_grid:
                    render.draw_grid(view, H, back.max_fret)
                render.draw_selection(view, H, resolved, show_fingers=show_fingers,
                                      dot_scale=dot_scale)
                if debug:
                    render.draw_debug(view, H, back.max_fret, back.debug_points())
            else:
                render.dim(view, 0.5)
                if debug:
                    for x, y in back.debug_points():
                        cv2.circle(view, (int(x), int(y)), 3, (0, 200, 255), -1, cv2.LINE_AA)

            frame_times.append(time.perf_counter() - t_loop)
            fps = 1.0 / max(np.mean(frame_times), 1e-6)
            tail = ("FROZEN " if frozen else "") + back.timing()
            if abs(dot_scale - 1.0) > 1e-6:
                tail += f"  dots x{dot_scale:.1f}"
            render.draw_hud(view, status, name, fps, extra=tail)
            if mirror:
                view = cv2.flip(view, 1)

            cv2.imshow(win, view)
            k = cv2.waitKey(1) & 0xFF
            if k in (27, ord("q")):
                break
            elif ord("1") <= k <= ord("7"):
                sel = Selection("chord", CHORD_IDS[k - ord("1")])
            elif k == ord("s"):
                sel = Selection("scale", SCALE_IDS[scale_i % len(SCALE_IDS)])
                scale_i += 1
            elif k == ord("a"):
                sel = Selection("scale_generated", GENERATED[gen_i % len(GENERATED)])
                gen_i += 1
            elif k == ord("g"):
                show_grid = not show_grid
            elif k == ord("f"):
                show_fingers = not show_fingers
            elif k == ord("m"):
                mirror = not mirror
            elif k == ord("d"):
                debug = not debug
            elif k in (ord("-"), ord("_")):
                dot_scale = max(0.4, dot_scale - 0.1)
            elif k in (ord("="), ord("+")):
                dot_scale = min(2.5, dot_scale + 0.1)
            elif k == ord(" "):
                frozen = not frozen
            elif k == ord("r"):
                back.reset()

        cv2.destroyAllWindows()

    print(f"\n{back.summary()}")
    if frame_times:
        print(f"display loop: {1.0/np.mean(frame_times):.1f} fps mean")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
