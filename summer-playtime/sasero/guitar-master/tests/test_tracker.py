"""Tracker tests, run headless against synthetic imagery with a known ground truth.

The integration test is the valuable one: build an enrollment from a textured synthetic
"fretboard", warp it into a scene by a known homography, and check the tracker recovers a
pose that puts the dots where they actually belong. That validates the whole composition
``H_live = H_match @ H_ref`` — the part most likely to be silently wrong by a transpose or
an inverse.
"""

from __future__ import annotations

import cv2
import numpy as np
import pytest

from fretguide.geometry import apply_homography, corners_uv, dot_uv, fret_u
from fretguide.tracker import Enrollment, FretboardTracker, OneEuroFilter, TrackerConfig
from fretguide.types import UV

REF_W, REF_H = 640, 150


def textured_board(w: int = REF_W, h: int = REF_H, seed: int = 3) -> np.ndarray:
    """A synthetic board with SIFT-friendly texture at several scales."""
    rng = np.random.default_rng(seed)
    img = np.full((h, w), 120, np.uint8)
    for _ in range(400):
        x, y = rng.integers(0, w), rng.integers(0, h)
        r = int(rng.integers(2, 9))
        cv2.circle(img, (int(x), int(y)), r, int(rng.integers(30, 230)), -1)
    for _ in range(60):
        x, y = rng.integers(0, w), rng.integers(0, h)
        cv2.rectangle(img, (int(x), int(y)), (int(x) + 14, int(y) + 6),
                      int(rng.integers(20, 240)), -1)
    # fret-like vertical lines, so it resembles the real target
    for n in range(13):
        x = int(fret_u(n) / fret_u(12) * (w - 8)) + 4
        cv2.line(img, (x, 0), (x, h), 235, 2)
    return cv2.GaussianBlur(img, (3, 3), 0)


def make_enrollment(**kw) -> Enrollment:
    ref = textured_board()
    corners = [(0, 0), (0, REF_H - 1), (REF_W - 1, REF_H - 1), (REF_W - 1, 0)]
    return Enrollment.build(ref, corners, **kw)


def scene_from(enr: Enrollment, H_warp: np.ndarray, size=(1280, 720)) -> np.ndarray:
    """Render the reference board into a larger scene under a known homography."""
    rng = np.random.default_rng(11)
    scene = rng.integers(40, 90, (size[1], size[0]), dtype=np.uint8)  # cluttered background
    warped = cv2.warpPerspective(enr.ref_gray, H_warp, size, flags=cv2.INTER_LINEAR)
    mask = cv2.warpPerspective(np.full(enr.ref_gray.shape, 255, np.uint8), H_warp, size)
    scene[mask > 0] = warped[mask > 0]
    return scene


def similarity_warp(tx=300.0, ty=250.0, scale=1.25, rot_deg=-8.0) -> np.ndarray:
    a = np.deg2rad(rot_deg)
    R = np.array([[np.cos(a), -np.sin(a)], [np.sin(a), np.cos(a)]]) * scale
    H = np.eye(3)
    H[:2, :2] = R
    H[:2, 2] = (tx, ty)
    return H


class TestOneEuroFilter:
    def test_first_sample_passes_through(self):
        f = OneEuroFilter()
        out = f(np.array([1.0, 2.0]), t=0.0)
        np.testing.assert_allclose(out, [1.0, 2.0])

    def test_converges_to_a_constant(self):
        f = OneEuroFilter(freq=30.0, min_cutoff=1.0, beta=0.01)
        x = np.array([5.0, -3.0])
        out = x.copy()
        for i in range(200):
            out = f(x, t=i / 30.0)
        np.testing.assert_allclose(out, x, atol=1e-3)

    def test_attenuates_noise(self):
        rng = np.random.default_rng(0)
        f = OneEuroFilter(freq=30.0, min_cutoff=0.6, beta=0.0)
        truth = np.array([10.0, 10.0])
        raw, filt = [], []
        for i in range(300):
            noisy = truth + rng.normal(0, 1.0, 2)
            raw.append(noisy)
            filt.append(f(noisy, t=i / 30.0))
        raw_err = np.abs(np.array(raw[50:]) - truth).mean()
        filt_err = np.abs(np.array(filt[50:]) - truth).mean()
        assert filt_err < raw_err / 2, f"filtered {filt_err:.3f} vs raw {raw_err:.3f}"

    def test_reset_clears_state(self):
        f = OneEuroFilter()
        f(np.array([100.0]), t=0.0)
        f.reset()
        np.testing.assert_allclose(f(np.array([1.0]), t=0.0), [1.0])


