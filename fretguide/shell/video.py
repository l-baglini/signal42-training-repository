"""The video surface: three YUV planes uploaded as textures, converted on the GPU.

This is docs/PLAN-shell.md P2. The picture is in colour and costs the CPU nothing extra to
make so, because ``capture.py`` was already receiving all three planes and discarding two
of them; the conversion happens in a fragment shader as part of a blit the GPU is
performing anyway.

Greyscale sources go through the identical path with both chroma planes held at neutral,
so there is no second code path to keep in step and no branch in the shader.
"""

from __future__ import annotations

import numpy as np
from PySide6.QtCore import Qt
from PySide6.QtGui import QSurfaceFormat
from PySide6.QtOpenGL import (
    QOpenGLShader,
    QOpenGLShaderProgram,
    QOpenGLTexture,
    QOpenGLVertexArrayObject,
)
from PySide6.QtOpenGLWidgets import QOpenGLWidget

from .layout import Rect, letterbox
from .shaders import FRAGMENT, NEUTRAL_CHROMA, VERTEX

GL_TRIANGLE_STRIP = 0x0005
GL_UNPACK_ALIGNMENT = 0x0CF5


def default_surface_format() -> QSurfaceFormat:
    """GL 3.3 core, double buffered, vsynced. Must be set before the first widget exists."""
    fmt = QSurfaceFormat()
    fmt.setVersion(3, 3)
    fmt.setProfile(QSurfaceFormat.CoreProfile)
    fmt.setSwapInterval(1)  # vsync: the overlay is only ever as smooth as the swap
    return fmt


