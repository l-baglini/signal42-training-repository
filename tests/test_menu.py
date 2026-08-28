"""The practice catalogue and how the cursor moves through it.

Pure state, no toolkit, so all of it is provable here — which is the reason the menu is
modelled apart from its drawing. The OpenCV app and the native shell render this same
object, and neither of them needs a test to prove that Locrian follows Aeolian.
"""

from __future__ import annotations

import pytest

from fretguide.content import resolve_selection
from fretguide.menu import KEYS, ORDINALS, Layout, Menu, Node, build_root, preferred_anchor
from fretguide.types import Selection


def leaves(nodes) -> list[Node]:
    out = []
    for n in nodes:
        out.extend(leaves(n.children) if n.is_branch else [n])
    return out


def find(nodes, label: str) -> Node:
    return next(n for n in nodes if n.label == label)


# --------------------------------------------------------------------------- #
# Shape of the tree
# --------------------------------------------------------------------------- #


def test_the_top_level_is_chords_and_scales():
    assert [n.label for n in build_root()] == ["Chords", "Scales"]


def test_chords_are_one_step_down_and_are_chords():
    chords = find(build_root(), "Chords")
    assert len(chords.children) == 7
    assert all(n.selection.mode == "chord" for n in chords.children)
    assert all(not n.is_branch for n in chords.children), "a chord is a leaf, not a branch"


def test_scales_open_onto_the_twelve_keys():
    scales = find(build_root(), "Scales")
    assert [n.label for n in scales.children] == list(KEYS)
    assert len(KEYS) == 12


def test_keys_start_at_a():
    """Guitarists count from A: it is the open fifth string and where every book starts.
    The chromatic table underneath starts at C, so this ordering is deliberate."""
    assert KEYS[0] == "A"
    assert KEYS == ("A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#")


def test_a_key_offers_modals_then_both_pentatonics_then_the_whole_neck():
    key = find(find(build_root(), "Scales").children, "G")
    assert [n.label for n in key.children] == [
        "Modals", "Minor pentatonic", "Major pentatonic", "Whole neck"]
    assert all(n.is_branch for n in key.children)


def test_the_modes_of_a_key_are_in_derivation_order():
    """That order *is* the relationship between the modes — each is the next degree of the
    same parent scale. Sorting them A–Z would hide the one fact that makes them learnable.
    """
    modals = find(find(find(build_root(), "Scales").children, "G").children, "Modals")
    assert [n.label.split()[-1] for n in modals.children] == [
        "Ionian", "Dorian", "Phrygian", "Lydian", "Mixolydian", "Aeolian", "Locrian"]
    assert [n.label.split()[0] for n in modals.children] == [
        "I", "II", "III", "IV", "V", "VI", "VII"]


@pytest.mark.parametrize("group", ["Minor pentatonic", "Major pentatonic"])
def test_each_pentatonic_offers_five_shapes(group):
    key = find(find(build_root(), "Scales").children, "G")
    shapes = find(key.children, group)
    assert [n.label for n in shapes.children] == [f"{o} shape" for o in ORDINALS]
    assert all(n.selection.mode == "penta_box" for n in shapes.children)


def test_minor_and_major_pentatonic_are_the_same_shapes_rooted_differently():
    key = find(find(build_root(), "Scales").children, "G")
    minor = find(key.children, "Minor pentatonic").children
    major = find(key.children, "Major pentatonic").children
    for lo, hi in zip(minor, major):
        a = resolve_selection(lo.selection, max_fret=24)
        b = resolve_selection(hi.selection, max_fret=24)
        assert {(p.string, p.fret) for p in a.positions} == {(p.string, p.fret) for p in b.positions}
        assert [p.is_root for p in a.positions] != [p.is_root for p in b.positions]


def test_every_mode_and_shape_carries_a_detail_line():
    """Without root, chord and position a mode row is indistinguishable from the other
    six, because the notes are literally the same."""
    key = find(find(build_root(), "Scales").children, "G")
    for group in ("Modals", "Minor pentatonic", "Major pentatonic"):
        for node in find(key.children, group).children:
            assert node.detail, f"{group} / {node.label} has no detail"
            assert "pos" in node.detail


def test_every_catalogue_entry_actually_resolves():
    """The whole catalogue, checked against the theory engine.

    Every leaf is a string that has to survive being split, looked up and turned into fret
    positions. A typo would produce a menu item that silently draws nothing — visible only
    if you happened to pick that one — so this walks all of them rather than sampling.
    """
    all_leaves = leaves(build_root())
    for node in all_leaves:
        resolved = resolve_selection(node.selection, max_fret=24)
        assert resolved is not None, f"{node.label} does not resolve"
        assert resolved.positions, f"{node.label} resolves to nothing"
    assert len(all_leaves) == 7 + 12 * (7 + 5 + 5 + 4)


# --------------------------------------------------------------------------- #
# Moving through it
# --------------------------------------------------------------------------- #


