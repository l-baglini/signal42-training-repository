"""Geometry tests: the fret rule, the homography, and the safety gate."""

from __future__ import annotations

import numpy as np
import pytest

from fretguide.geometry import (
    OPEN_MARKER_U,
    apply_homography,
    corners_uv,
    dot_pixel,
    dot_uv,
    fret_u,
    grid_lines,
    image_to_fretboard,
    inlier_spread,
    invert_homography,
    solve_homography,
    solve_is_trustworthy,
    string_v,
)
from fretguide.types import UV


class TestFretRule:
    def test_known_anchors(self):
        assert fret_u(0) == pytest.approx(0.0)
        assert fret_u(12) == pytest.approx(0.5)
        assert fret_u(24) == pytest.approx(0.75)

    def test_monotonic_and_compressing(self):
        """Frets advance toward the bridge, and each space is smaller than the last."""
        us = [fret_u(n) for n in range(0, 25)]
        gaps = np.diff(us)
        assert (gaps > 0).all()
        assert (np.diff(gaps) < 0).all()

    def test_not_linear(self):
        """The classic bug: linear interpolation would put fret 6 at u=0.25."""
        assert fret_u(6) == pytest.approx(0.2929, abs=1e-4)
        assert abs(fret_u(6) - 0.25) > 0.04

    def test_string_v_endpoints(self):
        assert string_v(6) == pytest.approx(0.0)  # low E
        assert string_v(1) == pytest.approx(1.0)  # high E
        assert string_v(4) == pytest.approx(0.4)

    @pytest.mark.parametrize("bad", [0, 7, -1])
    def test_string_v_rejects_out_of_range(self, bad):
        with pytest.raises(ValueError):
            string_v(bad)

    def test_dot_centred_in_fret_space(self):
        d = dot_uv(6, 5)
        assert d.u == pytest.approx((fret_u(4) + fret_u(5)) / 2)
        assert d.v == pytest.approx(0.0)

    def test_open_string_marker_sits_behind_the_nut(self):
        for fret in (0, -1):
            assert dot_uv(3, fret).u == OPEN_MARKER_U
        assert OPEN_MARKER_U < 0


class TestHomography:
    @staticmethod
    def _known_H():
        return np.array([[900.0, 60.0, 220.0], [-140.0, 700.0, 130.0], [0.30, 0.12, 1.0]])

    def test_recovers_a_known_homography_from_4_points(self):
        H = self._known_H()
        src = [UV(0.0, 0.0), UV(0.0, 1.0), UV(0.5, 1.0), UV(0.5, 0.0)]
        dst = apply_homography(H, src)
        got = solve_homography(src, dst)
        np.testing.assert_allclose(got / got[2, 2], H / H[2, 2], rtol=1e-8, atol=1e-8)

    def test_least_squares_with_more_than_4_points(self):
        H = self._known_H()
        src = [UV(fret_u(n), v) for n in range(0, 13, 2) for v in (0.0, 1.0)]
        dst = apply_homography(H, src)
        got = solve_homography(src, dst)
        np.testing.assert_allclose(got / got[2, 2], H / H[2, 2], rtol=1e-7, atol=1e-7)

    def test_round_trip_through_the_inverse(self):
        H = self._known_H()
        uv = [UV(0.1, 0.2), UV(0.4, 0.9), UV(0.0, 0.0)]
        back = image_to_fretboard(H, apply_homography(H, uv))
        np.testing.assert_allclose(back, [[0.1, 0.2], [0.4, 0.9], [0.0, 0.0]], atol=1e-9)

    def test_inverse_is_an_inverse(self):
        H = self._known_H()
        np.testing.assert_allclose(H @ invert_homography(H), np.eye(3), atol=1e-9)

    def test_rejects_too_few_points(self):
        with pytest.raises(ValueError):
            solve_homography([UV(0, 0), UV(1, 0), UV(1, 1)], [(0, 0), (1, 0), (1, 1)])

    def test_rejects_degenerate_collinear_points(self):
        src = [UV(0, 0), UV(0.25, 0), UV(0.5, 0), UV(0.75, 0)]
        dst = [(0, 0), (10, 0), (20, 0), (30, 0)]
        with pytest.raises((ValueError, np.linalg.LinAlgError)):
            solve_homography(src, dst)

    def test_dot_pixel_matches_manual_projection(self):
        H = self._known_H()
        p = dot_pixel(H, 6, 5)
        expected = apply_homography(H, dot_uv(6, 5))[0]
        assert (p.x, p.y) == pytest.approx(tuple(expected))

    def test_grid_has_a_line_per_fret_and_string(self):
        lines = grid_lines(self._known_H(), max_fret=12)
        assert len(lines) == 13 + 6

    def test_corners_are_four_ordered_points(self):
        c = corners_uv(12)
        assert len(c) == 4
        assert [(p.u, p.v) for p in c] == [
            (0.0, 0.0), (0.0, 1.0), (fret_u(12), 1.0), (fret_u(12), 0.0)
        ]


class TestTrustGate:
    """The guard v1 lacked: refuse to draw an under-determined pose."""

    def test_spread_measures_u_extent(self):
        pts = [UV(0.1, 0), UV(0.5, 1), UV(0.3, 0)]
        assert inlier_spread(pts) == pytest.approx(0.4)

    def test_spread_of_a_single_point_is_zero(self):
        assert inlier_spread([UV(0.4, 0.5)]) == 0.0

    def test_spread_respects_the_mask(self):
        pts = [UV(0.0, 0), UV(0.05, 0), UV(0.9, 0)]
        assert inlier_spread(pts, [True, True, False]) == pytest.approx(0.05)

    def test_wide_baseline_is_trusted(self):
        pts = [UV(fret_u(n), v) for n in range(0, 13, 2) for v in (0.0, 1.0)]
        ok, reason = solve_is_trustworthy(pts)
        assert ok and reason == ""

    def test_short_baseline_is_rejected(self):
        """Frets 9-12 only measured 1.37 fret-widths of error — must not be drawn."""
        pts = [UV(fret_u(n), v) for n in (9, 10, 11, 12) for v in (0.0, 1.0)]
        ok, reason = solve_is_trustworthy(pts)
        assert not ok
        assert "baseline too short" in reason

    def test_too_few_inliers_is_rejected(self):
        pts = [UV(0.0, 0.0), UV(0.5, 1.0), UV(0.25, 0.5)]
        ok, reason = solve_is_trustworthy(pts)
        assert not ok
        assert "too few inliers" in reason

    def test_a_masked_out_wide_set_can_still_fail(self):
        pts = [UV(fret_u(n), v) for n in range(0, 13, 2) for v in (0.0, 1.0)]
        mask = [False] * len(pts)
        mask[0] = mask[1] = True
        ok, _ = solve_is_trustworthy(pts, mask)
        assert not ok
