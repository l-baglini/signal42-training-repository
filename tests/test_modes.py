"""Modes as degrees of a key, and the boxes they are played in.

The facts asserted here come from a teaching sheet ("Scale modali in tonalità di G"): the
seven modes of G, the chord each belongs over, and the fret position each box starts at.
Only the *positions* were taken from the sheet. Everything else — which notes are in each
box, and which finger plays them — is derived, and the tests below are what justify
trusting the derivation rather than a squint at a scan.
"""

from __future__ import annotations

import pytest

from fretguide.content import G_MAJOR_BOX, resolve_selection
from fretguide.modes import BOX_FRETS, MODES, key_modes, mode_box, transpose
from fretguide.theory import chroma, chroma_at, scale_chromas
from fretguide.types import Selection


def test_the_seven_modes_of_g_match_the_teaching_sheet():
    """Modo Ionico G, Dorico A-, Frigio B-, Lidio C, Misolidio D7, Eolio E-, Locrio
    F#-7/5b — at positions II, IV, VII, VII, IX, XI, II."""
    modes = key_modes("G")
    assert [m.italian for m in modes] == [
        "Ionico", "Dorico", "Frigio", "Lidio", "Misolidio", "Eolio", "Locrio"]
    assert [m.root for m in modes] == ["G", "A", "B", "C", "D", "E", "F#"]
    assert [m.chord for m in modes] == ["G", "Am", "Bm", "C", "D7", "Em", "F#m7b5"]
    assert [m.position for m in modes] == [2, 4, 7, 7, 9, 11, 2]


def test_the_ionian_box_matches_the_curated_one():
    """The load-bearing test for the whole approach.

    G_MAJOR_BOX was written by hand from the same teaching system, before any of this
    existed. If deriving a box from nothing but its position reproduces it note for note
    and finger for finger, then the six boxes nobody hand-checked are trustworthy too —
    and no finger numbers had to be read off a scan.
    """
    derived = mode_box(key_modes("G")[0])
    got = sorted((p.string, p.fret, p.finger) for p in derived)
    want = sorted((p.string, p.fret, p.finger) for p in G_MAJOR_BOX.positions)
    assert got == want


def test_every_box_note_belongs_to_the_parent_key():
    """A mode is not its own scale; it is the key's notes with a different tonic. A note
    outside the key would mean the derivation had invented one."""
    for key in ("G", "C", "E", "A#"):
        allowed = scale_chromas(key, "major")
        for m in key_modes(key):
            for p in mode_box(m):
                assert chroma_at(p.string, p.fret) in allowed, (
                    f"{key} {m.name}: string {p.string} fret {p.fret} is not in {key} major")


def test_every_transcribed_box_starts_on_its_own_root():
    """The point of the box. Starting anywhere else and you hear the parent scale, which
    is exactly the confusion these boxes exist to clear up.

    Transcribed boxes only. The untranscribed ones are a fret window filled in from the
    key, and where their window starts is precisely what has not been confirmed.
    """
    for key in ("G", "C", "F#"):
        for m in key_modes(key):
            if not m.verified:
                continue
            box = mode_box(m)
            lowest = min(box, key=lambda p: (-p.string, p.fret))
            assert lowest.is_root, f"{key} {m.name} box starts on {lowest} not its root"


def test_the_hand_shifts_between_strings_so_fingering_is_not_a_formula():
    """The correction that made these shapes transcribed rather than computed.

    In Dorico the index finger plays fret 5 on the outer four strings and fret 4 on the G
    and D strings, so one fret carries two different fingers inside one box. The old rule
    -- finger = fret - position + 1 -- cannot express that, and it passed only because it
    was checked against Ionian, the one shape where the hand does not move.
    """
    dorico = key_modes("G")[1]
    by_fret: dict[int, set[int]] = {}
    for p in mode_box(dorico):
        by_fret.setdefault(p.fret, set()).add(p.finger)
    assert by_fret[5] == {1, 2}, "fret 5 should be played by two different fingers"
    assert by_fret[7] == {3, 4}, "fret 7 should be played by two different fingers"


def test_transcribed_boxes_are_fully_fingered():
    for m in key_modes("G"):
        if m.verified:
            assert all(1 <= p.finger <= 4 for p in mode_box(m)), f"{m.name} has a gap"