def test_a_fresh_menu_stands_on_a_playable_leaf():
    """Opening onto a branch would mean the overlay showed nothing until you moved."""
    m = Menu()
    assert m.selection() is not None
    assert resolve_selection(m.selection(), max_fret=24) is not None


def test_columns_appear_and_vanish_with_the_branch_you_are_on():
    m = Menu()
    m.click(0, 0)  # Chords
    assert [len(c) for c in m.columns] == [2, 7], "chords are two columns deep"
    m.click(0, 1)  # Scales
    assert [len(c) for c in m.columns] == [2, 12, 4, 7], "scales are four"


def test_descending_and_ascending_walk_the_columns():
    m = Menu()
    m.click(0, 1)
    assert m.column == 0
    for expected in (1, 2, 3):
        assert m.descend()
        assert m.column == expected
    assert not m.descend(), "should not descend past the last column"
    for expected in (2, 1, 0):
        assert m.ascend()
        assert m.column == expected
    assert not m.ascend()


def test_moving_wraps_within_a_column():
    m = Menu()
    m.click(0, 1)
    m.focus(1)
    m.move(-1)
    assert m.trail[1] == KEYS[-1], "the key column did not wrap backwards"
    m.move(1)
    assert m.trail[1] == KEYS[0]


def test_changing_key_keeps_your_place_in_the_mode_list():
    """You are comparing the same mode across keys; landing back on Ionian each time
    would make that the one thing the menu is bad at."""
    m = Menu()
    assert m.sync_to(Selection("mode_box", "A:5"))
    label = m.trail[-1]
    m.focus(1)
    m.move(1)
    assert m.trail[1] == "A#"
    assert m.trail[-1] == label, "the mode changed when only the key should have"
    assert m.selection() == Selection("mode_box", "A#:5")


def test_the_selection_follows_the_deepest_node_not_the_focused_one():
    """Moving through keys must change what is drawn even though a key is a branch: the
    mode you were looking at still applies in the new key."""
    m = Menu()
    m.sync_to(Selection("mode_box", "G:2"))
    m.focus(1)
    before = m.selection()
    m.move(1)
    assert m.selection() != before
    assert m.selection().mode == "mode_box"


def test_selection_is_live_rather_than_committed():
    m = Menu()
    m.sync_to(Selection("mode_box", "G:1"))
    first = m.selection()
    m.move(1)
    assert m.selection() != first
    assert resolve_selection(m.selection(), max_fret=24) is not None


def test_clicking_out_of_range_does_nothing():
    m = Menu()
    before = m.trail
    assert m.click(0, 99) is False
    assert m.click(9, 0) is False
    assert m.click(0, -1) is False
    assert m.trail == before


def test_sync_to_finds_what_is_already_on_screen():
    """Opening the menu should show you where you are, not reset you to the top."""
    m = Menu()
    assert m.sync_to(Selection("mode_box", "D#:4"))
    assert m.trail == ["Scales", "D#", "Modals", "IV  Lydian"]

    assert m.sync_to(Selection("penta_box", "C:3:min"))
    assert m.trail == ["Scales", "C", "Minor pentatonic", "3rd shape"]

    assert m.sync_to(Selection("chord", "Em"))
    assert m.trail == ["Chords", "Em"]

    assert m.sync_to(Selection("scale_generated", "F blues"))
    assert m.trail == ["Scales", "F", "Whole neck", "Blues"]


def test_sync_to_reports_failure_for_things_not_in_the_catalogue():
    assert Menu().sync_to(Selection("scale", "g-major-box")) is False


# --------------------------------------------------------------------------- #
# Layout and hit-testing
# --------------------------------------------------------------------------- #


def test_a_click_lands_on_the_row_it_looks_like_it_landed_on():
    """Walked exhaustively rather than sampled. A menu that is one row out is the kind of
    bug you can only chase by clicking at it, which is no way to debug anything."""
    m = Menu()
    m.click(0, 1)
    lay = Layout()
    for column, nodes in enumerate(m.columns):
        for index in range(len(nodes)):
            x, y, w, h = lay.row_rect(column, index)
            for px, py in ((x + 1, y + 1), (x + w - 2, y + h - 2), (x + w / 2, y + h / 2)):
                assert lay.hit(px, py, m) == (column, index), (
                    f"({px},{py}) should be column {column} row {index}")


def test_clicks_outside_the_panel_are_not_swallowed():
    """Clicking the video must reach the video, so the menu has to say 'not mine'."""
    m = Menu()
    lay = Layout()
    bx, by, bw, bh = lay.panel_rect(m)
    for px, py in ((bx - 1, by + 5), (bx + 5, by - 1), (bx + bw + 1, by + 5),
                   (bx + 5, by + bh + 1), (0, 0)):
        assert lay.hit(px, py, m) is None


def test_the_panel_covers_every_row_it_offers():
    """Otherwise the last entries are drawn outside the background and unclickable."""
    m = Menu()
    m.click(0, 1)
    lay = Layout()
    bx, by, bw, bh = lay.panel_rect(m)
    for column, nodes in enumerate(m.columns):
        for index in range(len(nodes)):
            x, y, w, h = lay.row_rect(column, index)
            assert bx <= x and x + w <= bx + bw, f"column {column} spills sideways"
            assert by <= y and y + h <= by + bh, f"row {index} spills out of the panel"


