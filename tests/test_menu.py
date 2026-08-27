"""The practice catalogue and how the cursor moves through it.

Pure state, no toolkit, so all of it is provable here — which is the reason the menu is
modelled separately from its drawing in the first place. The OpenCV app and the native
shell will render this same object, and neither of them needs a test to prove that
Locrian follows Aeolian.
"""

from __future__ import annotations

from fretguide.content import resolve_selection
from fretguide.menu import (
    CHORDS_GROUP,
    ROOTS,
    SCALE_GROUPS,
    Layout,
    Menu,
    left_rows,
    preferred_anchor,
    right_rows,
)
from fretguide.types import Selection


def test_the_left_column_is_chords_then_twelve_keys():
    labels = [r.label for r in left_rows()]
    assert labels[0] == CHORDS_GROUP
    assert labels[1:] == list(ROOTS)
    assert len(ROOTS) == 12


def test_roots_start_at_a():
    """Guitarists count from A: it is the open fifth string and where every book starts.
    The chromatic table underneath starts at C, so this ordering is deliberate."""
    assert ROOTS[0] == "A"
    assert ROOTS == ("A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#")


def test_modes_are_in_derivation_order_not_alphabetical():
    """That order *is* the relationship between the modes — each is the next degree of the
    same parent scale. Sorting them A–Z would hide the one fact that makes them learnable.
    """
    modal = dict(SCALE_GROUPS)["Modal"]
    assert [name for _, name in modal] == [
        "ionian", "dorian", "phrygian", "lydian", "mixolydian", "aeolian", "locrian",
    ]


def test_every_catalogue_entry_actually_resolves():
    """The whole catalogue, checked against the theory engine.

    139 entries, every one of which is a string that has to survive being split, looked up
    and turned into fret positions. A typo in a scale name would produce a menu item that
    silently draws nothing — visible only if you happened to pick that one — so this walks
    all of them rather than sampling.
    """
    checked = 0
    for lrow in left_rows():
        for rrow in right_rows(lrow.label):
            if rrow.selection is None:
                continue
            resolved = resolve_selection(rrow.selection, max_fret=12)
            assert resolved is not None, f"{lrow.label} / {rrow.label} does not resolve"
            assert resolved.positions, f"{lrow.label} / {rrow.label} resolves to nothing"
            checked += 1
    assert checked == 7 + 12 * 11, f"catalogue changed size: {checked}"


def test_chords_are_reachable_and_are_chords():
    rows = [r for r in right_rows(CHORDS_GROUP) if r.selection]
    assert len(rows) == 7
    assert all(r.selection.mode == "chord" for r in rows)


def test_a_key_offers_its_groups_with_headings():
    rows = right_rows("A")
    headings = [r.label for r in rows if r.heading]
    assert headings == ["Modal", "Pentatonic", "Other"]
    assert all(r.selection is None for r in rows if r.heading)
    assert all(r.selection.id.startswith("A ") for r in rows if r.selection)


def test_the_cursor_never_lands_on_a_heading():
    """Headings are labels, not choices. Moving must slide over them, in both directions,
    or the overlay blanks out whenever you pass one."""
    m = Menu()
    m.click(0, 1)  # key of A
    m.focus(1)
    seen = set()
    for _ in range(len(m.right) * 2):
        m.move(1)
        assert m.right[m.right_index].selection is not None
        seen.add(m.right_index)
    for _ in range(len(m.right) * 2):
        m.move(-1)
        assert m.right[m.right_index].selection is not None
    assert len(seen) == 11, "did not visit every scale in the key"


def test_moving_the_left_column_changes_the_key_but_keeps_your_place():
    """You are comparing the same mode across keys; landing back on Ionian each time
    would make that the one thing the menu is bad at."""
    m = Menu()
    m.click(0, 1)          # A
    m.focus(1)
    for _ in range(4):     # move to some mode
        m.move(1)
    label = m.right[m.right_index].label
    m.focus(0)
    m.move(1)              # A#
    assert m.left_label == "A#"
    assert m.right[m.right_index].label == label
    assert m.selection().id.startswith("A# ")


def test_clicking_a_heading_does_nothing():
    m = Menu()
    m.click(0, 1)
    m.focus(1)
    before = m.right_index
    heading = next(i for i, r in enumerate(m.right) if r.heading)
    assert m.click(1, heading) is False
    assert m.right_index == before


def test_clicking_out_of_range_does_nothing():
    m = Menu()
    assert m.click(0, 99) is False
    assert m.click(1, -1) is False


def test_selection_is_live_rather_than_committed():
    """Moving applies the choice. You are looking at the guitar, not at the menu, so a
    selection you have to confirm before you can see it is the wrong way round."""
    m = Menu()
    m.click(0, 0)
    m.focus(1)
    first = m.selection()
    m.move(1)
    assert m.selection() != first
    assert resolve_selection(m.selection(), max_fret=12) is not None


