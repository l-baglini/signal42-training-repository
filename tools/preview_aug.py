#!/usr/bin/env python3
"""Write out what the trainer ACTUALLY sees, so you can look at it before training.

    python tools/preview_aug.py                      # -> diagnostics/aug_preview.png
    python tools/preview_aug.py -n 12 --seed 3

The network is never shown your captured photographs. On every step the augmentation
manufactures a new image from them -- rotated, scaled, moved, dimmed, blurred, partly
occluded, and usually with the neck cut out and composited onto a different frame's
background. Those manufactured images live for microseconds inside the data loader and are
never written to disk, which makes them the easiest part of the whole system to get wrong
without noticing.

Two real bugs hid in exactly there, both obvious the moment the images were looked at:

  1. Every background came from another frame of the same session, and every one of those
     contains the same guitar. So the manufactured image held two or three fretboards and
     the label named only one -- training the net to answer "not a fretboard" on real
     fretboards.
  2. Cutting the kept region along the board quad drew a seam exactly around the answer, so
     "the fretboard is inside the boundary" scored well without learning any appearance.

This script exists so that failure mode is a thirty-second check instead of an hour of GPU
time. Green lines are the labels. What to look for:

  - exactly ONE sharp fretboard per tile, with the green lines sitting on it
  - other necks (from backgrounds) smeared beyond recognition
  - several sharp patches of real content per tile, only one holding a neck
  - the board in a different place, size and angle in every tile
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # repo root, so `fretguide` imports

from fretguide.dataset import (
    DEFAULT_MAX_FRET,
    AugConfig,
    erase_board,
    load_dataset,
    make_sample,
)
from fretguide.geometry import apply_homography, fret_u
from fretguide.types import UV


def draw_labels(img: np.ndarray, H_in: np.ndarray, max_fret: int) -> np.ndarray:
    view = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    for n in range(max_fret + 1):
        a, b = apply_homography(H_in, [UV(fret_u(n), 0.0), UV(fret_u(n), 1.0)])
        if np.isfinite(a).all() and np.isfinite(b).all():
            cv2.line(view, tuple(np.int32(a)), tuple(np.int32(b)), (60, 240, 60), 1, cv2.LINE_AA)
    return view


def label_tile(img: np.ndarray, text: str) -> np.ndarray:
    cv2.rectangle(img, (0, 0), (img.shape[1], 20), (0, 0, 0), -1)
    cv2.putText(img, text, (6, 15), cv2.FONT_HERSHEY_SIMPLEX, 0.45,
                (255, 255, 255), 1, cv2.LINE_AA)
    return img


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--frames", default="dataset/frames")
    ap.add_argument("--labels", default="dataset/labels.json")
    ap.add_argument("--out-dir", default="diagnostics")
    ap.add_argument("-n", type=int, default=9, help="how many samples to draw")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--max-fret", type=int, default=DEFAULT_MAX_FRET)
    ap.add_argument("--no-bg-replace", action="store_true",
                    help="show what geometry-only augmentation looked like (the failure)")
    args = ap.parse_args()

    frames = load_dataset(args.frames, args.labels, args.max_fret)
    if len(frames) < 2:
        print(f"need at least 2 labelled frames, found {len(frames)}")
        return 1
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    cfg = AugConfig()
    if args.no_bg_replace:
        cfg.bg_replace_p = 0.0
    rng = np.random.default_rng(args.seed)

    cache: dict[int, np.ndarray] = {}

    def gray(i: int) -> np.ndarray:
        if i not in cache:
            cache[i] = cv2.imread(str(frames[i].path), cv2.IMREAD_GRAYSCALE)
        return cache[i]

    tiles = []
    for _ in range(args.n):
        i = int(rng.integers(0, len(frames)))
        j = int(rng.integers(0, len(frames) - 1))
        j += j >= i
        img, _hm, H_in = make_sample(gray(i), frames[i].H, rng, cfg, args.max_fret,
                                     bg_gray=gray(j), bg_H=frames[j].H)
        tile = draw_labels(img, H_in, args.max_fret)
        tiles.append(label_tile(cv2.resize(tile, (426, 256)),
                                f"neck from {frames[i].path.name}  bg from {frames[j].path.name}"))

    cols = 3
    rows = [np.hstack(tiles[k:k + cols]) for k in range(0, len(tiles) - len(tiles) % cols, cols)]
    grid = np.vstack(rows)
    p = out_dir / ("aug_preview_no_bg.png" if args.no_bg_replace else "aug_preview.png")
    cv2.imwrite(str(p), grid)
    print(f"wrote {p}   ({args.n} manufactured training images, green = the labels)")

    # Side by side: a captured frame, and the same frame with its neck erased, which is
    # what it looks like when it is used as somebody else's background.
    f = frames[len(frames) // 3]
    g = gray(len(frames) // 3)
    pair = np.hstack([
        label_tile(cv2.cvtColor(cv2.resize(g, (640, 360)), cv2.COLOR_GRAY2BGR),
                   f"{f.path.name} as captured"),
        label_tile(cv2.cvtColor(cv2.resize(erase_board(g, f.H, args.max_fret), (640, 360)),
                                cv2.COLOR_GRAY2BGR),
                   "same frame, neck erased -> safe to use as a background"),
    ])
    p2 = out_dir / "aug_erase.png"
    cv2.imwrite(str(p2), pair)
    print(f"wrote {p2}   (no fret wires or string lines should survive on the right)")
    print("\nLook for: exactly ONE sharp fretboard per tile, green lines on it, and the")
    print("board in a different place/size/angle each time.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
