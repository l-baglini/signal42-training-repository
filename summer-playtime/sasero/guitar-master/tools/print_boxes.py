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


def draw_box(canvas, ox: int, oy: int, mode, fret_w: int = 74, untracked: int = 0) -> None:
    """One grid: six string lines, four fret columns, a finger number per note.

    **Wide, not tall.** Strings are drawn close together and frets far apart, which is
    what a fretboard looks like from the side and what every sheet of this kind uses. The
    first version of this diagram used square cells, so a four-fret box came out taller
    than it was wide -- and a portrait grid reads as a *chord* diagram, where the strings
    run vertically and the frets across. Anyone who read it that way would find every box
    transposed into nonsense, which is precisely what happened.

    String 1 (high E) is along the top, as in tablature and on the source sheet.
    """
    notes = mode_box(mode, max_fret=24)
    lo = min(p.fret for p in notes) if notes else mode.position
    hi = max(p.fret for p in notes) if notes else mode.position + BOX_FRETS - 1
    span = hi - lo + 1
    string_h = max(16, int(fret_w * 0.36))
    w, h = fret_w * span, string_h * 5
    r = max(9, min(int(string_h * 0.46), int(fret_w * 0.22)))

    cv2.putText(canvas, f"Modo {mode.italian}", (ox, oy - 40), FONT, 0.66, INK, 2, cv2.LINE_AA)
    cv2.putText(canvas, mode.name, (ox, oy - 20), FONT, 0.46, GREY, 1, cv2.LINE_AA)
    (cw, _), _ = cv2.getTextSize(mode.chord, FONT, 0.66, 2)
    cv2.putText(canvas, mode.chord, (ox + w - cw, oy - 40), FONT, 0.66, INK, 2, cv2.LINE_AA)
    cv2.putText(canvas, mode.roman_position, (ox - 44, oy + 6), FONT, 0.6, INK, 2, cv2.LINE_AA)

    for i in range(6):  # strings, high E at the top
        y = oy + i * string_h
        cv2.line(canvas, (ox, y), (ox + w, y), INK, 1, cv2.LINE_AA)
    for j in range(span + 1):  # fret wires
        x = ox + j * fret_w
        # A heavy line means the nut, and only the open position has one. Drawing it at
        # the left of every box would say each one starts at the nut, which is the single
        # most misleading thing a fingering diagram can claim.
        nut = j == 0 and lo == 0
        cv2.line(canvas, (x, oy), (x, oy + h), INK, 4 if nut else 1, cv2.LINE_AA)

    # Fret numbers along the bottom, so the position is readable without counting.
    for j in range(span):
        label = str(lo + j)
        (tw, _), _ = cv2.getTextSize(label, FONT, 0.4, 1)
        # Clear of the bottom string line by more than a root circle's radius: the low E
        # very often carries one, and the fret number was landing inside it.
        cv2.putText(canvas, label, (ox + int((j + 0.5) * fret_w) - tw // 2, oy + h + 32),
                    FONT, 0.4, GREY, 1, cv2.LINE_AA)

    # Notes sit in the fret *space* (where the finger presses) and on the string *line*,
    # so the line runs straight through the digit. Knock the paper out behind each one.
    for p in notes:
        col = p.fret - lo
        y = oy + (p.string - 1) * string_h
        x = ox + int((col + 0.5) * fret_w)
        cv2.circle(canvas, (x, y), r, PAPER, -1, cv2.LINE_AA)
        if p.is_root:
            cv2.circle(canvas, (x, y), r, ROOT, 2, cv2.LINE_AA)
        colour = ROOT if p.is_root else INK
        if p.finger is None:
            # Unconfirmed shape: the note is right, which finger plays it is not. A filled
            # dot says "this note" without claiming anything about the hand.
            cv2.circle(canvas, (x, y), max(4, r // 3), colour, -1, cv2.LINE_AA)
        else:
            (tw, th), _ = cv2.getTextSize(str(p.finger), FONT, 0.48, 2)
            cv2.putText(canvas, str(p.finger), (x - tw // 2, y + th // 2), FONT, 0.48,
                        colour, 2, cv2.LINE_AA)

    if not mode.verified:
        cv2.putText(canvas, "fingering not confirmed against the sheet - notes only",
                    (ox, oy - 4), FONT, 0.4, (150, 110, 40), 1, cv2.LINE_AA)
    if untracked:
        cv2.putText(canvas, f"last {untracked} frets are past fret 12 - the app cannot",
                    (ox, oy + h + 54), FONT, 0.4, (40, 40, 200), 1, cv2.LINE_AA)
        cv2.putText(canvas, "track them, but you can still play them",
                    (ox, oy + h + 70), FONT, 0.4, (40, 40, 200), 1, cv2.LINE_AA)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--key", default="G")
    ap.add_argument("-o", "--out", default="diagnostics/boxes.png")
    ap.add_argument("--fret-width", type=int, default=74,
                    help="pixels per fret. String spacing follows at ~0.36 of it, which "
                         "is what keeps the grid wide rather than tall")
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

    fret_w = args.fret_width
    widest = max((max(p.fret for p in mode_box(m, max_fret=24))
                  - min(p.fret for p in mode_box(m, max_fret=24)) + 1)
                 for m in modes if mode_box(m, max_fret=24))
    bw, bh = fret_w * widest, int(fret_w * 0.36) * 5
    cols = 2
    gap_x, gap_y = 120, 150
    rows = (len(modes) + cols - 1) // cols
    canvas = np.full((rows * (bh + gap_y) + 130, cols * (bw + gap_x) + 100, 3), PAPER,
                     np.uint8)
    cv2.putText(canvas, f"Modal boxes - key of {args.key}", (40, 48), FONT, 0.9, INK, 2,
                cv2.LINE_AA)
    cv2.putText(canvas, "strings: high E on top, low E at the bottom   |   red = root",
                (40, 74), FONT, 0.44, GREY, 1, cv2.LINE_AA)

    for i, m in enumerate(modes):
        ox = 100 + (i % cols) * (bw + gap_x)
        oy = 160 + (i // cols) * (bh + gap_y)
        draw_box(canvas, ox, oy, m, fret_w, untracked=tracked[i].clipped)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(out), canvas)
    print(f"{out}  {len(modes)} boxes, key of {args.key}")
    for m, t in zip(modes, tracked):
        print(f"  {m.roman:>4}  {m.italian:<10} {m.name:<11} {t.detail}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