class VideoWidget(QOpenGLWidget):
    """Draws the most recent :class:`~fretguide.source.FramePacket`, and only that one.

    Packets are *replaced*, never queued. If the GUI thread cannot keep up with capture,
    the right behaviour is to skip frames and stay current: a queue would trade latency
    for completeness, and a fretboard overlay that is 200 ms behind the guitar is worse
    than one that missed some frames nobody saw.
    """

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self.setMinimumSize(320, 180)
        self.setFocusPolicy(Qt.StrongFocus)
        self._packet = None
        self._uploaded = -1
        self._tex: dict[str, QOpenGLTexture] = {}
        self._sizes: dict[str, tuple[int, int]] = {}
        self._prog: QOpenGLShaderProgram | None = None
        self._vao: QOpenGLVertexArrayObject | None = None
        self._box = Rect(0, 0, 0, 0)
        self.mirror = False
        #: Painted over the video when the pose was refused. P4 replaces this with a
        #: designed state; until then it matches what the OpenCV app does.
        self.dim_when_unlocked = 0.5
        self.frames_shown = 0
        self.frames_dropped = 0

    # -- packet plumbing ---------------------------------------------------- #

    def set_packet(self, packet) -> None:
        """Called from the GUI thread with the newest packet. Cheap: no upload here."""
        if self._packet is not None and self._packet.index != self._uploaded:
            self.frames_dropped += 1  # replaced before it was ever drawn
        self._packet = packet
        self.update()

    @property
    def box(self) -> Rect:
        """Where the video currently sits inside the widget, in widget pixels.

        The overlay must be positioned through this (see layout.frame_to_widget) or it
        will disagree with the picture by exactly the letterbox margin.
        """
        return self._box

    # -- GL ----------------------------------------------------------------- #

    def initializeGL(self) -> None:
        f = self.context().functions()
        f.glClearColor(0.04, 0.04, 0.05, 1.0)
        # Rows of an R8 plane are w bytes, and w is not always a multiple of 4. The GL
        # default alignment of 4 would then skew every row by a growing offset and shear
        # the picture -- a spectacular failure at 1922 px and invisible at 1920.
        f.glPixelStorei(GL_UNPACK_ALIGNMENT, 1)

        self._prog = QOpenGLShaderProgram()
        self._prog.addShaderFromSourceCode(QOpenGLShader.Vertex, VERTEX)
        self._prog.addShaderFromSourceCode(QOpenGLShader.Fragment, FRAGMENT)
        if not self._prog.link():
            raise RuntimeError(f"video shader failed to link:\n{self._prog.log()}")

        # A core-profile context refuses every draw call while VAO 0 is bound, and refuses
        # it *silently*: no exception, no Qt warning, just a window the colour of
        # glClearColor. The geometry here is four vertices synthesised from gl_VertexID,
        # so this VAO stays empty -- it exists purely to make the draw legal.
        self._vao = QOpenGLVertexArrayObject()
        self._vao.create()

        # Textures belong to this context and must be released while it is current.
        # This covers context *loss* -- a laptop switching GPUs, or waking from suspend.
        # It does not reliably cover shutdown, because the widget can outlive the event
        # loop, so ShellWindow.closeEvent calls release_gl() explicitly as well. Both
        # paths are needed; release_gl is idempotent so running both is harmless.
        self.context().aboutToBeDestroyed.connect(self.release_gl)

    def resizeGL(self, w: int, h: int) -> None:
        self._recompute_box(w, h)

    def _recompute_box(self, w: int, h: int) -> None:
        p = self._packet
        if p is None:
            self._box = Rect(0, 0, w, h)
        else:
            self._box = letterbox(p.gray.shape[1], p.gray.shape[0], w, h)

    def _plane(self, name: str, data: np.ndarray) -> QOpenGLTexture:
        """Texture for one plane, reallocated only when its dimensions change."""
        h, w = data.shape[:2]
        tex = self._tex.get(name)
        if tex is None or self._sizes.get(name) != (w, h):
            if tex is not None:
                tex.destroy()
            tex = QOpenGLTexture(QOpenGLTexture.Target2D)
            tex.setFormat(QOpenGLTexture.R8_UNorm)
            tex.setSize(w, h)
            # Linear on the half-resolution chroma planes is the upsample, for free and
            # in the same sample every video decoder uses.
            tex.setMinMagFilters(QOpenGLTexture.Linear, QOpenGLTexture.Linear)
            tex.setWrapMode(QOpenGLTexture.ClampToEdge)
            tex.allocateStorage()
            self._tex[name], self._sizes[name] = tex, (w, h)
        tex.setData(QOpenGLTexture.Red, QOpenGLTexture.UInt8,
                    np.ascontiguousarray(data).tobytes())
        return tex

    def paintGL(self) -> None:
        f = self.context().functions()
        f.glClear(0x00004000)  # GL_COLOR_BUFFER_BIT
        p, prog = self._packet, self._prog
        if p is None or prog is None:
            return

        ratio = self.devicePixelRatioF()
        self._recompute_box(self.width(), self.height())
        b = self._box

        if p.index != self._uploaded:
            h, w = p.gray.shape[:2]
            neutral = np.full((max(1, h // 2), max(1, w // 2)), NEUTRAL_CHROMA, np.uint8)
            self._plane("y", p.gray).bind(0)
            self._plane("u", p.u if p.u is not None else neutral).bind(1)
            self._plane("v", p.v if p.v is not None else neutral).bind(2)
            self._uploaded = p.index
            self.frames_shown += 1
        else:
            for i, name in enumerate(("y", "u", "v")):
                self._tex[name].bind(i)

        prog.bind()
        for i, name in enumerate(("texY", "texU", "texV")):
            prog.setUniformValue1i(name, i)
        prog.setUniformValue1f("dim", 1.0 if p.locked else self.dim_when_unlocked)
        prog.setUniformValue1i("mirror", int(self.mirror))

        # Viewport is in device pixels; box is in logical pixels. On a HiDPI screen the
        # two differ and the picture would land in the wrong quarter of the widget.
        f.glViewport(int(b.x * ratio), int((self.height() - b.bottom) * ratio),
                     int(b.w * ratio), int(b.h * ratio))
        self._vao.bind()
        f.glDrawArrays(GL_TRIANGLE_STRIP, 0, 4)
        self._vao.release()
        prog.release()

    def release_gl(self) -> None:
        """Drop GL objects while their context is still current. Idempotent.

        Qt prints 'destroy() called without a current context' and leaks the textures
        otherwise. That is cosmetic at shutdown but not on context loss, which is a real
        event when a laptop switches GPUs or wakes from suspend -- there the widget goes on
        living and would keep handles to textures that no longer exist.
        """
        if not self._tex and self._vao is None:
            return
        self.makeCurrent()
        for tex in self._tex.values():
            tex.destroy()
        self._tex.clear()
        self._sizes.clear()
        if self._vao is not None:
            self._vao.destroy()
            self._vao = None
        self._prog = None
        self._uploaded = -1
        self.doneCurrent()
