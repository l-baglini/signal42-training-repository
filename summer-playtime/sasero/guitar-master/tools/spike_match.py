#!/usr/bin/env python3
"""Spike: can we track this fretboard by matching it against a reference frame?

This is the go/no-go experiment. It reproduces the approach Wang & Ohya (2018)
measured at 2.3-4.5 mm in-image error on fretboard corners — enrol a reference frame,
then match every later frame *back to the reference* (never to the previous frame, so
drift cannot accumulate) and fit a homography with RANSAC.

SIFT is used deliberately: it is already installed, and it answers the question that
matters first — **does this fretboard carry enough texture?** It is too slow for
realtime (Wang & Ohya got 0.4 fps with it); XFeat replaces it later for speed. If SIFT
finds plenty of well-spread inliers, a faster learned matcher will too.

Usage:
    python tools/spike_match.py -d 4                 # then follow on-screen prompts
    python tools/spike_match.py -d 4 --width 1280    # match at a lower resolution

Controls:  SPACE = capture reference   R = re-select region   Q/ESC = quit
Nothing is written to disk.
"""

from __future__ import annotations

import argparse
import time

import cv2
import numpy as np

RATIO = 0.75  # Lowe ratio test; lower = stricter


def open_camera(dev, w: int, h: int):
    cap = cv2.VideoCapture(dev, cv2.CAP_V4L2)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, w)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, h)
    cap.set(cv2.CAP_PROP_FPS, 30)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 2)
    if not cap.isOpened():
        raise SystemExit(f"could not open {dev}")
    return cap


def grey(frame: np.ndarray) -> np.ndarray:
    return frame if frame.ndim == 2 else cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("-d", "--device", default="0")
    ap.add_argument("--size", default="1920x1080")
    ap.add_argument("--width", type=int, default=1280, help="downscale width used for matching")
    ap.add_argument("--nfeatures", type=int, default=4000)
    ap.add_argument("--reproj", type=float, default=3.0, help="RANSAC reprojection threshold, px")
    args = ap.parse_args()

    dev = args.device if str(args.device).startswith("/dev/") else int(args.device)
    W, H = (int(x) for x in args.size.lower().split("x"))
    cap = open_camera(dev, W, H)

    sift = cv2.SIFT_create(nfeatures=args.nfeatures)
    matcher = cv2.BFMatcher()

    scale = None
    ref_kp = ref_des = ref_shape = None
    roi = None
    stats: list[tuple[int, float, float]] = []  # (inliers, spread, ms)

    print(__doc__.split("Usage:")[0])
    print("Aim the phone so the whole neck (nut through fret 12) is visible, then press SPACE.\n")

    while True:
        ok, frame = cap.read()
        if not ok:
            print("read failed")
            break
        g = grey(frame)
        if scale is None:
            scale = args.width / g.shape[1]
        small = cv2.resize(g, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        view = cv2.cvtColor(small, cv2.COLOR_GRAY2BGR)

        if ref_des is not None:
            t0 = time.perf_counter()
            kp, des = sift.detectAndCompute(small, None)
            n_in, spread = 0, 0.0
            if des is not None and len(kp) >= 4:
                raw = matcher.knnMatch(ref_des, des, k=2)
                good = [m for m, n in (p for p in raw if len(p) == 2) if m.distance < RATIO * n.distance]
                if len(good) >= 4:
                    src = np.float32([ref_kp[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
                    dst = np.float32([kp[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
                    Hm, mask = cv2.findHomography(src, dst, cv2.RANSAC, args.reproj)
                    if Hm is not None and mask is not None:
                        inl = mask.ravel().astype(bool)
                        n_in = int(inl.sum())
                        xs = src.reshape(-1, 2)[inl, 0]
                        if n_in >= 2 and ref_shape:
                            # fraction of the reference region's width the inliers span,
                            # i.e. the along-neck baseline. Short baseline == unusable fit.
                            spread = float(xs.max() - xs.min()) / ref_shape[1]
                        # draw the reference region projected into the live frame
                        h0, w0 = ref_shape
                        quad = np.float32([[0, 0], [w0, 0], [w0, h0], [0, h0]]).reshape(-1, 1, 2)
                        proj = cv2.perspectiveTransform(quad, Hm).reshape(-1, 2).astype(int)
                        colour = (0, 220, 0) if (n_in >= 20 and spread > 0.35) else (0, 165, 255)
                        cv2.polylines(view, [proj], True, colour, 2, cv2.LINE_AA)
                        for p in dst.reshape(-1, 2)[inl].astype(int):
                            cv2.circle(view, tuple(p), 2, colour, -1)
            ms = (time.perf_counter() - t0) * 1000
            stats.append((n_in, spread, ms))
            cv2.putText(view, f"inliers {n_in:4d}  spread {spread:.2f}  {ms:5.1f} ms",
                        (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2, cv2.LINE_AA)
        else:
            cv2.putText(view, "SPACE = capture reference", (10, 24),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2, cv2.LINE_AA)

        cv2.imshow("fretboard match spike", view)
        key = cv2.waitKey(1) & 0xFF
        if key in (27, ord("q")):
            break
        if key == ord(" ") or (key == ord("r") and ref_des is not None):
            cv2.destroyWindow("fretboard match spike")
            box = cv2.selectROI("select the FRETBOARD only, then ENTER", view, False, False)
            cv2.destroyWindow("select the FRETBOARD only, then ENTER")
            if box[2] < 10 or box[3] < 10:
                print("region too small, ignored")
                continue
            x, y, w, h = (int(v) for v in box)
            roi = small[y:y + h, x:x + w].copy()
            ref_kp, ref_des = sift.detectAndCompute(roi, None)
            ref_shape = roi.shape[:2]
            stats.clear()
            print(f"reference captured: region {w}x{h} px, {len(ref_kp)} SIFT keypoints "
                  f"({len(ref_kp)/(w*h/10000):.1f} per 100x100 px)")
            if len(ref_kp) < 100:
                print("  ! few keypoints — the board may be too plain, too soft, or too small "
                      "in frame. Try more light, a closer camera, or raking side-light.")

    cap.release()
    cv2.destroyAllWindows()

    if stats:
        a = np.array(stats)
        inl, spr, ms = a[:, 0], a[:, 1], a[:, 2]
        locked = (inl >= 20) & (spr > 0.35)
        print("\n" + "=" * 62)
        print(f"frames matched      : {len(a)}")
        print(f"inliers             : mean {inl.mean():.0f}, median {np.median(inl):.0f}, "
              f"min {inl.min():.0f}, max {inl.max():.0f}")
        print(f"baseline spread     : mean {spr.mean():.2f}, min {spr.min():.2f}")
        print(f"match time          : mean {ms.mean():.0f} ms  ({1000/ms.mean():.1f} fps if unassisted)")
        print(f"usable-pose frames  : {100*locked.mean():.0f}%  (>=20 inliers and >0.35 spread)")
        print("=" * 62)
        if locked.mean() > 0.8:
            print("VERDICT: texture is sufficient. Proceed to XFeat for speed.")
        elif locked.mean() > 0.4:
            print("VERDICT: marginal. Improve lighting/framing and re-run before deciding.")
        else:
            print("VERDICT: texture is NOT sufficient as framed. Fix light/distance/focus first;\n"
                  "         if it stays poor, the trained-detector route (Track B) is indicated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
