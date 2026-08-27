"""Automatic fretboard detection — no enrollment, no reference image, no clicking.

Each frame is solved from scratch, so there is nothing to set up and nothing to drift.

The idea that makes this tractable is that a fretboard is not a free-form shape. Two
families of lines are visible — the strings running along the neck, and the fret wires
across it — and both are *parallel on the physical board*, so in the image each family
converges to a vanishing point.

That buys the crucial constraint. The strings' vanishing point is the image of the point
infinitely far down the neck, i.e. of ``u = infinity``. A 1-D projective map ``u -> s``
along the neck normally has 3 degrees of freedom; knowing where ``u = infinity`` lands
fixes one of them, leaving

    s(u) = (s_inf * u + B) / (u + D)

with just two unknowns. Since fret positions obey ``u(n) = 1 - 2^(-n/12)`` exactly, **two
detected fret wires are enough to solve the whole board**, and every other detected wire
becomes an independent check. That is why this can be robust despite the classical
literature finding per-frame fret detection brittle: we are not detecting frets
independently, we are fitting one rigid known law and scoring the whole hypothesis.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from .geometry import fret_u, solve_homography
from .types import UV


@dataclass
class Detection:
    H: np.ndarray  # fretboard space (u, v) -> image pixels
    n_frets: int  # detected wires supporting the fit
    score: float  # fraction of predicted wires with image evidence
    edges: tuple[np.ndarray, np.ndarray]  # the two board-edge lines (v=0, v=1)
    fret_lines: list[np.ndarray]  # supporting wire lines, homogeneous


# --------------------------------------------------------------------------- #
# Line primitives
# --------------------------------------------------------------------------- #


def _segments(gray: np.ndarray, min_len: float) -> np.ndarray:
    lsd = cv2.createLineSegmentDetector()
    lines = lsd.detect(gray)[0]
    if lines is None:
        return np.empty((0, 4), np.float32)
    L = lines.reshape(-1, 4)
    d = L[:, 2:4] - L[:, 0:2]
    return L[np.hypot(d[:, 0], d[:, 1]) >= min_len]


def _homog(seg: np.ndarray) -> np.ndarray:
    """Homogeneous line through a segment's endpoints."""
    p = np.array([seg[0], seg[1], 1.0])
    q = np.array([seg[2], seg[3], 1.0])
    l = np.cross(p, q)
    n = np.hypot(l[0], l[1])
    return l / n if n > 1e-9 else l


def _angles(segs: np.ndarray) -> np.ndarray:
    d = segs[:, 2:4] - segs[:, 0:2]
    return np.degrees(np.arctan2(d[:, 1], d[:, 0])) % 180.0