def test_unconfirmed_boxes_show_no_fingering_at_all():
    """A wrong finger number is worse than none: it is the part a learner copies without
    questioning it. Until a shape has been read off the sheet, the notes stand alone."""
    for m in key_modes("G"):
        if not m.verified:
            assert all(p.finger is None for p in mode_box(m)), f"{m.name} invented fingers"
            assert "unconfirmed" in m.detail


def test_a_box_spans_five_frets_and_no_more():
    """Five, not four. Dorico runs 4-8, and a four-fret assumption dropped its top note on
    three of the six strings."""
    for key in ("G", "D", "B"):
        for m in key_modes(key):
            frets = {p.fret for p in mode_box(m, max_fret=24)}
            if frets:
                assert max(frets) - min(frets) < BOX_FRETS


def test_the_transcribed_boxes_are_distinct_from_each_other():
    """The whole reason this module exists.

    Asked for as whole-neck scales, all seven modes of a key return an identical set of
    positions -- same notes, only the roots differ -- so a learner sees one picture seven
    times. As boxes they are distinct shapes in distinct places.

    Only the transcribed ones are compared. Frigio and Lidio share a fret window because
    both roman numerals read as VII off the scan; they are genuinely the same window, and
    what separates them is the root, the chord and where the shape starts -- none of which
    is confirmed yet.
    """
    done = [m for m in key_modes("G") if m.verified]
    shapes = {frozenset((p.string, p.fret) for p in mode_box(m)) for m in done}
    assert len(shapes) == len(done), "two transcribed boxes of G are identical"


def test_the_roots_of_a_mode_really_are_that_modes_root():
    for m in key_modes("C"):
        for p in mode_box(m):
            marked = p.is_root
            actual = chroma_at(p.string, p.fret) == chroma(m.root)
            assert marked == actual


@pytest.mark.parametrize("key", ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A",
                                 "A#", "B"])
def test_every_key_transposes_the_same_seven_shapes(key):
    """A box is a shape; moving key moves it up the neck and changes nothing else.

    Compared as fret offsets from each box's own position, so the comparison is about
    shape rather than where the shape sits.
    """
    def shape(m):
        return sorted((p.string, p.fret - m.position) for p in mode_box(m, max_fret=24))

    for a, b in zip(key_modes("G", max_fret=24), key_modes(key, max_fret=24)):
        assert shape(a) == shape(b), f"{key} {b.name} is not the same shape as G {a.name}"


def test_transpose_wraps_the_octave():
    assert transpose("G", 2) == "A"
    assert transpose("B", 1) == "C"
    assert transpose("A", 12) == "A"


def test_boxes_past_the_twelfth_fret_are_reported_not_hidden():
    """The tracker poses frets 0–12 and no further, so Aeolian's position XI box runs two
    frets off the end. Saying so beats drawing two-thirds of a shape silently."""
    aeolian = key_modes("G")[5]
    assert aeolian.position == 11
    assert aeolian.clipped == 3
    assert "off the neck" in aeolian.detail
    # Both transcribed boxes sit entirely on the tracked neck. Misolidio also clips now,
    # at one fret, but only because an unconfirmed box is assumed five frets wide from a
    # position read off the scan -- that number may well move when it is transcribed.
    assert all(m.clipped == 0 for m in key_modes("G") if m.verified)
    assert key_modes("G")[4].clipped == 1


def test_a_wider_neck_needs_no_clipping():
    assert all(m.clipped == 0 for m in key_modes("G", max_fret=24))


def test_selections_resolve_and_carry_the_teaching_labels():
    for degree, want in enumerate(["Ionian", "Dorian", "Phrygian", "Lydian",
                                   "Mixolydian", "Aeolian", "Locrian"], start=1):
        r = resolve_selection(Selection("mode_box", f"G:{degree}"), max_fret=12)
        assert r is not None and r.name.startswith(want)
        assert "over" in r.name and "pos" in r.name


@pytest.mark.parametrize("bad", ["G:0", "G:8", "G:x", "H:1", "G", ":", ""])
def test_malformed_mode_ids_resolve_to_nothing_rather_than_raising(bad):
    assert resolve_selection(Selection("mode_box", bad), max_fret=12) is None


def test_the_mode_table_is_internally_consistent():
    assert len(MODES) == 7
    assert [d for d, *_ in MODES] == [1, 2, 3, 4, 5, 6, 7]
