"""Choosing where to play a note.

Two kinds of assertion here, and the distinction matters. Some things are
*exact* -- every solved note must sound the pitch that was asked for, no note
may exceed the hand's span, nothing may exceed the fret count -- and those are
checked absolutely. Whether a fingering is *good* is not exact, and is measured
against human transcriptions in ``tools/eval_fingering.py`` instead, because the
files that answer it are gitignored. What can be pinned down here are the
handful of voicings every guitarist agrees on.
"""

from __future__ import annotations

import pytest

from fretguide.fingering import (
    STANDARD_TUNING,
    Hand,
    PitchNote,
    Weights,
    candidates,
    solve,
    to_pitches,
)
from fretguide.score import SongNote
from fretguide.theory import pitch_to_midi

C4, E4, G4 = 60, 64, 67


def _line(pitches, start=0.0, step=1.0) -> list[PitchNote]:
    return [PitchNote(midi=m, start=start + i * step, duration=step) for i, m in enumerate(pitches)]


def _chord(pitches) -> list[PitchNote]:
    return [PitchNote(midi=m, start=0.0, duration=4.0) for m in pitches]


def _sounds(note: SongNote) -> int:
    return STANDARD_TUNING[note.string] + note.fret


# --------------------------------------------------------------------------- #
# Exact: the solver may choose freely, but it may not choose wrong
# --------------------------------------------------------------------------- #


def test_every_solved_note_sounds_the_pitch_it_was_given():
    """The one assertion that cannot be argued with.

    A fingering may be unidiomatic and still be defensible; a fingering that
    sounds a different note is simply broken, and nothing else in this file
    would catch it because every other property would still hold.
    """
    wanted = [40, 45, 50, 55, 59, 64, 67, 72, 76, 60, 62, 64, 65]
    solution = solve(_line(wanted), Hand(max_fret=12))
    assert solution.unplayable == 0
    got = [_sounds(n) for n in solution.notes]
    assert got == wanted


def test_no_note_lands_past_the_fret_count():
    for max_fret in (5, 12, 24):
        solution = solve(_line([64, 67, 71, 76]), Hand(max_fret=max_fret))
        assert all(n.fret <= max_fret for n in solution.notes)


def test_a_chord_never_puts_two_notes_on_one_string():
    solution = solve(_chord([40, 47, 52, 56, 59, 64]), Hand(max_fret=12))
    strings = [n.string for n in solution.notes]
    assert len(strings) == len(set(strings))


def test_a_chord_never_exceeds_the_hand_span():
    for span in (3, 4, 5):
        solution = solve(_chord([48, 52, 55, 60, 64]), Hand(span=span, max_fret=12))
        frets = [n.fret for n in solution.notes if n.fret > 0]
        if frets:
            assert max(frets) - min(frets) < span


def test_pitches_out_of_range_are_reported_not_dropped():
    """A note the guitar cannot reach must be counted, not silently vanish."""
    solution = solve(_line([30, 64, 31]), Hand(max_fret=12))  # 30 and 31 are below low E
    assert solution.unplayable == 2
    assert [_sounds(n) for n in solution.notes] == [64]


def test_an_entirely_unplayable_part_returns_nothing_and_says_so():
    solution = solve(_line([20, 21, 22]), Hand(max_fret=12))
    assert solution.notes == ()
    assert solution.unplayable == 3


def test_solving_an_empty_part_is_not_an_error():
    solution = solve([], Hand(max_fret=12))
    assert solution.notes == () and solution.unplayable == 0


def test_note_timing_is_carried_through_untouched():
    notes = _line([64, 67, 71], start=2.5, step=0.25)
    solution = solve(notes, Hand(max_fret=12))
    assert [n.start for n in solution.notes] == [2.5, 2.75, 3.0]
    assert all(n.duration == 0.25 for n in solution.notes)


# --------------------------------------------------------------------------- #
# Candidates
# --------------------------------------------------------------------------- #


def test_a_pitch_has_one_place_per_string_that_can_reach_it():
    places = candidates(E4, Hand(max_fret=12))
    assert {(p.string, p.fret) for p in places} == {(1, 0), (2, 5), (3, 9)}


def test_a_low_fret_count_removes_the_far_places():
    assert {(p.string, p.fret) for p in candidates(E4, Hand(max_fret=6))} == {(1, 0), (2, 5)}


def test_the_open_string_pitch_is_always_available():
    """Fret 0 is the nut, not a hand position, so it survives any lower bound."""
    places = candidates(pitch_to_midi("E2"), Hand(max_fret=12, lowest_fret=5))
    assert (6, 0) in {(p.string, p.fret) for p in places}


# --------------------------------------------------------------------------- #
# The few voicings everybody agrees on
# --------------------------------------------------------------------------- #


def test_it_finds_the_open_c_chord():
    """C-E-G-C-E resolves to x32010, which is the first chord anyone learns."""
    solution = solve(_chord([48, 52, 55, 60, 64]), Hand(max_fret=12))
    assert {(n.string, n.fret) for n in solution.notes} == {(5, 3), (4, 2), (3, 0), (2, 1), (1, 0)}


def test_it_finds_the_open_e_minor_chord():
    solution = solve(_chord([40, 47, 52, 55, 59, 64]), Hand(max_fret=12))
    assert {(n.string, n.fret) for n in solution.notes} == {
        (6, 0), (5, 2), (4, 2), (3, 0), (2, 0), (1, 0)
    }