def test_sync_to_finds_what_is_already_on_screen():
    """Opening the menu should show you where you are, not reset you to the top."""
    m = Menu()
    assert m.sync_to(Selection("scale_generated", "D# lydian"))
    assert m.left_label == "D#"
    assert m.right[m.right_index].label == "Lydian"
    assert m.selection() == Selection("scale_generated", "D# lydian")

    assert m.sync_to(Selection("chord", "Em"))
    assert m.left_label == CHORDS_GROUP
    assert m.selection() == Selection("chord", "Em")


def test_sync_to_reports_failure_for_things_not_in_the_catalogue():
    m = Menu()
    assert m.sync_to(Selection("scale", "g-major-box")) is False


def test_movement_wraps_in_both_columns():
    m = Menu()
    m.move(-1)
    assert m.left_label == ROOTS[-1], "left column did not wrap backwards"
    m.move(1)
    assert m.left_label == CHORDS_GROUP


# --------------------------------------------------------------------------- #
# Layout and hit-testing
# --------------------------------------------------------------------------- #


def test_a_click_lands_on_the_row_it_looks_like_it_landed_on():
    """Walked exhaustively rather than sampled. A menu that is one row out is the kind of
    bug you can only chase by clicking at it, which is no way to debug anything."""
    m = Menu()
    lay = Layout()
    for column, rows in ((0, m.left), (1, m.right)):
        for index in range(len(rows)):
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
    m.click(0, 1)  # a key, whose right column is the longest one
    lay = Layout()
    bx, by, bw, bh = lay.panel_rect(m)
    for column, rows in ((0, m.left), (1, m.right)):
        for index in range(len(rows)):
            x, y, w, h = lay.row_rect(column, index)
            assert bx <= x and x + w <= bx + bw, f"column {column} spills sideways"
            assert by <= y and y + h <= by + bh, f"row {index} spills out of the panel"


def test_the_menu_scales_with_the_frame():
    """1920 in the app, 640 in a test. Fixed pixels would be unreadable in one and would
    cover the neck in the other."""
    small = Layout.for_frame(640, 360)
    big = Layout.for_frame(1920, 1080)
    assert big.row_h > small.row_h and big.left_w > small.left_w
    assert Layout.for_frame(1280, 720).row_h == Layout().row_h, "1280 should be the baseline"


def test_scaling_is_clamped_so_the_menu_stays_usable():
    """A 320-wide test frame must not produce a 7-pixel row height."""
    tiny = Layout.for_frame(320, 180)
    huge = Layout.for_frame(7680, 4320)
    assert tiny.row_h >= 15
    assert huge.row_h <= 60


def test_the_menu_goes_where_the_neck_is_not():
    """Opening a menu that hides the notes it just drew defeats the menu."""
    m = Menu()
    left_half = [[x, 300] for x in range(50, 600, 20)]
    right_half = [[x, 300] for x in range(700, 1250, 20)]
    assert preferred_anchor(left_half, 1280, 720, m) == "right"
    assert preferred_anchor(right_half, 1280, 720, m) == "left"
    assert preferred_anchor(None, 1280, 720, m) == "left"
    assert preferred_anchor([], 1280, 720, m) == "left"


def test_the_anchor_is_measured_rather_than_guessed_from_the_centroid():
    """A neck can be centred and still overlap one corner far more than the other.

    These points average to the middle of the frame, so a centroid rule would call it a
    tie, but they are all in the upper left, which is exactly where a left-anchored panel
    goes.
    """
    m = Menu()
    points = [[x, 100] for x in range(40, 460, 20)] + [[x, 690] for x in range(820, 1240, 20)]
    assert preferred_anchor(points, 1280, 720, m) == "right"


def test_a_right_anchored_panel_stays_inside_the_frame():
    for width in (640, 1280, 1920, 3840):
        lay = Layout.for_frame(width, int(width * 9 / 16), anchor="right")
        bx, _, bw, _ = lay.panel_rect(Menu())
        assert bx >= 0 and bx + bw <= width, f"panel spills off a {width}px frame"


def test_hit_testing_follows_the_anchor():
    """The rows move with the panel, so the geometry must too — otherwise a right-anchored
    menu is drawn on one side and clickable on the other."""
    m = Menu()
    lay = Layout.for_frame(1280, 720, anchor="right")
    x, y, w, h = lay.row_rect(1, 3)
    assert lay.hit(x + w / 2, y + h / 2, m) == (1, 3)
    assert lay.hit(30, y + h / 2, m) is None, "clicks near the left edge are not the menu's"
