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


def test_the_derived_ionian_box_reproduces_the_curated_one():
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


def test_every_box_starts_on_its_own_root():
    """The point of the box. Starting anywhere else and you hear the parent scale, which
    is exactly the confusion these boxes exist to clear up."""
    for key in ("G", "C", "F#"):
        for m in key_modes(key):
            box = mode_box(m)
            if not box:
                continue
            lowest = min(box, key=lambda p: (-p.string, p.fret))
            assert lowest.is_root, f"{key} {m.name} box starts on {lowest} not its root"


def test_fingering_is_one_finger_per_fret_from_the_position():
    """What "playing in position" means, and the rule the curated box was built by."""
    for m in key_modes("G"):
        for p in mode_box(m):
            assert p.finger == p.fret - m.position + 1
            assert 1 <= p.finger <= BOX_FRETS


def test_a_box_spans_four_frets_and_no_more():
    for key in ("G", "D", "B"):
        for m in key_modes(key):
            frets = {p.fret for p in mode_box(m)}
            if frets:
                assert max(frets) - min(frets) < BOX_FRETS


def test_every_mode_of_a_key_is_a_different_shape():
    """The whole reason this module exists.

    Asked for as whole-neck scales, all seven modes of a key return an identical set of
    positions — same notes, only the roots differ — so a learner sees one picture seven
    times. As boxes they are seven distinct shapes in distinct places.
    """
    shapes = {frozenset((p.string, p.fret) for p in mode_box(m)) for m in key_modes("G")}
    assert len(shapes) == 7, "two modes of G produce the same box"


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
    assert aeolian.clipped == 2
    assert "off the neck" in aeolian.detail
    assert all(m.clipped == 0 for m in key_modes("G")[:5]), "only Aeolian should clip in G"


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
