#!/usr/bin/env python3
"""Go/no-go for the native shell: does the real video path work on this machine?

    python tools/probe_gl.py            # verdict only
    python tools/probe_gl.py --verbose  # + GL strings and per-check numbers

docs/PLAN-shell.md P0/P2. Two stages, both offscreen, so this runs over SSH and from a
script and exits non-zero on failure.

  1. **Colour maths.** Three single-channel R8 textures uploaded as Y, U and V, converted
     by ``fretguide.shell.shaders.FRAGMENT`` -- the shader that actually ships, not a copy
     of it -- rendered and read back, checked against the colours that went in.

  2. **The real widget.** A ``VideoWidget`` is given a real ``FramePacket`` from the
     synthetic source and asked to draw. Checks that the board comes out the colour of
     wood, that the letterbox margins are where the arithmetic says, and that the picture
     is not upside down.

Stage 1 alone would pass while the widget was drawing nothing at all: a core-profile
context refuses draw calls with no VAO bound, silently, leaving a window the colour of
glClearColor. That is exactly the bug stage 2 exists to catch, because it did happen.

This is not in the pytest suite because it needs the [gui] extra and a GL context, and
CLAUDE.md would rather have an honest external gate than a test that skips itself.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # repo root

# Spread on purpose: two primaries, a saturated secondary, and a mid grey. Grey is the one
# that catches swapped U and V -- neutral chroma must stay neutral, and every other colour
# still looks plausible with those two crossed.
PROBES = {
    "red": (220, 40, 40),
    "green": (40, 200, 90),
    "blue": (60, 90, 230),
    "grey": (128, 128, 128),
}

GL_TRIANGLE_STRIP = 0x0005
GL_VENDOR, GL_RENDERER, GL_VERSION = 0x1F00, 0x1F01, 0x1F02


def rgb_to_yuv601(rgb: tuple[int, int, int]) -> tuple[float, float, float]:
    """BT.601 limited-range forward transform — the inverse of what the shader does."""
    r, g, b = (c / 255.0 for c in rgb)
    return (0.0625 + 0.256788 * r + 0.504129 * g + 0.097906 * b,
            0.5 - 0.148223 * r - 0.290993 * g + 0.439216 * b,
            0.5 + 0.439216 * r - 0.367788 * g - 0.071427 * b)


def stage_colour(fmt, tol: int, verbose: bool) -> list[str]:
    """Round-trip four colours through the shipped fragment shader."""
    from PySide6.QtGui import QOffscreenSurface, QOpenGLContext
    from PySide6.QtOpenGL import (
        QOpenGLFramebufferObject,
        QOpenGLShader,
        QOpenGLShaderProgram,
        QOpenGLTexture,
        QOpenGLVertexArrayObject,
    )

    from fretguide.shell.shaders import FRAGMENT, VERTEX

    surface = QOffscreenSurface()
    surface.setFormat(fmt)
    surface.create()
    ctx = QOpenGLContext()
    ctx.setFormat(fmt)
    if not ctx.create() or not ctx.makeCurrent(surface):
        return ["could not create a GL 3.3 core context"]

    f = ctx.functions()
    if verbose:
        for name, enum in (("vendor", GL_VENDOR), ("renderer", GL_RENDERER),
                           ("version", GL_VERSION)):
            print(f"  {name:9} {f.glGetString(enum)}")

    prog = QOpenGLShaderProgram()
    prog.addShaderFromSourceCode(QOpenGLShader.Vertex, VERTEX)
    prog.addShaderFromSourceCode(QOpenGLShader.Fragment, FRAGMENT)
    if not prog.link():
        return [f"the shipped shader does not link here:\n{prog.log()}"]

    size = 16
    fbo = QOpenGLFramebufferObject(size, size)
    vao = QOpenGLVertexArrayObject()
    vao.create()

    def plane(value: float) -> QOpenGLTexture:
        t = QOpenGLTexture(QOpenGLTexture.Target2D)
        t.setFormat(QOpenGLTexture.R8_UNorm)
        t.setSize(size, size)
        t.setMinMagFilters(QOpenGLTexture.Linear, QOpenGLTexture.Linear)
        t.allocateStorage()
        t.setData(QOpenGLTexture.Red, QOpenGLTexture.UInt8,
                  np.full((size, size), round(value * 255), np.uint8).tobytes())
        return t

    failures = []
    for name, want in PROBES.items():
        texs = [plane(c) for c in rgb_to_yuv601(want)]
        for i, (t, uniform) in enumerate(zip(texs, ("texY", "texU", "texV"))):
            t.bind(i)
            prog.bind()
            prog.setUniformValue1i(uniform, i)
        prog.setUniformValue1f("dim", 1.0)
        prog.setUniformValue1i("mirror", 0)

        fbo.bind()
        f.glViewport(0, 0, size, size)
        vao.bind()
        f.glDrawArrays(GL_TRIANGLE_STRIP, 0, 4)
        vao.release()
        img = fbo.toImage()
        fbo.release()
        for t in texs:
            t.destroy()

        px = img.pixelColor(size // 2, size // 2)
        got = (px.red(), px.green(), px.blue())
        err = max(abs(a - b) for a, b in zip(got, want))
        if verbose or err > tol:
            print(f"  {name:6} want rgb{want}  got rgb{got}  err {err:>3}  "
                  f"{'ok' if err <= tol else 'FAIL'}")
        if err > tol:
            failures.append(f"{name} off by {err} (tolerance {tol}) — suspect the colour "
                            f"matrix: BT.601 limited vs full range vs BT.709")
    ctx.doneCurrent()
    return failures


def stage_widget(verbose: bool) -> list[str]:
    """Draw a real packet with the real widget, and check what came out."""
    from PySide6.QtWidgets import QApplication

    from fretguide.shell.layout import letterbox
    from fretguide.shell.video import VideoWidget
    from fretguide.source import SyntheticSource

    app = QApplication.instance() or QApplication([])
    src_w, src_h = 1280, 720
    win_w, win_h = 1000, 700  # not 16:9, so the letterbox has to do something

    widget = VideoWidget()
    widget.resize(win_w, win_h)
    widget.show()
    app.processEvents()

    source = SyntheticSource(width=src_w, height=src_h, fps=None, colour=True)
    for _ in range(14):  # far enough in that the board has drifted off centre
        packet = source.read()
    widget.set_packet(packet)
    app.processEvents()
    widget.repaint()
    app.processEvents()
    img = widget.grabFramebuffer()

    failures = []
    box = letterbox(src_w, src_h, win_w, win_h)
    scale = img.width() / win_w  # HiDPI: the grab is in device pixels

    def rgb(x, y):
        c = img.pixelColor(int(x * scale), int(y * scale))
        return (c.red(), c.green(), c.blue())

    centre = rgb(win_w / 2, win_h / 2)
    if verbose:
        print(f"  letterbox {box}   grab {img.width()}x{img.height()}   centre rgb{centre}")

    if max(centre) < 25:
        failures.append(f"nothing was drawn (centre rgb{centre} is the clear colour). "
                        f"In a core profile this is usually a draw call with no VAO bound")
    elif not (centre[0] > centre[1] > centre[2] and centre[0] - centre[2] > 20):
        failures.append(f"the board is not the colour of wood: rgb{centre}. Expected R>G>B "
                        f"— if it is blue-ish, U and V are swapped")

    if box.y > 4:  # this window letterboxes top and bottom
        bar = rgb(win_w / 2, box.y / 2)
        if max(bar) > 25:
            failures.append(f"the letterbox margin is not empty: rgb{bar} at y={box.y//2}")

    # Orientation. Sample the middle of two fret spaces far apart on the neck: under a
    # vertical flip the neck runs the other diagonal, so both land in the room instead of
    # on the board. Fret *centres*, not fret positions, or these land on the wires, which
    # are near-white and would pass a colour check without proving anything.
    from fretguide.geometry import apply_homography, fret_centre_u
    from fretguide.types import UV

    for fret in (2, 11):
        xy = apply_homography(packet.H, UV(fret_centre_u(fret), 0.5))[0]
        c = rgb(box.x + xy[0] * box.w / src_w, box.y + xy[1] * box.h / src_h)
        if verbose:
            print(f"  fret {fret:>2} centre rgb{c} at {xy.round()}")
        if not (c[0] > c[2] + 20):
            failures.append(
                f"fret {fret}'s centre is not on warm board: rgb{c}. The neck is not "
                f"where the pose says it is — suspect a vertical flip or the viewport")

    # And the room behind it must be cool, which is the same check in reverse: if U and V
    # were swapped globally, both the board and the room would flip sign together and the
    # board test above would still pass on its own.
    room = rgb(win_w * 0.03, box.y + box.h * 0.06)
    if verbose:
        print(f"  room     rgb{room}")
    if room[2] <= room[0]:
        failures.append(f"the room behind the neck is not cool: rgb{room} — expected B>R, "
                        f"so U and V are probably swapped")

    widget.close()
    app.processEvents()
    return failures


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--tolerance", type=int, default=4,
                    help="max per-channel deviation, 0-255 (default 4)")
    args = ap.parse_args()

    try:
        from PySide6.QtGui import QSurfaceFormat
        from PySide6.QtWidgets import QApplication
    except ImportError as e:
        print(f"no-go: PySide6 not installed ({e})")
        print("       .venv/bin/pip install -e '.[gui]'")
        return 1

    from fretguide.shell.video import default_surface_format

    fmt = default_surface_format()
    QSurfaceFormat.setDefaultFormat(fmt)
    app = QApplication.instance() or QApplication(sys.argv)  # noqa: F841

    failures = stage_colour(fmt, args.tolerance, args.verbose)
    if failures:
        print("\nno-go (colour maths):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("  colour   4/4 probes round-trip through the shipped shader")

    failures = stage_widget(args.verbose)
    if failures:
        print("\nno-go (video widget):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("  widget   board drawn in colour, letterboxed, right way up")

    print("\ngo: the native video path works on this machine.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
