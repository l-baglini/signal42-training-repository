"""Dataset, augmentation, and heatmap encode/decode for the fretboard keypoint model.

THE CENTRAL IDEA: a label is a HOMOGRAPHY, not 26 loose points.

The labeller stores 2 endpoints for each of 13 frets. Those 26 points are heavily
over-determined -- 8 degrees of freedom describe them exactly -- so we fit one robust
homography per frame and treat *that* as the ground truth. Three things fall out:

  1. Denoising. Measured on the real 285-frame set, the endpoints the user dragged
     scatter by a median 2.5 px ALONG the fret wire (harmless: a dot just slides along
     the string) but only 0.9 px ACROSS it (the direction that decides which fret you
     are told to play). Fitting the model averages the along-wire jitter away.
  2. Exact augmentation. Warp the image by A, and the new label is A @ H. Points can
     never drift out of sync with pixels, which is the classic keypoint-aug bug.
  3. A target the geometry layer can actually consume. The net's job becomes
     "recover H", which is what render.py needs, rather than "emit 26 pretty dots".

Everything here is numpy + cv2 only. No torch, so it is testable in CI and reusable at
inference time, where torch is absent and OpenVINO runs the net.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from .geometry import apply_homography, dot_uv, fret_u, invert_homography, solve_homography
from .types import UV

#: Network input size. 640x384 is divisible by 32 and, on the 1920x1080 frames the
#: capture tool writes, gives a whole-number 3.0x downscale with 12 px of letterbox.
#: The accuracy budget is +-0.25 fret-widths ~ 10 px at 1920 (docs/research/00-diagnosis.md),
#: i.e. 3.3 px here -- comfortably above what a stride-2 heatmap with subpixel decoding
#: resolves, and 2.4x cheaper than running at 960x576.
INPUT_W, INPUT_H = 640, 384

#: Heatmap stride. The head predicts at 320x192; one cell is 3 px at 1920.
STRIDE = 2

DEFAULT_MAX_FRET = 12


# --------------------------------------------------------------------------- #
# Canonical keypoints
# --------------------------------------------------------------------------- #


def canonical_uv(max_fret: int = DEFAULT_MAX_FRET) -> list[UV]:
    """The keypoints the net predicts: both ends of every fret wire, nut first.

    Channel order is ``fret * 2 + end``, where end 0 is the low-E edge (v=0) and end 1
    the high-E edge (v=1) -- the same convention ``tools/collect.py`` writes and
    ``geometry.string_v`` uses. Two keypoints per fret rather than four board corners
    because corners were measured the *worst* representation: they force the fret law to
    be extrapolated from the extremes, while per-fret points constrain it everywhere and
    survive partial occlusion of the neck by the hand.
    """
    out: list[UV] = []
    for n in range(max_fret + 1):
        u = fret_u(n)
        out += [UV(u, 0.0), UV(u, 1.0)]
    return out


def n_keypoints(max_fret: int = DEFAULT_MAX_FRET) -> int:
    return 2 * (max_fret + 1)


# --------------------------------------------------------------------------- #
# Label -> homography
# --------------------------------------------------------------------------- #


def robust_label_homography(
    label: dict,
    max_fret: int = DEFAULT_MAX_FRET,
    max_iters: int = 8,
) -> tuple[np.ndarray, float, float]:
    """Fit the board->image homography to one label dict via IRLS.

    Returns ``(H, rms_px, across_rms_px)``. Iteratively re-fits while discarding points
    whose residual exceeds ``max(2.5 * median, 6 px)``, which removes the occasional
    stray click (the real set has one nut endpoint 80 px out) without discarding a
    merely-noisy point.

    The two residuals are reported separately because only one of them matters.
    ``across_rms_px`` is the component perpendicular to the fret wire -- the direction
    that decides *which fret* a dot lands in. The parallel component only slides a dot
    along the string it was already on, and on the real set it is 3x larger (median
    2.5 px vs 0.9 px) purely because dragging an endpoint along a wire is visually
    unpunished. Gating frames on total residual would therefore discard good labels;
    gate on ``across_rms_px``.
    """
    frets = {int(n): np.asarray(p, dtype=np.float64) for n, p in label["frets"].items()}
    src: list[UV] = []
    dst: list[tuple[float, float]] = []
    for n in sorted(frets):
        if n > max_fret:
            continue
        u = fret_u(n)
        e0, e1 = frets[n]
        src += [UV(u, 0.0), UV(u, 1.0)]
        dst += [(float(e0[0]), float(e0[1])), (float(e1[0]), float(e1[1]))]
    if len(src) < 6:
        raise ValueError(f"label has only {len(src)} usable endpoints")

    dst_a = np.asarray(dst, dtype=np.float64)
    H = solve_homography(src, dst_a)
    for _ in range(max_iters):
        resid = np.linalg.norm(_project(H, src) - dst_a, axis=1)
        keep = resid <= max(float(np.median(resid)) * 2.5, 6.0)
        if keep.sum() < 8 or keep.all():
            break
        H = solve_homography([s for s, k in zip(src, keep) if k], dst_a[keep])

    delta = _project(H, src) - dst_a
    resid = np.linalg.norm(delta, axis=1)

    across = np.empty(len(src))
    for i in range(0, len(src), 2):
        wire = dst_a[i + 1] - dst_a[i]
        n = np.linalg.norm(wire)
        if n < 1e-9:
            across[i:i + 2] = resid[i:i + 2]
            continue
        normal = np.array([-wire[1], wire[0]]) / n
        across[i:i + 2] = np.abs(delta[i:i + 2] @ normal)

    return H, float(np.sqrt((resid**2).mean())), float(np.sqrt((across**2).mean()))


def _project(H: np.ndarray, uv) -> np.ndarray:
    return apply_homography(H, uv)


@dataclass(frozen=True)
class LabelledFrame:
    path: Path
    H: np.ndarray  #: board (u, v) -> full-resolution image pixels
    rms_px: float  #: total residual of the fret-law fit, full-resolution pixels
    across_px: float  #: residual perpendicular to the fret wires -- the one in the budget


def load_dataset(
    frames_dir: str | Path,
    labels_path: str | Path,
    max_fret: int = DEFAULT_MAX_FRET,
    max_across_px: float = 20.0,
) -> list[LabelledFrame]:
    """Load every labelled frame, sorted by filename = capture order.

    Capture order is preserved deliberately: consecutive frames are near-duplicates
    (211 of 284 consecutive pairs in the real set move the board under 15 px), so a
    random train/val split would leak almost every validation frame into training and
    report a fantasy score. See :func:`split_by_capture_order`.

    ``max_across_px`` is a catastrophe gate, not a quality filter, and is set loose on
    purpose. Measured over all 285 real labels, the across-wire error per endpoint is a
    median of 0.013 and a p90 of 0.035 fret-widths -- 14% of the 0.25 budget -- and *no*
    frame has a median endpoint error above 0.05. Two frames contain a single stray
    endpoint (0.31 and 0.35 fret-widths) but IRLS trims those before the final fit, so
    tightening this threshold would discard usable frames to fix nothing. With 285
    frames covering essentially one pose, throwing data away is the more expensive
    mistake.
    """
    frames_dir, labels_path = Path(frames_dir), Path(labels_path)
    labels = json.loads(labels_path.read_text())
    out: list[LabelledFrame] = []
    for name in sorted(labels):
        label = labels[name]
        if not label or "frets" not in label:
            continue  # skipped frame, or an old 4-corner label
        path = frames_dir / name
        if not path.exists():
            continue
        try:
            H, rms, across = robust_label_homography(label, max_fret)
        except (ValueError, np.linalg.LinAlgError):
            continue
        if across > max_across_px:
            continue  # the fret law cannot explain where these wires are; do not train on it
        out.append(LabelledFrame(path, H, rms, across))
    return out


def split_by_capture_order(
    frames: list[LabelledFrame], val_frac: float = 0.2, block: int = 24
) -> tuple[list[LabelledFrame], list[LabelledFrame]]:
    """Hold out whole CONTIGUOUS BLOCKS, spread evenly through capture order.

    Two requirements pull in opposite directions and blocks satisfy both.

    Never split randomly. Consecutive frames are near-duplicates -- 211 of 284 consecutive
    pairs in the first batch move the board under 15 px -- so a random split puts a
    near-identical twin of almost every validation frame into training and reports a
    fantasy score. Holding out whole runs of ``block`` consecutive frames keeps twins on
    the same side of the split.

    Never hold out only the tail, either, which is what this function used to do. New
    frames get appended, and new frames are exactly the ones deliberately captured with
    more variety, so a tail split sends nearly all of that variety to validation: measured
    on the real set, 77 of 99 newly-captured frames went to val, leaving the model to train
    almost entirely on the old single-pose batch and then be judged on poses it was never
    shown. Pessimistic score, and the new data wasted.

    Evenly-spaced blocks put a share of every capture session on both sides.
    """
    n = len(frames)
    n_blocks = max(2, (n + block - 1) // block)
    n_val_blocks = max(1, int(round(n_blocks * val_frac)))
    # Evenly spaced, offset to the middle of each stride so the first and last blocks --
    # often a session's warm-up and its best frames -- stay in training.
    stride = n_blocks / n_val_blocks
    val_blocks = {int((i + 0.5) * stride) for i in range(n_val_blocks)}
    train, val = [], []
    for i, f in enumerate(frames):
        (val if (i // block) in val_blocks else train).append(f)
    if not val or not train:  # degenerate tiny sets: fall back to a tail split
        n_val = max(1, int(round(n * val_frac)))
        return frames[: n - n_val], frames[n - n_val :]
    return train, val


# --------------------------------------------------------------------------- #
# Letterbox: full-resolution pixels <-> network input pixels
# --------------------------------------------------------------------------- #


def letterbox_matrix(src_w: int, src_h: int, dst_w: int = INPUT_W, dst_h: int = INPUT_H) -> np.ndarray:
    """Aspect-preserving scale-and-centre as a 3x3, so it composes with homographies."""
    s = min(dst_w / src_w, dst_h / src_h)
    return np.array(
        [[s, 0.0, (dst_w - src_w * s) / 2.0], [0.0, s, (dst_h - src_h * s) / 2.0], [0.0, 0.0, 1.0]],
        dtype=np.float64,
    )


# --------------------------------------------------------------------------- #
# Geometric augmentation
# --------------------------------------------------------------------------- #


@dataclass
class AugConfig:
    """Ranges for the random input-space warp and the background compositing.

    THE FAILURE THIS EXISTS TO PREVENT, measured on a real 200-epoch run:

        train fret error  0.009 fret-widths        (near perfect)
        val   fret error  4.4   fret-widths        (18x outside the 0.25 budget)
        predicted board centre -> TRUE board       74 input px
        predicted board centre -> TRAIN-MEAN board 11 input px

    The model had learned to output *where the fretboard usually is* and to ignore where
    it actually was. It recognised the room, not the guitar. The board centre moves only
    13 px (std, in network-input pixels) within a capture session, so "memorise the
    position" is simply an easier hypothesis than "find the fretboard".

    GEOMETRIC AUGMENTATION ALONE CANNOT FIX THIS, and that was the original design error.
    Warping the whole image moves the room and the guitar together, so the board's position
    relative to the window and the shelves survives every rotation, scale and perspective
    change intact. The shortcut is preserved by construction.

    What breaks it is ``bg_replace_p``: on some fraction of samples the neck is cut out and
    composited onto a DIFFERENT frame's background, warped independently. The background
    then predicts nothing about where the board is, so the only cue that pays off across
    the whole training set is the board's own pixels. This is the copy-paste augmentation
    of Ghiasi et al. 2021, used here for the same reason: a tiny dataset in which context
    correlates with the answer.

    It is a mixture, not a replacement: the rest of the samples keep their real background,
    so the net still sees natural images with hands and body attached to the instrument.
    Those cues are legitimate -- they physically move with the guitar. The room does not.
    """

    rotate_deg: float = 35.0
    scale_min: float = 0.60
    scale_max: float = 1.55
    #: Fraction of the input size the board centre may be placed away from centre.
    centre_jitter: float = 0.34
    #: Corner displacement for the perspective component, as a fraction of input size.
    perspective: float = 0.055
    #: Require at least this many keypoints inside the frame, else redraw.
    min_visible: int = 10
    max_tries: int = 24

    brightness: float = 30.0
    contrast: float = 0.32
    gamma: float = 0.35
    noise_sigma: float = 8.0
    blur_max: int = 9
    occluders: int = 2
    #: An occluder may never hide more than this fraction of the board's keypoints.
    occlude_max_frac: float = 0.4

    #: Probability of replacing the background with another frame's, warped independently.
    #: The single most important setting in this class -- see the class docstring.
    #:
    #: Modest ON PURPOSE, now that ``FretNet(depth=3)`` has a receptive field of 83 px and
    #: therefore cannot see the room at all. Compositing was carrying the whole burden of
    #: killing the shortcut when the network's receptive field was 159 px, and it had to be
    #: cranked so high that the training images stopped resembling anything a camera
    #: produces -- a train/serve mismatch traded for a shortcut, which is not a fix.
    #: Limiting the receptive field kills the shortcut by construction; this is now only
    #: generic robustness to an unfamiliar background, so a quarter of samples is plenty.
    bg_replace_p: float = 0.25
    #: How far past the board the kept region extends, in board coordinates: ``u`` as a
    #: fraction of scale length, ``v`` as a fraction of neck width. Randomised per sample
    #: so the composite seam never sits at a fixed distance the net could learn instead.
    bg_margin_u: tuple[float, float] = (0.02, 0.07)
    bg_margin_v: tuple[float, float] = (0.25, 0.95)
    #: Feather width of the composite seam, in input pixels.
    bg_feather: tuple[float, float] = (1.5, 7.0)
    #: Extra seam-bounded patches per composited sample, so a seam does not mark the board.
    #: Setting this to (0, 0) reproduces the run-2 failure described in
    #: :func:`composite_background`.
    decoy_seams: tuple[int, int] = (1, 3)

    def still(self) -> "AugConfig":
        """A no-op configuration, for validation."""
        return AugConfig(
            rotate_deg=0.0,
            scale_min=1.0,
            scale_max=1.0,
            centre_jitter=0.0,
            perspective=0.0,
            brightness=0.0,
            contrast=0.0,
            gamma=0.0,
            noise_sigma=0.0,
            blur_max=0,
            occluders=0,
            bg_replace_p=0.0,
        )


def random_geometric_warp(
    rng: np.random.Generator,
    board_pts: np.ndarray,
    cfg: AugConfig,
    dst_w: int = INPUT_W,
    dst_h: int = INPUT_H,
) -> np.ndarray:
    """A random 3x3 taking input-space pixels to input-space pixels.

    Composed as perspective-jitter x rotate-and-scale-about-the-board x recentre, so the
    board -- wherever it happens to sit in the source frame -- ends up somewhere random,
    at a random size and angle. Returns identity-ish if no draw keeps enough keypoints
    on screen, so a hard frame degrades to un-augmented rather than to garbage.
    """
    # A no-op config must be a true identity, not "recentre the board with zero jitter".
    # Validation has to measure the model on the frames as captured; silently translating
    # every val frame to the middle would make the still-score meaningless.
    if (cfg.rotate_deg == 0.0 and cfg.scale_min == cfg.scale_max == 1.0
            and cfg.centre_jitter == 0.0 and cfg.perspective == 0.0):
        return np.eye(3, dtype=np.float64)

    centre = board_pts.mean(axis=0)
    for _ in range(max(1, cfg.max_tries)):
        theta = np.deg2rad(rng.uniform(-cfg.rotate_deg, cfg.rotate_deg))
        s = float(np.exp(rng.uniform(np.log(cfg.scale_min), np.log(cfg.scale_max))))
        c, sn = np.cos(theta) * s, np.sin(theta) * s
        target = np.array([dst_w / 2.0, dst_h / 2.0]) + rng.uniform(
            -cfg.centre_jitter, cfg.centre_jitter, size=2
        ) * np.array([dst_w, dst_h])
        R = np.array([[c, -sn, 0.0], [sn, c, 0.0], [0.0, 0.0, 1.0]])
        T1 = np.array([[1.0, 0, -centre[0]], [0, 1.0, -centre[1]], [0, 0, 1.0]])
        T2 = np.array([[1.0, 0, target[0]], [0, 1.0, target[1]], [0, 0, 1.0]])
        A = T2 @ R @ T1

        if cfg.perspective > 0:
            j = cfg.perspective * np.array([dst_w, dst_h])
            quad = np.float32([[0, 0], [dst_w, 0], [dst_w, dst_h], [0, dst_h]])
            moved = (quad + rng.uniform(-1.0, 1.0, size=(4, 2)) * j).astype(np.float32)
            A = cv2.getPerspectiveTransform(quad, moved) @ A

        warped = apply_homography(A, board_pts)
        if not np.isfinite(warped).all():
            continue
        inside = (
            (warped[:, 0] > 2) & (warped[:, 0] < dst_w - 3)
            & (warped[:, 1] > 2) & (warped[:, 1] < dst_h - 3)
        )
        if inside.sum() >= min(cfg.min_visible, len(board_pts)):
            return A
    return np.eye(3, dtype=np.float64)


def photometric(img: np.ndarray, rng: np.random.Generator, cfg: AugConfig) -> np.ndarray:
    """Brightness / contrast / gamma / noise / motion blur, in that order.

    Motion blur is not decoration: the guitar moves while being played, and every real
    frame the tracker must handle is smeared to some degree.
    """
    out = img.astype(np.float32)
    if cfg.contrast or cfg.brightness:
        a = 1.0 + rng.uniform(-cfg.contrast, cfg.contrast) if cfg.contrast else 1.0
        b = rng.uniform(-cfg.brightness, cfg.brightness) if cfg.brightness else 0.0
        out = out * a + b
    out = np.clip(out, 0, 255)
    if cfg.gamma:
        g = float(np.exp(rng.uniform(-cfg.gamma, cfg.gamma)))
        out = 255.0 * np.power(out / 255.0, g)
    if cfg.blur_max >= 3 and rng.random() < 0.35:
        k = int(rng.integers(3, cfg.blur_max + 1)) | 1
        ker = np.zeros((k, k), np.float32)
        ker[k // 2, :] = 1.0 / k
        ang = float(rng.uniform(0, 180))
        M = cv2.getRotationMatrix2D((k / 2 - 0.5, k / 2 - 0.5), ang, 1.0)
        ker = cv2.warpAffine(ker, M, (k, k))
        s = ker.sum()
        if s > 1e-6:
            out = cv2.filter2D(out, -1, ker / s)
    if cfg.noise_sigma:
        out = out + rng.normal(0.0, rng.uniform(0.0, cfg.noise_sigma), out.shape)
    return np.clip(out, 0, 255).astype(np.uint8)


def board_mask(
    H_in: np.ndarray,
    margin_u: float,
    margin_v: float,
    max_fret: int = DEFAULT_MAX_FRET,
    feather: float = 4.0,
    shape: tuple[int, int] = (INPUT_H, INPUT_W),
) -> np.ndarray:
    """Soft mask, 1 on the neck and 0 away from it, in network-input pixels.

    Built in BOARD coordinates and then projected, so it follows the neck under any
    perspective instead of being an axis-aligned box. Margins are in board units --
    ``margin_u`` as a fraction of scale length past the nut and the top fret, ``margin_v``
    as a fraction of neck width past each edge -- which keeps the kept region proportional
    to the instrument however far away it is.
    """
    uf = fret_u(max_fret)
    quad = [
        UV(-margin_u, -margin_v), UV(uf + margin_u, -margin_v),
        UV(uf + margin_u, 1.0 + margin_v), UV(-margin_u, 1.0 + margin_v),
    ]
    pts = apply_homography(H_in, quad)
    if not np.isfinite(pts).all():
        return np.ones(shape, dtype=np.float32)
    m = np.zeros(shape, dtype=np.float32)
    cv2.fillConvexPoly(m, np.int32(np.round(pts)), 1.0, cv2.LINE_AA)
    if feather > 0.5:
        k = int(feather * 2) | 1
        m = cv2.GaussianBlur(m, (k, k), feather / 2.0)
    return m


#: The region of a frame that contains fretboard-like structure, in board coordinates:
#: from behind the headstock (u < 0) to past the bridge (u = 1), and a little beyond both
#: neck edges. Covering only to fret 12 is not enough -- frets 13-22 and the headstock stay
#: sharp and perfectly recognisable, which was visible in the run-3 composites.
ERASE_U = (-0.22, 1.05)
ERASE_V = (-0.45, 1.45)


def erase_board(
    gray: np.ndarray,
    H: np.ndarray,
    max_fret: int = DEFAULT_MAX_FRET,
    margin_u: float | None = None,
    margin_v: float | None = None,
) -> np.ndarray:
    """Blur out the fretboard in a frame, so it can serve as a background.

    WITHOUT THIS, COMPOSITING POISONS THE LABELS. Every background comes from another frame
    of the same session, and every one of those contains a guitar. Pasting one neck onto
    another frame's room therefore produces an image with two or three fretboards in it and
    a label naming only one -- training the net to answer "not a fretboard" on real
    fretboards. That is contradictory supervision, and it is worse than the shortcut the
    compositing was introduced to remove.

    Blurring, rather than filling flat: a flat patch is a conspicuous shape, and a net can
    learn "the real neck is the one that is not next to a grey blob". Heavy blur destroys
    the fret wires and the string lines -- the structures the net keys on -- while leaving
    plausible image statistics behind. Margins are generous because a partly-erased neck
    with a few wires still showing is exactly the ambiguous case to avoid.
    """
    uf = fret_u(max_fret)
    u0 = ERASE_U[0] if margin_u is None else -margin_u
    u1 = ERASE_U[1] if margin_u is None else uf + margin_u
    v0 = ERASE_V[0] if margin_v is None else -margin_v
    v1 = ERASE_V[1] if margin_v is None else 1.0 + margin_v
    quad = [UV(u0, v0), UV(u1, v0), UV(u1, v1), UV(u0, v1)]
    pts = apply_homography(H, quad)
    m = np.zeros(gray.shape[:2], dtype=np.float32)
    if np.isfinite(pts).all():
        cv2.fillConvexPoly(m, np.int32(np.round(pts)), 1.0, cv2.LINE_AA)
        m = cv2.GaussianBlur(m, (19, 19), 9.0)
    # Just enough to destroy fret wires and string lines, which sit ~30 px apart at full
    # resolution. The previous min_dim//12 (90 px at 1080) turned a large part of every
    # background into featureless mush and made the composites unrecognisable as photographs.
    k = 41
    if min(gray.shape[:2]) < 200:
        k = max(9, (min(gray.shape[:2]) // 5) | 1)
    blurred = cv2.GaussianBlur(gray, (k, k), 0)
    out = gray.astype(np.float32) * (1.0 - m) + blurred.astype(np.float32) * m
    return np.clip(out, 0, 255).astype(np.uint8)


def span_mask(H: np.ndarray, shape: tuple[int, int], feather: float = 5.0) -> np.ndarray:
    """Mask over the whole string span of a pose -- headstock to bridge, both neck edges.

    Wider than the kept region on purpose. Used to keep decoy islands away from the source
    frame's upper frets: the kept region stops at fret 12, so frets 13-22 are still present
    in the warped source image, and a decoy landing there would re-expose a sharp,
    unlabelled fretboard -- the poisoned-label bug again, in miniature.
    """
    quad = [UV(ERASE_U[0], ERASE_V[0]), UV(ERASE_U[1], ERASE_V[0]),
            UV(ERASE_U[1], ERASE_V[1]), UV(ERASE_U[0], ERASE_V[1])]
    pts = apply_homography(H, quad)
    m = np.zeros(shape, dtype=np.float32)
    if np.isfinite(pts).all():
        cv2.fillConvexPoly(m, np.int32(np.round(pts)), 1.0, cv2.LINE_AA)
        if feather > 0.5:
            k = int(feather * 2) | 1
            m = cv2.GaussianBlur(m, (k, k), feather / 2.0)
    return m


def _decoy_quad(rng: np.random.Generator, ref: np.ndarray) -> np.ndarray:
    """A random quad roughly the size and elongation of the neck region ``ref``."""
    w = float(np.ptp(ref[:, 0])) * float(rng.uniform(0.55, 1.35))
    h = float(np.ptp(ref[:, 1])) * float(rng.uniform(0.55, 1.6))
    cx = float(rng.uniform(0.05, 0.95)) * INPUT_W
    cy = float(rng.uniform(0.05, 0.95)) * INPUT_H
    base = np.array([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]])
    th = float(rng.uniform(-np.pi, np.pi))
    R = np.array([[np.cos(th), -np.sin(th)], [np.sin(th), np.cos(th)]])
    jitter = rng.uniform(-0.12, 0.12, size=(4, 2)) * np.array([w, h])
    return base @ R.T + jitter + np.array([cx, cy])


def composite_background(
    img: np.ndarray,
    H_in: np.ndarray,
    bg_gray: np.ndarray,
    rng: np.random.Generator,
    cfg: AugConfig,
    max_fret: int = DEFAULT_MAX_FRET,
    bg_H: np.ndarray | None = None,
) -> np.ndarray:
    """Keep the neck, replace everything else with another frame, warped independently.

    This severs the correlation between where the board is and what the room looks like.
    The background gets its own random warp, so across the training set the surroundings
    carry no information about the board's position and the net has to read the neck.

    DECOYS ARE NOT OPTIONAL, and leaving them out broke the second training run. Cutting the
    kept region along the board quad draws a feathered seam *exactly around the neck*, and
    that seam is a perfect pointer: a net can learn "the fretboard is inside the boundary"
    and score well on every composited sample without ever learning what a fretboard looks
    like. Natural samples have no seam, so it falls back on recognising the room -- the very
    failure this function exists to prevent, reintroduced by the shape of the fix.

    So one to three additional patches from the same background are pasted with identical
    feathering at random places. Several seams per image, only one containing a neck, which
    makes "look for a seam" worthless and leaves appearance as the only cue that works.

    The guitar body and the hands go with the background, losing two cues that are
    legitimately attached to the instrument. That is the price, and it is why this is applied
    to a fraction of samples rather than all of them.
    """
    if bg_H is not None:
        # Mandatory in practice: see erase_board. A background with its own neck left in
        # gives the net two fretboards and one label.
        bg_gray = erase_board(bg_gray, bg_H, max_fret)
    bg_S = letterbox_matrix(bg_gray.shape[1], bg_gray.shape[0])
    # An independent warp: the background must not move with the board.
    theta = rng.uniform(-np.pi, np.pi)
    s = float(np.exp(rng.uniform(np.log(0.9), np.log(1.8))))
    c, sn = np.cos(theta) * s, np.sin(theta) * s
    cx, cy = INPUT_W / 2.0, INPUT_H / 2.0
    B = (np.array([[1.0, 0, cx + rng.uniform(-90, 90)],
                   [0, 1.0, cy + rng.uniform(-60, 60)], [0, 0, 1.0]])
         @ np.array([[c, -sn, 0.0], [sn, c, 0.0], [0.0, 0.0, 1.0]])
         @ np.array([[1.0, 0, -cx], [0, 1.0, -cy], [0, 0, 1.0]]))
    bg = cv2.warpPerspective(bg_gray, (B @ bg_S).astype(np.float64), (INPUT_W, INPUT_H),
                             flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101)

    feather = float(rng.uniform(*cfg.bg_feather))
    m = board_mask(
        H_in,
        float(rng.uniform(*cfg.bg_margin_u)),
        float(rng.uniform(*cfg.bg_margin_v)),
        max_fret,
        feather,
        img.shape[:2],
    )
    out = img.astype(np.float32) * m + bg.astype(np.float32) * (1.0 - m)

    # Decoy islands. These carry ORIGINAL frame content, exactly like the kept neck region,
    # so the image contains several sharp islands of the source frame and only one of them
    # holds a fretboard. Pasting *background* into the decoys instead would leave the neck
    # as the sole island of original content -- the same giveaway in a different costume.
    ref = apply_homography(H_in, canonical_uv(max_fret))
    if np.isfinite(ref).all():
        # Keep decoys clear of the source's ENTIRE string span, not merely the kept region.
        allowed = 1.0 - np.maximum(m, span_mask(H_in, img.shape[:2]))
        for _ in range(int(rng.integers(cfg.decoy_seams[0], cfg.decoy_seams[1] + 1))):
            d = np.zeros(img.shape[:2], dtype=np.float32)
            cv2.fillConvexPoly(d, np.int32(np.round(_decoy_quad(rng, ref))), 1.0, cv2.LINE_AA)
            if feather > 0.5:
                k = int(feather * 2) | 1
                d = cv2.GaussianBlur(d, (k, k), feather / 2.0)
            d = d * allowed
            out = out * (1.0 - d) + img.astype(np.float32) * d

    return np.clip(out, 0, 255).astype(np.uint8)


def add_occluders(
    img: np.ndarray, pts: np.ndarray, rng: np.random.Generator, cfg: AugConfig
) -> np.ndarray:
    """Paste a few soft blobs, some of them over the neck -- the fretting hand.

    Capped at ``occlude_max_frac`` of the keypoints so the board never disappears; the
    point is to teach the net to emit low confidence for a hidden fret and to recover
    the pose from the rest, not to train on unanswerable frames.
    """
    if cfg.occluders <= 0:
        return img
    out = img.copy()
    h, w = out.shape[:2]
    n = int(rng.integers(0, cfg.occluders + 1))
    for _ in range(n):
        on_board = rng.random() < 0.6 and len(pts)
        if on_board:
            cx, cy = pts[int(rng.integers(0, len(pts)))]
            cx += rng.uniform(-20, 20)
            cy += rng.uniform(-20, 20)
            rx = rng.uniform(12, 46)
            ry = rng.uniform(12, 46)
        else:
            cx, cy = rng.uniform(0, w), rng.uniform(0, h)
            rx, ry = rng.uniform(15, 90), rng.uniform(15, 90)
        hidden = (np.abs(pts[:, 0] - cx) < rx) & (np.abs(pts[:, 1] - cy) < ry)
        if len(pts) and hidden.mean() > cfg.occlude_max_frac:
            continue
        patch = out.copy()
        cv2.ellipse(
            patch,
            (int(cx), int(cy)),
            (int(rx), int(ry)),
            float(rng.uniform(0, 180)),
            0,
            360,
            int(rng.integers(30, 210)),
            -1,
        )
        k = int(rng.integers(3, 15)) | 1
        out = cv2.GaussianBlur(patch, (k, k), 0) if rng.random() < 0.5 else patch
    return out


# --------------------------------------------------------------------------- #
# Heatmap encode / decode
# --------------------------------------------------------------------------- #


def render_heatmaps(
    pts: np.ndarray,
    hm_w: int,
    hm_h: int,
    stride: int = STRIDE,
    sigma: float = 1.5,
) -> np.ndarray:
    """(K, hm_h, hm_w) float32 Gaussians. Off-frame keypoints get an all-zero channel.

    An all-zero channel is a real training signal, not a gap: it teaches the net to say
    "not visible" instead of guessing, which is what lets the pose fit drop occluded
    frets rather than being dragged off by them.
    """
    k = len(pts)
    hm = np.zeros((k, hm_h, hm_w), dtype=np.float32)
    r = int(np.ceil(3.0 * sigma))
    for i, (x, y) in enumerate(pts):
        cx, cy = x / stride, y / stride
        if not (np.isfinite(cx) and np.isfinite(cy)):
            continue
        x0, x1 = int(np.floor(cx - r)), int(np.ceil(cx + r)) + 1
        y0, y1 = int(np.floor(cy - r)), int(np.ceil(cy + r)) + 1
        x0c, y0c, x1c, y1c = max(x0, 0), max(y0, 0), min(x1, hm_w), min(y1, hm_h)
        if x0c >= x1c or y0c >= y1c:
            continue
        gx = np.arange(x0c, x1c, dtype=np.float32) - cx
        gy = np.arange(y0c, y1c, dtype=np.float32) - cy
        g = np.exp(-(gy[:, None] ** 2 + gx[None, :] ** 2) / (2.0 * sigma * sigma))
        hm[i, y0c:y1c, x0c:x1c] = np.maximum(hm[i, y0c:y1c, x0c:x1c], g)
    return hm


def decode_heatmaps(
    hm: np.ndarray,
    stride: int = STRIDE,
    window: int = 2,
    rel_thresh: float = 0.3,
) -> tuple[np.ndarray, np.ndarray]:
    """(K, h, w) heatmaps -> ``(pts_input_px, confidence)``.

    Peak cell, then a centre-of-mass over a (2*window+1) neighbourhood, counting only
    cells at or above ``rel_thresh`` of the peak.

    Both constants are measured, not guessed, and the interaction between them is the
    whole point. A centroid over a truncated Gaussian is biased toward the window centre,
    which argues for a wide window; but a wide window also swallows a *second* peak when
    the net is torn between two frets in the same channel, and that error is an order of
    magnitude worse. Measured on synthetic peaks, error in input pixels
    (clean | with a 60%-height decoy 5 cells away):

        window 2, no threshold   0.28 | 0.28
        window 4, no threshold   0.02 | 0.99   <- accurate until it is catastrophic
        window 2, rel 0.3        0.09 | 0.09   <- chosen
        window 3, rel 0.3        0.09 | 0.14

    The threshold is what makes the narrow window accurate *and* immune: it discards the
    decoy outright, so contaminated performance equals clean performance. 0.09 px is 3%
    of the 3.3 px input-resolution budget.
    """
    k, h, w = hm.shape
    flat = hm.reshape(k, -1)
    idx = flat.argmax(axis=1)
    conf = flat[np.arange(k), idx]
    py, px = np.divmod(idx, w)
    pts = np.zeros((k, 2), dtype=np.float64)
    for i in range(k):
        x0, x1 = max(int(px[i]) - window, 0), min(int(px[i]) + window + 1, w)
        y0, y1 = max(int(py[i]) - window, 0), min(int(py[i]) + window + 1, h)
        patch = np.clip(hm[i, y0:y1, x0:x1].astype(np.float64), 0.0, None)
        if rel_thresh > 0.0:
            patch = np.where(patch >= rel_thresh * conf[i], patch, 0.0)
        s = patch.sum()
        if s <= 1e-9:
            pts[i] = (px[i], py[i])
            continue
        ys = np.arange(y0, y1, dtype=np.float64)
        xs = np.arange(x0, x1, dtype=np.float64)
        pts[i] = ((patch.sum(axis=0) * xs).sum() / s, (patch.sum(axis=1) * ys).sum() / s)
    return pts * stride, conf.astype(np.float64)


# --------------------------------------------------------------------------- #
# Keypoints -> pose
# --------------------------------------------------------------------------- #


def homography_from_keypoints(
    pts: np.ndarray,
    conf: np.ndarray,
    max_fret: int = DEFAULT_MAX_FRET,
    min_conf: float = 0.15,
    min_points: int = 8,
    reproj_px: float = 4.0,
    max_iters: int = 6,
) -> tuple[np.ndarray | None, np.ndarray]:
    """Fit the pose from decoded keypoints. Returns ``(H, inlier_mask)``.

    Over-determined on purpose -- up to 26 points for 8 unknowns -- so independent
    per-keypoint error averages down instead of landing directly on the drawn dots.
    Confidence-gated then IRLS-trimmed, because one confidently-wrong fret (the net
    mistaking fret 5 for fret 7 is the plausible failure) must not be averaged in.
    """
    canon = canonical_uv(max_fret)
    if len(pts) != len(canon):
        raise ValueError(f"expected {len(canon)} keypoints, got {len(pts)}")
    ok = (conf >= min_conf) & np.isfinite(pts).all(axis=1)
    if ok.sum() < min_points:
        return None, ok & False

    idx = np.flatnonzero(ok)
    try:
        H = solve_homography([canon[i] for i in idx], pts[idx])
    except (ValueError, np.linalg.LinAlgError):
        return None, ok & False

    keep = idx
    for _ in range(max_iters):
        resid = np.linalg.norm(_project(H, [canon[i] for i in keep]) - pts[keep], axis=1)
        good = resid <= max(reproj_px, float(np.median(resid)) * 2.0)
        if good.all() or good.sum() < min_points:
            break
        keep = keep[good]
        try:
            H = solve_homography([canon[i] for i in keep], pts[keep])
        except (ValueError, np.linalg.LinAlgError):
            return None, ok & False

    mask = np.zeros(len(pts), dtype=bool)
    mask[keep] = True
    return H, mask


def fret_width_error(
    H_pred: np.ndarray,
    H_true: np.ndarray,
    max_fret: int = DEFAULT_MAX_FRET,
) -> np.ndarray:
    """Per-dot error in FRET-WIDTHS, the unit the accuracy budget is written in.

    Projects every finger dot with the predicted pose, maps it back through the true
    pose into board coordinates, and divides the u-error by the local fret spacing.
    Reporting pixels or heatmap MSE would hide the thing that actually matters: whether
    a dot lands in the right fret. Budget is 0.25 (docs/research/00-diagnosis.md).
    """
    Hi = invert_homography(H_true)
    errs = []
    for f in range(1, max_fret + 1):
        width_u = fret_u(f) - fret_u(f - 1)
        for s in range(1, 7):
            uv = dot_uv(s, f)
            back = apply_homography(Hi, apply_homography(H_pred, uv))[0]
            if not np.isfinite(back).all():
                errs.append(np.inf)
                continue
            errs.append(abs(back[0] - uv.u) / width_u)
    return np.asarray(errs, dtype=np.float64)


# --------------------------------------------------------------------------- #
# Sample construction
# --------------------------------------------------------------------------- #


def make_sample(
    gray: np.ndarray,
    H_full: np.ndarray,
    rng: np.random.Generator,
    cfg: AugConfig,
    max_fret: int = DEFAULT_MAX_FRET,
    sigma: float = 1.5,
    bg_gray: np.ndarray | None = None,
    bg_H: np.ndarray | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """One training sample: ``(image uint8 (H, W), heatmaps (K, h, w), H_input 3x3)``.

    ``H_input`` maps board coordinates to *network input* pixels, and is the quantity
    the metric compares against -- keeping the evaluation in the same frame the net
    predicts in, with no hidden rescaling to argue about later.

    Pass ``bg_gray`` (any other frame from the set) to enable background compositing, which
    is what stops the net from locating the board by recognising the room. Without it the
    augmentation is geometry-only, which was measured to be insufficient -- see
    :class:`AugConfig`.

    Pass ``bg_H`` as well, always: it is that frame's own board pose, used to erase its neck
    before it becomes background. Omitting it leaves a second, unlabelled fretboard in the
    image -- see :func:`erase_board`.
    """
    canon = canonical_uv(max_fret)
    S = letterbox_matrix(gray.shape[1], gray.shape[0])
    H_in = S @ H_full
    board = apply_homography(H_in, canon)

    A = random_geometric_warp(rng, board, cfg)
    H_in = A @ H_in
    pts = apply_homography(H_in, canon)

    img = cv2.warpPerspective(
        gray,
        (A @ S).astype(np.float64),
        (INPUT_W, INPUT_H),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE,
    )
    if bg_gray is not None and rng.random() < cfg.bg_replace_p:
        img = composite_background(img, H_in, bg_gray, rng, cfg, max_fret, bg_H)
    img = add_occluders(img, pts, rng, cfg)
    img = photometric(img, rng, cfg)

    hm = render_heatmaps(pts, INPUT_W // STRIDE, INPUT_H // STRIDE, STRIDE, sigma)
    return img, hm, H_in