class TestEnrollment:
    def test_build_finds_features(self):
        enr = make_enrollment()
        assert len(enr.kp_xy) > 100
        assert enr.descriptors.shape[0] == len(enr.kp_xy)
        assert enr.H_ref.shape == (3, 3)

    def test_h_ref_maps_fretboard_space_onto_the_reference_image(self):
        enr = make_enrollment()
        got = apply_homography(enr.H_ref, corners_uv(enr.max_fret))
        expected = [(0, 0), (0, REF_H - 1), (REF_W - 1, REF_H - 1), (REF_W - 1, 0)]
        np.testing.assert_allclose(got, expected, atol=1e-6)

    def test_nut_and_octave_land_where_expected(self):
        """u=0 at the nut edge and u(12) at the far edge of the enrolled span."""
        enr = make_enrollment()
        nut = apply_homography(enr.H_ref, UV(0.0, 0.5))[0]
        oct12 = apply_homography(enr.H_ref, UV(fret_u(12), 0.5))[0]
        assert nut[0] == pytest.approx(0.0, abs=1e-6)
        assert oct12[0] == pytest.approx(REF_W - 1, abs=1e-6)

    def test_rejects_a_blank_reference(self):
        blank = np.full((REF_H, REF_W), 128, np.uint8)
        with pytest.raises(ValueError, match="too plain"):
            Enrollment.build(blank, [(0, 0), (0, 10), (10, 10), (10, 0)])

    def test_save_load_round_trip(self, tmp_path):
        enr = make_enrollment()
        p = tmp_path / "e.npz"
        enr.save(p)
        back = Enrollment.load(p)
        np.testing.assert_array_equal(back.ref_gray, enr.ref_gray)
        np.testing.assert_allclose(back.H_ref, enr.H_ref)
        np.testing.assert_allclose(back.kp_xy, enr.kp_xy)
        assert back.max_fret == enr.max_fret


class TestTrackerIntegration:
    def test_recovers_a_known_pose(self):
        enr = make_enrollment()
        H_warp = similarity_warp()
        scene = scene_from(enr, H_warp)

        tracker = FretboardTracker(enr, TrackerConfig(smooth=False))
        H_live, status = tracker.update(scene, t=0.0)

        assert status.locked, f"expected lock, got: {status.reason}"
        assert status.inliers >= 20
        assert status.spread > 0.35

        # Ground truth: fretboard space -> reference image -> scene.
        H_true = H_warp @ enr.H_ref
        probes = [dot_uv(s, f) for s in (1, 3, 6) for f in (1, 5, 9, 12)]
        got = apply_homography(H_live, probes)
        want = apply_homography(H_true, probes)
        err = np.linalg.norm(got - want, axis=1)
        assert err.max() < 3.0, f"max dot error {err.max():.2f} px"

    def test_dot_error_stays_small_across_several_poses(self):
        enr = make_enrollment()
        for rot, scale in [(0.0, 1.0), (-12.0, 1.3), (7.0, 0.9), (-20.0, 1.15)]:
            H_warp = similarity_warp(rot_deg=rot, scale=scale)
            scene = scene_from(enr, H_warp)
            tracker = FretboardTracker(enr, TrackerConfig(smooth=False))
            H_live, status = tracker.update(scene, t=0.0)
            assert status.locked, f"rot={rot} scale={scale}: {status.reason}"
            probes = [dot_uv(s, f) for s in (1, 6) for f in (1, 7, 12)]
            err = np.linalg.norm(
                apply_homography(H_live, probes) - apply_homography(H_warp @ enr.H_ref, probes),
                axis=1,
            )
            assert err.max() < 4.0, f"rot={rot} scale={scale}: {err.max():.2f} px"

    def test_reports_no_lock_on_an_absent_board(self):
        enr = make_enrollment()
        rng = np.random.default_rng(5)
        noise = rng.integers(0, 255, (720, 1280), dtype=np.uint8)
        tracker = FretboardTracker(enr)
        H_live, status = tracker.update(noise, t=0.0)
        assert H_live is None
        assert not status.locked
        assert status.reason

    def test_lucas_kanade_path_keeps_tracking_between_re_anchors(self):
        """Second frame should be handled by LK, not a fresh match, and still be right."""
        enr = make_enrollment()
        H_warp = similarity_warp()
        scene = scene_from(enr, H_warp)

        tracker = FretboardTracker(enr, TrackerConfig(rematch_interval=10.0, smooth=False))
        tracker.update(scene, t=0.0)
        matches_after_first = tracker.n_matches

        H_live, status = tracker.update(scene, t=0.01)  # too soon to re-anchor
        assert tracker.n_matches == matches_after_first, "should not have re-matched"
        assert tracker.n_lk >= 1, "should have used optical flow"
        assert status.locked
        probes = [dot_uv(s, f) for s in (1, 6) for f in (1, 12)]
        err = np.linalg.norm(
            apply_homography(H_live, probes) - apply_homography(H_warp @ enr.H_ref, probes), axis=1
        )
        assert err.max() < 4.0

    def test_reset_forces_a_fresh_anchor(self):
        enr = make_enrollment()
        scene = scene_from(enr, similarity_warp())
        tracker = FretboardTracker(enr, TrackerConfig(rematch_interval=10.0))
        tracker.update(scene, t=0.0)
        tracker.reset()
        tracker.update(scene, t=0.01)
        assert tracker.n_matches == 2

    def test_smoothing_does_not_break_the_pose(self):
        enr = make_enrollment()
        H_warp = similarity_warp()
        scene = scene_from(enr, H_warp)
        tracker = FretboardTracker(enr, TrackerConfig(smooth=True))
        H_live, status = tracker.update(scene, t=0.0)
        assert status.locked
        probes = [dot_uv(3, 5), dot_uv(1, 12)]
        err = np.linalg.norm(
            apply_homography(H_live, probes) - apply_homography(H_warp @ enr.H_ref, probes), axis=1
        )
        assert err.max() < 3.0


