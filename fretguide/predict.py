"""Run the trained fretboard model on live frames, with no enrolment and no markers.

This is the module that replaces the v1 pipeline the user rejected. There is no reference
image to match against, nothing to click, nothing stuck to the guitar: every frame is posed
from its own pixels, so the overlay follows the instrument wherever it goes instead of
assuming it stayed where it was enrolled.

Independent per-frame inference has one cost -- a keypoint that jitters by a pixel makes the
drawn dots shimmer -- so the projected board corners are one-euro filtered and the pose
re-solved from the smoothed corners. Corners, never the entries of H: the nine entries are
not independent and not metrically meaningful, and filtering them warps the board in ways
that correspond to no camera motion at all.

The neural network sits behind a plain ``infer(x) -> heatmaps`` callable, so everything
between the heatmaps and a drawable pose -- the confidence gate, the robust fit, the spread
gate, the smoothing -- is testable without OpenVINO, a model file, or a camera. That
boundary is deliberate: those stages are where v1 actually went wrong, so they are the
stages that most need tests.

Torch is deliberately absent. Inference is OpenVINO, so a machine that only ever runs the
app never installs a training stack.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from .dataset import (
    DEFAULT_MAX_FRET,
    INPUT_H,
    INPUT_W,
    STRIDE,
    canonical_uv,
    decode_heatmaps,
    homography_from_keypoints,
    letterbox_matrix,
)
from .geometry import apply_homography, corners_uv, solve_homography, solve_is_trustworthy
from .tracker import OneEuroFilter

#: ``infer(x)`` takes (1, 1, INPUT_H, INPUT_W) float32 in [0, 1] and returns the heatmaps,
#: either as (1, K, h, w) or (K, h, w).
InferFn = Callable[[np.ndarray], np.ndarray]


@dataclass
class Pose:
    """One frame's result. ``H`` is None when the frame could not be posed."""

    H: np.ndarray | None  #: board (u, v) -> full-resolution image pixels
    n_keypoints: int  #: keypoints that survived the confidence gate and the pose fit
    mean_conf: float
    reason: str  #: why the pose was refused; empty when H is usable
    infer_ms: float
    pts: np.ndarray  #: decoded keypoints in full-resolution pixels, for debug drawing
    conf: np.ndarray


def openvino_infer(model_path: str | Path, device: str = "AUTO") -> InferFn:
    """Compile an OpenVINO IR (or ONNX) file and return it as a plain callable."""
    # Path check BEFORE the import, so a missing model reports the actionable error even on
    # a machine with no OpenVINO installed -- the training box, for instance, where the
    # tests still have to pass.
    path = Path(model_path)
    if not path.exists():
        raise FileNotFoundError(
            f"no model at {path}. Train one with tools/train.py, then tools/export.py"
        )
    import openvino as ov

    compiled = ov.Core().compile_model(str(path), device, {"PERFORMANCE_HINT": "LATENCY"})
    out = compiled.output(0)

    def infer(x: np.ndarray) -> np.ndarray:
        return compiled(x)[out]

    return infer


class FretboardModel:
    """Full frame in, board pose out.

    Construct with :meth:`from_ir` for normal use; pass an ``infer`` callable directly to
    drive the pose logic from synthetic heatmaps in tests.
    """

    def __init__(
        self,
        infer: InferFn,
        max_fret: int = DEFAULT_MAX_FRET,
        min_conf: float = 0.15,
        min_points: int = 8,
        min_spread_u: float = 0.12,
        smooth: bool = True,
        freq: float = 30.0,
    ):
        self._infer = infer
        self.max_fret = max_fret
        self.min_conf = min_conf
        self.min_points = min_points
        self.min_spread_u = min_spread_u
        self.canon = canonical_uv(max_fret)
        # One filter over the four projected board corners. beta is what trades lag against
        # jitter: the guitar alternates between near-stationary (where shimmer is what you
        # notice) and quick repositioning (where lag is what you notice).
        self._filter = OneEuroFilter(freq=freq, min_cutoff=1.2, beta=0.015) if smooth else None
        self._S: np.ndarray | None = None
        self._src_shape: tuple[int, int] | None = None

    @classmethod
    def from_ir(cls, model_path: str | Path, device: str = "AUTO", **kwargs) -> FretboardModel:
        """Load an exported model. ``device`` is OpenVINO's: AUTO, CPU, GPU, NPU.

        Run ``tools/export.py`` to see measured latency per device rather than guessing.
        """
        model = cls(openvino_infer(model_path, device), **kwargs)
        model.device = device
        model.model_path = str(model_path)
        return model

    def _letterbox(self, gray: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        shape = (gray.shape[0], gray.shape[1])
        if self._S is None or self._src_shape != shape:
            self._S = letterbox_matrix(gray.shape[1], gray.shape[0], INPUT_W, INPUT_H)
            self._src_shape = shape
        img = cv2.warpPerspective(
            gray, self._S, (INPUT_W, INPUT_H),
            flags=cv2.INTER_AREA, borderMode=cv2.BORDER_REPLICATE,
        )
        return img, self._S

    def reset(self) -> None:
        """Drop temporal state. Call after any gap in the frame sequence."""
        if self._filter is not None:
            self._filter.reset()

    def __call__(self, gray: np.ndarray, t: float | None = None) -> Pose:
        if gray.ndim == 3:
            gray = cv2.cvtColor(gray, cv2.COLOR_BGR2GRAY)
        img, S = self._letterbox(gray)
        x = (img.astype(np.float32) / 255.0)[None, None]

        t0 = time.perf_counter()
        hm = np.asarray(self._infer(x))
        infer_ms = (time.perf_counter() - t0) * 1000.0
        if hm.ndim == 4:
            hm = hm[0]

        pts_in, conf = decode_heatmaps(hm, STRIDE)
        Si = np.linalg.inv(S)
        pts_full = apply_homography(Si, pts_in)

        H_in, mask = homography_from_keypoints(
            pts_in, conf, self.max_fret, self.min_conf, self.min_points
        )
        if H_in is None:
            # A dropped frame breaks temporal continuity; filtering across the gap would
            # drag the next good pose toward a stale one.
            self.reset()
            return Pose(None, 0, float(conf.mean()), "no pose from keypoints",
                        infer_ms, pts_full, conf)

        # The same spread gate the analytic path uses. A pose fitted from keypoints
        # clustered on a few adjacent frets is not slightly wrong, it is wild once
        # evaluated at the other end of the neck -- measured at 1.37 fret-widths in v1.
        ok, reason = solve_is_trustworthy(
            [self.canon[i] for i in np.flatnonzero(mask)], None,
            min_inliers=self.min_points, min_spread_u=self.min_spread_u,
        )
        if not ok:
            self.reset()
            return Pose(None, int(mask.sum()), float(conf[mask].mean()), reason,
                        infer_ms, pts_full, conf)

        H_full = Si @ H_in
        if self._filter is not None:
            cu = corners_uv(self.max_fret)
            smoothed = self._filter(apply_homography(H_full, cu).ravel(), t).reshape(-1, 2)
            try:
                H_full = solve_homography(cu, smoothed)
            except (ValueError, np.linalg.LinAlgError):
                pass  # keep the unsmoothed pose rather than dropping a good frame

        return Pose(H_full, int(mask.sum()), float(conf[mask].mean()), "",
                    infer_ms, pts_full, conf)
