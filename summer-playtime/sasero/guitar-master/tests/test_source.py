"""Frame sources: the packet contract, and poses that are exact by construction.

docs/PLAN-shell.md P1. These tests are the reason the native shell can be built at all
without a camera -- if the synthetic and replay sources are trustworthy, everything drawn
on top of them is testable here rather than only on a guitar.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

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
    open_source,
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
    src = SyntheticSource(width=640, height=360, fps=None, motion=True)
    first = src.read().H
    for _ in range(30):
        last = src.read().H
    a = apply_homography(first, UV(0.25, 0.5))[0]
    b = apply_homography(last, UV(0.25, 0.5))[0]
    assert np.linalg.norm(a - b) > 5.0, "the board barely moved over 30 frames"


@pytest.mark.parametrize("t", [0.0, 3.7, 9.1, 16.4])
def test_the_backdrop_matches_the_real_capture_geometry(t):
    """The synthetic board must lie the way the real camera sees the real guitar.

    Measured from all 384 labelled frames in dataset/labels.json, which agree unanimously:
    fret 12 is left of the nut, the nut sits higher in the image, and the high E string
    runs along the *bottom* edge. Those three facts are asserted rather than the dataset
    loaded, because dataset/frames/ is gitignored and a test needing it would skip.

    Worth pinning, because two of the three are independent and it is easy to fix one and
    break the other: the neck direction and the string direction are separate axes, and
    rotating the board 180 degrees flips both. A neck lying correctly with its strings
    upside down looks entirely plausible until you try to read a chord off it -- and it
    would quietly invert the meaning of every screenshot used to judge the overlay.
    """
    H = synthetic_pose(t, 1280, 720)
    nut = apply_homography(H, UV(0.0, 0.5))[0]
    f12 = apply_homography(H, UV(fret_u(12), 0.5))[0]
    low_e = apply_homography(H, UV(0.25, 0.0))[0]  # string 6
    high_e = apply_homography(H, UV(0.25, 1.0))[0]  # string 1

    assert f12[0] < nut[0], "fret 12 should be left of the nut"
    assert nut[1] < f12[1], "the neck should rise towards the nut"
    assert high_e[1] > low_e[1], "the high E should run along the bottom edge"


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


# --------------------------------------------------------------------------- #
# Colour (docs/PLAN-shell.md P2)
# --------------------------------------------------------------------------- #


def test_chroma_is_absent_unless_asked_for():
    """Colour is display-only. The tracking path must keep seeing exactly Y and nothing
    else, and the OpenCV app must not start paying for planes it never draws."""
    packet = SyntheticSource(width=320, height=180, fps=None).read()
    assert packet.u is None and packet.v is None
    assert not packet.colour


def test_chroma_planes_are_half_resolution():
    """4:2:0. Full-resolution chroma would be four times the upload for no visible gain —
    and would not match what the camera actually delivers."""
    packet = SyntheticSource(width=320, height=180, fps=None, colour=True).read()
    assert packet.colour
    assert packet.u.shape == (90, 160) == packet.v.shape
    assert packet.u.dtype == np.uint8


def test_the_board_is_warm_and_the_room_is_not():
    """The sign of the chroma, checked in the only way that survives a global swap.

    Testing the board alone would pass with U and V crossed, because both regions would
    flip together. Asserting the board is warm *and* the room is cool pins the sign.
    """
    from fretguide.source import CHROMA_BOARD, CHROMA_ROOM

    assert CHROMA_BOARD[0] < 128 < CHROMA_BOARD[1], "board chroma is not warm"
    assert CHROMA_ROOM[0] > 128 > CHROMA_ROOM[1], "room chroma is not cool"

    packet = SyntheticSource(width=640, height=360, fps=None, colour=True).read()
    assert packet.u.min() == CHROMA_BOARD[0] and packet.v.max() == CHROMA_BOARD[1]
    assert packet.u.max() == CHROMA_ROOM[0] and packet.v.min() == CHROMA_ROOM[1]


def test_chroma_follows_the_board_as_it_moves():
    """A static chroma plane would look right in a screenshot and wrong in motion."""
    src = SyntheticSource(width=320, height=180, fps=None, colour=True, motion=True)
    first = src.read().u
    for _ in range(30):
        last = src.read().u
    assert not np.array_equal(first, last), "chroma did not move with the board"


def test_greyscale_and_colour_agree_on_luminance():
    """Turning colour on must not disturb the plane the tracker reads."""
    a = SyntheticSource(width=320, height=180, fps=None).read()
    b = SyntheticSource(width=320, height=180, fps=None, colour=True).read()
    assert np.array_equal(a.gray, b.gray)


# --------------------------------------------------------------------------- #
# open_source dispatch, and the BGR composite the OpenCV app draws on
# --------------------------------------------------------------------------- #


def test_open_source_builds_a_synthetic_source_from_a_bare_name():
    src = open_source("synthetic", width=320, height=180, fps=None)
    assert isinstance(src, SyntheticSource)
    assert src.max_fret == 12


def test_open_source_ignores_arguments_a_source_does_not_take():
    """Every tool passes the union of all sources' options and lets this sort it out.

    Without the filtering, adding an option for one source would break the call for all
    the others — and the failure would be a TypeError at startup on somebody else's
    machine, since two of the four sources cannot be constructed on this one.
    """
    src = open_source("synthetic", width=320, height=180, fps=None,
                      model_path="nonexistent.xml", infer_device="NPU",
                      enrollment="nope.npz", match_width=99, device=4)
    assert isinstance(src, SyntheticSource)


def test_open_source_replay(tmp_path):
    frames, labels, _ = _write_fake_dataset(tmp_path, n=2)
    src = open_source("replay", frames_dir=frames, labels_path=labels, fps=None)
    assert isinstance(src, ReplaySource)


def test_hardware_free_sources_do_not_drag_in_openvino_or_qt():
    """The point of the synthetic source is that it runs anywhere.

    CameraSource defers its openvino import and the shell defers Qt; if either leaked to
    module scope, `--source synthetic` would start failing on exactly the machines it
    exists to serve, and only there.
    """
    import subprocess

    code = (
        "import sys; from fretguide.source import open_source;"
        "open_source('synthetic', width=64, height=64, fps=None).read();"
        "bad = [m for m in ('openvino', 'torch', 'PySide6') if m in sys.modules];"
        "print(','.join(bad))"
    )
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True,
                         cwd=Path(__file__).resolve().parent.parent)
    assert out.returncode == 0, out.stderr
    assert out.stdout.strip() == "", f"synthetic source imported {out.stdout.strip()}"


def test_to_bgr_widens_greyscale_without_tinting_it():
    packet = SyntheticSource(width=320, height=180, fps=None).read()
    bgr = packet.to_bgr()
    assert bgr.shape == (180, 320, 3)
    assert np.array_equal(bgr[..., 0], bgr[..., 1]) and np.array_equal(bgr[..., 1], bgr[..., 2])


def test_to_bgr_puts_the_colour_back_where_it_belongs():
    """Board warm, room cool — the same assertion pair as the chroma test, one stage later.

    Checking only that the image is 'in colour' would pass with the planes swapped; the
    board and the room must disagree in the right direction.
    """
    from fretguide.geometry import apply_homography, fret_centre_u

    packet = SyntheticSource(width=640, height=360, fps=None, colour=True).read()
    bgr = packet.to_bgr()
    assert bgr.shape == (360, 640, 3)

    x, y = apply_homography(packet.H, UV(fret_centre_u(6), 0.5))[0]
    b, g, r = bgr[int(y), int(x)]
    assert int(r) > int(b) + 20, f"the board is not warm in BGR: rgb({r},{g},{b})"

    b, g, r = bgr[8, 8]  # a corner of the room, well clear of the neck
    assert int(b) > int(r), f"the room is not cool in BGR: rgb({r},{g},{b})"


# --------------------------------------------------------------------------- #
# A full-length neck
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize("max_fret", [12, 21, 22])
def test_the_neck_stays_in_frame_however_long_it_is(max_fret):
    w, h = 640, 360
    margin = min(
        min(x, y, w - 1 - x, h - 1 - y)
        for i in range(0, 600, 11)
        for x, y in (apply_homography(synthetic_pose(i / 30, w, h, max_fret), uv)[0]
                     for uv in corners_uv(max_fret))
    )
    assert margin > 0, f"a {max_fret}-fret neck leaves the frame (worst {margin:.0f} px)"


def test_a_longer_neck_is_drawn_narrower():
    """A neck is a fixed shape, not a rectangle that grows in one direction.

    Holding the drawn length fixed and adding frets has to make the board *thinner*, or a
    21-fret neck comes out looking like a plank -- and dot_radius, which sizes dots from
    the local string spacing, would be wrong along with it.
    """
    def width_of(max_fret):
        H = synthetic_pose(0.0, 1280, 720, max_fret)
        a = apply_homography(H, UV(0.1, 0.0))[0]
        b = apply_homography(H, UV(0.1, 1.0))[0]
        return float(np.linalg.norm(a - b))

    assert width_of(21) < width_of(12) * 0.8
    assert width_of(24) < width_of(21)


def test_the_fret_law_still_holds_over_a_full_neck():
    """Fret 21's space is about a third of fret 1's — 2^(-20/12) of it, in fact."""
    H = synthetic_pose(0.0, 1600, 900, 21)
    xs = [apply_homography(H, UV(fret_u(n), 0.5))[0] for n in range(22)]
    gaps = [float(np.linalg.norm(xs[n + 1] - xs[n])) for n in range(21)]
    assert all(gaps[i] > gaps[i + 1] for i in range(20)), "gaps do not shrink up the neck"
    assert 2.4 < gaps[0] / gaps[-1] < 4.0, f"nut:fret21 gap ratio is {gaps[0] / gaps[-1]:.2f}"


def test_a_strat_neck_carries_the_inlays_a_strat_carries():
    from fretguide.source import DOUBLE_INLAY_FRETS, INLAY_FRETS, STRAT_FRETS

    assert STRAT_FRETS == 21, "vintage-spec Strat; modern ones are 22, via --max-fret"
    on_neck = [f for f in INLAY_FRETS if f <= STRAT_FRETS]
    assert on_neck == [3, 5, 7, 9, 12, 15, 17, 19, 21]
    assert 12 in DOUBLE_INLAY_FRETS and 24 in DOUBLE_INLAY_FRETS


def test_every_modal_box_fits_on_a_full_neck():
    """The point of drawing more than twelve frets.

    Misolidio ends at fret 13 and Eolio at 15, so on the twelve frets the model can pose
    they are cut short. A Strat neck holds all seven boxes whole.
    """
    from fretguide.modes import key_modes

    for key in ("G", "C", "E", "A#"):
        assert all(m.clipped == 0 for m in key_modes(key, max_fret=21)), key


def test_the_synthetic_neck_holds_still_by_default():
    """You are reading a shape off the neck and matching it with your hands. A board that
    drifts while you do that is only in the way, and the real guitar already supplies all
    the movement the tracker has to cope with."""
    src = SyntheticSource(width=320, height=180, fps=None)
    poses = [src.read().H for _ in range(20)]
    assert all(np.allclose(poses[0], H) for H in poses[1:]), "the still neck moved"


def test_motion_is_still_available_for_testing_tracking():
    src = SyntheticSource(width=320, height=180, fps=None, motion=True)
    poses = [src.read().H for _ in range(40)]
    assert not np.allclose(poses[0], poses[-1]), "motion=True did not move the board"
