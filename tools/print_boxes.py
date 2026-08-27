#!/usr/bin/env python3
"""Draw the modal boxes of a key as fingering grids, in the format teaching sheets use.

    python tools/print_boxes.py                 # key of G
    python tools/print_boxes.py --key C -o c.png

Two jobs. It is how the derived boxes get checked against the sheet they came from -- hold
this next to the paper and the shapes either match or they do not -- and it is something
to print and keep on a music stand.

Only the *positions* of the G boxes were taken from the sheet. The notes and the
fingerings are derived (see fretguide/modes.py), which is why they need looking at.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # repo root

from fretguide.modes import BOX_FRETS, key_modes, mode_box

FONT = cv2.FONT_HERSHEY_SIMPLEX
PAPER = (252, 252, 252)
INK = (30, 30, 30)
ROOT = (40, 40, 210)
GREY = (140, 140, 140)


def draw_box(canvas, ox: int, oy: int, mode, cell: int = 46, untracked: int = 0) -> None:
    """One grid: six string lines, four fret columns, a finger number per note.

    String 1 (high E) is drawn along the top, which is how guitar fingering grids are
    conventionally laid out and how the source sheet has them.
    """
    w, h = cell * BOX_FRETS, cell * 5
    title = f"Modo {mode.italian}"
    cv2.putText(canvas, title, (ox, oy - 34), FONT, 0.72, INK, 2, cv2.LINE_AA)
    # Clear of the top string line: descenders in "Phrygian" and "Mixolydian" were
    # touching it and the words read as struck through.
    cv2.putText(canvas, mode.name, (ox, oy - 16), FONT, 0.5, GREY, 1, cv2.LINE_AA)
    cv2.putText(canvas, mode.chord, (ox + w - 10, oy - 34), FONT, 0.72, INK, 2, cv2.LINE_AA)
    cv2.putText(canvas, mode.roman_position, (ox - 46, oy + 4), FONT, 0.66, INK, 2, cv2.LINE_AA)

    for i in range(6):  # strings
        y = oy + i * cell
        cv2.line(canvas, (ox, y), (ox + w, y), INK, 1, cv2.LINE_AA)
    for j in range(BOX_FRETS + 1):  # fret wires
        x = ox + j * cell
        # A heavy line means the nut, and only the open position has one. Drawing it at
        # the left of every box would say each one starts at the nut, which is the single
        # most misleading thing a fingering diagram can claim.
        nut = j == 0 and mode.position == 0
        cv2.line(canvas, (x, oy), (x, oy + h), INK, 4 if nut else 1, cv2.LINE_AA)

    # Notes sit in the fret *space* (where the finger presses) and on the string *line*.
    # The line therefore runs straight through the digit, which is what mangled the first
    # version of this diagram: every finger number had a rule struck through it. Knock the
    # paper back out behind each one before drawing it.
    for p in mode_box(mode, max_fret=24):
        col = p.fret - mode.position
        y = oy + (p.string - 1) * cell          # string 1 on top
        x = ox + int((col + 0.5) * cell)
        cv2.circle(canvas, (x, y), 13, PAPER, -1, cv2.LINE_AA)
        if p.is_root:
            cv2.circle(canvas, (x, y), 13, ROOT, 2, cv2.LINE_AA)
        (tw, th), _ = cv2.getTextSize(str(p.finger), FONT, 0.62, 2)
        cv2.putText(canvas, str(p.finger), (x - tw // 2, y + th // 2), FONT, 0.62,
                    ROOT if p.is_root else INK, 2, cv2.LINE_AA)

    if untracked:
        cv2.putText(canvas, f"last {untracked} frets are past fret 12 - the app",
                    (ox, oy + h + 24), FONT, 0.42, (40, 40, 200), 1, cv2.LINE_AA)
        cv2.putText(canvas, "cannot track them, but you can still play them",
                    (ox, oy + h + 42), FONT, 0.42, (40, 40, 200), 1, cv2.LINE_AA)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--key", default="G")
    ap.add_argument("-o", "--out", default="diagnostics/boxes.png")
    ap.add_argument("--cell", type=int, default=46)
    args = ap.parse_args()

    try:
        # Drawn against a long neck so no shape is cut short on paper, but the warnings
        # come from the neck the *tracker* covers: a box can be perfectly playable and
        # still be one the overlay cannot follow.
        modes = key_modes(args.key, max_fret=24)
        tracked = key_modes(args.key, max_fret=12)
    except ValueError as e:
        print(e)
        return 1

    cell = args.cell
    bw, bh = cell * BOX_FRETS, cell * 5
    cols, gap = 2, 110
    rows = (len(modes) + cols - 1) // cols
    canvas = np.full((rows * (bh + gap) + 110, cols * (bw + gap) + 90, 3), PAPER, np.uint8)
    cv2.putText(canvas, f"Modal boxes - key of {args.key}", (40, 48), FONT, 0.9, INK, 2,
                cv2.LINE_AA)

    for i, m in enumerate(modes):
        ox = 90 + (i % cols) * (bw + gap)
        oy = 130 + (i // cols) * (bh + gap)
        draw_box(canvas, ox, oy, m, cell, untracked=tracked[i].clipped)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(out), canvas)
    print(f"{out}  {len(modes)} boxes, key of {args.key}")
    for m, t in zip(modes, tracked):
        print(f"  {m.roman:>4}  {m.italian:<10} {m.name:<11} {t.detail}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