class TestEnrollmentMasksToTheBoard:
    """The bug that made the overlay stick to the room instead of the guitar.

    A reference containing background features lets RANSAC fit the largest consistent
    set — which is the static background, not the moving instrument. Measured on a real
    enrollment: 970 of 1059 features were off-board and the tracker locked onto the room.
    """

    @staticmethod
    def _scene_with_background():
        """A board occupying the middle of a frame full of high-contrast clutter."""
        rng = np.random.default_rng(21)
        scene = np.full((400, 1000), 100, np.uint8)
        for _ in range(500):  # busy "room" everywhere
            x, y = rng.integers(0, 1000), rng.integers(0, 400)
            cv2.rectangle(scene, (int(x), int(y)), (int(x) + 12, int(y) + 12),
                          int(rng.integers(0, 255)), -1)
        board = textured_board(600, 140)
        scene[130:270, 200:800] = board
        corners = [(200, 130), (200, 269), (799, 269), (799, 130)]
        return scene, corners

    def test_only_board_features_are_kept(self):
        scene, corners = self._scene_with_background()
        enr = Enrollment.build(scene, corners)

        quad = apply_homography(enr.H_ref, corners_uv(enr.max_fret)).astype(np.float32)
        outside = [
            (x, y) for x, y in enr.kp_xy
            if cv2.pointPolygonTest(quad, (float(x), float(y)), False) < 0
        ]
        # a small margin is intentionally allowed around the board edge
        far_outside = [
            (x, y) for x, y in outside
            if not (170 <= x <= 830 and 100 <= y <= 300)
        ]
        assert not far_outside, f"{len(far_outside)} features landed off the board"
        assert len(enr.kp_xy) >= 20

    def test_masking_removes_the_off_board_features(self):
        """Contrast: without the mask, many features belong to things that don't move.

        The exact ratio depends on how textured the surroundings are — on the real
        enrollment it was 970 of 1059 — so what is asserted here is the qualitative
        claim: unmasked detection admits a large number of off-board features, masked
        detection admits essentially none.
        """
        scene, corners = self._scene_with_background()

        kp_all, _ = cv2.SIFT_create(nfeatures=4000).detectAndCompute(scene, None)
        off_board = sum(1 for k in kp_all
                        if not (200 <= k.pt[0] <= 800 and 130 <= k.pt[1] <= 270))
        assert off_board > 100, "test scene should contain plenty of background texture"

        enr = Enrollment.build(scene, corners)
        quad = apply_homography(enr.H_ref, corners_uv(enr.max_fret)).astype(np.float32)
        still_off = sum(1 for x, y in enr.kp_xy
                        if cv2.pointPolygonTest(quad, (float(x), float(y)), False) < -12)
        assert still_off == 0, f"{still_off} off-board features survived the mask"

    def test_tracking_a_moving_board_over_static_background(self):
        """The real-world scenario: guitar moves, room does not. Pose must follow the board."""
        scene, corners = self._scene_with_background()
        enr = Enrollment.build(scene, corners)

        rng = np.random.default_rng(4)
        moved = np.full((400, 1000), 100, np.uint8)
        for _ in range(500):  # identical static clutter
            x, y = rng.integers(0, 1000), rng.integers(0, 400)
            cv2.rectangle(moved, (int(x), int(y)), (int(x) + 12, int(y) + 12),
                          int(rng.integers(0, 255)), -1)
        shift = np.float32([[1, 0, 90], [0, 1, 40]])  # board moves, background does not
        board_only = np.zeros_like(moved)
        board_only[130:270, 200:800] = enr.ref_gray[130:270, 200:800]
        shifted = cv2.warpAffine(board_only, shift, (1000, 400))
        mask = cv2.warpAffine((board_only > 0).astype(np.uint8) * 255, shift, (1000, 400))
        moved[mask > 0] = shifted[mask > 0]

        tracker = FretboardTracker(enr, TrackerConfig(smooth=False))
        H_live, status = tracker.update(moved, t=0.0)
        assert status.locked, status.reason
        got = apply_homography(H_live, corners_uv(enr.max_fret))
        want = apply_homography(enr.H_ref, corners_uv(enr.max_fret)) + np.array([90, 40])
        assert np.abs(got - want).max() < 8, "pose followed the background, not the board"
