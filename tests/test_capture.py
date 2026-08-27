"""Splitting a raw 4:2:0 buffer into Y, U and V.

Worth testing carefully out of proportion to its size. Every 4:2:0 layout is exactly
``width * height * 3 // 2`` bytes, so picking the wrong one does not raise, does not
change the shape, and does not corrupt the greyscale image the tracker uses. It produces
a perfectly sharp picture with the colours wrong -- which looks like a camera problem, a
driver problem or a white-balance problem, and is none of them.

``split_yuv420`` is a pure function precisely so this can be proven here rather than
discovered on a guitar.
"""

from __future__ import annotations

import cv2
import numpy as np
import pytest

from fretguide.capture import _fourcc_str, split_yuv420

W, H = 16, 12
HALF = (H // 2, W // 2)


def planes(seed: int = 3):
    """Three distinguishable planes. Distinct value ranges, so a swap cannot go unnoticed."""
    rng = np.random.default_rng(seed)
    y = rng.integers(16, 235, (H, W), dtype=np.uint8)
    u = rng.integers(0, 60, HALF, dtype=np.uint8)  # low
    v = rng.integers(190, 255, HALF, dtype=np.uint8)  # high — never confusable with u
    return y, u, v


def pack(y, u, v, layout: str) -> np.ndarray:
    first, second = (u, v) if layout != "YV12" else (v, u)
    if layout == "NV12":
        uv = np.empty((H // 2, W), np.uint8)
        uv[:, 0::2], uv[:, 1::2] = u, v
        return np.concatenate([y.reshape(-1), uv.reshape(-1)])
    return np.concatenate([y.reshape(-1), first.reshape(-1), second.reshape(-1)])


@pytest.mark.parametrize("layout", ["I420", "IYUV", "YU12", "YV12", "NV12"])
def test_every_supported_layout_round_trips_exactly(layout):
    """Not approximately: these are byte views, so anything but equality is a bug."""
    y, u, v = planes()
    got_y, got_u, got_v = split_yuv420(pack(y, u, v, layout), W, H, layout)
    assert np.array_equal(got_y, y)
    assert np.array_equal(got_u, u), f"{layout}: U plane wrong (chroma swapped?)"
    assert np.array_equal(got_v, v), f"{layout}: V plane wrong (chroma swapped?)"


def test_yv12_is_not_silently_treated_as_i420():
    """The two differ only in chroma order — the exact mistake this guards against."""
    y, u, v = planes()
    as_i420 = split_yuv420(pack(y, u, v, "YV12"), W, H, "I420")
    assert not np.array_equal(as_i420[1], u), "YV12 and I420 decoded identically"


def test_unknown_layouts_are_refused_rather_than_guessed():
    """Returning None lets the caller fall back to OpenCV's own conversion. Guessing
    would hand back a plausible image with red and blue swapped."""
    y, u, v = planes()
    assert split_yuv420(pack(y, u, v, "I420"), W, H, "YUYV") is None
    assert split_yuv420(pack(y, u, v, "I420"), W, H, "") is None


def test_a_buffer_of_the_wrong_size_is_refused():
    assert split_yuv420(np.zeros(10, np.uint8), W, H, "I420") is None


def _yuv_to_bgr(y, u, v):
    """The BT.601 limited-range maths the shader does, in numpy."""
    up = cv2.resize(u, (W, H), interpolation=cv2.INTER_NEAREST).astype(np.float32) - 128
    vp = cv2.resize(v, (W, H), interpolation=cv2.INTER_NEAREST).astype(np.float32) - 128
    yy = 1.164383 * (y.astype(np.float32) - 16.0)
    rgb = np.stack([yy + 1.596027 * vp,
                    yy - 0.812968 * vp - 0.391762 * up,
                    yy + 2.017232 * up], axis=-1)
    return np.clip(rgb, 0, 255).astype(np.uint8)[..., ::-1]  # RGB -> BGR


def _blocky_bgr(seed: int = 11) -> np.ndarray:
    """Saturated colour in 2x2 blocks, aligned to the chroma grid.

    Deliberately not random noise. 4:2:0 stores one chroma sample per 2x2 block, so on
    noise three of every four pixels get chroma that was never theirs and the error swamps
    everything -- including the error from decoding the wrong plane, which is the only
    thing this test is trying to see. Aligned blocks make subsampling nearly lossless, so
    the tolerance can be tight enough to actually discriminate.
    """
    rng = np.random.default_rng(seed)
    small = rng.integers(0, 255, (H // 2, W // 2, 3), dtype=np.uint8)
    return np.repeat(np.repeat(small, 2, axis=0), 2, axis=1)


def test_our_i420_matches_opencvs_i420():
    """An independent oracle for the plane arithmetic.

    OpenCV builds the I420 buffer; we split it and reassemble a colour image with the
    BT.601 maths the shader uses. If our idea of where U and V live disagreed with the
    library that produced the bytes, this is where it shows -- and OpenCV is the same code
    path that fills the buffer at capture time.
    """
    bgr = _blocky_bgr()
    buf = cv2.cvtColor(bgr, cv2.COLOR_BGR2YUV_I420).reshape(-1)
    y, u, v = split_yuv420(buf, W, H, "I420")
    assert y.shape == (H, W) and u.shape == HALF and v.shape == HALF

    err = np.abs(_yuv_to_bgr(y, u, v).astype(int) - bgr.astype(int)).mean()
    assert err < 6, f"decoded colour is {err:.1f} levels off OpenCV's own encoding"


def test_the_oracle_would_notice_a_swapped_plane():
    """Proves the previous test discriminates, rather than passing on anything.

    A test whose tolerance is loose enough to accept a chroma swap is worse than no test,
    because it reads as coverage. This asserts the failure it is supposed to catch really
    does fail.
    """
    bgr = _blocky_bgr()
    buf = cv2.cvtColor(bgr, cv2.COLOR_BGR2YUV_I420).reshape(-1)
    y, u, v = split_yuv420(buf, W, H, "I420")

    good = np.abs(_yuv_to_bgr(y, u, v).astype(int) - bgr.astype(int)).mean()
    swapped = np.abs(_yuv_to_bgr(y, v, u).astype(int) - bgr.astype(int)).mean()
    assert swapped > good * 5, (
        f"swapping U and V changed the result by too little (good {good:.1f}, "
        f"swapped {swapped:.1f}) -- this oracle cannot see the bug it exists for"
    )


def test_fourcc_decoding():
    assert _fourcc_str(float(int.from_bytes(b"YU12", "little"))) == "YU12"
    assert _fourcc_str(float(int.from_bytes(b"NV12", "little"))) == "NV12"
