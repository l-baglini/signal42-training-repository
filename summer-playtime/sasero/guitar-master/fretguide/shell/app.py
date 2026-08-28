"""The shell window and the capture thread.

Two threads, not three (docs/PLAN-shell.md section 2.1). Capture and inference stay
together in :class:`SourceWorker`, so a FramePacket is assembled in exactly one place and
CLAUDE.md invariant 6 -- a pose is composited only onto the frame it was computed from --
holds by construction rather than by discipline. Splitting them is the obvious
optimisation and is precisely where that invariant dies, silently and intermittently.

The GUI thread never blocks on capture and never queues packets: it always draws the most
recent one. Dropping frames keeps the overlay current, which is what matters when the
thing on screen has to line up with an object in your hands.
"""

from __future__ import annotations

import time

from PySide6.QtCore import QMutex, QMutexLocker, Qt, QThread, Signal
from PySide6.QtGui import QKeySequence, QShortcut
from PySide6.QtWidgets import QLabel, QMainWindow, QStatusBar, QVBoxLayout, QWidget

from ..source import FrameSource
from .video import VideoWidget


class SourceWorker(QThread):
    """Pulls packets off a :class:`~fretguide.source.FrameSource` as fast as it yields them.

    Holds exactly one packet -- the latest. A queue would let the GUI fall behind the
    guitar rather than skip, and latency is the thing this product cannot afford.
    """

    ready = Signal()
    finished_early = Signal(str)

    def __init__(self, source: FrameSource, parent=None) -> None:
        super().__init__(parent)
        self._source = source
        self._mutex = QMutex()
        self._latest = None
        self._stop = False
        self.produced = 0
        self.dropped = 0
        self._t0 = 0.0

    def run(self) -> None:
        self._t0 = time.monotonic()
        while not self._stop:
            try:
                packet = self._source.read()
            except Exception as e:  # noqa: BLE001 — a dead camera must not kill the UI
                self.finished_early.emit(str(e))
                return
            if packet is None:
                self.finished_early.emit("source exhausted")
                return
            with QMutexLocker(self._mutex):
                if self._latest is not None:
                    self.dropped += 1  # overwritten before the GUI collected it
                self._latest = packet
                self.produced += 1
            self.ready.emit()

    def take(self):
        """Latest packet, or None if the GUI has already seen it. Never blocks for long."""
        with QMutexLocker(self._mutex):
            packet, self._latest = self._latest, None
            return packet

    @property
    def capture_fps(self) -> float:
        dt = time.monotonic() - self._t0
        return self.produced / dt if dt > 0 else 0.0

    def stop(self) -> None:
        self._stop = True
        self.wait(2000)
        self._source.close()


class ShellWindow(QMainWindow):
    """P2's window: the video surface, a status line, and enough keys to drive it.

    Deliberately thin. The chord picker, the settings and the designed NO-LOCK state are
    P4; putting them here now would mean building them against an overlay that does not
    exist yet.
    """

    def __init__(self, source: FrameSource, title: str = "FretGuide") -> None:
        super().__init__()
        self.setWindowTitle(title)
        self.video = VideoWidget(self)
        self.worker = SourceWorker(source, self)

        central = QWidget(self)
        layout = QVBoxLayout(central)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self.video)
        self.setCentralWidget(central)

        self._status = QLabel("starting…")
        bar = QStatusBar(self)
        bar.addWidget(self._status)
        self.setStatusBar(bar)

        self.worker.ready.connect(self._on_ready, Qt.QueuedConnection)
        self.worker.finished_early.connect(self._on_source_ended, Qt.QueuedConnection)

        for keys, fn in (
            ("M", self._toggle_mirror),
            ("F11", self._toggle_fullscreen),
            ("Q", self.close),
            ("Esc", self.close),
        ):
            QShortcut(QKeySequence(keys), self, activated=fn)

        self._shown = 0
        self._last_status = 0.0
        self.resize(1280, 760)

    def start(self) -> None:
        self.worker.start()

    def _on_ready(self) -> None:
        packet = self.worker.take()
        if packet is None:
            return  # a newer signal already collected it; nothing to draw
        self.video.set_packet(packet)
        self._shown += 1
        now = time.monotonic()
        if now - self._last_status > 0.5:  # the status line is not a per-frame concern
            self._last_status = now
            self._status.setText(self._describe(packet))

    def _describe(self, packet) -> str:
        s = packet.status
        state = "LOCK" if packet.locked else f"NO LOCK — {s.reason or 'pose refused'}"
        bits = [state, f"{self.worker.capture_fps:5.1f} fps in"]
        colour = "colour" if packet.colour else "greyscale"
        bits.append(colour)
        if self.worker.dropped:
            bits.append(f"{self.worker.dropped} dropped")
        bits += [f"{k} {v}" for k, v in s.fields.items()]
        return "   ".join(bits)

    def _on_source_ended(self, why: str) -> None:
        self._status.setText(f"source stopped: {why}")

    def _toggle_mirror(self) -> None:
        self.video.mirror = not self.video.mirror
        self.video.update()

    def _toggle_fullscreen(self) -> None:
        self.showNormal() if self.isFullScreen() else self.showFullScreen()

    def closeEvent(self, event) -> None:
        # Order matters: stop feeding the widget before tearing down its GL objects, or a
        # queued packet can arrive between the two and repaint against dead textures.
        self.worker.stop()
        self.video.release_gl()
        super().closeEvent(event)
