"""Tests for the training-data pipeline. Numpy + cv2 only, so they run without torch.

The one that matters most is :func:`test_perfect_heatmaps_meet_the_accuracy_budget`.
It establishes the CEILING of the whole design: if ground-truth heatmaps, decoded and
turned back into a pose, cannot place dots inside the accuracy budget, then no amount of
training can, and the representation is wrong. Every other test here guards a specific
way the pipeline could silently corrupt labels.
"""

from __future__ import annotations

import json

import cv2
import numpy as np
import pytest

from fretguide.dataset import (
    DEFAULT_MAX_FRET,
    INPUT_H,
    INPUT_W,
    STRIDE,
    AugConfig,
    canonical_uv,
    decode_heatmaps,
    fret_width_error,
    homography_from_keypoints,
    letterbox_matrix,
    load_dataset,
    make_sample,
    n_keypoints,
    photometric,
    random_geometric_warp,
    render_heatmaps,
    robust_label_homography,
    split_by_capture_order,
)
from fretguide.geometry import apply_homography, fret_u
from fretguide.types import UV

BUDGET_FRET_WIDTHS = 0.25  # docs/research/00-diagnosis.md


# --------------------------------------------------------------------------- #
# Synthetic ground truth
# --------------------------------------------------------------------------- #


def synth_H(w: int = 1920, h: int = 1080, angle_deg: float = 20.0) -> np.ndarray:
    """A plausible board pose: rotated, foreshortened, roughly where a real one sits."""
    quad = np.float32([[0, 0], [1, 0], [1, 1], [0, 1]])
    a = np.deg2rad(angle_deg)
    c, s = np.cos(a), np.sin(a)
    dst = []
    for (u, v) in [(0.0, 0.0), (0.5, 0.0), (0.5, 1.0), (0.0, 1.0)]:
        x, y = u * 1500.0, v * 170.0
        # a little perspective: the far end is smaller
        k = 1.0 + 0.25 * u
        dst.append([300 + (x * c - y * s) / k, 260 + (x * s + y * c) / k])
    return cv2.getPerspectiveTransform(
        np.float32([[0, 0], [fret_u(DEFAULT_MAX_FRET), 0],
                    [fret_u(DEFAULT_MAX_FRET), 1], [0, 1]]),
        np.float32(dst),
    ).astype(np.float64)


def label_from_H(H: np.ndarray, max_fret: int = DEFAULT_MAX_FRET, noise: float = 0.0,
                 seed: int = 0) -> dict:
    rng = np.random.default_rng(seed)
    frets = {}
    for n in range(max_fret + 1):
        pts = apply_homography(H, [UV(fret_u(n), 0.0), UV(fret_u(n), 1.0)])
        if noise:
            pts = pts + rng.normal(0.0, noise, pts.shape)
        frets[str(n)] = [[float(pts[0][0]), float(pts[0][1])],
                         [float(pts[1][0]), float(pts[1][1])]]
    return {"frets": frets, "far_fret": max_fret}


def synth_frame(H: np.ndarray, w: int = 1920, h: int = 1080) -> np.ndarray:
    """A textured board with visible fret wires, on a textured background."""
    rng = np.random.default_rng(7)
    img = (rng.normal(120, 18, (h, w))).clip(0, 255).astype(np.uint8)
    quad = np.int32(apply_homography(H, [UV(0, 0), UV(fret_u(12), 0),
                                         UV(fret_u(12), 1), UV(0, 1)]))
    cv2.fillPoly(img, [quad], 60)
    for n in range(13):
        a, b = apply_homography(H, [UV(fret_u(n), 0.0), UV(fret_u(n), 1.0)])
        cv2.line(img, tuple(np.int32(a)), tuple(np.int32(b)), 210, 2, cv2.LINE_AA)
    return img


# --------------------------------------------------------------------------- #
# Canonical keypoints
# --------------------------------------------------------------------------- #


