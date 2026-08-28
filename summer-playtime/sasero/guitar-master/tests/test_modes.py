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
from fretguide.modes import (
    BOX_FRETS,
    MODES,
    ORDINALS,
    key_modes,
    key_pentatonics,
    mode_box,
    pentatonic_box,
    transpose,
)
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
    """The tracker poses frets 0-12 and no further, because the model predicts the nut
    through the twelfth fret and nothing beyond.

    Two of the seven boxes run past it in the key of G, and both are real: Misolidio ends
    at fret 13 and Eolio at 15. Saying so beats drawing part of a shape and letting
    somebody learn it that way.
    """
    modes = key_modes("G")
    assert [m.clipped for m in modes] == [0, 0, 0, 0, 1, 3, 0]
    assert "off the neck" in modes[5].detail
    assert all(not m.clipped for m in modes[:4]), "the first four boxes fit on the neck"


def test_every_box_position_matches_the_roman_numeral_on_the_sheet():
    """Independent check on the transcription.

    The fret each box starts at is not stored: it falls out of the notes that were typed
    in. That it reproduces the sheet's own roman numerals -- II, IV, VII, VII, IX, XI, II
    -- means a mis-keyed fret would have to move a whole box to go unnoticed.
    """
    assert [m.position for m in key_modes("G", max_fret=24)] == [2, 4, 7, 7, 9, 11, 2]
    assert [m.roman_position for m in key_modes("G", max_fret=24)] == [
        "II", "IV", "VII", "VII", "IX", "XI", "II"]


def test_lidio_is_frigio_without_the_low_e_below_its_root():
    """The pair that explains the system.

    Frigio and Lidio share one box. What separates them is where it starts: Frigio's root
    B is the low E's fret 7, Lidio's root C is fret 8, so Lidio simply does not play that
    first note. Same shape, different tonic, different chord underneath.
    """
    frigio, lidio = key_modes("G")[2], key_modes("G")[3]
    f = {(p.string, p.fret) for p in mode_box(frigio)}
    ll = {(p.string, p.fret) for p in mode_box(lidio)}
    assert f - ll == {(6, 7)}, "Frigio should have exactly one note Lidio lacks"
    assert not ll - f, "Lidio should have no note Frigio lacks"


def test_locrio_is_ionico_plus_the_low_e_below_ionicos_root():
    """The same relationship one degree round: Locrio's root F# is the low E's fret 2,
    which sits below Ionico's root G at fret 3, so Locrio reaches down for it."""
    ionico, locrio = key_modes("G")[0], key_modes("G")[6]
    i = {(p.string, p.fret) for p in mode_box(ionico)}
    lo = {(p.string, p.fret) for p in mode_box(locrio)}
    assert lo - i == {(6, 2)}
    assert not i - lo

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


def test_only_the_five_fret_boxes_need_the_hand_to_move():
    """Why the fingerings had to be transcribed rather than computed.

    Four fingers cannot cover five frets, so the three wider boxes shift the hand between
    strings and the four narrower ones do not. The narrow ones are exactly the boxes a
    `finger = fret - lo + 1` rule fits — which is why checking that rule against Ionico
    looked like proof and was not.
    """
    for m in key_modes("G", max_fret=24):
        box = mode_box(m, max_fret=24)
        lo = min(p.fret for p in box)
        span = max(p.fret for p in box) - lo + 1
        anchors = {p.fret - p.finger + 1 for p in box}
        if span == 4:
            assert anchors == {lo}, f"{m.italian} is 4 frets but shifts the hand"
        else:
            assert span == 5, f"{m.italian} spans {span} frets"
            assert anchors == {lo, lo + 1}, f"{m.italian} shifts oddly: {sorted(anchors)}"


def test_every_note_of_every_box_belongs_to_the_key():
    """The transcription's own guard: a mis-keyed fret almost always leaves the key."""
    from fretguide.theory import chroma_at, scale_chromas

    for key in ("G", "C", "E"):
        allowed = scale_chromas(key, "major")
        for m in key_modes(key, max_fret=24):
            for p in mode_box(m, max_fret=24):
                assert chroma_at(p.string, p.fret) in allowed, (
                    f"{key} {m.italian}: string {p.string} fret {p.fret} is outside {key}")