def split_families(segs: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Split segments into (along-neck, across-neck) by their dominant orientations.

    Uses a circular histogram because orientation wraps at 180 degrees; the neck can lie
    at any angle in frame, so nothing here assumes a horizontal guitar.
    """
    if len(segs) < 8:
        return segs[:0], segs[:0]
    ang = _angles(segs)
    hist = np.zeros(180)
    for a in ang:
        hist[int(a) % 180] += 1
    hist = np.convolve(np.r_[hist, hist, hist], np.ones(11) / 11, "same")[180:360]

    a1 = int(np.argmax(hist))
    # the second family must be well away from the first (frets are ~perpendicular)
    mask = np.array([min(abs(i - a1), 180 - abs(i - a1)) > 35 for i in range(180)])
    a2 = int(np.argmax(np.where(mask, hist, -1)))

    def near(a0):
        d = np.abs(ang - a0)
        return np.minimum(d, 180 - d) < 22

    return segs[near(a1)], segs[near(a2)]


def vanishing_point(segs: np.ndarray) -> np.ndarray | None:
    """Least-squares intersection of a family of lines (their vanishing point)."""
    if len(segs) < 2:
        return None
    L = np.array([_homog(s) for s in segs])
    # minimise sum (l . x)^2 subject to |x| = 1
    _, _, vt = np.linalg.svd(L)
    v = vt[-1]
    return v if abs(v[2]) > 1e-12 or True else None


# --------------------------------------------------------------------------- #
# The board
# --------------------------------------------------------------------------- #


def _extreme_lines(segs: np.ndarray, vp_other: np.ndarray) -> tuple[np.ndarray, np.ndarray] | None:
    """The two outermost lines of a family — the board's edges (outer strings)."""
    if len(segs) < 2:
        return None
    lines = np.array([_homog(s) for s in segs])
    mids = (segs[:, 0:2] + segs[:, 2:4]) / 2
    # order the family by signed distance along the direction that separates them
    d = np.array([vp_other[0], vp_other[1]], float)
    if abs(vp_other[2]) > 1e-9:
        d = d / vp_other[2]
        d = d - mids.mean(axis=0)
    n = np.array([-d[1], d[0]])
    n /= max(np.linalg.norm(n), 1e-9)
    proj = mids @ n
    return lines[int(np.argmin(proj))], lines[int(np.argmax(proj))]


def _intersect(l1: np.ndarray, l2: np.ndarray) -> np.ndarray | None:
    p = np.cross(l1, l2)
    return None if abs(p[2]) < 1e-9 else p / p[2]


def cluster_positions(s: np.ndarray, tol: float) -> np.ndarray:
    """Merge many segments belonging to the same wire into one position each.

    LSD returns several collinear fragments per fret wire; without this the hypothesis
    search below is quadratic in fragments rather than in actual wires.
    """
    if len(s) == 0:
        return s
    s = np.sort(s)
    groups, cur = [], [s[0]]
    for v in s[1:]:
        if v - cur[-1] <= tol:
            cur.append(v)
        else:
            groups.append(np.mean(cur))
            cur = [v]
    groups.append(np.mean(cur))
    return np.array(groups)


def _fit_fret_law(s_obs: np.ndarray, s_inf: float, max_fret: int = 22):
    """Find which detected wires are which frets, and the map u -> s along the neck.

    ``s(u) = (s_inf * u + B) / (u + D)``. Two correspondences determine (B, D), so pairs of
    observations are tried against pairs of candidate fret indices and scored by how many
    *other* observations then land on predicted fret positions. The fret law is rigid
    enough that the true hypothesis wins decisively.

    Only widely-separated observation pairs are tried (a short baseline gives an
    ill-conditioned fit), and the index search is vectorised over numpy.
    """
    n_obs = len(s_obs)
    if n_obs < 4:
        return None
    us = np.array([fret_u(n) for n in range(max_fret + 1)])

    # candidate index pairs (n1, n2), vectorised
    n1s, n2s = np.triu_indices(max_fret + 1, k=1)
    keep = (n2s - n1s) <= 14
    n1s, n2s = n1s[keep], n2s[keep]
    u1s, u2s = us[n1s], us[n2s]

    best = None
    span = s_obs[-1] - s_obs[0]
    for i in range(n_obs):
        for j in range(i + 1, n_obs):
            s1, s2 = s_obs[i], s_obs[j]
            if abs(s2 - s1) < 0.35 * span:  # need a real baseline
                continue
            # solve  B - s*D = s*u - s_inf*u  for both correspondences, vectorised
            det = -s2 + s1
            if abs(det) < 1e-9:
                continue
            r1 = s1 * u1s - s_inf * u1s
            r2 = s2 * u2s - s_inf * u2s
            D = (r2 - r1) / det
            B = r1 + s1 * D
            den = us[None, :] + D[:, None]
            ok = np.all(np.abs(den) > 1e-6, axis=1)
            if not ok.any():
                continue
            pred = (s_inf * us[None, :] + B[:, None]) / den  # (H, F)
            finite = np.all(np.isfinite(pred), axis=1) & ok
            d = np.diff(pred, axis=1)
            mono = finite & (np.all(d > 0, axis=1) | np.all(d < 0, axis=1))
            if not mono.any():
                continue
            idx = np.where(mono)[0]
            P = pred[idx]
            tol = np.maximum(3.0, 0.22 * np.median(np.abs(np.diff(P[:, :13], axis=1)), axis=1))
            dist = np.abs(P[:, None, :] - s_obs[None, :, None]).min(axis=2)  # (H, n_obs)
            hits = (dist < tol[:, None]).sum(axis=1)
            err = dist.mean(axis=1)
            k = int(np.lexsort((err, -hits))[0])
            cand = (int(hits[k]), -float(err[k]), float(B[idx[k]]), float(D[idx[k]]))
            if best is None or cand[:2] > best[:2]:
                best = cand
    if best is None or best[0] < 5:
        return None
    return best[2], best[3], best[0]


def board_region(gray: np.ndarray, dark_pct: float = 38.0) -> np.ndarray | None:
    """Mask of the most fretboard-like region: large, dark and elongated.

    Without this the detector happily locks onto any strong line structure in the scene —
    on a real frame it fitted the white shelving in the background, which has plenty of
    parallel edges. A fretboard is specifically *dark wood carrying bright thin lines*, and
    that is the cheapest discriminator available.
    """
    small = cv2.GaussianBlur(gray, (0, 0), 2.0)
    thr = np.percentile(small, dark_pct)
    dark = (small < thr).astype(np.uint8) * 255
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    dark = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, k, iterations=2)
    dark = cv2.morphologyEx(dark, cv2.MORPH_OPEN, k, iterations=1)

    n, labels, stats, _ = cv2.connectedComponentsWithStats(dark, 8)
    if n <= 1:
        return None
    best, best_score = None, 0.0
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if area < 0.01 * gray.size:
            continue
        elong = max(w, h) / max(min(w, h), 1)
        fill = area / float(w * h)
        score = area * min(elong, 12.0) * fill  # big, long and solid
        if score > best_score:
            best, best_score = i, score
    if best is None:
        return None
    mask = (labels == best).astype(np.uint8) * 255
    # grow a little so fret wires at the very edge are kept
    return cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))


