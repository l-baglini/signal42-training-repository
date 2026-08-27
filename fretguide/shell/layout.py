"""Fitting a video frame into a window. No Qt, no GL — just the arithmetic.

Separated out because getting this wrong is not a crash. The picture merely ends up
slightly stretched, and a fretboard that is 2% too wide still looks like a fretboard —
while every dot drawn on it inherits the same distortion. The overlay would be wrong in a
way that reads as "the tracking is a bit off", which is the most expensive kind of bug
this project has.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Rect:
    """Integer pixel rectangle, origin top-left."""

    x: int
    y: int
    w: int
    h: int

    @property
    def right(self) -> int:
        return self.x + self.w

    @property
    def bottom(self) -> int:
        return self.y + self.h


def letterbox(src_w: int, src_h: int, dst_w: int, dst_h: int) -> Rect:
    """Largest centred rectangle of the source's aspect ratio that fits in the target.

    Aspect ratio is preserved exactly rather than nearly: the frame is scaled by a single
    factor in both axes, so a circle in the video stays a circle and the overlay's
    geometry is a pure scale of the pose it was computed from.

    Rounding is symmetric — any odd leftover pixel goes to the right/bottom margin — so
    the image never sits one pixel off-centre in one direction and flush in the other.
    """
    if min(src_w, src_h, dst_w, dst_h) <= 0:
        return Rect(0, 0, 0, 0)
    scale = min(dst_w / src_w, dst_h / src_h)
    w = max(1, int(round(src_w * scale)))
    h = max(1, int(round(src_h * scale)))
    return Rect((dst_w - w) // 2, (dst_h - h) // 2, w, h)


def frame_to_widget(x: float, y: float, src_w: int, src_h: int, box: Rect) -> tuple[float, float]:
    """Map a point in full-resolution frame pixels to widget pixels.

    This is the only place the video's scale and offset are applied. The overlay must go
    through it too, or the dots and the picture will disagree by exactly the letterbox
    margin — which is invisible in a maximised window and obvious in any other.
    """
    if src_w <= 0 or src_h <= 0:
        return (0.0, 0.0)
    return (box.x + x * box.w / src_w, box.y + y * box.h / src_h)