def test_channel_order_matches_the_labeller_convention():
    """Channel 2n is the low-E edge (v=0) of fret n, 2n+1 the high-E edge (v=1).

    tools/collect.py writes endpoints in exactly this order. If the two ever disagree,
    training silently learns mirrored keypoints and every dot lands on the wrong string.
    """
    canon = canonical_uv(12)
    assert len(canon) == n_keypoints(12) == 26
    for n in range(13):
        assert canon[2 * n] == UV(fret_u(n), 0.0)
        assert canon[2 * n + 1] == UV(fret_u(n), 1.0)


def test_keypoints_follow_the_fret_law_not_linear_spacing():
    canon = canonical_uv(12)
    us = [canon[2 * n].u for n in range(13)]
    assert us[12] == pytest.approx(0.5)
    gaps = np.diff(us)
    # Frets bunch toward the bridge: every gap strictly smaller than the last.
    assert np.all(np.diff(gaps) < 0)


# --------------------------------------------------------------------------- #
# Label -> homography
# --------------------------------------------------------------------------- #


def test_noiseless_label_recovers_its_homography_exactly():
    H = synth_H()
    H_fit, rms, across = robust_label_homography(label_from_H(H))
    assert rms < 1e-6 and across < 1e-6
    canon = canonical_uv(12)
    err = np.linalg.norm(apply_homography(H_fit, canon) - apply_homography(H, canon), axis=1)
    assert err.max() < 1e-6


def test_fit_averages_away_click_noise():
    """26 points for 8 unknowns: the fit must be better than the points it was given."""
    H = synth_H()
    noise = 3.0
    H_fit, _, _ = robust_label_homography(label_from_H(H, noise=noise, seed=3))
    canon = canonical_uv(12)
    err = np.linalg.norm(apply_homography(H_fit, canon) - apply_homography(H, canon), axis=1)
    assert err.mean() < noise, f"fit ({err.mean():.2f}px) no better than input noise ({noise}px)"


def test_irls_rejects_a_single_stray_endpoint():
    """The real set contains a nut endpoint 80 px out. It must not drag the pose."""
    H = synth_H()
    label = label_from_H(H)
    label["frets"]["0"][0] = [label["frets"]["0"][0][0] + 80.0,
                              label["frets"]["0"][0][1] - 60.0]
    H_fit, rms, _ = robust_label_homography(label)
    canon = canonical_uv(12)
    err = np.linalg.norm(apply_homography(H_fit, canon) - apply_homography(H, canon), axis=1)
    assert err.max() < 2.0, f"stray click moved the pose by {err.max():.1f}px"
    assert rms > 5.0, "rms should still report that a bad point exists"


def test_across_and_along_residuals_are_reported_separately():
    """Jitter ALONG the wires must not be penalised like jitter across them.

    This is why the load gate uses the across component: on the real set the along-wire
    scatter is 3x larger and entirely harmless.

    The jitter has to be RANDOM per endpoint. A uniform slide of every endpoint along its
    wire is a v-axis scaling, which a homography represents exactly -- measured, it comes
    out as 0.4 px of residual, absorbed rather than reported. Only incoherent noise shows
    up as residual at all.
    """
    H = synth_H()
    label = label_from_H(H)
    rng = np.random.default_rng(2)
    for n in range(13):
        a, b = np.array(label["frets"][str(n)][0]), np.array(label["frets"][str(n)][1])
        d = (b - a) / np.linalg.norm(b - a)
        label["frets"][str(n)][0] = list(a + d * rng.normal(0.0, 14.0))
        label["frets"][str(n)][1] = list(b + d * rng.normal(0.0, 14.0))
    _, rms, across = robust_label_homography(label)
    assert rms > 5.0, f"14px of along-wire jitter should show in the total residual ({rms:.2f})"
    assert across < rms / 3.0, (
        f"along-wire jitter leaked into the across residual (across {across:.2f}px "
        f"vs total {rms:.2f}px)"
    )


# --------------------------------------------------------------------------- #
# Splitting
# --------------------------------------------------------------------------- #


