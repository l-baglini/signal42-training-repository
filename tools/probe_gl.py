#!/usr/bin/env python3
"""Go/no-go check for the native shell — does the YUV-in-a-shader path actually work here?

    python tools/probe_gl.py            # verdict only
    python tools/probe_gl.py --verbose  # + the GL strings

docs/PLAN-shell.md P0. The plan's central claim is that colour video is free: the camera
already hands us Y, U and V (capture.py keeps only Y), so we upload three single-channel
textures and convert to RGB in a fragment shader, and the GPU does it inside a blit it is
already performing.

This does not merely check that a GL context can be created. It runs that exact mechanism
end to end -- three R8 textures, the BT.601 conversion in GLSL, rendered to a real
framebuffer and read back -- and checks the pixels came out the colour they should. A
context that exists but cannot sample three textures or hit the colour would be a no-go
discovered three days into P2 instead of here.

Exit status is 0 for go, 1 for no-go, so CI or a script can gate on it.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # repo root

# Colours to round-trip. Chosen for spread: two primaries, a saturated secondary, and a
# mid grey (which catches a swapped U/V, since neutral chroma must stay neutral).
PROBES = {
    "red": (220, 40, 40),
    "green": (40, 200, 90),
    "blue": (60, 90, 230),
    "grey": (128, 128, 128),
}

VERT = """
#version 330 core
const vec2 QUAD[4] = vec2[4](vec2(-1,-1), vec2(1,-1), vec2(-1,1), vec2(1,1));
out vec2 uv;
void main() {
    vec2 p = QUAD[gl_VertexID];
    uv = p * 0.5 + 0.5;
    gl_Position = vec4(p, 0.0, 1.0);
}
"""

# BT.601 limited range -- what V4L2 delivers for this capture format. If the shell ever
# looks washed out or over-saturated, this matrix is the first suspect: full-range and
# BT.709 both differ, and all three are visually plausible until compared side by side.
FRAG = """
#version 330 core
in vec2 uv;
out vec4 frag;
uniform sampler2D texY;
uniform sampler2D texU;
uniform sampler2D texV;
void main() {
    float y = texture(texY, uv).r;
    float u = texture(texU, uv).r - 0.5;
    float v = texture(texV, uv).r - 0.5;
    y = 1.164383 * (y - 0.0625);
    frag = vec4(
        y + 1.596027 * v,
        y - 0.812968 * v - 0.391762 * u,
        y + 2.017232 * u,
        1.0);
}
"""


def rgb_to_yuv601(rgb: tuple[int, int, int]) -> tuple[float, float, float]:
    """BT.601 limited-range forward transform — the inverse of what the shader does."""
    r, g, b = (c / 255.0 for c in rgb)
    y = 0.0625 + 0.256788 * r + 0.504129 * g + 0.097906 * b
    u = 0.5 - 0.148223 * r - 0.290993 * g + 0.439216 * b
    v = 0.5 + 0.439216 * r - 0.367788 * g - 0.071427 * b
    return y, u, v


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--verbose", action="store_true", help="print the GL strings")
    ap.add_argument("--tolerance", type=int, default=4,
                    help="max per-channel deviation, 0-255 (default 4)")
    args = ap.parse_args()

    try:
        from PySide6.QtGui import QOffscreenSurface, QOpenGLContext, QSurfaceFormat
        from PySide6.QtOpenGL import (
            QOpenGLFramebufferObject,
            QOpenGLShader,
            QOpenGLShaderProgram,
            QOpenGLTexture,
            QOpenGLVertexArrayObject,
        )
        from PySide6.QtWidgets import QApplication
    except ImportError as e:
        print(f"no-go: PySide6 not installed ({e})")
        print("       .venv/bin/pip install -e '.[gui]'")
        return 1

    fmt = QSurfaceFormat()
    fmt.setVersion(3, 3)
    fmt.setProfile(QSurfaceFormat.CoreProfile)
    QSurfaceFormat.setDefaultFormat(fmt)

    app = QApplication(sys.argv)  # noqa: F841  (must outlive the GL objects)

    # Offscreen rather than a window: this must be runnable over SSH and from a script,
    # and a window would prove nothing extra about the shader path.
    surface = QOffscreenSurface()
    surface.setFormat(fmt)
    surface.create()
    ctx = QOpenGLContext()
    ctx.setFormat(fmt)
    if not ctx.create() or not ctx.makeCurrent(surface):
        print("no-go: could not create a GL 3.3 core context")
        return 1

    f = ctx.functions()
    if args.verbose:
        # GL_VENDOR / GL_RENDERER / GL_VERSION. Spelled as literals because
        # PySide6 does not re-export the GL enums at module level.
        for name, enum in (("vendor", 0x1F00), ("renderer", 0x1F01), ("version", 0x1F02)):
            print(f"  {name:9} {f.glGetString(enum)}")

    prog = QOpenGLShaderProgram()
    prog.addShaderFromSourceCode(QOpenGLShader.Vertex, VERT)
    prog.addShaderFromSourceCode(QOpenGLShader.Fragment, FRAG)
    if not prog.link():
        print(f"no-go: shader link failed\n{prog.log()}")
        return 1

    size = 16
    fbo = QOpenGLFramebufferObject(size, size)
    vao = QOpenGLVertexArrayObject()
    vao.create()

    def plane(value: float) -> QOpenGLTexture:
        """One uniform single-channel texture — the shape a real Y/U/V plane arrives in."""
        t = QOpenGLTexture(QOpenGLTexture.Target2D)
        t.setFormat(QOpenGLTexture.R8_UNorm)
        t.setSize(size, size)
        t.setMinMagFilters(QOpenGLTexture.Linear, QOpenGLTexture.Linear)
        t.allocateStorage()
        buf = np.full((size, size), round(value * 255), dtype=np.uint8)
        t.setData(QOpenGLTexture.Red, QOpenGLTexture.UInt8, buf.tobytes())
        return t

    failures = []
    for name, want in PROBES.items():
        y, u, v = rgb_to_yuv601(want)
        texs = [plane(y), plane(u), plane(v)]
        for i, (t, uniform) in enumerate(zip(texs, ("texY", "texU", "texV"))):
            t.bind(i)
            prog.bind()
            prog.setUniformValue1i(uniform, i)

        fbo.bind()
        f.glViewport(0, 0, size, size)
        vao.bind()
        f.glDrawArrays(0x0005, 0, 4)  # GL_TRIANGLE_STRIP
        vao.release()
        img = fbo.toImage()
        fbo.release()
        for t in texs:
            t.destroy()

        px = img.pixelColor(size // 2, size // 2)
        got = (px.red(), px.green(), px.blue())
        err = max(abs(a - b) for a, b in zip(got, want))
        ok = err <= args.tolerance
        print(f"  {name:6} want rgb{want}  got rgb{got}  err {err:>3}  "
              f"{'ok' if ok else 'FAIL'}")
        if not ok:
            failures.append(name)

    ctx.doneCurrent()

    if failures:
        print(f"\nno-go: YUV->RGB wrong for {', '.join(failures)} "
              f"(tolerance {args.tolerance})")
        print("       A context exists but the conversion is off -- suspect the")
        print("       colour matrix (BT.601 limited vs full range vs BT.709).")
        return 1

    print("\ngo: GL 3.3 core context, three R8 planes sampled, BT.601 conversion correct.")
    print("    docs/PLAN-shell.md P2 can proceed on this machine.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
