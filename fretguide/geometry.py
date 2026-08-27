"""Geometry: the two-stage fretboard-space -> image-pixel mapping.

TWO STAGES, BOTH REQUIRED. Doing only one is the classic failure mode.

  1. NON-LINEAR FRET SPACING:  u(n) = 1 - 2^(-n/12)
     Frets bunch up toward the bridge. NEVER linearly interpolate fret positions —
     that is wrong even with a perfect camera.

  2. PERSPECTIVE: a 3x3 homography H maps the flat (u, v) plane to the
     perspective-projected pixels of the camera image.

A dot's pixel = apply_homography(H, dot_uv(string, fret)).

Because u(n) is a pure function of the equal-tempered fret rule, the scale length
cancels in normalised coordinates: **this module needs no measurement of the
physical instrument.** See docs/PRD-v2.md item 8.

Lessons from v1 baked in here (see docs/research/00-diagnosis.md):
  - Fit from points that lie ON the fretboard plane, and INTERPOLATE between them.
    Never extrapolate a projective transform beyond its support.
  - Gate every solve on inlier spread. A short-baseline fit is not merely
    inaccurate, it is wild (only frets 9-12 visible measured 1.37 fret-widths mean
    error, worst 5.29). Refusing to draw beats drawing nonsense.
  - Smooth the projected geometry, never the raw entries of H.
"""

from __future__ import annotations

import numpy as np

from .types import Point, StringNumber, UV

# --------------------------------------------------------------------------- #
# Stage 1: the fret rule
# --------------------------------------------------------------------------- #

#: u slightly behind the nut, where open ("O") / muted ("X") markers are drawn.
OPEN_MARKER_U = -0.045


def fret_u(n: float) -> float:
    """Fractional distance from the nut to fret ``n``, as a fraction of scale length.

    Equal temperament, 12th root of 2. fret_u(0) = 0 (nut), fret_u(12) = 0.5,
    fret_u(24) = 0.75.
    """
    return 1.0 - 2.0 ** (-n / 12.0)


def string_v(s: StringNumber) -> float:
    """v-coordinate across the neck. String 6 (low E) -> 0, string 1 (high E) -> 1."""
    if not 1 <= s <= 6:
        raise ValueError(f"string must be 1..6, got {s}")
    return (6 - s) / 5.0


def dot_uv(string: StringNumber, fret: int) -> UV:
    """Fretboard-space coordinate of a finger dot.

    For a fretted note (fret >= 1) the dot is centred in the fret *space* between
    fret f-1 and fret f. For an open/muted string the marker sits behind the nut.
    """
    v = string_v(string)
    if fret <= 0:
        return UV(OPEN_MARKER_U, v)
    return UV((fret_u(fret - 1) + fret_u(fret)) / 2.0, v)


def fret_centre_u(fret: int) -> float:
    """u of the centre of the fret space the fingertip occupies."""
    if fret <= 0:
        return OPEN_MARKER_U
    return (fret_u(fret - 1) + fret_u(fret)) / 2.0


# --------------------------------------------------------------------------- #
# Stage 2: the homography
# --------------------------------------------------------------------------- #


def _as_xy(points) -> np.ndarray:
    """Accept a sequence of Point, UV, or (a, b) pairs -> (N, 2) float array."""
    out = []
    for p in points:
        if isinstance(p, Point):
            out.append((p.x, p.y))
        elif isinstance(p, UV):
            out.append((p.u, p.v))
        else:
            a, b = p
            out.append((float(a), float(b)))
    return np.asarray(out, dtype=np.float64)


def solve_homography(src, dst) -> np.ndarray:
    """Least-squares homography from N >= 4 correspondences (exact for 4).

    Hartley-normalised DLT with h33 fixed to 1. Deterministic and dependency-light,
    which makes it the right tool for tests and for the analytic path. For tracking
    against noisy detections use :func:`find_homography_ransac` instead, so outliers
    are rejected rather than averaged in.
    """
    s = _as_xy(src)
    d = _as_xy(dst)
    if len(s) < 4 or len(s) != len(d):
        raise ValueError(f"need >=4 matched correspondences, got {len(s)}/{len(d)}")

    Ts, sn = _normalising_transform(s)
    Td, dn = _normalising_transform(d)

    n = len(sn)
    A = np.zeros((2 * n, 8), dtype=np.float64)
    b = np.zeros(2 * n, dtype=np.float64)
    u, v = sn[:, 0], sn[:, 1]
    x, y = dn[:, 0], dn[:, 1]
    for i in range(n):
        A[2 * i] = [u[i], v[i], 1, 0, 0, 0, -u[i] * x[i], -v[i] * x[i]]
        b[2 * i] = x[i]
        A[2 * i + 1] = [0, 0, 0, u[i], v[i], 1, -u[i] * y[i], -v[i] * y[i]]
        b[2 * i + 1] = y[i]

    h, _residuals, rank, _sv = np.linalg.lstsq(A, b, rcond=None)
    # Degeneracy must be detected explicitly. lstsq happily returns a minimum-norm
    # answer for a rank-deficient system (e.g. all correspondences collinear) rather
    # than failing, and a silently-wrong homography is exactly how v1 drew nonsense.
    if rank < 8:
        raise ValueError(
            f"degenerate correspondences: design matrix rank {rank} < 8 "
            "(points are collinear or coincident)"
        )
    Hn = np.array([[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1.0]])
    H = np.linalg.inv(Td) @ Hn @ Ts
    if not np.isfinite(H).all() or abs(H[2, 2]) < 1e-12:
        raise ValueError("degenerate correspondences: homography is not recoverable")
    return H / H[2, 2]


