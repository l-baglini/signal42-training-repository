"""Does the overlay draw dots where the geometry says they go?

This is the parity harness from docs/PLAN-shell.md P1, and it exists because of a
question that has cost real debugging time: when a dot looks wrong, is the pose wrong or
is the drawing wrong? With a synthetic source the pose is not estimated -- it is the very
matrix the picture was drawn from -- so the answer is decidable, and any discrepancy here
belongs to the renderer.

:func:`drawn_dot_centres` deliberately recovers positions from the rendered *pixels*
rather than from the drawing code's own arithmetic. That makes it renderer-agnostic: when
the QPainter overlay arrives at P3, it is checked by these same assertions against the
same poses, and "the two renderers disagree" becomes a test failure instead of something
somebody notices later on a video.
"""

from __future__ import annotations

import cv2
import numpy as np
import pytest

from fretguide import render
from fretguide.content import resolve_selection
from fretguide.geometry import dot_pixel
from fretguide.source import SyntheticSource
from fretguide.types import Selection

#: A chord with no open strings, so every mark under test is a filled dot. The muted
#: string 6 is drawn as an X in COL_MUTED and is invisible to the masks below.
BARRE = Selection("chord", "Bm")


def drawn_dot_centres(view: np.ndarray, colour: tuple[int, int, int],
                      min_area: int = 12) -> np.ndarray:
    """Centroids of the filled blobs of exactly ``colour`` (BGR) in ``view``.

    Renderer-agnostic by construction: it reads the output image, not the code that
    produced it.
    """
    mask = cv2.inRange(view, np.array(colour, np.uint8), np.array(colour, np.uint8))
    n, _, stats, centroids = cv2.connectedComponentsWithStats(mask, connectivity=8)
    return np.array([centroids[i] for i in range(1, n)
                     if stats[i, cv2.CC_STAT_AREA] >= min_area])


def render_selection(width: int = 1280, height: int = 720, t_index: int = 0):
    """Draw BARRE onto one synthetic frame. Returns (view, H, resolved)."""
    src = SyntheticSource(width=width, height=height, fps=None)
    for _ in range(t_index + 1):
        packet = src.read()
    assert packet is not None and packet.H is not None
    view = cv2.cvtColor(packet.gray, cv2.COLOR_GRAY2BGR)
    resolved = resolve_selection(BARRE, max_fret=12)
    render.draw_selection(view, packet.H, resolved, show_fingers=False)
    return view, packet.H, resolved


def test_every_fretted_dot_lands_on_its_projected_position():
    """The whole point of the overlay, asserted directly.

    Tolerance is 2 px because render.py rounds centres to integers before drawing and the
    blobs are antialiased. At 1280 px wide a fret space is ~40 px, so 2 px is about 0.05
    fret-widths -- well inside the 0.25 budget, and a real placement bug moves a dot by a
    whole fret space, not by two pixels.
    """
    view, H, resolved = render_selection()
    found = drawn_dot_centres(view, render.COL_NOTE)
    found = np.vstack([found, drawn_dot_centres(view, render.COL_ROOT)])

    expected = np.array([[(p := dot_pixel(H, pos.string, pos.fret)).x, p.y]
                         for pos in resolved.positions if pos.fret > 0])
    assert len(found) == len(expected), f"drew {len(found)} dots, expected {len(expected)}"

    for want in expected:
        d = np.linalg.norm(found - want, axis=1).min()
        assert d <= 2.0, f"nearest drawn dot is {d:.2f} px from {want}"


def test_root_and_non_root_use_different_colours():
    """Bm's root is on string 5; the emphasis is a correctness property, not decoration."""
    view, _, resolved = render_selection()
    roots = [p for p in resolved.positions if p.is_root and p.fret > 0]
    assert len(drawn_dot_centres(view, render.COL_ROOT)) == len(roots)
    assert len(drawn_dot_centres(view, render.COL_NOTE)) == len(resolved.positions) - len(roots)


def test_dots_never_overlap_their_neighbours():
    """render.dot_radius sizes to the tighter local dimension for exactly this reason.

    Two dots on adjacent strings in the same fret space must not merge; if they do, the
    overlay stops saying which string to fret, which is the one thing it is for.
    """
    view, H, resolved = render_selection()
    centres = np.vstack([drawn_dot_centres(view, render.COL_NOTE),
                         drawn_dot_centres(view, render.COL_ROOT)])
    radii = [render.dot_radius(H, p.fret, p.string) for p in resolved.positions if p.fret > 0]
    biggest = 2 * max(radii)
    d = np.linalg.norm(centres[:, None, :] - centres[None, :, :], axis=-1)
    np.fill_diagonal(d, np.inf)
    assert d.min() > biggest * 0.55, "two dots are close enough to read as one mark"


@pytest.mark.parametrize("t_index", [0, 17, 44])
def test_placement_holds_as_the_board_moves(t_index):
    """The pose drifts frame to frame; correct placement must not depend on where it is."""
    view, H, resolved = render_selection(t_index=t_index)
    found = np.vstack([drawn_dot_centres(view, render.COL_NOTE),
                       drawn_dot_centres(view, render.COL_ROOT)])
    for pos in (p for p in resolved.positions if p.fret > 0):
        want = dot_pixel(H, pos.string, pos.fret)
        d = np.linalg.norm(found - np.array([want.x, want.y]), axis=1).min()
        assert d <= 2.0, f"string {pos.string} fret {pos.fret} off by {d:.2f} px at t{t_index}"


def test_nothing_is_drawn_without_a_pose():
    """Invariant 4: a refused pose must produce no overlay at all, not a faded one."""
    src = SyntheticSource(width=640, height=360, fps=None, refuse_every=1)
    packet = src.read() or pytest.fail("no packet")
    for _ in range(6):
        if packet.H is None:
            break
        packet = src.read()
    assert packet.H is None, "refuse_every never produced an unlocked packet"
    assert packet.status.reason, "a refusal must say which gate failed"

    view = cv2.cvtColor(packet.gray, cv2.COLOR_GRAY2BGR)
    render.dim(view, 0.5)
    assert len(drawn_dot_centres(view, render.COL_NOTE)) == 0
    assert len(drawn_dot_centres(view, render.COL_ROOT)) == 0