def test_the_panel_narrows_when_there_are_fewer_columns():
    """Chords need two columns; leaving room for four would be a lot of empty panel over
    the neck."""
    m = Menu()
    m.click(0, 0)
    lay = Layout()
    narrow = lay.panel_rect(m)[2]
    m.click(0, 1)
    assert lay.panel_rect(m)[2] > narrow


@pytest.mark.parametrize("dst", [(1280, 720), (1920, 1080), (2560, 1440), (960, 540)])
def test_the_menu_fits_the_frame_at_every_size(dst):
    """It has to sit beside the neck, not run off the bottom of the video."""
    m = Menu()
    m.click(0, 1)
    for anchor in ("left", "right"):
        lay = Layout.for_frame(*dst, anchor)
        bx, by, bw, bh = lay.panel_rect(m)
        assert bx >= 0 and bx + bw <= dst[0], f"panel spills sideways at {dst}"
        assert by + bh <= dst[1], f"panel is taller than the frame at {dst}"


def test_the_menu_scales_with_the_frame():
    small = Layout.for_frame(640, 360)
    big = Layout.for_frame(1920, 1080)
    assert big.row_h > small.row_h and big.widths[0] > small.widths[0]
    assert Layout.for_frame(1280, 720).row_h == Layout().row_h, "1280 is the baseline"


def test_scaling_is_clamped_so_the_menu_stays_usable():
    assert Layout.for_frame(320, 180).row_h >= 15
    assert Layout.for_frame(7680, 4320).row_h <= 60


def test_the_menu_goes_where_the_neck_is_not():
    """Opening a menu that hides the notes it just drew defeats the menu."""
    m = Menu()
    left_half = [[x, 300] for x in range(50, 600, 20)]
    right_half = [[x, 300] for x in range(700, 1250, 20)]
    assert preferred_anchor(left_half, 1280, 720, m) == "right"
    assert preferred_anchor(right_half, 1280, 720, m) == "left"
    assert preferred_anchor(None, 1280, 720, m) == "left"
    assert preferred_anchor([], 1280, 720, m) == "left"


def test_hit_testing_follows_the_anchor():
    """The rows move with the panel, so the geometry must too — otherwise a right-anchored
    menu is drawn on one side and clickable on the other."""
    m = Menu()
    m.click(0, 1)
    lay = Layout.for_frame(1280, 720, anchor="right")
    x, y, w, h = lay.row_rect(1, 3)
    assert lay.hit(x + w / 2, y + h / 2, m) == (1, 3)
    assert lay.hit(30, y + h / 2, m) is None, "clicks near the left edge are not the menu's"


# --------------------------------------------------------------------------- #
# Focus belongs to the user
# --------------------------------------------------------------------------- #


def test_sync_to_does_not_steal_the_focused_column():
    """The bug that made the left column unreachable.

    The app re-syncs the menu when a hotkey moves the selection behind its back. If that
    also moved the focus, the cursor sprang back to the deepest column the moment you
    stepped out of one, and the top-level column could not be reached at all.
    """
    m = Menu()
    m.sync_to(Selection("mode_box", "G:3"))
    for column in range(len(m.columns)):
        m.focus(column)
        m.sync_to(m.selection())
        assert m.column == column, f"sync_to moved focus away from column {column}"


def test_opening_the_menu_may_land_on_the_leaf_you_are_playing():
    """The one time taking the focus is right: you opened it to see where you are."""
    m = Menu()
    m.focus(0)
    assert m.sync_to(Selection("penta_box", "C:4:min"), keep_focus=False)
    assert m.column == len(m.columns) - 1
    assert m.trail == ["Scales", "C", "Minor pentatonic", "4th shape"]


def test_you_can_reach_the_top_level_and_stay_there():
    """Symptom as reported: stuck on Chords, and knocked back right when moving left.

    Walks it the way a person does — step out to the top column, move down to Scales, and
    re-sync as the app does — asserting the focus and the choice both hold.
    """
    m = Menu()
    m.sync_to(Selection("chord", "G"), keep_focus=False)
    while m.ascend():
        pass
    assert m.column == 0

    m.move(1)
    assert m.trail[0] == "Scales"
    assert m.column == 0, "moving within the top column moved the focus"

    m.sync_to(m.selection())
    assert m.column == 0, "the re-sync knocked the focus back to the right"
    assert m.trail[0] == "Scales", "the re-sync dragged the path back to Chords"


def test_stepping_left_then_right_returns_where_you_were():
    m = Menu()
    m.sync_to(Selection("mode_box", "D:6"), keep_focus=False)
    trail = m.trail
    for _ in range(3):
        m.ascend()
    for _ in range(3):
        m.descend()
    assert m.trail == trail
    assert m.selection() == Selection("mode_box", "D:6")
