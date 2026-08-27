#!/usr/bin/env python3
"""Inspect a saved enrollment — does the stored geometry actually match the guitar?

If the overlay lands in the wrong place, there are only two possible causes:

  A. the enrollment is wrong  — the four clicked corners don't correspond to the real
     nut and 12th fret, so every dot is misplaced no matter how well tracking works;
  B. the tracking is wrong    — the enrollment is fine but the live pose is bad.

This tool settles A without needing the camera. It draws the stored fret grid over the
stored reference image: if those lines don't sit on the real fret wires, the enrollment is
bad and must be redone. Only if this looks right is it worth debugging the tracker.

    python tools/check_enrollment.py                       # enrollment.npz
    python tools/check_enrollment.py --enrollment my.npz --save check.png
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # repo root

from fretguide.geometry import apply_homography, corners_uv, fret_u, grid_lines
from fretguide.tracker import Enrollment
from fretguide.types import UV

ZOOM = 2


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--enrollment", default="enrollment.npz")
    ap.add_argument("--save", default=None, help="write the annotated image here instead of showing it")
    args = ap.parse_args()

    try:
        enr = Enrollment.load(args.enrollment)
    except FileNotFoundError:
        print(f"no enrollment at {args.enrollment!r}")
        return 1

    ref = enr.ref_gray
    h, w = ref.shape[:2]
    print(f"reference image : {w}x{h}")
    print(f"features        : {len(enr.kp_xy)} ({len(enr.kp_xy)/(w*h/10000):.1f} per 100x100 px)")
    print(f"max fret        : {enr.max_fret}")

    corners = apply_homography(enr.H_ref, corners_uv(enr.max_fret))
    print("\nboard corners in the reference image (should be near its four corners if you"
          "\nboxed the fretboard tightly):")
    for name, p in zip(["nut x lowE ", "nut x highE", "f12 x highE", "f12 x lowE "], corners):
        inside = 0 <= p[0] <= w and 0 <= p[1] <= h
        print(f"  {name}  ({p[0]:7.1f}, {p[1]:7.1f}) {'' if inside else '  <-- OUTSIDE the reference image!'}")

    # A degenerate or mirrored click order shows up as a negative/!= expected winding.
    area = 0.5 * abs(sum(corners[i][0] * corners[(i + 1) % 4][1] - corners[(i + 1) % 4][0] * corners[i][1]
                         for i in range(4)))
    frac = area / (w * h)
    print(f"\nboard quad covers {frac*100:.0f}% of the reference image")
    if frac < 0.15:
        print("  ! very small — did you click the fret positions, or something else?")

    view = cv2.cvtColor(cv2.resize(ref, None, fx=ZOOM, fy=ZOOM, interpolation=cv2.INTER_CUBIC),
                        cv2.COLOR_GRAY2BGR)
    for a, b in grid_lines(enr.H_ref, enr.max_fret):
        if np.isfinite([a.x, a.y, b.x, b.y]).all():
            cv2.line(view, (int(a.x * ZOOM), int(a.y * ZOOM)), (int(b.x * ZOOM), int(b.y * ZOOM)),
                     (60, 220, 245), 1, cv2.LINE_AA)
    for n in range(enr.max_fret + 1):
        p = apply_homography(enr.H_ref, UV(fret_u(n), -0.10))[0]
        cv2.putText(view, str(n), (int(p[0] * ZOOM) - 5, int(p[1] * ZOOM)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (60, 220, 245), 1, cv2.LINE_AA)
    for i, p in enumerate(corners):
        cv2.drawMarker(view, (int(p[0] * ZOOM), int(p[1] * ZOOM)), (60, 60, 245),
                       cv2.MARKER_CROSS, 20, 2, cv2.LINE_AA)
        cv2.putText(view, str(i + 1), (int(p[0] * ZOOM) + 6, int(p[1] * ZOOM) - 6),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (60, 60, 245), 2, cv2.LINE_AA)

    if args.save:
        cv2.imwrite(args.save, view)
        print(f"\nwrote {args.save} — do the numbered lines sit on the real fret wires?")
    else:
        print("\nDo the numbered lines sit on the real fret wires? Any key to close.")
        cv2.imshow("enrollment check - lines should land on the frets", view)
        cv2.waitKey(0)
        cv2.destroyAllWindows()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