def _normalising_transform(pts: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Similarity transform mapping points to centroid 0 with mean distance sqrt(2)."""
    c = pts.mean(axis=0)
    d = np.linalg.norm(pts - c, axis=1).mean()
    s = 1.0 if d < 1e-12 else np.sqrt(2.0) / d
    T = np.array([[s, 0, -s * c[0]], [0, s, -s * c[1]], [0, 0, 1.0]])
    return T, (pts - c) * s


def apply_homography(H: np.ndarray, uv) -> np.ndarray:
    """Map fretboard-space point(s) to image pixels. Accepts UV or (N, 2); returns (N, 2)."""
    pts = _as_xy([uv] if isinstance(uv, (UV, Point)) else uv)
    hom = np.column_stack([pts, np.ones(len(pts))])
    out = hom @ np.asarray(H, dtype=np.float64).T
    w = out[:, 2:3]
    with np.errstate(divide="ignore", invalid="ignore"):
        return out[:, :2] / w


def invert_homography(H: np.ndarray) -> np.ndarray:
    return np.linalg.inv(np.asarray(H, dtype=np.float64))


def image_to_fretboard(H: np.ndarray, xy) -> np.ndarray:
    """Map image point(s) back to fretboard space using H^-1."""
    return apply_homography(invert_homography(H), xy)


def find_homography_ransac(src, dst, reproj_px: float = 3.0):
    """Robust homography via OpenCV RANSAC. Returns ``(H, inlier_mask)``.

    Preferred over :func:`solve_homography` for live tracking: a single bad
    correspondence (glare, motion blur, a repeated-fret mismatch) otherwise poisons
    a least-squares fit. ``H`` is ``None`` if no consensus was found.
    """
    import cv2  # imported lazily so the pure-geometry path has no cv2 dependency

    s = _as_xy(src).astype(np.float32).reshape(-1, 1, 2)
    d = _as_xy(dst).astype(np.float32).reshape(-1, 1, 2)
    if len(s) < 4:
        return None, np.zeros(len(s), dtype=bool)
    H, mask = cv2.findHomography(s, d, cv2.RANSAC, reproj_px)
    if H is None:
        return None, np.zeros(len(s), dtype=bool)
    return H, (mask.ravel().astype(bool) if mask is not None else np.ones(len(s), bool))


# --------------------------------------------------------------------------- #
# The safety gate that v1 lacked
# --------------------------------------------------------------------------- #


def inlier_spread(src_uv, mask=None) -> float:
    """Fraction of the neck's length that the inlying correspondences span.

    This is the guard against the failure measured in v1: a homography fitted from a
    small cluster and then evaluated far outside it amplifies noise without bound.
    Returns the u-extent of the inliers, in [0, 1].
    """
    pts = _as_xy(src_uv)
    if mask is not None:
        mask = np.asarray(mask, dtype=bool)
        pts = pts[mask]
    if len(pts) < 2:
        return 0.0
    return float(pts[:, 0].max() - pts[:, 0].min())


def solve_is_trustworthy(
    src_uv,
    mask=None,
    min_inliers: int = 8,
    min_spread_u: float = 0.12,
) -> tuple[bool, str]:
    """Decide whether a fitted pose may be drawn.

    ``min_spread_u`` defaults to 0.12, roughly the u-extent from the nut to fret 4 —
    below that the fit is extrapolating over most of the neck. Returns
    ``(ok, reason)``; ``reason`` is empty when ok.
    """
    pts = _as_xy(src_uv)
    n = int(np.asarray(mask, dtype=bool).sum()) if mask is not None else len(pts)
    if n < min_inliers:
        return False, f"too few inliers ({n} < {min_inliers})"
    spread = inlier_spread(src_uv, mask)
    if spread < min_spread_u:
        return False, f"baseline too short (u-spread {spread:.3f} < {min_spread_u})"
    return True, ""


# --------------------------------------------------------------------------- #
# Rendering helpers
# --------------------------------------------------------------------------- #


def dot_pixel(H: np.ndarray, string: StringNumber, fret: int) -> Point:
    """Pixel location of a finger dot, combining both stages."""
    xy = apply_homography(H, dot_uv(string, fret))[0]
    return Point(float(xy[0]), float(xy[1]))


def fret_line(H: np.ndarray, fret: int) -> tuple[Point, Point]:
    """The fret wire at ``fret``, across all six strings."""
    u = fret_u(fret)
    (a, b) = apply_homography(H, [UV(u, 0.0), UV(u, 1.0)])
    return Point(*a), Point(*b)


def string_line(H: np.ndarray, s: StringNumber, max_fret: int = 12) -> tuple[Point, Point]:
    """String ``s`` running from the nut to ``max_fret``."""
    v = string_v(s)
    (a, b) = apply_homography(H, [UV(0.0, v), UV(fret_u(max_fret), v)])
    return Point(*a), Point(*b)


def grid_lines(H: np.ndarray, max_fret: int = 12) -> list[tuple[Point, Point]]:
    """A faint orientation grid: one line per fret, plus one per string."""
    lines = [fret_line(H, n) for n in range(max_fret + 1)]
    lines += [string_line(H, s, max_fret) for s in range(1, 7)]
    return lines


def corners_uv(max_fret: int = 12) -> list[UV]:
    """The four corners of the tracked board region, in a fixed order.

    Used as the quantity to temporally filter — smooth these four projected points
    and re-derive H, rather than filtering H's entries, which are not independent
    or metrically meaningful.
    """
    uf = fret_u(max_fret)
    return [UV(0.0, 0.0), UV(0.0, 1.0), UV(uf, 1.0), UV(uf, 0.0)]
