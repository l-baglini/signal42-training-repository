#!/usr/bin/env python3
"""Enrol this guitar: capture one reference image and locate the fretboard in it.

You do this ONCE. Unlike v1's per-session tapping on live video, the four clicks here
land on a frozen still image, so you can be precise and take your time. The result is
saved and reused forever (as long as the fretboard itself doesn't change).

    python tools/enroll.py -d 4
    python tools/enroll.py -d 4 --out my-guitar.npz --max-fret 12

Steps:
  1. Aim so the whole neck is visible and hold still. Press SPACE to freeze a frame.
  2. Drag a box around just the fretboard (this is what gets matched later).
  3. Click 4 points IN THIS ORDER, on the zoomed view:
        nut x low-E (thickest)  ->  nut x high-E (thinnest)
        -> fret 12 x high-E     ->  fret 12 x low-E
     i.e. start at the thick string by the nut and go round the board.
     Press U to undo the last click, ENTER to accept, R to restart.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # repo root, so `fretguide` imports

from fretguide.capture import Camera
from fretguide.geometry import apply_homography, corners_uv, fret_u, grid_lines, solve_homography
from fretguide.tracker import Enrollment
from fretguide.types import UV

PROMPTS = [
    "1/4  NUT  x  LOW E   (thickest string)",
    "2/4  NUT  x  HIGH E  (thinnest string)",
    "3/4  FRET {f}  x  HIGH E (thinnest)",
    "4/4  FRET {f}  x  LOW E  (thickest)",
]
ZOOM = 2  # the clicking view is magnified, since a few px of error here costs accuracy


def freeze_frame(cam: Camera) -> np.ndarray | None:
    win = "enroll - aim at the neck, SPACE to freeze, Q to quit"
    while True:
        f = cam.read()
        if f is None:
            return None
        view = cv2.cvtColor(f.gray, cv2.COLOR_GRAY2BGR)
        cv2.putText(view, "SPACE = freeze this frame", (12, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2, cv2.LINE_AA)
        cv2.imshow(win, view)
        k = cv2.waitKey(1) & 0xFF
        if k == ord(" "):
            cv2.destroyWindow(win)
            return f.gray.copy()
        if k in (27, ord("q")):
            cv2.destroyWindow(win)
            return None


def pick_corners(roi: np.ndarray, max_fret: int) -> list[tuple[float, float]] | None:
    """Click the four board corners on a magnified still. Returns points in ROI pixels."""
    big = cv2.resize(roi, None, fx=ZOOM, fy=ZOOM, interpolation=cv2.INTER_CUBIC)
    base = cv2.cvtColor(big, cv2.COLOR_GRAY2BGR)
    pts: list[tuple[float, float]] = []
    win = "click the 4 board corners"

    def on_mouse(event, x, y, flags, _):
        if event == cv2.EVENT_LBUTTONDOWN and len(pts) < 4:
            pts.append((x / ZOOM, y / ZOOM))

    cv2.namedWindow(win)
    cv2.setMouseCallback(win, on_mouse)
    while True:
        view = base.copy()
        for i, (px, py) in enumerate(pts):
            p = (int(px * ZOOM), int(py * ZOOM))
            cv2.drawMarker(view, p, (60, 60, 245), cv2.MARKER_CROSS, 22, 2, cv2.LINE_AA)
            cv2.putText(view, str(i + 1), (p[0] + 8, p[1] - 8), cv2.FONT_HERSHEY_SIMPLEX,
                        0.6, (60, 60, 245), 2, cv2.LINE_AA)
        if len(pts) >= 2:
            cv2.polylines(view, [np.int32([(x * ZOOM, y * ZOOM) for x, y in pts])],
                          len(pts) == 4, (60, 200, 245), 1, cv2.LINE_AA)
        msg = (PROMPTS[len(pts)].format(f=max_fret) if len(pts) < 4
               else "ENTER = accept    U = undo    R = restart")
        cv2.rectangle(view, (0, 0), (view.shape[1], 34), (20, 20, 20), -1)
        cv2.putText(view, msg, (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.62,
                    (255, 255, 255), 2, cv2.LINE_AA)
        cv2.imshow(win, view)
        k = cv2.waitKey(20) & 0xFF
        if k == ord("u") and pts:
            pts.pop()
        elif k == ord("r"):
            pts.clear()
        elif k in (13, 10) and len(pts) == 4:
            cv2.destroyWindow(win)
            return pts
        elif k in (27, ord("q")):
            cv2.destroyWindow(win)
            return None


def confirm(roi: np.ndarray, H_ref: np.ndarray, max_fret: int) -> bool:
    """Show the projected fret grid so a bad click is caught now, not later."""
    big = cv2.resize(roi, None, fx=ZOOM, fy=ZOOM, interpolation=cv2.INTER_CUBIC)
    view = cv2.cvtColor(big, cv2.COLOR_GRAY2BGR)
    for a, b in grid_lines(H_ref, max_fret):
        cv2.line(view, (int(a.x * ZOOM), int(a.y * ZOOM)), (int(b.x * ZOOM), int(b.y * ZOOM)),
                 (60, 220, 245), 1, cv2.LINE_AA)
    for n in (0, 3, 5, 7, 12):
        if n > max_fret:
            continue
        p = apply_homography(H_ref, UV(fret_u(n), 1.05))[0]
        cv2.putText(view, str(n), (int(p[0] * ZOOM) - 6, int(p[1] * ZOOM)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (60, 220, 245), 2, cv2.LINE_AA)
    cv2.rectangle(view, (0, 0), (view.shape[1], 34), (20, 20, 20), -1)
    cv2.putText(view, "Do the lines sit on the frets?   Y = save    N = redo",
                (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.62, (255, 255, 255), 2, cv2.LINE_AA)
    win = "check the grid"
    while True:
        cv2.imshow(win, view)
        k = cv2.waitKey(20) & 0xFF
        if k in (ord("y"), 13, 10):
            cv2.destroyWindow(win)
            return True
        if k in (ord("n"), 27, ord("q")):
            cv2.destroyWindow(win)
            return False


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("-d", "--device", default="0")
    ap.add_argument("--size", default="1920x1080")
    ap.add_argument("--out", default="enrollment.npz")
    ap.add_argument("--max-fret", type=int, default=12)
    args = ap.parse_args()

    w, h = (int(x) for x in args.size.lower().split("x"))
    print(__doc__)
    with Camera(args.device, w, h) as cam:
        print(f"camera: {cam.width}x{cam.height}, raw-YUV path: {cam.raw_yuv}")
        while True:
            gray = freeze_frame(cam)
            if gray is None:
                print("cancelled")
                return 1

            view = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
            box = cv2.selectROI("drag a box around the FRETBOARD, then ENTER", view, False, False)
            cv2.destroyAllWindows()
            x, y, bw, bh = (int(v) for v in box)
            if bw < 40 or bh < 15:
                print("region too small; try again")
                continue
            roi = gray[y:y + bh, x:x + bw].copy()

            pts = pick_corners(roi, args.max_fret)
            if pts is None:
                print("cancelled")
                return 1
            try:
                H_ref = solve_homography(corners_uv(args.max_fret), pts)
            except (ValueError, np.linalg.LinAlgError) as e:
                print(f"those four points are degenerate ({e}); try again")
                continue

            if not confirm(roi, H_ref, args.max_fret):
                continue

            try:
                enr = Enrollment.build(roi, pts, max_fret=args.max_fret)
            except ValueError as e:
                print(f"enrollment failed: {e}")
                continue

            enr.save(args.out)
            print(f"\nsaved {args.out}")
            print(f"  reference region : {roi.shape[1]}x{roi.shape[0]} px")
            density = enr.feature_density()
            print(f"  features on board: {len(enr.kp_xy)}  ({density:.1f} per 100x100 px of board)")
            if density < 15:
                print("  ! LOW. Tracking will be fragile. A good reference has 30+.")
                print("    Re-shoot: move the camera closer so the neck fills more of the frame,")
                print("    add light from the SIDE (raking light reveals grain and fret ends),")
                print("    and hold still so the frame is sharp.")
            elif density < 30:
                print("  ~ usable, but closer/sharper/better-lit would track more reliably")
            else:
                print("  + good")
            print(f"  max fret         : {enr.max_fret}")
            print("\nNow run:  .venv/bin/python tools/run_app.py -d "
                  f"{args.device} --enrollment {args.out}")
            return 0


if __name__ == "__main__":
    raise SystemExit(main())
