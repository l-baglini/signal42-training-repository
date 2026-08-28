"""Tests for the robust (OpenCV RANSAC) solver — the one the live tracker will use.

Separated from test_geometry.py because these require cv2, whereas the pure geometry
path deliberately does not.
"""

from __future__ import annotations

import numpy as np
import pytest

from fretguide.geometry import (
    apply_homography,
    find_homography_ransac,
    fret_u,
    solve_homography,
    solve_is_trustworthy,
)
from fretguide.types import UV

H_TRUE = np.array([[900.0, 60.0, 220.0], [-140.0, 700.0, 130.0], [0.30, 0.12, 1.0]])


def board_points(step: int = 1, max_fret: int = 12) -> list[UV]:
    """Fret-line endpoints along both board edges — the planned keypoint set."""
    return [UV(fret_u(n), v) for n in range(0, max_fret + 1, step) for v in (0.0, 1.0)]


class TestRansac:
    def test_recovers_the_true_homography_from_clean_points(self):
        src = board_points()
        dst = apply_homography(H_TRUE, src)
        H, mask = find_homography_ransac(src, dst)
        assert H is not None
        assert mask.all()
        np.testing.assert_allclose(H / H[2, 2], H_TRUE / H_TRUE[2, 2], rtol=1e-5, atol=1e-5)

    def test_rejects_a_gross_outlier(self):
        """A single mismatched correspondence must not poison the fit.

        This is the failure mode least-squares cannot survive and the reason the
        tracker uses RANSAC: one repeated-fret mismatch or glare-induced bad match is
        normal, not exceptional.
        """
        src = board_points()
        dst = apply_homography(H_TRUE, src)
        dst[5] += np.array([180.0, -240.0])  # one badly wrong match

        H, mask = find_homography_ransac(src, dst, reproj_px=3.0)
        assert H is not None
        assert not mask[5], "the outlier should have been excluded"
        assert mask.sum() >= len(src) - 2
        np.testing.assert_allclose(H / H[2, 2], H_TRUE / H_TRUE[2, 2], rtol=1e-3, atol=1e-3)

    def test_least_squares_is_visibly_poisoned_by_the_same_outlier(self):
        """Contrast: shows why the robust path is not optional."""
        src = board_points()
        dst = apply_homography(H_TRUE, src)
        dst[5] += np.array([180.0, -240.0])

        H_ls = solve_homography(src, dst)
        truth = apply_homography(H_TRUE, src)
        err_ls = np.linalg.norm(apply_homography(H_ls, src) - truth, axis=1).mean()

        H_rs, _ = find_homography_ransac(src, dst)
        err_rs = np.linalg.norm(apply_homography(H_rs, src) - truth, axis=1).mean()

        assert err_rs < err_ls / 5, f"ransac {err_rs:.2f}px vs least-squares {err_ls:.2f}px"

    def test_tolerates_realistic_keypoint_noise(self):
        """sigma = 2 px was measured as comfortably inside the accuracy budget."""
        rng = np.random.default_rng(7)
        src = board_points()
        dst = apply_homography(H_TRUE, src) + rng.normal(0, 2.0, (len(src), 2))
        H, mask = find_homography_ransac(src, dst, reproj_px=6.0)
        assert H is not None and mask.sum() >= len(src) - 3

        # Error at the dot positions, expressed in pixels.
        truth = apply_homography(H_TRUE, src)
        err = np.linalg.norm(apply_homography(H, src) - truth, axis=1)
        assert err.mean() < 6.0

    def test_too_few_points_returns_no_solution(self):
        H, mask = find_homography_ransac([UV(0, 0), UV(1, 0), UV(1, 1)], [(0, 0), (1, 0), (1, 1)])
        assert H is None
        assert not mask.any()

    def test_gate_rejects_a_short_baseline_solve_even_when_ransac_succeeds(self):
        """RANSAC is happy with a tight cluster; the trust gate is what stops us drawing it."""
        # Frets 9-12 only: 8 points, so the inlier *count* passes and the u-spread
        # (0.095) is what trips the gate. This is the exact case the diagnosis measured
        # at 1.37 fret-widths of mean error.
        src = [UV(fret_u(n), v) for n in (9, 10, 11, 12) for v in (0.0, 1.0)]
        dst = apply_homography(H_TRUE, src)
        H, mask = find_homography_ransac(src, dst)
        assert H is not None  # RANSAC found a perfectly consistent fit...
        ok, reason = solve_is_trustworthy(src, mask)
        assert not ok and "baseline too short" in reason  # ...but it must not be drawn


@pytest.mark.parametrize("step", [1, 2, 3])
def test_sparser_keypoints_still_recover_the_pose(step):
    src = board_points(step=step)
    dst = apply_homography(H_TRUE, src)
    H, _ = find_homography_ransac(src, dst)
    np.testing.assert_allclose(H / H[2, 2], H_TRUE / H_TRUE[2, 2], rtol=1e-4, atol=1e-4)
