#!/usr/bin/env python3
"""Render the overlay to a PNG from any frame source, with no camera and no window.

    python tools/preview_render.py                          # synthetic, chord G
    python tools/preview_render.py --chord Bm --frames 4    # a short sequence
    python tools/preview_render.py --source replay -n 120   # real footage, exact pose
    python tools/preview_render.py --source 4               # live camera + model

docs/PLAN-shell.md P1. Two jobs:

1. **Look at the overlay without hardware.** The synthetic source draws a moving
   fretboard from a matrix it also hands back, so the pose is exact and any misplaced dot
   is unambiguously the renderer's fault. That question -- model or renderer? -- used to
   need a guitar to answer.

2. **Give the shell something to be compared against.** When the QPainter overlay lands
   at P3 it has to agree with render.py on where every dot goes; this produces the
   reference images, and tests/test_render.py asserts the agreement.

The output is a strip of consecutive frames rather than one, because the interesting
failures -- jitter, a dot lagging the board, the overlay swimming against the video --
only exist between frames.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # repo root


from fretguide import render
from fretguide.content import CHORD_IDS, SCALE_IDS, resolve_selection
from fretguide.geometry import grid_lines
from fretguide.menu import Layout, Menu, preferred_anchor
from fretguide.source import open_source
from fretguide.types import Selection


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", default="synthetic",
                    help="'synthetic' (default, needs nothing), 'replay', or a camera device")
    ap.add_argument("--chord", help=f"one of {', '.join(CHORD_IDS)}")
    ap.add_argument("--scale", help=f"one of {', '.join(SCALE_IDS)}")
    ap.add_argument("--frames", type=int, default=3, help="how many to render (default 3)")
    ap.add_argument("-n", "--skip", type=int, default=0,
                    help="drop this many frames first, to reach an interesting pose")
    ap.add_argument("--size", default="1280x720", help="synthetic source only")
    ap.add_argument("--out", default="diagnostics/overlay.png")
    ap.add_argument("--no-grid", action="store_true")
    ap.add_argument("--menu", action="store_true",
                    help="draw the practice menu too, opened on the current selection")
    ap.add_argument("--refuse-every", type=int, default=0,
                    help="synthetic: periodically refuse the pose, to see the NO LOCK state")
    args = ap.parse_args()

    if args.chord and args.scale:
        print("pick one of --chord / --scale")
        return 2
    sel = (Selection("chord", args.chord) if args.chord
           else Selection("scale", args.scale) if args.scale
           else Selection("chord", "G"))

    w, h = (int(x) for x in args.size.lower().split("x"))
    try:
        src = open_source(args.source, width=w, height=h, fps=None,
                          refuse_every=args.refuse_every)
    except (FileNotFoundError, OSError, ValueError) as e:
        print(e)
        return 1

    resolved = resolve_selection(sel, max_fret=12)
    if resolved is None:
        print(f"unknown selection {sel.id!r}")
        return 2

    menu = Menu()
    if args.menu:
        menu.open = True
        menu.focus(1)
        if not menu.sync_to(sel):
            print(f"note: {sel.id!r} is not in the menu catalogue; showing it from the top")

    for _ in range(args.skip):
        if src.read() is None:
            print("source exhausted while skipping")
            return 1

    strip, posed = [], 0
    for _ in range(args.frames):
        packet = src.read()
        if packet is None:
            break
        view = cv2.cvtColor(packet.gray, cv2.COLOR_GRAY2BGR)
        if packet.H is not None:
            if not args.no_grid:
                render.draw_grid(view, packet.H, 12)
            render.draw_selection(view, packet.H, resolved)
            posed += 1
        else:
            # Exactly what the app does, and exactly what P4 is going to replace.
            render.dim(view, 0.5)
        render.draw_hud(view, packet.status, resolved.name, 0.0,
                        extra=f"#{packet.index} {args.source}")
        if args.menu:
            pts = None
            if packet.H is not None:
                pts = np.array([[q.x, q.y]
                                for line in grid_lines(packet.H, 12) for q in line])
            h, w = packet.gray.shape[:2]
            render.draw_menu(view, menu,
                             Layout.for_frame(w, h, preferred_anchor(pts, w, h, menu)))
        strip.append(view)
    src.close()

    if not strip:
        print("no frames rendered")
        return 1

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(out), np.vstack(strip))
    print(f"{out}  {len(strip)} frame(s), {posed} posed, {resolved.name}")
    if posed < len(strip):
        print(f"  {len(strip) - posed} refused — a dimmed frame with NO LOCK is correct")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
