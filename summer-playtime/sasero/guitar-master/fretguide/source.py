"""Where frames and poses come from.

Everything downstream of this module -- the OpenCV app, and the native shell in
``docs/PLAN-shell.md`` -- consumes a :class:`FramePacket` and does not care how it was
produced. Three producers exist, and the reason there is more than one is that only one
of them needs hardware:

========================  ==========================  =============================
source                    frames                      pose
========================  ==========================  =============================
:class:`CameraSource`     V4L2, live                  the trained model
:class:`EnrollmentSource` V4L2, live                  match to a reference photo
:class:`ReplaySource`     ``dataset/frames/*.png``    the labels -- exact
:class:`SyntheticSource`  drawn procedurally          the matrix it was drawn from
========================  ==========================  =============================

The last two matter more than they look. A pose that is exact *by construction* means any
misplaced dot is unambiguously the renderer's fault, which turns "is the model wrong or is
the drawing wrong?" from a debugging session into a non-question. And because
:class:`SyntheticSource` needs no camera, no trained model and no dataset, the app can be
run, developed and tested on a machine with none of them -- including in CI, where the
overlay would otherwise be untestable.

The pairing rule (CLAUDE.md invariant 6) is enforced by shape here: a packet carries the
pose that was computed from *its own* pixels, assembled in one place, so there is no
window in which a pose can be attached to a different frame.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Protocol, runtime_checkable

import cv2
import numpy as np

from .geometry import corners_uv, fret_u, grid_lines, solve_homography
from .types import UV, Point, TrackerStatus

#: Frets carrying inlay markers on a standard neck. Single dot except the double at 12.
INLAY_FRETS = (3, 5, 7, 9, 12, 15, 17, 19, 21, 24)

#: Frets carrying the doubled inlay: the octaves.
DOUBLE_INLAY_FRETS = (12, 24)

#: Frets on a Fender Stratocaster. Vintage-spec necks have 21; most current models
#: (Player, American Professional) have 22, which is ``--max-fret 22``.
#:
#: Only the synthetic backdrop can go this far. The trained model predicts the nut through
#: the twelfth fret and nothing beyond -- 26 keypoints, two per fret wire -- so a camera
#: source is pinned at 12 whatever this says.
STRAT_FRETS = 21

#: Which way the synthetic neck lies, as the angle of the nut -> fret 12 axis in image
#: coordinates (y increases downwards). 163 degrees puts fret 12 on the left and the nut on
#: the right, with the neck rising to the right.
#:
#: This is not a taste decision. It is what the camera in this rig actually sees, measured
#: from all 384 labelled frames in dataset/labels.json, which agree unanimously: fret 12
#: left of the nut, nut higher in the image, and the high E string along the BOTTOM edge.
#: See test_the_backdrop_matches_the_real_capture_geometry.
#:
#: Nothing downstream may assume an orientation -- the pose is a full homography and the
#: overlay is derived from it. If changing this breaks anything but a screenshot, that
#: thing had an orientation baked into it and the bug is there, not here.
NECK_ANGLE_DEG = 163.0


@dataclass(frozen=True)
class FramePacket:
    """One frame together with the pose computed from it.

    They travel as a unit and are never re-associated. The overlay for this packet is
    composited onto ``gray`` (or the colour planes) of this same packet, never onto a
    fresher frame -- that mismatch is what makes an overlay swim against the video even
    when the tracker is working perfectly.
    """

    gray: np.ndarray  #: full-resolution Y plane
    t: float  #: monotonic capture time
    index: int  #: monotonically increasing; a gap means a dropped frame, not a bug
    H: np.ndarray | None  #: board (u, v) -> image pixels; None when the pose was refused
    status: TrackerStatus
    #: Chroma planes, half-resolution, when the source provides them. P2 of the shell
    #: plan uploads these as textures and converts in a shader; the OpenCV app ignores
    #: them and the tracking path never sees them at all.
    u: np.ndarray | None = None
    v: np.ndarray | None = None
    #: Keypoints for the debug overlay, in image pixels. Empty for sources with no model.
    debug_pts: np.ndarray = field(default_factory=lambda: np.zeros((0, 2)))

    @property
    def locked(self) -> bool:
        return self.H is not None

    @property
    def colour(self) -> bool:
        return self.u is not None and self.v is not None

    def to_bgr(self) -> np.ndarray:
        """A BGR image for the OpenCV app to draw on. Greyscale sources widen to grey.

        Repacks the planes into an I420 buffer and lets OpenCV convert, rather than doing
        the matrix in numpy: same result, and it takes the library's optimised path
        instead of allocating three float arrays per frame. The native shell does not use
        this at all -- there the conversion happens on the GPU for free (shell/shaders.py).
        """
        if not self.colour:
            return cv2.cvtColor(self.gray, cv2.COLOR_GRAY2BGR)
        h, w = self.gray.shape[:2]
        buf = np.concatenate([self.gray.reshape(-1), self.u.reshape(-1), self.v.reshape(-1)])
        return cv2.cvtColor(buf.reshape(h * 3 // 2, w), cv2.COLOR_YUV2BGR_I420)


@runtime_checkable
class FrameSource(Protocol):
    """A producer of :class:`FramePacket`. Implementations may block in ``read``."""

    width: int
    height: int

    #: Highest fret the source poses. The overlay clamps generated content to it.
    max_fret: int

    def read(self) -> FramePacket | None:
        """Next packet, or None when the source is exhausted or the camera failed."""
        ...

    def reset(self) -> None:
        """Drop any temporal state. Bound to `r` in the app, for when smoothing lags."""
        ...

    def summary(self) -> str:
        """One line for the end of a run. Empty when there is nothing worth saying."""
        ...

    def close(self) -> None: ...


# --------------------------------------------------------------------------- #
# Replay — real frames, exact poses
# --------------------------------------------------------------------------- #


class ReplaySource:
    """Play back the labelled dataset, posed from its labels rather than from a model.

    The labels give both endpoints of every fret wire, so ``dataset.load_dataset`` already
    derives an exact board homography for each frame. That makes this real footage of the
    real instrument with ground truth attached -- the right thing to develop the overlay
    against, and the only way to tell a rendering bug from a model bug without a guitar in
    your hands.

    ``dataset/frames/`` is gitignored (317 MB, regenerable), so a fresh clone will not have
    it. Use :class:`SyntheticSource` there.
    """

    def __init__(
        self,
        frames_dir: str | Path = "dataset/frames",
        labels_path: str | Path = "dataset/labels.json",
        max_fret: int = 12,
        fps: float | None = 30.0,
        loop: bool = True,
    ) -> None:
        from .dataset import load_dataset  # local: pulls in the labelling machinery

        frames_dir = Path(frames_dir)
        if not frames_dir.is_dir():
            raise FileNotFoundError(
                f"no frames at {frames_dir}. They are gitignored and regenerable "
                f"(tools/collect.py capture), or use SyntheticSource, which needs no data."
            )
        self.frames = load_dataset(frames_dir, labels_path, max_fret=max_fret)
        if not self.frames:
            raise ValueError(f"{frames_dir} and {labels_path} yielded no usable frames")

        probe = cv2.imread(str(self.frames[0].path), cv2.IMREAD_GRAYSCALE)
        if probe is None:
            raise OSError(f"could not read {self.frames[0].path}")
        self.height, self.width = probe.shape[:2]
        self.max_fret = max_fret
        self.fps, self.loop = fps, loop
        self._i = 0
        self._t0 = time.monotonic()

    def __len__(self) -> int:
        return len(self.frames)

    def read(self) -> FramePacket | None:
        if self._i >= len(self.frames):
            if not self.loop:
                return None
            self._i = 0
        lf = self.frames[self._i]
        gray = cv2.imread(str(lf.path), cv2.IMREAD_GRAYSCALE)
        if gray is None:
            return None

        if self.fps:  # pace like a camera, so timing-sensitive UI code sees realistic gaps
            due = self._t0 + self._i / self.fps
            slack = due - time.monotonic()
            if slack > 0:
                time.sleep(slack)

        self._i += 1
        # rms_px is the label's own fit residual: honest provenance for a pose that is
        # ground truth but not infinitely precise.
        status = TrackerStatus(
            locked=True,
            inliers=2 * (self.max_fret + 1),
            spread=fret_u(self.max_fret),
            fields={"src": "replay", "rms": f"{lf.rms_px:.1f}px", "frame": lf.path.name},
        )
        return FramePacket(gray=gray, t=time.monotonic(), index=self._i - 1,
                           H=lf.H, status=status)

    def reset(self) -> None:
        pass  # replay has no temporal state; the pose comes from the labels

    def summary(self) -> str:
        return f"replayed {self._i} of {len(self.frames)} labelled frames"

    def close(self) -> None:
        pass


# --------------------------------------------------------------------------- #
# Synthetic — no camera, no model, no dataset
# --------------------------------------------------------------------------- #


def synthetic_pose(t: float, width: int, height: int, max_fret: int = 12) -> np.ndarray:
    """A plausible, slowly drifting board pose at time ``t``.

    Deterministic in ``t``, so a given moment always renders identically -- which is what
    lets this be used in tests as well as on screen.

    The far end of the neck is drawn *wider* than the nut: a real neck tapers that way, and
    the camera normally sits nearer the body, so both effects push the same direction. It
    also guarantees the transform is genuinely projective rather than an affine special
    case, which would quietly hide a whole class of homography bug.
    """
    cx, cy = width * 0.5, height * 0.5
    ang = math.radians(NECK_ANGLE_DEG + 5.0 * math.sin(t * 0.9))
    ex = np.array([math.cos(ang), math.sin(ang)])  # along the neck, nut -> fret 12
    # Across the neck, pointing from string 6 (low E) to string 1 (high E), i.e. v=0 -> v=1.
    # Negated relative to the usual perpendicular so that the high E ends up on the lower
    # edge of the image, which is where the real camera puts it -- the neck direction and
    # the string direction are independent, and rotating the board without also fixing this
    # yields a neck that lies correctly with its strings upside down.
    ey = -np.array([-math.sin(ang), math.cos(ang)])
    length = width * 0.74 * (1.0 + 0.03 * math.sin(t * 0.62))
    # Width is set from the *drawn* length so the neck keeps a guitar's proportions
    # whatever it shows. A neck is about 15.4 times as long as it is wide over its full
    # scale, so the span from the nut to fret n is 15.4 * u(n) widths -- 7.7 at fret 12,
    # 10.8 at fret 21. Holding a fixed ratio instead would draw a 21-fret neck as wide as
    # a plank, and dots sized from that spacing would be wrong with it.
    w_nut = length / (8.6 * fret_u(max_fret) / fret_u(12))
    # Only a mild taper. The neck really is wider at fret 12 and the camera really does
    # sit nearer the body, but at 1.34x those two together very nearly cancelled the fret
    # law -- on-screen gaps went from 1.89:1 (nut vs fret 12, the truth) to 1.10:1, which
    # is close enough to uniform that a renderer interpolating frets linearly would have
    # looked fine here. A backdrop that hides this project's central bug is worse than no
    # backdrop. QUICKSTART also asks for a head-on camera, so a small taper is the more
    # faithful setup anyway.
    w_far = w_nut * (1.12 + 0.03 * math.sin(t * 0.53))
    drift = ey * (height * 0.05 * math.sin(t * 0.7)) + ex * (width * 0.03 * math.cos(t * 0.5))
    c = np.array([cx, cy]) + drift

    nut = c - ex * length / 2
    far = c + ex * length / 2
    # Same order as geometry.corners_uv: (0,0) (0,1) (uf,1) (uf,0); v=0 is string 6.
    dst = [
        nut - ey * w_nut / 2,
        nut + ey * w_nut / 2,
        far + ey * w_far / 2,
        far - ey * w_far / 2,
    ]
    return solve_homography(corners_uv(max_fret), [Point(*p) for p in dst])


@lru_cache(maxsize=4)
def _backdrop(width: int, height: int, seed: int) -> tuple[np.ndarray, np.ndarray]:
    """The parts of the picture that do not depend on the pose. Built once per size.

    Room lighting, vignette, sensor noise and wood grain are all fixed in image space --
    only the *board* moves through them. Regenerating them every frame cost 74 ms at 1080p
    and capped the synthetic source at 13 fps, which made the one mode that needs no
    hardware the slowest one in the app.

    Returns (room, board_texture): two full-resolution images, of which each frame takes
    the room and stamps the board through a mask.
    """
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    # Uneven room light: a soft diagonal gradient plus a vignette.
    room = 46 + 26 * (xx / width) + 14 * (yy / height)
    r = np.hypot((xx - width / 2) / (width / 2), (yy - height / 2) / (height / 2))
    room *= np.clip(1.15 - 0.42 * r, 0.35, 1.0)
    room = np.clip(room + rng.normal(0, 3.0, (height, width)), 0, 255).astype(np.uint8)

    # Rosewood grain, running along the neck rather than across it.
    grain = cv2.GaussianBlur(rng.normal(0, 26, (height, width)).astype(np.float32), (1, 31), 0)
    board = np.clip(96 + grain, 30, 200).astype(np.uint8)
    return room, board


def draw_synthetic_board(H: np.ndarray, width: int, height: int, max_fret: int = 12,
                         seed: int = 7) -> np.ndarray:
    """Draw a fretboard-like greyscale image for the pose ``H``.

    Not photoreal and not trying to be. It exists so the overlay can be positioned, sized
    and coloured against something with the right geometry and roughly the right contrast
    -- a fretboard is mid-grey, cluttered and lit unevenly, which is exactly what makes
    overlay legibility hard (see render.py's module docstring).

    Never feed this to the model or to training. It is a backdrop, not data.
    """
    room, texture = _backdrop(width, height, seed)
    img = room.copy()
    quad = np.array([[p.x, p.y] for p in
                     [_pt(H, uv) for uv in corners_uv(max_fret)]], dtype=np.int32)
    mask = np.zeros((height, width), np.uint8)
    cv2.fillConvexPoly(mask, quad, 255, cv2.LINE_AA)
    cv2.copyTo(texture, mask, img)

    for f in INLAY_FRETS:  # inlays sit mid-space, not on the wire
        if f > max_fret:
            break
        umid = (fret_u(f - 1) + fret_u(f)) / 2
        offs = (0.28, 0.72) if f in DOUBLE_INLAY_FRETS else (0.5,)
        for vv in offs:
            p = _pt(H, UV(umid, vv))
            # Scaled to the fret space it sits in: a dot sized for fret 3 covers most of
            # fret 21.
            span = _pt(H, UV(fret_u(f), 0.5)), _pt(H, UV(fret_u(f - 1), 0.5))
            gap = math.hypot(span[0].x - span[1].x, span[0].y - span[1].y)
            cv2.circle(img, (int(p.x), int(p.y)), int(max(2, min(width // 260, gap * 0.22))),
                       205, -1, cv2.LINE_AA)

    lines = grid_lines(H, max_fret)
    fret_thick = max(1, int(width // 480 * min(1.0, 12 / max(1, max_fret))))
    for i, (a, b) in enumerate(lines):
        is_fret = i <= max_fret
        shade = 225 if is_fret else 190
        thick = max(1, fret_thick) if is_fret else max(1, width // 900)
        if np.isfinite([a.x, a.y, b.x, b.y]).all():
            cv2.line(img, (int(a.x), int(a.y)), (int(b.x), int(b.y)), shade, thick, cv2.LINE_AA)
    return cv2.GaussianBlur(img, (3, 3), 0)


#: Chroma of the two regions, BT.601 limited range. Rosewood is warm (U below neutral,
#: V above); the room behind it is left very slightly cool. Values derived from
#: RGB(90, 60, 40) and RGB(70, 74, 82) through the same matrix the shader inverts, so a
#: sign error anywhere in the colour path shows up as a board that has gone blue.
CHROMA_BOARD = (114, 142)
CHROMA_ROOM = (132, 124)


def synthetic_chroma(H: np.ndarray, width: int, height: int,
                     max_fret: int = 12) -> tuple[np.ndarray, np.ndarray]:
    """Half-resolution U and V planes matching :func:`draw_synthetic_board`.

    Exists so the colour path is visible and testable without a camera. Chroma is flat
    per region rather than textured, which is realistic enough: 4:2:0 already throws away
    three quarters of it, and on a real neck the colour genuinely is close to constant --
    it is luminance that carries the grain, the frets and the light.
    """
    hh, hw = height // 2, width // 2
    u = np.full((hh, hw), CHROMA_ROOM[0], np.uint8)
    v = np.full((hh, hw), CHROMA_ROOM[1], np.uint8)
    quad = np.array([[p.x / 2, p.y / 2] for p in
                     [_pt(H, uv) for uv in corners_uv(max_fret)]], dtype=np.int32)
    cv2.fillConvexPoly(u, quad, CHROMA_BOARD[0], cv2.LINE_AA)
    cv2.fillConvexPoly(v, quad, CHROMA_BOARD[1], cv2.LINE_AA)
    return u, v


def _pt(H: np.ndarray, uv: UV) -> Point:
    """Project one board point to image pixels.

    UV is board space and Point is image space; they are separate types precisely so
    this direction cannot be got backwards.
    """
    from .geometry import apply_homography

    xy = apply_homography(H, uv)[0]
    return Point(float(xy[0]), float(xy[1]))


class SyntheticSource:
    """A moving fretboard drawn from a known matrix. Needs nothing installed.

    This is what makes the shell developable and testable without hardware: the pose is
    not estimated, it is the very matrix the picture was drawn from, so the overlay's
    correctness is decidable to the pixel.

    ``refuse_every`` periodically returns a packet with no pose, so the ``NO LOCK`` state
    -- which is a designed state in this product, not an error path -- can be built and
    looked at without having to hide a real guitar from a real camera.
    """

    def __init__(self, width: int = 1920, height: int = 1080, max_fret: int = 12,
                 fps: float | None = 30.0, refuse_every: int = 0,
                 colour: bool = False, motion: bool = False,
                 pose_t: float = 0.0) -> None:
        self.width, self.height, self.max_fret = width, height, max_fret
        self.fps, self.refuse_every, self.colour = fps, refuse_every, colour
        #: Still by default. The drift exists to prove the overlay tracks a moving board
        #: and it does that job in the tests; on screen it is only in the way. You are
        #: reading a shape off the neck and matching it with your hands, and a neck that
        #: will not hold still makes that harder for no gain -- the real guitar supplies
        #: all the movement this needs to cope with.
        self.motion, self.pose_t = motion, pose_t
        self._i = 0
        self._t0 = time.monotonic()

    def read(self) -> FramePacket | None:
        i = self._i
        self._i += 1
        t = i / (self.fps or 30.0)
        if self.fps:
            slack = (self._t0 + t) - time.monotonic()
            if slack > 0:
                time.sleep(slack)

        H = synthetic_pose(t if self.motion else self.pose_t,
                           self.width, self.height, self.max_fret)
        gray = draw_synthetic_board(H, self.width, self.height, self.max_fret)
        chroma = (synthetic_chroma(H, self.width, self.height, self.max_fret)
                  if self.colour else (None, None))

        if self.refuse_every and i and i % self.refuse_every < max(1, self.refuse_every // 6):
            status = TrackerStatus(locked=False, inliers=3, spread=0.04,
                                   reason="baseline too short (u-spread 0.040 < 0.12)",
                                   fields={"src": "synthetic"})
            return FramePacket(gray=gray, t=time.monotonic(), index=i, H=None,
                               status=status, u=chroma[0], v=chroma[1])

        status = TrackerStatus(locked=True, inliers=2 * (self.max_fret + 1),
                               spread=fret_u(self.max_fret),
                               fields={"src": "synthetic"})
        return FramePacket(gray=gray, t=time.monotonic(), index=i, H=H, status=status,
                           u=chroma[0], v=chroma[1])

    def reset(self) -> None:
        pass  # the pose is a closed form of t; there is nothing to unstick

    def summary(self) -> str:
        return f"drew {self._i} synthetic frames"

    def close(self) -> None:
        pass


# --------------------------------------------------------------------------- #
# Camera — the real thing
# --------------------------------------------------------------------------- #


class CameraSource:
    """Live V4L2 capture posed by the trained model. The only source needing hardware.

    Imports are deferred so that this module stays importable -- and the other two sources
    stay usable -- on a machine with neither OpenVINO nor a camera, such as CI.
    """

    def __init__(self, device: int | str = 0, width: int = 1920, height: int = 1080,
                 model_path: str = "models/fretnet.xml", infer_device: str = "AUTO",
                 max_fret: int = 12, min_conf: float = 0.15, smooth: bool = True,
                 colour: bool = False) -> None:
        from .capture import Camera
        from .predict import FretboardModel

        self.cam = Camera(device, width, height, colour=colour)
        self.width, self.height = self.cam.width, self.cam.height
        self.model = FretboardModel.from_ir(model_path, device=infer_device,
                                            max_fret=max_fret, min_conf=min_conf,
                                            smooth=smooth)
        self.max_fret = max_fret
        self._i = self._posed = 0

    def read(self) -> FramePacket | None:
        f = self.cam.read()
        if f is None:
            return None
        # Inference happens here, on this thread, immediately after the read -- so the
        # pose and the pixels are bound together before anything else can see either.
        p = self.model(f.gray, f.t)
        self._i += 1
        self._posed += p.H is not None
        n_kp = 2 * (self.max_fret + 1)
        status = TrackerStatus(
            locked=p.H is not None, inliers=p.n_keypoints, spread=p.mean_conf,
            reason=p.reason,
            fields={"kp": f"{p.n_keypoints}/{n_kp}", "conf": f"{p.mean_conf:.2f}",
                    "net": f"{p.infer_ms:.0f}ms"},
        )
        return FramePacket(gray=f.gray, t=f.t, index=f.index, H=p.H, status=status,
                           u=f.u, v=f.v,
                           debug_pts=p.pts[p.conf >= self.model.min_conf])

    def reset(self) -> None:
        self.model.reset()

    def summary(self) -> str:
        if not self._i:
            return ""
        return (f"posed {self._posed}/{self._i} frames "
                f"({self._posed / self._i * 100:.0f}%)")

    def close(self) -> None:
        self.cam.close()


class EnrollmentSource:
    """Live capture posed by the older match-to-reference tracker.

    Kept as the comparison baseline it was built to be: it needs no trained model, so it
    still answers "is the model helping?" -- but it must be re-enrolled whenever the camera
    moves or the light changes, which is the per-session ritual PRD-v2 V6 exists to
    abolish. Not the recommended path.
    """

    def __init__(self, device: int | str = 0, width: int = 1920, height: int = 1080,
                 enrollment: str = "enrollment.npz", match_width: int = 1280,
                 rematch_ms: float = 150.0, smooth: bool = True,
                 colour: bool = False) -> None:
        from .capture import Camera
        from .tracker import Enrollment, FretboardTracker, TrackerConfig

        enr = Enrollment.load(enrollment)
        self.cam = Camera(device, width, height, colour=colour)
        self.width, self.height = self.cam.width, self.cam.height
        self.max_fret = enr.max_fret
        self.n_features = len(enr.kp_xy)
        self._t = FretboardTracker(enr, TrackerConfig(
            match_width=match_width, rematch_interval=rematch_ms / 1000.0, smooth=smooth))

    def read(self) -> FramePacket | None:
        f = self.cam.read()
        if f is None:
            return None
        H, status = self._t.update(f.gray, f.t)
        status.fields = dict(status.fields or {})
        status.fields.update({"sift": f"{self._t.last_match_ms:.0f}ms",
                              "lk": f"{self._t.last_lk_ms:.1f}ms"})
        pts = self._t.last_inlier_pts
        return FramePacket(gray=f.gray, t=f.t, index=f.index, H=H, status=status,
                           u=f.u, v=f.v,
                           debug_pts=pts if pts is not None else np.zeros((0, 2)))

    def reset(self) -> None:
        self._t.reset()

    def summary(self) -> str:
        return f"re-anchors {self._t.n_matches}, LK propagations {self._t.n_lk}"

    def close(self) -> None:
        self.cam.close()


def open_source(spec: str, **kw) -> FrameSource:
    """Build a source from a short string: ``synthetic``, ``replay``, or a camera device.

    Lets every tool take one ``--source`` argument and get all three for free.
    """
    if spec == "synthetic":
        return SyntheticSource(**{k: v for k, v in kw.items()
                                  if k in ("width", "height", "max_fret", "fps",
                                           "refuse_every", "colour", "motion",
                                           "pose_t")})
    if spec == "replay":
        return ReplaySource(**{k: v for k, v in kw.items()
                               if k in ("frames_dir", "labels_path", "max_fret", "fps",
                                        "loop")})
    if spec == "enrollment":
        return EnrollmentSource(**{k: v for k, v in kw.items()
                                   if k in ("device", "width", "height", "enrollment",
                                            "match_width", "rematch_ms", "smooth",
                                            "colour")})
    # Anything else is a camera device: "model", or a bare device number so that
    # `--source 4` keeps working.
    device = kw.get("device", 0) if spec == "model" else spec
    return CameraSource(device=device, **{k: v for k, v in kw.items()
                                          if k in ("width", "height", "model_path",
                                                   "infer_device", "max_fret", "min_conf",
                                                   "smooth", "colour")})
