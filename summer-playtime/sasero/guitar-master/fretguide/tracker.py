"""Markerless fretboard tracking by matching against an enrolled reference.

The measured design (docs/research/11-tracking-spike-results.md):

  - **Enrol once.** One reference image of this guitar's fretboard, its SIFT features,
    and a homography ``H_ref`` mapping fretboard space (u, v) to reference-image pixels.
    ``H_ref`` comes from four clicks on a *still* image, at leisure — not the per-session
    tapping on live video that made v1 miserable.
  - **Match back to the reference, never to the previous frame.** Correspondence identity
    is therefore fixed, so drift cannot accumulate and recovery after full occlusion is
    automatic. This was Wang & Ohya's central insight and it costs nothing.
  - **Detect-then-track.** Full SIFT matching costs ~54 ms (18 fps). Pyramidal
    Lucas-Kanade propagation of the existing inliers costs a few ms, so the pose updates
    every frame while re-anchoring happens a few times a second.
  - **Gate every solve on inlier spread.** A tight cluster yields a confident-looking but
    wildly wrong pose — measured at 1.37 fret-widths mean error when only frets 9-12 were
    visible. Refusing to draw beats drawing nonsense.
  - **Filter the projected corners, not H's entries.** The nine entries of a homography
    are neither independent nor metrically meaningful; smoothing them individually skews
    the result.

The composed mapping is ``H_live = H_match @ H_ref``: fretboard space to reference image
to the current frame.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from .geometry import (
    apply_homography,
    corners_uv,
    inlier_spread,
    solve_homography,
    solve_is_trustworthy,
)
from .types import UV, TrackerStatus

# --------------------------------------------------------------------------- #
# Smoothing
# --------------------------------------------------------------------------- #


class OneEuroFilter:
    """One-euro filter — low lag when moving, low jitter when still.

    Preferred over a fixed low-pass or Kalman here because the guitar alternates between
    near-stationary (where jitter is what you notice) and quick repositioning (where lag
    is what you notice), and this adapts between the two with two intuitive parameters.
    """

    def __init__(self, freq: float = 30.0, min_cutoff: float = 1.0, beta: float = 0.02,
                 d_cutoff: float = 1.0) -> None:
        self.freq = freq
        self.min_cutoff = min_cutoff
        self.beta = beta
        self.d_cutoff = d_cutoff
        self._x_prev: np.ndarray | None = None
        self._dx_prev: np.ndarray | None = None
        self._t_prev: float | None = None

    @staticmethod
    def _alpha(cutoff: float, dt: float) -> float:
        tau = 1.0 / (2.0 * np.pi * cutoff)
        return 1.0 / (1.0 + tau / dt)

    def reset(self) -> None:
        self._x_prev = self._dx_prev = self._t_prev = None

    def __call__(self, x: np.ndarray, t: float | None = None) -> np.ndarray:
        x = np.asarray(x, dtype=np.float64)
        if self._x_prev is None:
            self._x_prev = x.copy()
            self._dx_prev = np.zeros_like(x)
            self._t_prev = t
            return x.copy()

        dt = 1.0 / self.freq
        if t is not None and self._t_prev is not None and t > self._t_prev:
            dt = t - self._t_prev
        self._t_prev = t

        dx = (x - self._x_prev) / dt
        a_d = self._alpha(self.d_cutoff, dt)
        dx_hat = a_d * dx + (1 - a_d) * self._dx_prev

        cutoff = self.min_cutoff + self.beta * np.abs(dx_hat)
        # Vector input: filter each component with its own adaptive cutoff.
        alpha = np.array([self._alpha(float(c), dt) for c in np.atleast_1d(cutoff)])
        alpha = alpha.reshape(x.shape) if alpha.size == x.size else alpha
        x_hat = alpha * x + (1 - alpha) * self._x_prev

        self._x_prev, self._dx_prev = x_hat, dx_hat
        return x_hat


# --------------------------------------------------------------------------- #
# Enrollment
# --------------------------------------------------------------------------- #


@dataclass
class Enrollment:
    """Everything learned once about this specific guitar."""

    ref_gray: np.ndarray  # the reference image (the fretboard region)
    kp_xy: np.ndarray  # (N, 2) keypoint locations in reference-image pixels
    descriptors: np.ndarray  # (N, 128) SIFT descriptors
    H_ref: np.ndarray  # fretboard space (u, v) -> reference-image pixels
    max_fret: int = 12

    def save(self, path: str | Path) -> None:
        np.savez_compressed(
            Path(path),
            ref_gray=self.ref_gray,
            kp_xy=self.kp_xy,
            descriptors=self.descriptors,
            H_ref=self.H_ref,
            max_fret=self.max_fret,
        )

    @classmethod
    def load(cls, path: str | Path) -> Enrollment:
        d = np.load(Path(path))
        return cls(
            ref_gray=d["ref_gray"],
            kp_xy=d["kp_xy"],
            descriptors=d["descriptors"],
            H_ref=d["H_ref"],
            max_fret=int(d["max_fret"]),
        )

    @staticmethod
    def board_mask(shape, H_ref: np.ndarray, max_fret: int, margin: float = 0.06) -> np.ndarray:
        """A mask covering only the fretboard, slightly dilated past its edges."""
        quad = apply_homography(H_ref, corners_uv(max_fret)).astype(np.float32)
        centre = quad.mean(axis=0)
        grown = (centre + (quad - centre) * (1.0 + margin)).astype(np.int32)
        mask = np.zeros(shape[:2], np.uint8)
        cv2.fillConvexPoly(mask, grown, 255)
        return mask

    @staticmethod
    def build(ref_gray: np.ndarray, board_corners_px, max_fret: int = 12,
              nfeatures: int = 4000) -> Enrollment:
        """Create an enrollment from a reference image and four clicked board corners.

        ``board_corners_px`` must be in the order matching :func:`geometry.corners_uv`:
        (nut x low-E), (nut x high-E), (fret ``max_fret`` x high-E), (fret x low-E).

        **Only features inside the fretboard quad are kept.** This is essential, not a
        refinement: any feature on the room, the stand or the player's body belongs to
        something that does *not* move with the guitar. Include those and RANSAC will
        happily fit the largest consistent set — the static background — leaving an
        overlay that sits still while the guitar moves under it. Measured on a real
        enrollment: 970 of 1059 features were off-board, and the tracker locked onto
        the room.
        """
        H_ref = solve_homography(corners_uv(max_fret), board_corners_px)
        mask = Enrollment.board_mask(ref_gray.shape, H_ref, max_fret)

        sift = cv2.SIFT_create(nfeatures=nfeatures)
        kp, des = sift.detectAndCompute(ref_gray, mask)
        n = 0 if des is None else len(kp)
        if n < 20:
            raise ValueError(
                f"only {n} features on the fretboard itself — the reference is too plain, "
                "too blurry, or the board is too small in frame. Re-shoot closer, with more "
                "(ideally side-on) light."
            )
        return Enrollment(
            ref_gray=ref_gray,
            kp_xy=np.float32([k.pt for k in kp]),
            descriptors=des,
            H_ref=H_ref,
            max_fret=max_fret,
        )

    def feature_density(self) -> float:
        """Features per 100x100 px of board. Below ~15 tracking will be fragile."""
        quad = apply_homography(self.H_ref, corners_uv(self.max_fret)).astype(np.float32)
        area = max(cv2.contourArea(quad), 1.0)
        return len(self.kp_xy) / (area / 10000.0)


# --------------------------------------------------------------------------- #
# The tracker
# --------------------------------------------------------------------------- #

LK_PARAMS = dict(
    winSize=(21, 21),
    maxLevel=3,
    criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01),
)


@dataclass
class TrackerConfig:
    match_width: int = 1280
    """Width frames are downscaled to before SIFT.

    This is the single biggest performance lever. The measured spike ran at 1280 and took
    54 ms; running at native 1920 is 2.25x the pixels and blows the frame budget so badly
    that every frame re-anchors and the optical-flow fast path never gets to run.
    """
    ratio: float = 0.75  # Lowe ratio test
    reproj_px: float = 3.0  # RANSAC threshold
    min_inliers: int = 20
    min_spread_u: float = 0.35
    rematch_interval: float = 0.15  # seconds between full SIFT re-anchors
    min_tracked: int = 12  # below this, force a re-anchor
    smooth: bool = True
    search_margin: float = 0.6
    """How far beyond the last known board to search, as a fraction of its size.

    Restricting SIFT to a region around the last pose is the second big lever: the board
    occupies a small part of a 1080p frame, so a full-frame detect spends most of its time
    on background — which also competes for the `nfeatures` budget and crowds out the
    features we actually want. Falls back to a full-frame search whenever lock is lost.
    """
    nfeatures: int = 3000


class FretboardTracker:
    """Tracks the enrolled fretboard in a live greyscale stream.

    Call :meth:`update` with each frame. Returns ``(H_live, status)`` where ``H_live``
    maps fretboard space to current-frame pixels, or ``None`` when no trustworthy pose is
    available — in which case nothing should be drawn.
    """

    def __init__(self, enrollment: Enrollment, config: TrackerConfig | None = None) -> None:
        self.enr = enrollment
        self.cfg = config or TrackerConfig()
        self._sift = cv2.SIFT_create(nfeatures=self.cfg.nfeatures)
        self._matcher = cv2.BFMatcher()

        self._prev_gray: np.ndarray | None = None
        self._ref_pts: np.ndarray | None = None  # (N, 2) in reference-image pixels
        self._live_pts: np.ndarray | None = None  # (N, 1, 2) in current-frame pixels
        self._last_match_t = 0.0
        self._corner_filter = OneEuroFilter(freq=30.0, min_cutoff=1.2, beta=0.008)
        self._last_good_H: np.ndarray | None = None

        self.n_matches = 0
        self.n_lk = 0
        self.last_spread = 0.0
        self.last_match_ms = 0.0
        self.last_lk_ms = 0.0
        self.last_kp = 0
        self._last_quad: np.ndarray | None = None  # board corners in frame px, last good pose
        self.last_inlier_pts: np.ndarray | None = None  # for the debug view

    # -- internals ---------------------------------------------------------- #

    def _search_mask(self, shape, s: float) -> np.ndarray | None:
        """A mask around the last known board, in downscaled coordinates."""
        if self._last_quad is None:
            return None
        q = self._last_quad * s
        x0, y0 = q.min(axis=0)
        x1, y1 = q.max(axis=0)
        mw, mh = (x1 - x0) * self.cfg.search_margin, (y1 - y0) * self.cfg.search_margin
        h, w = shape
        x0 = int(max(0, x0 - mw));  x1 = int(min(w, x1 + mw))
        y0 = int(max(0, y0 - mh));  y1 = int(min(h, y1 + mh))
        if x1 - x0 < 40 or y1 - y0 < 20:
            return None
        mask = np.zeros(shape, np.uint8)
        mask[y0:y1, x0:x1] = 255
        return mask

    def _match_to_reference(self, gray: np.ndarray) -> tuple[np.ndarray, np.ndarray] | None:
        """SIFT match against the enrolled reference. Returns (ref_pts, live_pts) in
        full-resolution frame coordinates."""
        t0 = time.perf_counter()
        s = min(1.0, self.cfg.match_width / gray.shape[1])
        img = gray if s == 1.0 else cv2.resize(gray, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)

        mask = self._search_mask(img.shape, s)
        kp, des = self._sift.detectAndCompute(img, mask)
        if (des is None or len(kp) < 4) and mask is not None:
            kp, des = self._sift.detectAndCompute(img, None)  # widen the search
        if des is None or len(kp) < 4:
            self.last_match_ms = (time.perf_counter() - t0) * 1000
            return None

        raw = self._matcher.knnMatch(self.enr.descriptors, des, k=2)
        good = [m for m, n in (p for p in raw if len(p) == 2)
                if m.distance < self.cfg.ratio * n.distance]
        self.n_matches += 1
        self.last_match_ms = (time.perf_counter() - t0) * 1000
        self.last_kp = len(kp)
        if len(good) < 4:
            return None

        ref_pts = self.enr.kp_xy[[m.queryIdx for m in good]]
        live = np.float32([kp[m.trainIdx].pt for m in good]) / s
        return ref_pts, live

    def _solve(self, ref_pts: np.ndarray, live_pts: np.ndarray):
        """RANSAC homography reference->frame, then compose with H_ref and gate it."""
        if len(ref_pts) < 4:
            return None, None, "too few correspondences"
        H_match, mask = cv2.findHomography(
            ref_pts.reshape(-1, 1, 2).astype(np.float32),
            live_pts.reshape(-1, 1, 2).astype(np.float32),
            cv2.RANSAC,
            self.cfg.reproj_px,
        )
        if H_match is None or mask is None:
            return None, None, "no RANSAC consensus"
        inl = mask.ravel().astype(bool)
        # findHomography can return a matrix with an empty inlier mask, and
        # cv2.perspectiveTransform returns None rather than an empty array when given no
        # points -- which then crashed on .reshape. Below four inliers the pose is not
        # usable anyway, so refuse it here.
        if int(inl.sum()) < 4:
            return None, inl, f"too few inliers ({int(inl.sum())})"

        # Express the inliers in fretboard space so the spread gate is measured in
        # fret-widths of neck, not in pixels of an arbitrary reference image.
        H_ref_inv = np.linalg.inv(self.enr.H_ref)
        uv = cv2.perspectiveTransform(
            ref_pts[inl].reshape(-1, 1, 2).astype(np.float32), H_ref_inv.astype(np.float32)
        ).reshape(-1, 2)

        uvs = [UV(float(a), float(b)) for a, b in uv]
        self.last_spread = inlier_spread(uvs)
        ok, reason = solve_is_trustworthy(
            uvs,
            min_inliers=self.cfg.min_inliers,
            min_spread_u=self.cfg.min_spread_u,
        )
        if not ok:
            return None, inl, reason
        return H_match @ self.enr.H_ref, inl, ""

    def _smooth(self, H_live: np.ndarray, t: float) -> np.ndarray:
        """Filter the four projected board corners, then re-derive H from them."""
        if not self.cfg.smooth:
            return H_live
        uv = corners_uv(self.enr.max_fret)
        src = np.float32([[p.u, p.v] for p in uv])
        proj = cv2.perspectiveTransform(src.reshape(-1, 1, 2), H_live.astype(np.float32)).reshape(-1, 2)
        sm = self._corner_filter(proj.ravel(), t).reshape(-1, 2)
        try:
            return solve_homography(uv, sm)
        except (ValueError, np.linalg.LinAlgError):
            return H_live

    # -- public ------------------------------------------------------------- #

    def update(self, gray: np.ndarray, t: float | None = None):
        """Advance the tracker by one frame. Returns ``(H_live | None, TrackerStatus)``."""
        t = time.monotonic() if t is None else t
        need_match = (
            self._live_pts is None
            or len(self._live_pts) < self.cfg.min_tracked
            or (t - self._last_match_t) >= self.cfg.rematch_interval
        )

        if need_match:
            got = self._match_to_reference(gray)
            self._last_match_t = t
            if got is not None:
                self._ref_pts, self._live_pts = got[0], got[1].reshape(-1, 1, 2)
        elif self._prev_gray is not None and self._live_pts is not None:
            t_lk = time.perf_counter()
            nxt, st, _err = cv2.calcOpticalFlowPyrLK(
                self._prev_gray, gray, self._live_pts.astype(np.float32), None, **LK_PARAMS
            )
            if nxt is not None and st is not None:
                keep = st.ravel().astype(bool)
                self._live_pts = nxt[keep]
                self._ref_pts = self._ref_pts[keep]
                self.n_lk += 1
                self.last_lk_ms = (time.perf_counter() - t_lk) * 1000
            else:
                self._live_pts = None

        self._prev_gray = gray

        if self._ref_pts is None or self._live_pts is None or len(self._ref_pts) < 4:
            return None, TrackerStatus(locked=False, reason="no correspondences")

        H_live, inl, reason = self._solve(self._ref_pts, self._live_pts.reshape(-1, 2))
        if H_live is None:
            self._corner_filter.reset()
            self._last_quad = None  # widen the search next time
            stale = (t - self._last_match_t) * 1000.0
            return None, TrackerStatus(locked=False,
                                       inliers=int(inl.sum()) if inl is not None else 0,
                                       spread=self.last_spread, reason=reason, stale_ms=stale)

        # Keep only inliers, so LK doesn't carry rubbish forward.
        self._ref_pts = self._ref_pts[inl]
        self._live_pts = self._live_pts[inl]
        self.last_inlier_pts = self._live_pts.reshape(-1, 2).copy()

        H_smoothed = self._smooth(H_live, t)
        self._last_good_H = H_smoothed
        self._last_quad = cv2.perspectiveTransform(
            np.float32([[p.u, p.v] for p in corners_uv(self.enr.max_fret)]).reshape(-1, 1, 2),
            H_smoothed.astype(np.float32),
        ).reshape(-1, 2)
        n = int(inl.sum())
        return H_smoothed, TrackerStatus(locked=True, inliers=n, spread=self.last_spread, reason="")

    def reset(self) -> None:
        self._prev_gray = self._ref_pts = self._live_pts = None
        self._last_good_H = None
        self._last_quad = None
        self._corner_filter.reset()
        self._last_match_t = 0.0
