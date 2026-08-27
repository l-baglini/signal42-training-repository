"""Camera capture, tuned for tracking rather than for looking pretty.

Two things here are load-bearing, both measured (docs/research/09-local-hardware.md):

  - ``buffersize`` must not be 1. The usual "reduce latency" advice of a single queued
    buffer HALVES the delivered framerate, because you can then only dequeue every
    other frame. 2 is the lowest value that doesn't.
  - We ask for raw YUV and use the Y plane directly instead of letting OpenCV convert
    to BGR. Matching is greyscale anyway, so the conversion is pure waste: 0.66 ms
    per frame instead of 1.63 ms, and the greyscale image falls out for free.

That second point is an argument about the *tracking* path, and it still holds: inference
only ever sees Y. It was never an argument about the *display* path, and the two were
simply never separated. The chroma planes are already in the buffer we reshape -- read off
the sensor, sent over USB, written to RAM -- and were being discarded, which is why the
app showed a black-and-white picture of a colour guitar. ``colour=True`` keeps them, and
the native shell uploads all three planes as textures and converts on the GPU, so the CPU
cost stays exactly as measured above (docs/PLAN-shell.md section 1.1).
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import cv2
import numpy as np

#: 4:2:0 buffers that OpenCV hands back at the same size but in different plane orders.
#: Guessing wrong does not fail, it silently swaps red and blue, so the format is read
#: from the camera's FOURCC rather than assumed.
I420_LIKE = {"I420", "IYUV", "YU12"}  # Y, then U, then V -- all three planar
YV12_LIKE = {"YV12"}  # Y, then V, then U -- the same bytes, chroma swapped
NV12_LIKE = {"NV12"}  # Y, then one plane of interleaved UVUVUV


def split_yuv420(buf: np.ndarray, width: int, height: int,
                 fourcc: str) -> tuple[np.ndarray, np.ndarray, np.ndarray] | None:
    """Split a raw 4:2:0 buffer into (Y, U, V). Chroma planes are half-resolution.

    Pure and therefore testable, which matters more here than it looks: every 4:2:0
    layout is exactly ``width * height * 3 // 2`` bytes, so a wrong guess produces a
    perfectly valid image with the colours wrong -- the kind of bug that survives review
    and is then blamed on the camera. Returns None for a layout we do not recognise, so
    the caller can fall back to letting OpenCV convert rather than showing nonsense.
    """
    if buf.size != width * height * 3 // 2 or width % 2 or height % 2:
        return None
    flat = buf.reshape(height * 3 // 2, width)
    y = flat[:height, :]
    tail = flat[height:, :]
    half_h, half_w = height // 2, width // 2

    if fourcc in NV12_LIKE:
        uv = tail.reshape(half_h, width)
        return y, np.ascontiguousarray(uv[:, 0::2]), np.ascontiguousarray(uv[:, 1::2])
    if fourcc in I420_LIKE or fourcc in YV12_LIKE:
        quarter = tail.reshape(-1)[: half_h * half_w * 2]
        a = quarter[: half_h * half_w].reshape(half_h, half_w)
        b = quarter[half_h * half_w:].reshape(half_h, half_w)
        return (y, a, b) if fourcc in I420_LIKE else (y, b, a)
    return None


def _fourcc_str(code: float) -> str:
    """OpenCV reports FOURCC as a float holding four packed bytes."""
    n = int(code)
    return "".join(chr((n >> (8 * i)) & 0xFF) for i in range(4)).strip("\x00 ")


@dataclass
class Frame:
    """One captured frame. ``gray`` is full-resolution; ``mono`` time is monotonic."""

    gray: np.ndarray
    t: float
    index: int
    #: Half-resolution chroma, present only when the camera was opened with
    #: ``colour=True`` and the raw 4:2:0 path is active. The tracker never reads these.
    u: np.ndarray | None = None
    v: np.ndarray | None = None


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
        colour: bool = False,
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
        self.fourcc = ""
        if prefer_raw:
            self.cap.set(cv2.CAP_PROP_CONVERT_RGB, 0)
            ok, probe = self.cap.read()
            expected = self.height * self.width * 3 // 2  # YUV 4:2:0 planar
            if ok and probe is not None and probe.size == expected:
                self._raw = True
                self.fourcc = _fourcc_str(self.cap.get(cv2.CAP_PROP_FOURCC))
            else:
                self.cap.set(cv2.CAP_PROP_CONVERT_RGB, 1)

        # Colour is display-only and is refused rather than faked. If the layout is not
        # one we can split, the shell shows greyscale and says why -- better than showing
        # a picture with red and blue swapped and letting somebody debug their camera.
        self.colour = bool(colour) and self._raw
        self.colour_reason = ""
        if colour and not self._raw:
            self.colour_reason = "camera is not on the raw 4:2:0 path"
        elif colour and split_yuv420(probe, self.width, self.height, self.fourcc) is None:
            self.colour = False
            self.colour_reason = f"unsupported 4:2:0 layout {self.fourcc or '(unknown)'}"

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
        u = v = None
        if self._raw:
            if self.colour:
                # One reshape and two slices: views into the buffer, no copy, no convert.
                gray, u, v = split_yuv420(buf, self.width, self.height, self.fourcc)
            else:
                gray = buf.reshape(self.height * 3 // 2, self.width)[: self.height, :]
        elif buf.ndim == 3:
            gray = cv2.cvtColor(buf, cv2.COLOR_BGR2GRAY)
        else:
            gray = buf
        self._index += 1
        return Frame(gray=gray, t=t, index=self._index, u=u, v=v)

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
