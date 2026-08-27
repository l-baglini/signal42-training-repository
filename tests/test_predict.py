"""Tests for the live inference path, driven by synthetic heatmaps.

No OpenVINO, no model file, no camera. The neural network is replaced by a callable that
returns heatmaps we control, which is what makes the interesting cases testable at all:
a model that has gone blind, a model confidently wrong about one fret, a model that can
only see the last four frets. Those are the situations where v1 drew nonsense, so they are
the ones worth pinning down.
"""

from __future__ import annotations

import numpy as np
import pytest

from fretguide.dataset import (
    INPUT_H,
    INPUT_W,
    STRIDE,
    canonical_uv,
    fret_width_error,
    letterbox_matrix,
    render_heatmaps,
)
from fretguide.geometry import apply_homography, fret_u
from fretguide.predict import FretboardModel, Pose
from fretguide.types import UV

from test_dataset import synth_H

FULL_W, FULL_H = 1920, 1080


def heatmaps_for(H_full: np.ndarray, conf: np.ndarray | None = None,
                 sigma: float = 1.5) -> np.ndarray:
    """Heatmaps a perfect model would emit for a board at ``H_full``.

    ``conf`` scales each channel's peak, so a channel can be made weak (the net unsure) or
    empty (the fret hidden by a hand).
    """
    S = letterbox_matrix(FULL_W, FULL_H, INPUT_W, INPUT_H)
    pts = apply_homography(S @ H_full, canonical_uv(12))
    hm = render_heatmaps(pts, INPUT_W // STRIDE, INPUT_H // STRIDE, STRIDE, sigma)
    if conf is not None:
        hm = hm * np.asarray(conf, dtype=np.float32)[:, None, None]
    return hm[None]  # (1, K, h, w), as the exported model returns


def model_returning(hm: np.ndarray, **kwargs) -> FretboardModel:
    return FretboardModel(lambda x: hm, **kwargs)


BLANK = np.zeros((FULL_H, FULL_W), np.uint8)


# --------------------------------------------------------------------------- #
# The happy path
# --------------------------------------------------------------------------- #


def test_perfect_heatmaps_give_a_pose_at_full_resolution():
    """The returned H must map board coords to FULL-frame pixels, not network pixels.

    Getting this wrong is a 3x scale error that would look like a plausible overlay sitting
    in the wrong part of the screen, so it is worth an explicit test.
    """
    H = synth_H()
    m = model_returning(heatmaps_for(H), smooth=False)
    p = m(BLANK)
    assert p.H is not None, p.reason
    assert p.n_keypoints == 26
    assert fret_width_error(p.H, H).max() < 0.05
    # The nut should land where the true pose puts it, in full-resolution coordinates.
    got = apply_homography(p.H, UV(0.0, 0.0))[0]
    want = apply_homography(H, UV(0.0, 0.0))[0]
    assert np.linalg.norm(got - want) < 5.0


def test_debug_keypoints_are_in_full_resolution_pixels_too():
    """They are drawn straight onto the full frame, so they share H's coordinate system."""
    H = synth_H()
    p = model_returning(heatmaps_for(H), smooth=False)(BLANK)
    expect = apply_homography(H, canonical_uv(12))
    err = np.linalg.norm(p.pts - expect, axis=1)
    assert err.max() < 5.0
    assert p.pts[:, 0].max() > INPUT_W, "keypoints look like network-space coordinates"


def test_a_colour_frame_is_accepted():
    H = synth_H()
    m = model_returning(heatmaps_for(H), smooth=False)
    assert m(np.zeros((FULL_H, FULL_W, 3), np.uint8)).H is not None


def test_output_without_a_batch_dimension_also_works():
    """Some exports drop the leading 1. Accept both rather than crash on one."""
    H = synth_H()
    assert model_returning(heatmaps_for(H)[0], smooth=False)(BLANK).H is not None


# --------------------------------------------------------------------------- #
# Refusing to draw
# --------------------------------------------------------------------------- #


def test_a_blind_model_is_refused_not_guessed():
    """All-zero heatmaps: dim the screen, never invent a pose."""
    m = model_returning(np.zeros((1, 26, INPUT_H // STRIDE, INPUT_W // STRIDE), np.float32))
    p = m(BLANK)
    assert p.H is None
    assert p.reason
    assert p.n_keypoints == 0


def test_a_pose_from_only_the_top_frets_is_refused():
    """THE v1 DEFECT. Frets 9-12 alone measured 1.37 fret-widths of error, worst 5.29.

    A short-baseline fit is not slightly wrong, it is wild once evaluated at the nut. The
    spread gate must refuse it even though the keypoints are individually perfect and
    confident, and even though there are enough of them to fit a homography.
    """
    H = synth_H()
    conf = np.zeros(26)
    conf[2 * 9:] = 1.0  # frets 9..12, both ends: 8 confident keypoints
    p = model_returning(heatmaps_for(H, conf), smooth=False)(BLANK)
    assert p.H is None, "drew from a 4-fret baseline"
    assert "spread" in p.reason.lower(), p.reason


def test_a_wide_baseline_of_the_same_size_is_accepted():
    """Contrast with the above: 8 keypoints are enough when they SPAN the neck.

    Pinning this down matters because otherwise the previous test would pass just as well
    with a gate that stupidly demanded lots of keypoints.
    """
    H = synth_H()
    conf = np.zeros(26)
    for n in (0, 4, 8, 12):
        conf[2 * n:2 * n + 2] = 1.0
    p = model_returning(heatmaps_for(H, conf), smooth=False)(BLANK)
    assert p.H is not None, p.reason
    assert p.n_keypoints == 8
    assert fret_width_error(p.H, H).max() < 0.1


def test_low_confidence_everywhere_is_refused():
    H = synth_H()
    p = model_returning(heatmaps_for(H, np.full(26, 0.05)), smooth=False)(BLANK)
    assert p.H is None


# --------------------------------------------------------------------------- #
# Partial occlusion — the fretting hand
# --------------------------------------------------------------------------- #


def test_a_hand_over_the_middle_of_the_neck_does_not_lose_the_pose():
    """Frets 4-7 hidden. The remaining keypoints still span the neck, so it must draw."""
    H = synth_H()
    conf = np.ones(26)
    conf[2 * 4:2 * 8] = 0.0
    p = model_returning(heatmaps_for(H, conf), smooth=False)(BLANK)
    assert p.H is not None, p.reason
    assert p.n_keypoints == 18
    assert fret_width_error(p.H, H).max() < 0.05


def test_one_confidently_wrong_fret_is_trimmed_from_the_pose():
    """The plausible model failure: fret 5 predicted at fret 7, with high confidence."""
    H = synth_H()
    hm = heatmaps_for(H)
    hm[0, 10] = hm[0, 14]  # fret 5 low-E channel now peaks at fret 7's position
    hm[0, 11] = hm[0, 15]
    p = model_returning(hm, smooth=False)(BLANK)
    assert p.H is not None, p.reason
    assert p.n_keypoints <= 24, "the wrong keypoints were kept as inliers"
    assert fret_width_error(p.H, H).max() < 0.1


# --------------------------------------------------------------------------- #
# Temporal smoothing
# --------------------------------------------------------------------------- #


def test_smoothing_reduces_jitter_on_a_stationary_guitar():
    """The whole reason smoothing exists: independent per-frame poses shimmer."""
    H = synth_H()
    rng = np.random.default_rng(0)
    S = letterbox_matrix(FULL_W, FULL_H, INPUT_W, INPUT_H)
    base = apply_homography(S @ H, canonical_uv(12))

    def jittery(seed_holder=[0]):
        pts = base + rng.normal(0.0, 1.2, base.shape)
        hm = render_heatmaps(pts, INPUT_W // STRIDE, INPUT_H // STRIDE, STRIDE, 1.5)
        return hm[None]

    nut = {}
    for label, smooth in (("raw", False), ("smoothed", True)):
        rng = np.random.default_rng(0)  # identical noise sequence for both
        m = FretboardModel(lambda x: jittery(), smooth=smooth, freq=30.0)
        xs = []
        for i in range(40):
            p = m(BLANK, t=i / 30.0)
            assert p.H is not None, p.reason
            xs.append(apply_homography(p.H, UV(0.0, 0.0))[0])
        nut[label] = np.asarray(xs)[5:]  # drop the filter's warm-up

    raw_jitter = nut["raw"].std(axis=0).mean()
    smooth_jitter = nut["smoothed"].std(axis=0).mean()
    assert smooth_jitter < raw_jitter * 0.7, (
        f"smoothing barely helped: {smooth_jitter:.3f} vs raw {raw_jitter:.3f} px"
    )


def test_smoothing_does_not_bias_the_steady_state():
    """Low jitter is worthless if the overlay settles in the wrong place."""
    H = synth_H()
    m = FretboardModel(lambda x, _hm=heatmaps_for(H): _hm, smooth=True, freq=30.0)
    for i in range(30):
        p = m(BLANK, t=i / 30.0)
    assert fret_width_error(p.H, H).max() < 0.05


def test_a_refused_frame_resets_the_filter():
    """Filtering across a gap would drag the next good pose toward a stale one.

    Verified by posing a board, losing it, then reappearing somewhere else: the first frame
    after the gap must be at the new position, not partway back to the old one.
    """
    H1 = synth_H(angle_deg=10.0)
    H2 = synth_H(angle_deg=40.0)
    blank = np.zeros((1, 26, INPUT_H // STRIDE, INPUT_W // STRIDE), np.float32)
    seq = [heatmaps_for(H1)] * 10 + [blank] * 3 + [heatmaps_for(H2)]
    it = iter(seq)
    m = FretboardModel(lambda x: next(it), smooth=True, freq=30.0)
    for i in range(len(seq) - 1):
        m(BLANK, t=i / 30.0)
    p = m(BLANK, t=(len(seq) - 1) / 30.0)
    assert p.H is not None, p.reason
    # Straight to the new pose, because the filter was reset by the blank frames.
    assert fret_width_error(p.H, H2).max() < 0.05


def test_reset_is_safe_to_call_when_smoothing_is_off():
    m = model_returning(heatmaps_for(synth_H()), smooth=False)
    m.reset()
    assert m(BLANK).H is not None


# --------------------------------------------------------------------------- #
# Loading
# --------------------------------------------------------------------------- #


def test_missing_model_file_says_what_to_do():
    from fretguide.predict import openvino_infer

    with pytest.raises(FileNotFoundError) as e:
        openvino_infer("models/definitely-not-here.xml")
    assert "train.py" in str(e.value)


def test_letterbox_matrix_is_reused_across_frames_of_one_size():
    """Recomputing it per frame is wasted work in a 32 ms budget."""
    H = synth_H()
    m = model_returning(heatmaps_for(H), smooth=False)
    m(BLANK)
    first = m._S
    m(BLANK)
    assert m._S is first
    m(np.zeros((720, 1280), np.uint8))
    assert m._S is not first, "letterbox not recomputed for a new frame size"