def detect(gray: np.ndarray, max_fret: int = 12, min_seg: float = 30.0) -> Detection | None:
    """Find the fretboard in one frame. Returns None if it cannot be found confidently."""
    region = board_region(gray)
    if region is None:
        return None
    segs = _segments(gray, min_seg)
    if len(segs) >= 1:
        mid = ((segs[:, 0:2] + segs[:, 2:4]) / 2).astype(int)
        mid[:, 0] = np.clip(mid[:, 0], 0, gray.shape[1] - 1)
        mid[:, 1] = np.clip(mid[:, 1], 0, gray.shape[0] - 1)
        segs = segs[region[mid[:, 1], mid[:, 0]] > 0]
    if len(segs) < 12:
        return None
    fam_a, fam_b = split_families(segs)
    if len(fam_a) < 4 or len(fam_b) < 4:
        return None

    # The strings are the longer family (they span the whole neck); frets are shorter.
    def med_len(s):
        d = s[:, 2:4] - s[:, 0:2]
        return float(np.median(np.hypot(d[:, 0], d[:, 1])))

    strings, frets = (fam_a, fam_b) if med_len(fam_a) >= med_len(fam_b) else (fam_b, fam_a)

    vp_str = vanishing_point(strings)  # image of u = infinity
    vp_fret = vanishing_point(frets)  # image of v = infinity
    if vp_str is None or vp_fret is None:
        return None

    edges = _extreme_lines(strings, vp_fret)
    if edges is None:
        return None
    e0, e1 = edges

    # Centre line of the board, used as the 1-D coordinate along the neck.
    # Parameterise the neck by projecting fret-line midpoints onto its principal axis.
    pts = []
    for l in [_homog(s) for s in frets]:
        a = _intersect(l, e0)
        b = _intersect(l, e1)
        if a is None or b is None:
            continue
        pts.append(((a + b) / 2, l))
    if len(pts) < 4:
        return None
    P = np.array([p[0][:2] for p in pts])

    # 1-D coordinate: project onto the principal axis of those midpoints.
    c_mid = P.mean(axis=0)
    u_axis = np.linalg.svd(P - c_mid)[2][0]
    s_obs = (P - c_mid) @ u_axis

    # s of the strings' vanishing point = image of u = infinity
    if abs(vp_str[2]) < 1e-9:
        return None
    s_inf = float((vp_str[:2] / vp_str[2] - c_mid) @ u_axis)

    # Collapse collinear fragments into one position per wire before fitting.
    span = float(np.ptp(s_obs)) if len(s_obs) else 0.0
    s_sorted = cluster_positions(s_obs, tol=max(4.0, 0.012 * span))
    fit = _fit_fret_law(s_sorted, s_inf, max_fret=22)
    if fit is None:
        return None
    B, D, hits = fit

    def s_of(u: float) -> np.ndarray:
        return c_mid + u_axis * ((s_inf * u + B) / (u + D))

    # Build H from four board-space points whose images we can now compute.
    quad_uv = [UV(0.0, 0.0), UV(0.0, 1.0), UV(fret_u(max_fret), 1.0), UV(fret_u(max_fret), 0.0)]
    img_pts = []
    for uv in (quad_uv[0], quad_uv[3]):  # v = 0 edge
        c = s_of(uv.u)
        l = np.cross(np.r_[c, 1.0], vp_fret)
        p = _intersect(l, e0)
        if p is None:
            return None
        img_pts.append(p[:2])
    for uv in (quad_uv[1], quad_uv[2]):  # v = 1 edge
        c = s_of(uv.u)
        l = np.cross(np.r_[c, 1.0], vp_fret)
        p = _intersect(l, e1)
        if p is None:
            return None
        img_pts.append(p[:2])
    ordered = [img_pts[0], img_pts[2], img_pts[3], img_pts[1]]  # match quad_uv order

    try:
        H = solve_homography(quad_uv, ordered)
    except (ValueError, np.linalg.LinAlgError):
        return None

    return Detection(
        H=H,
        n_frets=int(hits),
        score=hits / max(len(s_obs), 1),
        edges=(e0, e1),
        fret_lines=[p[1] for p in pts],
    )