def test_a_chord_is_voiced_on_adjacent_strings():
    """The bug that cost seven points of agreement with the transcribers.

    Cocaine's E5 riff came out across strings 4, 2 and 1 -- the right three
    pitches in a shape no player would use, because it skips the third string.
    Asserted on an F major triad rather than that riff: E3-B3-E4 can be voiced
    with *two* open strings, and the open-string bonus legitimately outweighs
    the gap there, so it is the wrong case to pin a rule to. F3-C4-F4 has no
    open string anywhere, which leaves the shape rule decisive.
    """
    solution = solve(_chord([53, 60, 65]), Hand(max_fret=24))
    strings = sorted(n.string for n in solution.notes)
    assert strings == list(range(min(strings), min(strings) + 3)), f"skipped a string: {strings}"


def test_the_adjacency_rule_is_what_produces_that():
    """Guards the mechanism, not just the outcome: with the weight off, the same
    chord reverts to the skipped-string voicing."""
    without = Weights(string_gap=0.0)
    strings = sorted(n.string for n in solve(_chord([53, 60, 65]), Hand(max_fret=24), without).notes)
    assert strings == [1, 2, 4], "expected the weight to be the thing making this contiguous"


def test_a_phrase_inside_one_box_does_not_move_the_hand():
    """Frets 9 and 7 sit under one unmoved hand; charging travel between them
    was the second structural bug, and it pushed such phrases onto other strings."""
    # G4 A4 B4 on string 1 at frets 3, 5, 7 -- one hand position in fourth.
    solution = solve(_line([67, 69, 71, 69, 67]), Hand(max_fret=12))
    frets = [n.fret for n in solution.notes if n.fret]
    assert max(frets) - min(frets) <= 4


# --------------------------------------------------------------------------- #
# Round-tripping a written fingering
# --------------------------------------------------------------------------- #


def test_to_pitches_recovers_what_a_written_fingering_sounds():
    written = (SongNote(string=5, fret=7, start=0.0, duration=1.0),)  # E3
    assert [p.midi for p in to_pitches(written)] == [pitch_to_midi("E3")]


def test_to_pitches_drops_muted_notes():
    """A dead note has no pitch, so there is nothing for the solver to place."""
    written = (
        SongNote(string=5, fret=7, start=0.0, duration=1.0),
        SongNote(string=5, fret=7, start=1.0, duration=1.0, dead=True),
    )
    assert len(to_pitches(written)) == 1


def test_a_written_fingering_survives_a_round_trip_as_sound():
    """Strip the fingering, solve it again: the music must be identical even
    where the chosen places are not."""
    written = tuple(
        SongNote(string=s, fret=f, start=float(i), duration=1.0)
        for i, (s, f) in enumerate([(6, 3), (5, 2), (4, 0), (3, 4), (2, 1), (1, 3)])
    )
    before = [p.midi for p in to_pitches(written)]
    after = [_sounds(n) for n in solve(to_pitches(written), Hand(max_fret=24)).notes]
    assert after == before


# --------------------------------------------------------------------------- #
# The cost model
# --------------------------------------------------------------------------- #


def test_weights_at_zero_still_produce_a_valid_fingering():
    """Every weight is a preference, never a correctness condition. With all of
    them off the result should be duller, not broken."""
    flat = Weights(travel=0, stretch=0, open_string=0, height=0, string_gap=0, low_string=0)
    wanted = [64, 67, 71, 60]
    solution = solve(_line(wanted), Hand(max_fret=12), weights=flat)
    assert [_sounds(n) for n in solution.notes] == wanted


def test_a_higher_travel_weight_does_not_move_the_hand_more():
    """Sanity on the direction of the cost: charging more for shifting cannot
    produce a fingering that shifts further."""
    line = _line([64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64])

    def spread(travel):
        frets = [n.fret for n in solve(line, Hand(max_fret=12), Weights(travel=travel)).notes if n.fret]
        return max(frets) - min(frets) if frets else 0

    assert spread(20.0) <= spread(0.0)


def test_the_solver_uses_the_whole_neck_when_allowed_to():
    """A part that will not fit in twelve frets must still solve on a longer
    neck rather than being reported unplayable."""
    # Frets 16, 18 and 20 on the high E: past a camera neck, inside a real one.
    # (E6 and above would be fret 24+, which does not fit either and made this
    # test pass for the wrong reason.)
    high = _line([80, 82, 84])
    assert solve(high, Hand(max_fret=12)).unplayable == 3
    assert solve(high, Hand(max_fret=24)).unplayable == 0


def test_a_tuning_it_does_not_know_is_still_solved():
    drop_d = dict(STANDARD_TUNING)
    drop_d[6] -= 2
    solution = solve(_line([38, 45, 50]), Hand(max_fret=12), tuning=drop_d)
    assert solution.unplayable == 0
    assert [drop_d[n.string] + n.fret for n in solution.notes] == [38, 45, 50]


@pytest.mark.parametrize("count", [1, 2, 3, 4, 5, 6])
def test_chords_of_every_size_are_placed(count):
    pitches = [40, 47, 52, 56, 59, 64][:count]
    solution = solve(_chord(pitches), Hand(max_fret=24))
    assert len(solution.notes) == count
    assert sorted(_sounds(n) for n in solution.notes) == sorted(pitches)
