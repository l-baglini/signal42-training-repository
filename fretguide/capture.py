"""Camera capture, tuned for tracking rather than for looking pretty.

Two things here are load-bearing, both measured (docs/research/09-local-hardware.md):

  - ``buffersize`` must not be 1. The usual "reduce latency" advice of a single queued
    buffer HALVES the delivered framerate, because you can then only dequeue every
    other frame. 2 is the lowest value that doesn't.
  - We ask for raw YUV and use the Y plane directly instead of letting OpenCV convert
    to BGR. Matching is greyscale anyway, so the conversion is pure waste: 0.66 ms
    per frame instead of 1.63 ms, and the greyscale image falls out for free.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import cv2
import numpy as np


@dataclass
class Frame:
    """One captured frame. ``gray`` is full-resolution; ``mono`` time is monotonic."""

    gray: np.ndarray
    t: float
    index: int


class Camera:
    """A V4L2 camera delivering greyscale frames as cheaply as possible."""

    def __init__(
        self,
        device: int | str = 0,
        width: int = 1920,
        height: int = 1080,
        fps: int = 30,
        buffersize: int = 2,
        prefer_raw: bool = True,
    ) -> None:
        dev = device if isinstance(device, str) and device.startswith("/dev/") else int(device)
        self.cap = cv2.VideoCapture(dev, cv2.CAP_V4L2)
        if not self.cap.isOpened():
            raise RuntimeError(f"could not open camera {device!r}")

        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
        self.cap.set(cv2.CAP_PROP_FPS, fps)
        if buffersize == 1:
            raise ValueError("buffersize=1 halves the framerate; use 2 or more")
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, buffersize)

        self.width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        # Try the raw path; verify by frame shape rather than trusting the property.
        self._raw = False
        if prefer_raw:
            self.cap.set(cv2.CAP_PROP_CONVERT_RGB, 0)
            ok, probe = self.cap.read()
            expected = self.height * self.width * 3 // 2  # YUV 4:2:0 planar
            if ok and probe is not None and probe.size == expected:
                self._raw = True
            else:
                self.cap.set(cv2.CAP_PROP_CONVERT_RGB, 1)

        self._index = 0

    @property
    def raw_yuv(self) -> bool:
        """True if we're taking the cheap Y-plane path."""
        return self._raw

    def read(self) -> Frame | None:
        ok, buf = self.cap.read()
        if not ok or buf is None:
            return None
        t = time.monotonic()
        if self._raw:
            gray = buf.reshape(self.height * 3 // 2, self.width)[: self.height, :]
        elif buf.ndim == 3:
            gray = cv2.cvtColor(buf, cv2.COLOR_BGR2GRAY)
        else:
            gray = buf
        self._index += 1
        return Frame(gray=gray, t=t, index=self._index)

    def measure_fps(self, n: int = 45) -> float:
        """Measured delivery rate. Worth asserting at startup — a silent drop to half
        rate looks exactly like a tracking bug."""
        for _ in range(5):
            self.read()
        t0 = time.monotonic()
        got = sum(1 for _ in range(n) if self.read() is not None)
        dt = time.monotonic() - t0
        return got / dt if dt > 0 else 0.0

    def close(self) -> None:
        self.cap.release()

    def __enter__(self) -> Camera:
        return self

    def __exit__(self, *exc) -> None:
        self.close()