def test_eolio_string_four_is_fingered_from_the_twelfth_fret():
    """A deliberate departure from the source sheet, pinned so it is not "corrected" back.

    The sheet fingers Eolio's D string 2-4, keeping the hand back at fret 11 for it. But
    string 4's lowest note in this box is fret 12, so there is nothing at 11 to reach for,
    and fingering it 1-3 leaves string 3 as the only place in the box where the hand has
    to move. Same notes either way.
    """
    eolio = key_modes("G")[5]
    d_string = sorted((p.fret, p.finger) for p in mode_box(eolio, max_fret=24) if p.string == 4)
    assert d_string == [(12, 1), (14, 3)]

    anchors_by_string = {
        p.string: p.fret - p.finger + 1 for p in mode_box(eolio, max_fret=24)
    }
    shifted = [s for s, a in anchors_by_string.items() if a == 11]
    assert shifted == [3], f"only string 3 should sit back at fret 11, got {shifted}"


# --------------------------------------------------------------------------- #
# Pentatonic positions
# --------------------------------------------------------------------------- #


def test_a_key_has_exactly_five_pentatonic_positions():
    """Not an arbitrary count. The seven modal boxes occupy only five distinct windows,
    and those windows *are* the pentatonic positions — the same five shapes."""
    for minor in (False, True):
        pents = key_pentatonics("G", minor=minor, max_fret=24)
        assert len(pents) == 5
        assert [p.index for p in pents] == [1, 2, 3, 4, 5]
        assert [p.label for p in pents] == [f"{o} shape" for o in ORDINALS]


def test_the_minor_pentatonic_of_a_key_is_rooted_on_that_key():
    """The bug this replaces: asking for A's minor pentatonic gave F# minor, because it
    was built as the relative minor of A *major*.

    Pick a key and ask for its minor pentatonic and you mean the one rooted there. Its
    notes come from the relative major three semitones up, which is why the boxes are
    carved out of that key's modal shapes.
    """
    from fretguide.theory import chroma, chroma_at, scale_chromas

    for key in ("A", "G", "C#", "F"):
        for pent in key_pentatonics(key, minor=True, max_fret=24):
            assert pent.key == key
            assert pent.parent == transpose(key, 3), "notes come from the relative major"
            box = pentatonic_box(pent, max_fret=24)
            roots = {chroma_at(p.string, p.fret) for p in box if p.is_root}
            assert roots == {chroma(key)}, f"{key} minor pentatonic is rooted elsewhere"
            allowed = scale_chromas(key, "minor pentatonic")
            assert all(chroma_at(p.string, p.fret) in allowed for p in box)


def test_the_major_pentatonic_of_a_key_is_rooted_on_that_key():
    from fretguide.theory import chroma, chroma_at, scale_chromas

    for key in ("A", "G", "D#"):
        for pent in key_pentatonics(key, max_fret=24):
            assert pent.parent == key
            box = pentatonic_box(pent, max_fret=24)
            assert {chroma_at(p.string, p.fret) for p in box if p.is_root} == {chroma(key)}
            allowed = scale_chromas(key, "major pentatonic")
            assert all(chroma_at(p.string, p.fret) in allowed for p in box)


def test_a_minor_pentatonic_matches_the_reference_sheet():
    """Checked against a printed chart of the five positions of A minor pentatonic.

    The shapes are numbered from the one that begins on the root — A at the fifth fret of
    the low E — and run up the neck from there, which is where the chart starts counting.
    """
    pents = key_pentatonics("A", minor=True, max_fret=21)
    spans = []
    for pent in pents:
        box = pentatonic_box(pent, max_fret=21)
        spans.append((min(p.fret for p in box), max(p.fret for p in box)))
    assert spans == [(5, 8), (7, 10), (9, 13), (12, 15), (14, 17)]

    first = pentatonic_box(pents[0], max_fret=21)
    low_e = sorted(p.fret for p in first if p.string == 6)
    assert low_e == [5, 8], "the first shape starts on A at the fifth fret"
    assert next(p for p in first if p.string == 6 and p.fret == 5).is_root


def test_shapes_that_run_off_the_neck_drop_an_octave_if_there_is_room():
    """On twelve frets the last two shapes sit low instead of vanishing — which is what a
    teaching sheet does with them, for the same reason."""
    spans = []
    for pent in key_pentatonics("A", minor=True, max_fret=12):
        box = pentatonic_box(pent, max_fret=12)
        spans.append((min(p.fret for p in box), max(p.fret for p in box)))
    assert spans == [(5, 8), (7, 10), (9, 12), (0, 3), (2, 5)]


