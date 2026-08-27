"""Frame sources: the packet contract, and poses that are exact by construction.

docs/PLAN-shell.md P1. These tests are the reason the native shell can be built at all
without a camera -- if the synthetic and replay sources are trustworthy, everything drawn
on top of them is testable here rather than only on a guitar.
"""

from __future__ import annotations

import json

import cv2
import numpy as np
import pytest

from fretguide.geometry import apply_homography, corners_uv, fret_u
from fretguide.source import (
    FramePacket,
    FrameSource,
    ReplaySource,
    SyntheticSource,
    draw_synthetic_board,
    synthetic_pose,
)
from fretguide.types import UV


def test_synthetic_source_satisfies_the_protocol():
    assert isinstance(SyntheticSource(fps=None), FrameSource)


def test_packets_carry_their_own_pose_and_a_monotonic_index():
    """Invariant 6. A gap would mean a dropped frame; going backwards means a bug."""
    src = SyntheticSource(width=640, height=360, fps=None)
    packets = [src.read() for _ in range(5)]
    assert all(isinstance(p, FramePacket) for p in packets)
    assert [p.index for p in packets] == [0, 1, 2, 3, 4]
    assert all(p.locked for p in packets)


def test_synthetic_frames_are_deterministic_in_time():
    """Same moment, same picture -- which is what makes these usable in tests as well as
    on screen, and what would let a golden image be trusted."""
    a = SyntheticSource(width=320, height=180, fps=None)
    b = SyntheticSource(width=320, height=180, fps=None)
    for _ in range(3):
        pa, pb = a.read(), b.read()
        assert np.array_equal(pa.gray, pb.gray)
        assert np.allclose(pa.H, pb.H)


def test_the_synthetic_pose_actually_moves():
    """A static pose would let a whole class of frame/pose-pairing bug pass unnoticed."""
    src = SyntheticSource(width=640, height=360, fps=None)
    first = src.read().H
    for _ in range(30):
        last = src.read().H
    a = apply_homography(first, UV(0.25, 0.5))[0]
    b = apply_homography(last, UV(0.25, 0.5))[0]
    assert np.linalg.norm(a - b) > 5.0, "the board barely moved over 30 frames"


def test_the_synthetic_pose_is_genuinely_projective():
    """Not an affine special case.

    An affine transform has a last row of (0, 0, 1), and under one every fret would be
    evenly spaced on screen. Testing a renderer only against affine poses would hide
    exactly the perspective bugs this project exists to get right.
    """
    H = synthetic_pose(1.7, 1280, 720)
    H = H / H[2, 2]
    assert np.abs(H[2, :2]).max() > 1e-6, "pose is affine; perspective bugs would hide"


def test_the_drawn_board_has_non_linear_fret_spacing():
    """The backdrop must obey the fret law too, or it teaches the eye the wrong thing."""
    H = synthetic_pose(0.0, 1280, 720)
    xs = [apply_homography(H, UV(fret_u(n), 0.5))[0] for n in range(13)]
    gaps = [float(np.linalg.norm(xs[n + 1] - xs[n])) for n in range(12)]
    assert gaps[0] > gaps[-1] * 1.4, "fret gaps do not shrink up the neck"
    assert all(gaps[i] > gaps[i + 1] for i in range(11)), "gaps are not monotonically shrinking"


def test_refusal_packets_carry_a_reason():
    """A refused pose is a designed state; it has to say which gate failed."""
    src = SyntheticSource(width=320, height=180, fps=None, refuse_every=4)
    packets = [src.read() for _ in range(12)]
    refused = [p for p in packets if p.H is None]
    assert refused, "refuse_every produced no refusals"
    assert all(p.status.reason for p in refused)
    assert all(not p.status.locked for p in refused)
    assert any(p.H is not None for p in packets), "refuse_every refused everything"


def test_the_board_stays_in_frame_for_the_whole_drift_cycle():
    """Swept over time, not sampled at t=0.

    The drift rates in synthetic_pose are tuning constants, and the obvious way to break
    this source is to make the motion livelier until the neck wanders off the edge. A
    single-moment check would not notice; this fails the moment it starts to.
    """
    w, h = 640, 360
    img = draw_synthetic_board(synthetic_pose(0.0, w, h), w, h)
    assert img.shape == (h, w) and img.dtype == np.uint8

    margin = min(
        min(x, y, w - 1 - x, h - 1 - y)
        for i in range(0, 600, 7)
        for x, y in (apply_homography(synthetic_pose(i / 30, w, h), uv)[0]
                     for uv in corners_uv(12))
    )
    assert margin > 0, f"a board corner leaves the frame (worst margin {margin:.0f} px)"


# --------------------------------------------------------------------------- #
# Replay
# --------------------------------------------------------------------------- #


def _write_fake_dataset(tmp_path, n: int = 3, w: int = 640, h: int = 360):
    """A miniature dataset whose labels were generated from a pose we know exactly.

    Built rather than sampled, so this runs in CI: dataset/frames/ is 317 MB and
    gitignored, and a test that needs it would be a test that silently skips.
    """
    frames = tmp_path / "frames"
    frames.mkdir()
    labels, poses = {}, {}
    for i in range(n):
        H = synthetic_pose(i * 0.4, w, h)
        cv2.imwrite(str(frames / f"f{i:04d}.png"), draw_synthetic_board(H, w, h))
        wires = {}
        for fret in range(13):
            u = fret_u(fret)
            wires[str(fret)] = [
                [float(c) for c in apply_homography(H, UV(u, 0.0))[0]],
                [float(c) for c in apply_homography(H, UV(u, 1.0))[0]],
            ]
        labels[f"f{i:04d}.png"] = {"frets": wires}
        poses[f"f{i:04d}.png"] = H
    lp = tmp_path / "labels.json"
    lp.write_text(json.dumps(labels))
    return frames, lp, poses


def test_replay_recovers_the_pose_its_labels_were_made_from(tmp_path):
    """The label -> homography path, end to end, against a pose known to the last digit.

    This is what earns ReplaySource the right to be called ground truth: it is not merely
    self-consistent, it reproduces the matrix the frame was drawn from.
    """
    frames, labels, poses = _write_fake_dataset(tmp_path)
    src = ReplaySource(frames, labels, fps=None, loop=False)
    assert len(src) == 3

    while (packet := src.read()) is not None:
        name = packet.status.fields["frame"]
        want = poses[name]
        for u in (0.0, 0.25, fret_u(12)):
            for v in (0.0, 0.5, 1.0):
                a = apply_homography(packet.H, UV(u, v))[0]
                b = apply_homography(want, UV(u, v))[0]
                assert np.linalg.norm(a - b) < 0.5, f"{name} at ({u},{v}) off by >0.5 px"


def test_replay_stops_at_the_end_when_not_looping(tmp_path):
    frames, labels, _ = _write_fake_dataset(tmp_path, n=2)
    src = ReplaySource(frames, labels, fps=None, loop=False)
    assert src.read() is not None and src.read() is not None
    assert src.read() is None


def test_replay_loops_by_default(tmp_path):
    frames, labels, _ = _write_fake_dataset(tmp_path, n=2)
    src = ReplaySource(frames, labels, fps=None)
    seen = [src.read().status.fields["frame"] for _ in range(5)]
    assert seen[0] == seen[2] == seen[4], "replay did not wrap around"


def test_replay_says_what_to_do_when_the_frames_are_missing(tmp_path):
    """dataset/frames/ is absent in a fresh clone; the error has to be actionable."""
    with pytest.raises(FileNotFoundError, match="SyntheticSource"):
        ReplaySource(tmp_path / "nope", tmp_path / "nope.json")
