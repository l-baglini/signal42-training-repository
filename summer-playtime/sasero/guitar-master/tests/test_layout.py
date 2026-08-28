"""Letterbox arithmetic for the video surface.

Pure geometry, no Qt, no GL — which is why it lives in the suite rather than in
tools/probe_gl.py. A wrong answer here does not crash; it stretches the picture slightly,
and every overlay dot inherits the same distortion, so the failure presents as "the
tracking is a bit off". That is the most expensive way for this project to be wrong.
"""

from __future__ import annotations

import pytest

from fretguide.shell.layout import Rect, frame_to_widget, letterbox


def test_exact_fit_uses_the_whole_widget():
    assert letterbox(1920, 1080, 1280, 720) == Rect(0, 0, 1280, 720)


def test_a_wider_window_pillarboxes():
    box = letterbox(1920, 1080, 2000, 720)
    assert (box.w, box.h) == (1280, 720)
    assert box.x == 360 and box.y == 0
    assert box.right == 1640, "margins are not symmetric"


def test_a_taller_window_letterboxes():
    box = letterbox(1920, 1080, 1280, 900)
    assert (box.w, box.h) == (1280, 720)
    assert box.x == 0 and box.y == 90


@pytest.mark.parametrize("dst", [(1280, 720), (2000, 700), (640, 1000), (137, 991), (7, 5)])
def test_the_picture_never_spills_out_of_the_widget(dst):
    box = letterbox(1920, 1080, *dst)
    assert box.w <= dst[0] and box.h <= dst[1]
    assert box.x >= 0 and box.y >= 0


@pytest.mark.parametrize("dst", [(1280, 720), (2000, 700), (640, 1000), (137, 991), (7, 5)])
def test_both_axes_use_the_same_scale_to_within_rounding(dst):
    """The real guarantee, stated in the only form that holds at every size.

    A percentage tolerance on the aspect ratio is the tempting assertion and it is wrong:
    at a 7x5 widget the ideal box is 7 x 3.94, and rounding 3.94 to 4 shifts the ratio by
    2.8% all on its own. That is not distortion the code introduced, it is the pixel grid,
    and no implementation can do better. What *is* guaranteed is that each side is within
    half a pixel of one common scale factor — assert that instead.
    """
    src_w, src_h = 1920, 1080
    scale = min(dst[0] / src_w, dst[1] / src_h)
    box = letterbox(src_w, src_h, *dst)
    assert abs(box.w - src_w * scale) <= 0.5 + 1e-9
    assert abs(box.h - src_h * scale) <= 0.5 + 1e-9


@pytest.mark.parametrize("dst", [(1280, 720), (2000, 700), (640, 1000), (1301, 933)])
def test_aspect_ratio_holds_at_any_realistic_window_size(dst):
    """A circle in the video stays a circle. At real window sizes rounding is negligible."""
    box = letterbox(1920, 1080, *dst)
    assert abs(box.w / box.h - 1920 / 1080) < 0.005


def test_degenerate_sizes_do_not_explode():
    """A widget is 0x0 for one paint during startup and on some resizes."""
    assert letterbox(1920, 1080, 0, 0) == Rect(0, 0, 0, 0)
    assert letterbox(0, 0, 100, 100) == Rect(0, 0, 0, 0)


def test_frame_points_map_into_the_letterboxed_picture():
    """The overlay goes through this too, or dots and video disagree by the margin."""
    src = (1920, 1080)
    box = letterbox(*src, 2000, 720)
    assert frame_to_widget(0, 0, *src, box) == pytest.approx((box.x, box.y))
    assert frame_to_widget(1920, 1080, *src, box) == pytest.approx((box.right, box.bottom))
    mid = frame_to_widget(960, 540, *src, box)
    assert mid == pytest.approx((box.x + box.w / 2, box.y + box.h / 2))


def test_mapping_is_a_pure_scale_so_the_overlay_cannot_shear():
    """Equal steps in the frame must be equal steps in the widget, in both axes."""
    src = (1920, 1080)
    box = letterbox(*src, 1301, 933)
    xs = [frame_to_widget(x, 0, *src, box)[0] for x in (0, 480, 960, 1440, 1920)]
    steps = [b - a for a, b in zip(xs, xs[1:])]
    assert max(steps) - min(steps) < 1e-9