def test_split_holds_out_whole_blocks_never_single_frames():
    """Never a random split: consecutive real frames are near-duplicates.

    Holding out runs of consecutive frames keeps a frame's near-twins on the same side, so
    the validation score is not quietly measuring memorisation.
    """
    frames = list(range(240))
    train, val = split_by_capture_order(frames, 0.2, block=24)
    assert set(train).isdisjoint(val)
    assert len(train) + len(val) == len(frames)
    assert 0.1 < len(val) / len(frames) < 0.3
    # Every validation frame's block must be entirely in validation.
    val_blocks = {v // 24 for v in val}
    for f in frames:
        assert (f in val) == (f // 24 in val_blocks)


def test_split_puts_the_newest_frames_on_both_sides():
    """A tail split wastes exactly the frames captured to add variety.

    Measured on the real set: a tail split sent 77 of 99 newly-captured frames to
    validation, so the model trained almost entirely on the old single-pose batch and was
    then judged on poses it had never seen.
    """
    frames = list(range(400))
    newest = set(range(300, 400))  # a freshly appended, deliberately varied batch
    train, val = split_by_capture_order(frames, 0.2, block=24)
    in_train = len(newest & set(train))
    assert in_train > 0.5 * len(newest), (
        f"only {in_train}/{len(newest)} of the newest frames are used for training"
    )
    assert len(newest & set(val)) > 0, "and some must still be held out to measure on"


def test_split_degrades_gracefully_on_a_tiny_set():
    for n in (2, 3, 5, 9):
        train, val = split_by_capture_order(list(range(n)), 0.2, block=24)
        assert train and val and set(train).isdisjoint(val)


# --------------------------------------------------------------------------- #
# Letterbox
# --------------------------------------------------------------------------- #


def test_letterbox_preserves_aspect_and_centres():
    S = letterbox_matrix(1920, 1080, INPUT_W, INPUT_H)
    assert S[0, 0] == pytest.approx(S[1, 1]), "non-uniform scale would distort the board"
    corners = apply_homography(S, [(0, 0), (1920, 1080)])
    assert corners[0][0] == pytest.approx(0.0)
    assert corners[1][0] == pytest.approx(INPUT_W)
    # 1080 * (640/1920) = 360, so 12px of padding top and bottom
    assert corners[0][1] == pytest.approx(12.0)
    assert corners[1][1] == pytest.approx(INPUT_H - 12.0)


# --------------------------------------------------------------------------- #
# Heatmap encode / decode
# --------------------------------------------------------------------------- #


def test_heatmap_decode_is_subpixel_accurate():
    """Integer peaks would spend a third of the budget; the soft-argmax must beat them."""
    rng = np.random.default_rng(0)
    pts = rng.uniform([40, 40], [INPUT_W - 40, INPUT_H - 40], size=(26, 2))
    hm = render_heatmaps(pts, INPUT_W // STRIDE, INPUT_H // STRIDE, STRIDE)
    got, conf = decode_heatmaps(hm, STRIDE)
    err = np.linalg.norm(got - pts, axis=1)
    # Measured 0.09 px mean / 0.21 px max with the chosen sigma=1.5, window=2, rel=0.3.
    assert err.max() < 0.3, f"worst keypoint off by {err.max():.3f} input px"
    assert conf.min() > 0.5


def test_decode_ignores_a_secondary_peak_in_the_same_channel():
    """The net being torn between two frets must not average them into a third place.

    Without the relative threshold a wide window reads the midpoint, which is on neither
    fret -- 1 px of error at window 4, an order of magnitude worse than the truncation
    bias a wide window was meant to fix.
    """
    rng = np.random.default_rng(1)
    pts = rng.uniform([60, 60], [INPUT_W - 60, INPUT_H - 60], size=(26, 2))
    hm = render_heatmaps(pts, INPUT_W // STRIDE, INPUT_H // STRIDE, STRIDE)
    decoy = render_heatmaps(pts + np.array([10.0, 0.0]),
                            INPUT_W // STRIDE, INPUT_H // STRIDE, STRIDE) * 0.6
    got, _ = decode_heatmaps(np.maximum(hm, decoy), STRIDE)
    err = np.linalg.norm(got - pts, axis=1)
    assert err.max() < 0.3, f"decoy pulled a keypoint {err.max():.3f} px off"


def test_offscreen_keypoint_gets_an_empty_channel():
    """An all-zero channel is the 'not visible' signal the pose fit relies on."""
    pts = np.array([[100.0, 100.0]] * 26)
    pts[5] = [-500.0, -500.0]
    hm = render_heatmaps(pts, INPUT_W // STRIDE, INPUT_H // STRIDE, STRIDE)
    assert hm[5].max() == 0.0
    _, conf = decode_heatmaps(hm, STRIDE)
    assert conf[5] == 0.0
    assert conf[4] > 0.5


# --------------------------------------------------------------------------- #
# Keypoints -> pose
# --------------------------------------------------------------------------- #


def test_pose_fit_rejects_a_confidently_wrong_keypoint():
    """Mistaking fret 5 for fret 7 is the plausible net failure. It must be trimmed."""
    H = synth_H()
    canon = canonical_uv(12)
    pts = apply_homography(H, canon)
    conf = np.full(26, 0.9)
    pts[10] = pts[14]  # fret 5 low-E edge predicted at fret 7's position, confidently
    H_fit, mask = homography_from_keypoints(pts, conf)
    assert H_fit is not None
    assert not mask[10], "the wrong keypoint was treated as an inlier"
    err = fret_width_error(H_fit, H)
    assert err.max() < 0.05


def test_pose_refused_when_too_few_keypoints_are_confident():
    H = synth_H()
    pts = apply_homography(H, canonical_uv(12))
    conf = np.zeros(26)
    conf[:6] = 0.9
    H_fit, mask = homography_from_keypoints(pts, conf, min_points=8)
    assert H_fit is None and not mask.any(), "refusing to draw beats drawing nonsense"


def test_low_confidence_keypoints_are_ignored_entirely():
    H = synth_H()
    canon = canonical_uv(12)
    pts = apply_homography(H, canon)
    conf = np.full(26, 0.9)
    for i in (0, 1, 24, 25):
        pts[i] += 300.0  # garbage...
        conf[i] = 0.02  # ...but honestly flagged as garbage
    H_fit, mask = homography_from_keypoints(pts, conf)
    assert H_fit is not None
    assert not mask[[0, 1, 24, 25]].any()
    assert fret_width_error(H_fit, H).max() < 0.05


# --------------------------------------------------------------------------- #
# The metric itself
# --------------------------------------------------------------------------- #


def test_fret_width_error_is_zero_for_an_identical_pose():
    H = synth_H()
    assert fret_width_error(H, H).max() < 1e-9


def test_fret_width_error_scales_with_a_known_offset():
    """A pose shifted by exactly one fret-width must read as ~1.0, not as pixels."""
    H = synth_H()
    # Shift in board space by the fret 11->12 gap, the tightest spacing on the neck.
    gap = fret_u(12) - fret_u(11)
    shift = np.array([[1.0, 0.0, gap], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]])
    err = fret_width_error(H @ shift, H)
    # A constant offset in u, but fret width varies along the neck, so the reading varies
    # too: exactly 1.0 at fret 12 where the gap equals the shift, and the ratio of the
    # tightest gap to the widest one near the nut at the other end.
    assert err.max() == pytest.approx(1.0, rel=0.05)
    widest = fret_u(1) - fret_u(0)
    assert err.min() == pytest.approx(gap / widest, rel=0.05)
    assert err.min() < 0.6  # the neck's gap ratio is ~2x over 12 frets, never more


# --------------------------------------------------------------------------- #
# Augmentation
# --------------------------------------------------------------------------- #


def test_augmentation_actually_moves_the_board():
    """The captured set covers one pose. If aug does not diversify, nothing does."""
    H = synth_H()
    S = letterbox_matrix(1920, 1080)
    board = apply_homography(S @ H, canonical_uv(12))
    cfg = AugConfig()
    centres, angles, scales = [], [], []
    for seed in range(60):
        A = random_geometric_warp(np.random.default_rng(seed), board, cfg)
        w = apply_homography(A, board)
        centres.append(w.mean(axis=0))
        axis = w[-2:].mean(axis=0) - w[:2].mean(axis=0)
        angles.append(np.degrees(np.arctan2(axis[1], axis[0])))
        scales.append(np.linalg.norm(axis))
    centres = np.array(centres)
    # The real dataset spans 17 degrees of angle and 1.35x of scale. Augmentation has to
    # do substantially better than that or the model just memorises the one pose.
    assert np.ptp(angles) > 45.0, f"only {np.ptp(angles):.0f} deg of rotation"
    assert max(scales) / min(scales) > 1.8
    assert np.ptp(centres[:, 0]) > 200.0 and np.ptp(centres[:, 1]) > 100.0


def test_augmented_labels_stay_glued_to_augmented_pixels():
    """The classic keypoint-aug bug: image warped, points not (or differently).

    Checked by warping a synthetic frame whose fret wires are drawn bright, then
    verifying the returned pose still lands on bright pixels.
    """
    H = synth_H()
    img_full = synth_frame(H)
    rng = np.random.default_rng(11)
    cfg = AugConfig(brightness=0.0, contrast=0.0, gamma=0.0, noise_sigma=0.0,
                    blur_max=0, occluders=0)
    for _ in range(12):
        img, hm, H_in = make_sample(img_full, H, rng, cfg)
        pts = apply_homography(H_in, canonical_uv(12))
        inside = ((pts[:, 0] > 2) & (pts[:, 0] < INPUT_W - 3)
                  & (pts[:, 1] > 2) & (pts[:, 1] < INPUT_H - 3))
        assert inside.sum() >= 10
        # Sample the warped image at the label positions: fret wires were drawn at 210
        # on a board of 60, so a correct label sits on something clearly brighter.
        vals = np.array([img[int(round(y)), int(round(x))] for x, y in pts[inside]])
        assert np.median(vals) > 90, (
            f"labels landed on median intensity {np.median(vals):.0f}; "
            "image and points are out of sync"
        )


def test_heatmap_peaks_agree_with_the_returned_homography():
    H = synth_H()
    img_full = synth_frame(H)
    rng = np.random.default_rng(5)
    img, hm, H_in = make_sample(img_full, H, rng, AugConfig())
    pts, conf = decode_heatmaps(hm, STRIDE)
    expect = apply_homography(H_in, canonical_uv(12))
    visible = conf > 0.5
    assert visible.sum() >= 10
    err = np.linalg.norm(pts[visible] - expect[visible], axis=1)
    assert err.max() < 1.0


def test_still_config_is_a_true_noop():
    """Validation must measure the model, not a warp of the validation set."""
    H = synth_H()
    img_full = synth_frame(H)
    cfg = AugConfig().still()
    img_a, hm_a, H_a = make_sample(img_full, H, np.random.default_rng(1), cfg)
    img_b, hm_b, H_b = make_sample(img_full, H, np.random.default_rng(999), cfg)
    assert np.array_equal(img_a, img_b), "still() still randomises the image"
    assert np.allclose(H_a, H_b)
    assert np.allclose(H_a, letterbox_matrix(1920, 1080) @ H, atol=1e-9)


def test_photometric_leaves_geometry_untouched():
    rng = np.random.default_rng(0)
    img = (rng.normal(120, 25, (INPUT_H, INPUT_W))).clip(0, 255).astype(np.uint8)
    out = photometric(img, np.random.default_rng(4), AugConfig())
    assert out.shape == img.shape and out.dtype == np.uint8
    assert 0 <= out.min() and out.max() <= 255


def test_perfect_heatmaps_meet_the_accuracy_budget():
    """THE CEILING TEST. Encode -> decode -> pose, with no model error at all.

    If this fails the representation cannot work no matter how well the net trains, so
    it is the first thing to check after changing input size, stride, or sigma. Measured
    on the real 285-frame set this leaves roughly 14x of headroom.
    """
    H = synth_H()
    rng = np.random.default_rng(0)
    cfg = AugConfig()
    worst = 0.0
    for _ in range(25):
        _, hm, H_in = make_sample(np.zeros((1080, 1920), np.uint8), H, rng, cfg)
        pts, conf = decode_heatmaps(hm, STRIDE)
        H_fit, _ = homography_from_keypoints(pts, conf)
        assert H_fit is not None
        worst = max(worst, float(np.percentile(fret_width_error(H_fit, H_in), 95)))
    assert worst < BUDGET_FRET_WIDTHS / 4.0, (
        f"ceiling p95 {worst:.4f} fret-widths leaves too little room for model error"
    )


# --------------------------------------------------------------------------- #
# The real dataset on disk
# --------------------------------------------------------------------------- #


def test_real_dataset_loads_and_its_labels_are_inside_budget(tmp_path):
    """Skips cleanly if the dataset is absent, so CI on a fresh clone still passes."""
    import pathlib

    frames_dir = pathlib.Path("dataset/frames")
    labels = pathlib.Path("dataset/labels.json")
    if not labels.exists() or not frames_dir.exists():
        pytest.skip("no captured dataset in this checkout")

    frames = load_dataset(frames_dir, labels)
    assert len(frames) >= 4
    # Label noise must not eat the budget it is measured against.
    across = np.array([f.across_px for f in frames])
    assert np.median(across) < 8.0
    train, val = split_by_capture_order(frames)
    assert {f.path for f in train}.isdisjoint({f.path for f in val})


# --------------------------------------------------------------------------- #
# Background compositing — the fix for "the model learned the room"
# --------------------------------------------------------------------------- #


def test_board_mask_follows_the_neck_not_a_bounding_box():
    """The mask is built in board coordinates, so it must be a perspective quad."""
    from fretguide.dataset import board_mask

    H = letterbox_matrix(1920, 1080) @ synth_H()
    m = board_mask(H, 0.04, 0.5, 12, feather=2.0)
    assert m.shape == (INPUT_H, INPUT_W)
    assert 0.0 <= m.min() and m.max() <= 1.0 + 1e-6
    # Every labelled keypoint must be inside the kept region.
    for x, y in apply_homography(H, canonical_uv(12)):
        if 0 <= int(y) < INPUT_H and 0 <= int(x) < INPUT_W:
            assert m[int(y), int(x)] > 0.5, "the mask cuts through the fretboard"
    # And it must not simply keep everything: that would defeat the purpose.
    assert m.mean() < 0.5, "mask covers most of the frame; nothing would be replaced"


def test_compositing_severs_the_board_to_background_correlation():
    """THE POINT OF ALL THIS.

    A 200-epoch run reached 0.009 fret-widths on training frames and 4.4 on held-out ones
    by learning where the board usually sits relative to the room. Warping the whole image
    cannot prevent that -- the room and the guitar move together, so the relationship is
    preserved by construction. Compositing onto an independently-warped background is what
    removes the cue.

    Measured here as: does the background content still predict the board's position?
    """
    H = synth_H()
    board_img = synth_frame(H)
    # A background with one unmistakable landmark, so we can track where it went.
    bg = np.full((1080, 1920), 40, np.uint8)
    cv2.circle(bg, (1500, 800), 90, 235, -1)

    cfg = AugConfig(bg_replace_p=1.0, occluders=0, brightness=0.0, contrast=0.0,
                    gamma=0.0, noise_sigma=0.0, blur_max=0)
    rng = np.random.default_rng(0)
    offsets = []
    for _ in range(40):
        img, _, H_in = make_sample(board_img, H, rng, cfg, bg_gray=bg)
        board_c = apply_homography(H_in, canonical_uv(12)).mean(axis=0)
        ys, xs = np.nonzero(img > 200)
        if len(xs) < 30:
            continue  # landmark warped off-frame this draw
        offsets.append([xs.mean() - board_c[0], ys.mean() - board_c[1]])
    offsets = np.asarray(offsets)
    assert len(offsets) >= 12
    # If the landmark sat at a fixed offset from the board, the net could use it as a
    # pointer. Independent warps must scatter that offset widely.
    assert offsets[:, 0].std() > 60.0, (
        f"background landmark sits at a near-constant x-offset from the board "
        f"(std {offsets[:, 0].std():.1f} px); the shortcut survives"
    )


def test_composited_labels_are_still_glued_to_the_pixels():
    """Compositing must not shift the board relative to its label."""
    H = synth_H()
    board_img = synth_frame(H)
    bg = (np.random.default_rng(1).normal(110, 20, (1080, 1920))).clip(0, 255).astype(np.uint8)
    cfg = AugConfig(bg_replace_p=1.0, occluders=0, brightness=0.0, contrast=0.0,
                    gamma=0.0, noise_sigma=0.0, blur_max=0)
    rng = np.random.default_rng(4)
    for _ in range(10):
        img, _, H_in = make_sample(board_img, H, rng, cfg, bg_gray=bg)
        pts = apply_homography(H_in, canonical_uv(12))
        inside = ((pts[:, 0] > 2) & (pts[:, 0] < INPUT_W - 3)
                  & (pts[:, 1] > 2) & (pts[:, 1] < INPUT_H - 3))
        assert inside.sum() >= 10
        vals = np.array([img[int(round(y)), int(round(x))] for x, y in pts[inside]])
        # Fret wires are drawn at 210 on a board of 60; the background averages ~110.
        assert np.median(vals) > 90, (
            f"labels landed on median intensity {np.median(vals):.0f} after compositing"
        )


def test_still_config_disables_compositing():
    """Validation on natural frames must not be silently altered."""
    assert AugConfig().still().bg_replace_p == 0.0
    H = synth_H()
    img_a, _, _ = make_sample(synth_frame(H), H, np.random.default_rng(1),
                              AugConfig().still(), bg_gray=np.zeros((1080, 1920), np.uint8))
    img_b, _, _ = make_sample(synth_frame(H), H, np.random.default_rng(77),
                              AugConfig().still(), bg_gray=np.zeros((1080, 1920), np.uint8))
    assert np.array_equal(img_a, img_b)


def test_compositing_is_a_mixture_not_a_replacement():
    """Half the samples keep their real background: hands and body are honest cues."""
    cfg = AugConfig()
    assert 0.0 < cfg.bg_replace_p < 1.0


# --------------------------------------------------------------------------- #
# The three ways compositing itself went wrong
# --------------------------------------------------------------------------- #


def fretboard_energy(img: np.ndarray, H: np.ndarray, max_fret: int = 12) -> float:
    """Contrast along the fret wires -- high when a sharp fretboard is present there."""
    from fretguide.dataset import ERASE_U, ERASE_V

    quad = [UV(ERASE_U[0], ERASE_V[0]), UV(ERASE_U[1], ERASE_V[0]),
            UV(ERASE_U[1], ERASE_V[1]), UV(ERASE_U[0], ERASE_V[1])]
    pts = apply_homography(H, quad)
    m = np.zeros(img.shape[:2], np.uint8)
    cv2.fillConvexPoly(m, np.int32(pts), 1)
    if m.sum() < 50:
        return 0.0
    g = cv2.Laplacian(img.astype(np.float32), cv2.CV_32F, ksize=3)
    return float(np.abs(g)[m > 0].mean())


def test_erase_board_removes_the_whole_string_span_not_just_to_fret_12():
    """A background frame's own neck must not survive as an unlabelled fretboard.

    Covering only to fret 12 leaves frets 13-22 and the headstock sharp, which is exactly
    what showed up in the composites and is why ERASE_U runs past the bridge.
    """
    from fretguide.dataset import erase_board

    H = synth_H()
    img = synth_frame(H)
    before = fretboard_energy(img, H)
    after = fretboard_energy(erase_board(img, H), H)
    assert after < before * 0.35, (
        f"fret structure survived erasure ({after:.1f} vs {before:.1f}); a background frame "
        "would still contain a recognisable fretboard"
    )


def test_composite_contains_exactly_one_sharp_fretboard():
    """The poisoned-label bug: two fretboards in the image, only one labelled.

    Every background comes from another frame of the same session and every one of those
    holds a guitar, so without erasure the net is trained to answer "not a fretboard" on
    real fretboards.
    """
    H_a = synth_H(angle_deg=15.0)
    H_b = synth_H(angle_deg=-25.0)
    img_a, bg = synth_frame(H_a), synth_frame(H_b)
    cfg = AugConfig(bg_replace_p=1.0, occluders=0, brightness=0.0, contrast=0.0,
                    gamma=0.0, noise_sigma=0.0, blur_max=0)
    rng = np.random.default_rng(0)
    for _ in range(8):
        out, _, H_in = make_sample(img_a, H_a, rng, cfg, bg_gray=bg, bg_H=H_b)
        S = letterbox_matrix(1920, 1080)
        on_label = fretboard_energy(out, H_in)
        # Wherever the background's own board landed, it must be smooth by comparison.
        assert on_label > 1.0, "the labelled fretboard is not sharp in the composite"
        blurred = cv2.GaussianBlur(out, (31, 31), 0)
        # A second sharp fretboard would make the image's overall wire-contrast comparable
        # to the labelled region's; erasure must leave the labelled board clearly sharpest.
        assert on_label > np.abs(
            cv2.Laplacian(blurred.astype(np.float32), cv2.CV_32F, ksize=3)).mean() * 1.5


def test_decoy_islands_stop_the_seam_from_marking_the_board():
    """The seam bug: cutting along the board quad draws a boundary around the answer.

    A net can then learn "the fretboard is inside the boundary" and never learn what a
    fretboard looks like -- scoring well on composites and falling back on the room for
    natural frames. Several islands, one neck, makes that strategy worthless.
    """
    assert AugConfig().decoy_seams[1] >= 1, "decoys disabled; the seam points at the board"

    H = synth_H()
    img, bg = synth_frame(H), synth_frame(synth_H(angle_deg=-30.0))
    cfg = AugConfig(bg_replace_p=1.0, decoy_seams=(3, 3), occluders=0, brightness=0.0,
                    contrast=0.0, gamma=0.0, noise_sigma=0.0, blur_max=0, bg_feather=(2.0, 2.0))
    rng = np.random.default_rng(2)
    counts = []
    for _ in range(8):
        out, _, H_in = make_sample(img, H, rng, cfg, bg_gray=bg, bg_H=synth_H(angle_deg=-30.0))
        # Count disjoint regions whose content came from the source frame, by finding the
        # seams: strong edges that are not part of the board itself.
        edges = cv2.Canny(out, 60, 160)
        n, _lab, stats, _c = cv2.connectedComponentsWithStats(
            cv2.dilate(edges, np.ones((5, 5), np.uint8)), 8)
        counts.append(sum(1 for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] > 300))
    assert np.median(counts) >= 2, (
        f"only {np.median(counts):.0f} seam-bounded region(s); the board's outline is the "
        "only boundary in the image and therefore a perfect pointer to the answer"
    )


def test_decoys_never_overwrite_the_labelled_board():
    """A decoy pasted over the neck would leave the label pointing at nothing."""
    H = synth_H()
    img, bg = synth_frame(H), synth_frame(synth_H(angle_deg=-30.0))
    cfg = AugConfig(bg_replace_p=1.0, decoy_seams=(4, 4), occluders=0, brightness=0.0,
                    contrast=0.0, gamma=0.0, noise_sigma=0.0, blur_max=0)
    rng = np.random.default_rng(5)
    for _ in range(10):
        out, _, H_in = make_sample(img, H, rng, cfg, bg_gray=bg, bg_H=synth_H(angle_deg=-30.0))
        pts = apply_homography(H_in, canonical_uv(12))
        inside = ((pts[:, 0] > 2) & (pts[:, 0] < INPUT_W - 3)
                  & (pts[:, 1] > 2) & (pts[:, 1] < INPUT_H - 3))
        vals = np.array([out[int(round(y)), int(round(x))] for x, y in pts[inside]])
        assert np.median(vals) > 90, "a decoy covered the labelled fretboard"


def test_bg_replace_is_modest_now_that_the_receptive_field_does_the_work():
    """Compositing is robustness, not the shortcut defence -- see test_model.py.

    It was briefly cranked to 0.85 while the receptive field was 159 px and compositing had
    to carry the whole burden. At that rate the training images no longer resembled camera
    output, which trades a shortcut for a train/serve mismatch. FretNet(depth=3) removes the
    shortcut structurally, so this can come back down to a level that keeps most samples
    looking like photographs.
    """
    assert 0.1 <= AugConfig().bg_replace_p <= 0.4
