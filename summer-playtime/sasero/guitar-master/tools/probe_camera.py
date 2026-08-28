#!/usr/bin/env python3
"""Characterise a camera for tracking suitability.

Answers the questions that actually matter before writing any tracker:
  - What format/resolution/framerate do we really get (not what was requested)?
  - Is the image sharp enough for feature detection?
  - Is the exposure sane, and is it stable frame to frame?

Usage:
    python tools/probe_camera.py                     # /dev/video0
    python tools/probe_camera.py --device 4          # /dev/video4 (e.g. scrcpy sink)
    python tools/probe_camera.py -d 4 --size 1920x1080 --frames 120

Nothing is written to disk and no images are saved.
"""

from __future__ import annotations

import argparse
import time

import cv2
import numpy as np


def fourcc_str(v: int) -> str:
    return "".join(chr((int(v) >> 8 * i) & 0xFF) for i in range(4)).strip("\x00 ")


def sharpness(gray: np.ndarray) -> float:
    """Variance of the Laplacian — the standard focus/blur proxy. Higher is sharper."""
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("-d", "--device", default="0", help="/dev/videoN index or full path")
    ap.add_argument("--size", default=None, help="WxH, e.g. 1920x1080")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--mjpeg", action="store_true", help="request MJPEG (real webcams; not loopback)")
    ap.add_argument("--frames", type=int, default=90)
    ap.add_argument("--buffersize", type=int, default=2,
                    help="V4L2 queue depth. 1 HALVES the framerate — see docs/research/09-local-hardware.md")
    args = ap.parse_args()

    dev = args.device if str(args.device).startswith("/dev/") else int(args.device)
    cap = cv2.VideoCapture(dev, cv2.CAP_V4L2)
    if not cap.isOpened():
        print(f"FAILED to open {dev}. Is the device present and not already in use?")
        return 1

    if args.mjpeg:
        cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
    if args.size:
        w, h = (int(x) for x in args.size.lower().split("x"))
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, w)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, h)
    cap.set(cv2.CAP_PROP_FPS, args.fps)
    if args.buffersize:
        cap.set(cv2.CAP_PROP_BUFFERSIZE, args.buffersize)

    print(f"device            : {dev}")
    print(f"negotiated        : {int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))}x"
          f"{int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))} "
          f"@ {cap.get(cv2.CAP_PROP_FPS):.0f} fps declared, "
          f"fourcc={fourcc_str(cap.get(cv2.CAP_PROP_FOURCC))!r}")

    for _ in range(10):  # warm up; early frames are often stale or mis-exposed
        cap.read()

    times, sharps, means, read_ms = [], [], [], []
    t_prev = time.perf_counter()
    for _ in range(args.frames):
        t0 = time.perf_counter()
        ok, frame = cap.read()
        t1 = time.perf_counter()
        if not ok:
            print("read failed mid-run")
            break
        read_ms.append(1000 * (t1 - t0))
        times.append(t1 - t_prev)
        t_prev = t1
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        sharps.append(sharpness(gray))
        means.append(float(gray.mean()))
    cap.release()

    if not times:
        print("no frames captured")
        return 1

    t = np.array(times)
    s = np.array(sharps)
    m = np.array(means)
    fps = 1.0 / t.mean()

    print(f"frame shape       : {frame.shape}")
    print(f"measured fps      : {fps:.1f}  (over {len(t)} frames)")
    print(f"frame interval    : mean {1000*t.mean():.1f} ms, "
          f"p95 {1000*np.percentile(t, 95):.1f} ms, max {1000*t.max():.1f} ms")
    print(f"read()+decode     : mean {np.mean(read_ms):.1f} ms")
    print(f"sharpness (varLap): mean {s.mean():.0f}, min {s.min():.0f}, max {s.max():.0f}")
    print(f"brightness (0-255): mean {m.mean():.1f}, min {m.min():.1f}, max {m.max():.1f}")

    print("\nassessment")
    if fps < 0.7 * args.fps:
        print(f"  ! fps is {fps:.1f}, well under the requested {args.fps}."
              " Check BUFFERSIZE (1 halves it), lighting, and the source's own frame rate.")
    else:
        print(f"  + framerate is healthy ({fps:.1f} fps)")

    jitter = np.percentile(t, 95) / t.mean()
    print(f"  {'+' if jitter < 1.5 else '!'} timing jitter p95/mean = {jitter:.2f}"
          f"{'' if jitter < 1.5 else '  (uneven delivery; overlay will feel stuttery)'}")

    if s.mean() < 50:
        print(f"  ! image looks soft/blurry (varLap {s.mean():.0f}). Feature matching needs texture:"
              " check focus, move closer, add light so exposure can be shorter.")
    elif s.mean() < 150:
        print(f"  ~ moderate sharpness (varLap {s.mean():.0f}). Usable, but more light would help.")
    else:
        print(f"  + plenty of detail (varLap {s.mean():.0f})")

    if m.mean() < 60:
        print(f"  ! underexposed (mean {m.mean():.0f}/255). More light beats raising exposure,"
              " which adds motion blur.")
    elif m.mean() > 200:
        print(f"  ! overexposed (mean {m.mean():.0f}/255); highlights on a glossy board wash out detail.")
    else:
        print(f"  + exposure is reasonable (mean {m.mean():.0f}/255)")

    if m.std() > 8:
        print(f"  ! brightness drifts across frames (std {m.std():.1f}) — auto-exposure is still"
              " active. Lock it; changing exposure moves the features the tracker relies on.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