def test_a_pentatonic_position_is_its_modal_box_minus_the_fourth_and_seventh():
    """The whole construction, asserted directly rather than reimplemented."""
    from fretguide.theory import chroma, chroma_at

    for key, minor in (("G", False), ("A", True), ("F#", True)):
        for pent in key_pentatonics(key, minor=minor, max_fret=24):
            dropped = {(chroma(pent.parent) + 5) % 12, (chroma(pent.parent) + 11) % 12}
            parent_mode = next(m for m in key_modes(pent.parent, max_fret=24)
                               if m.italian == pent.from_mode)
            want = {(p.string, p.fret + pent.octave_shift, p.finger)
                    for p in mode_box(parent_mode, max_fret=24)
                    if chroma_at(p.string, p.fret) not in dropped}
            got = {(p.string, p.fret, p.finger)
                   for p in pentatonic_box(pent, max_fret=24)}
            assert got == want


def test_every_pentatonic_position_has_two_notes_on_every_string():
    """What makes it a pentatonic box rather than a box with holes in it.

    This is also why Lidio does not carry a position: it loses its lowest note with the
    4th and ends up with one note on the low E, so Frigio takes that window instead.
    """
    for key in ("G", "C", "E", "A#"):
        for minor in (False, True):
            for pent in key_pentatonics(key, minor=minor, max_fret=24):
                box = pentatonic_box(pent, max_fret=24)
                per_string = [sum(1 for p in box if p.string == s) for s in range(1, 7)]
                assert per_string == [2] * 6, f"{key} {pent.label}: {per_string}"
                assert len(box) == 12


def test_pentatonic_notes_belong_to_the_pentatonic_scale():
    from fretguide.theory import chroma_at, scale_chromas

    for key in ("G", "D"):
        for minor in (False, True):
            flavour = "minor pentatonic" if minor else "major pentatonic"
            allowed = scale_chromas(key, flavour)
            for pent in key_pentatonics(key, minor=minor, max_fret=24):
                for p in pentatonic_box(pent, max_fret=24):
                    assert chroma_at(p.string, p.fret) in allowed


def test_a_minor_pentatonic_is_its_relative_majors_pentatonic():
    """A minor pentatonic and C major pentatonic are one scale — the same notes heard from
    a different home. Same shapes, in the same places, rooted three semitones apart."""
    minor = key_pentatonics("A", minor=True, max_fret=24)
    major = key_pentatonics("C", max_fret=24)
    assert minor[0].parent == "C"
    assert {m.from_mode for m in minor} == {m.from_mode for m in major}

    by_mode = {m.from_mode: m for m in major}
    for lo in minor:
        hi = by_mode[lo.from_mode]
        a = {(p.string, p.fret % 12) for p in pentatonic_box(lo, max_fret=24)}
        b = {(p.string, p.fret % 12) for p in pentatonic_box(hi, max_fret=24)}
        assert a == b, f"{lo.label} is not the same shape as C major's"


def test_pentatonic_fingering_is_inherited_from_the_modal_box():
    """Same shape, same hand. A pentatonic position fingered differently from the modal
    box it sits inside would make the relationship invisible, which is most of its value.
    """
    for minor in (False, True):
        for pent in key_pentatonics("G", minor=minor, max_fret=24):
            assert all(1 <= p.finger <= 4 for p in pentatonic_box(pent, max_fret=24))


@pytest.mark.parametrize("bad", ["G:0:", "G:6:", "G:x:", "H:1:", "G", ":", ""])
def test_malformed_pentatonic_ids_resolve_to_nothing(bad):
    assert resolve_selection(Selection("penta_box", bad), max_fret=21) is None


def test_the_relative_key_is_named_correctly_in_both_directions():
    """A minor's relative major is C — three semitones up, not down. A major's relative
    minor is F#, nine up. Different intervals; getting one backwards labels every box with
    a key three semitones wrong, which is what it did."""
    assert key_pentatonics("A", minor=True)[0].relative == "C major"
    assert key_pentatonics("A")[0].relative == "F# minor"
    assert key_pentatonics("C", minor=True)[0].relative == "D# major"
    assert key_pentatonics("G")[0].relative == "E minor"


def test_the_reported_position_is_where_the_pentatonic_actually_starts():
    """The modal window it is carved from can open a fret earlier, on a note the
    pentatonic drops. Reporting that would put every position label one fret out."""
    for minor in (False, True):
        for pent in key_pentatonics("A", minor=minor, max_fret=21):
            box = pentatonic_box(pent, max_fret=21)
            assert pent.position == min(p.fret for p in box)
