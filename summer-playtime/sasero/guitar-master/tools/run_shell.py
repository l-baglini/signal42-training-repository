#!/usr/bin/env python3
"""The native shell — colour video of your fretboard, composited on the GPU.

    python tools/run_shell.py                      # synthetic board; needs no hardware
    python tools/run_shell.py --source 4           # live camera + trained model
    python tools/run_shell.py --source replay      # the labelled dataset, exact poses

docs/PLAN-shell.md P2. This is the video surface only: three YUV planes uploaded as
textures and converted to RGB in a fragment shader. The overlay still lives in the OpenCV
app (tools/run_app.py) until P3 ports it to QPainter, so nothing is drawn on the video
here yet — what this proves is the picture, the colour, the aspect ratio and the
frame/pose handoff.

Run it with no arguments and you get a moving synthetic fretboard in colour: no camera, no
trained model, no dataset. That is the point of fretguide/source.py.

Keys:  M mirror   F11 fullscreen   Q / Esc quit
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # repo root


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", default="synthetic",
                    help="'synthetic' (default), 'replay', or a camera device number")
    ap.add_argument("--size", default="1920x1080")
    ap.add_argument("--model", default="models/fretnet.xml")
    ap.add_argument("--infer-device", default="AUTO")
    ap.add_argument("--greyscale", action="store_true",
                    help="skip the chroma planes, to compare against the OpenCV app")
    ap.add_argument("--refuse-every", type=int, default=0,
                    help="synthetic: periodically refuse the pose, to see the dimmed state")
    args = ap.parse_args()

    try:
        from PySide6.QtGui import QSurfaceFormat
        from PySide6.QtWidgets import QApplication
    except ImportError:
        print("the shell needs PySide6:  .venv/bin/pip install -e '.[gui]'")
        print("the OpenCV app needs nothing extra:  python tools/run_app.py -d 4")
        return 1

    from fretguide.shell.app import ShellWindow
    from fretguide.shell.video import default_surface_format
    from fretguide.source import open_source

    # Must be set before any GL widget is constructed, or the widget silently gets
    # whatever the platform felt like and the 3.3-core shaders fail to compile.
    QSurfaceFormat.setDefaultFormat(default_surface_format())
    app = QApplication(sys.argv)

    w, h = (int(x) for x in args.size.lower().split("x"))
    try:
        source = open_source(args.source, width=w, height=h, colour=not args.greyscale,
                             model_path=args.model, infer_device=args.infer_device,
                             refuse_every=args.refuse_every)
    except (FileNotFoundError, OSError, RuntimeError, ValueError) as e:
        print(e)
        if args.source not in ("synthetic", "replay"):
            print("\nNo camera or model? The synthetic source needs neither:")
            print("  python tools/run_shell.py")
        return 1

    if getattr(source, "colour", None) is False and not args.greyscale:
        # Say it rather than quietly showing grey; see capture.colour_reason.
        why = getattr(getattr(source, "cam", None), "colour_reason", "")
        print(f"colour unavailable{': ' + why if why else ''} — showing greyscale")

    window = ShellWindow(source, title=f"FretGuide — {args.source}")
    window.show()
    window.start()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
