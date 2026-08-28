"""The play head over a song.

No dependency and no file: a Song is a plain dataclass, so these build one
directly. The clock is driven by an explicit delta rather than a wall clock,
which is what makes it testable at all — and is why `Transport.tick` takes
seconds instead of reading them.
"""

from __future__ import annotations

import pytest

from fretguide.score import Bar, Song, SongNote, SongTrack, TempoChange
from fretguide.transport import MAX_RATE, MIN_RATE, Transport


def _song(notes=(), bars=4, bpm=120.0, tempos=None) -> Song:
    return Song(
        title="Song",
        artist="Someone",
        tracks=(),
        bars=tuple(Bar(number=i + 1, start=i * 4.0, length=4.0) for i in range(bars)),
        tempos=tempos or (TempoChange(0.0, bpm),),
    )


def _play(notes=(), **kw) -> Transport:
    song = _song(**kw)
    track = SongTrack(name="Guitar", notes=tuple(notes), string_count=6)
    return Transport(song=song, track=track)


# --------------------------------------------------------------------------- #
# The clock
# --------------------------------------------------------------------------- #


def test_a_paused_transport_does_not_move():
    t = _play()
    t.tick(10.0)
    assert t.beat == 0.0


def test_playing_advances_at_the_written_tempo():
    t = _play()
    t.playing = True
    t.tick(1.0)  # 120 bpm: one second is two beats
    assert t.beat == pytest.approx(2.0)


def test_the_rate_scales_the_clock():
    t = _play()
    t.playing, t.rate = True, 0.5
    t.tick(1.0)
    assert t.beat == pytest.approx(1.0), "half speed should cover half the beats"


def test_the_clock_follows_a_tempo_change():
    """The play head reads the tempo where it *is*, not where it started."""
    t = _play(tempos=(TempoChange(0.0, 120.0), TempoChange(2.0, 60.0)))
    t.playing = True
    t.tick(1.0)
    assert t.beat == pytest.approx(2.0)
    t.tick(1.0)  # now at 60 bpm: one second is one beat
    assert t.beat == pytest.approx(3.0)


def test_a_negative_or_zero_delta_is_ignored():
    t = _play()
    t.playing = True
    t.tick(0.0)
    t.tick(-5.0)
    assert t.beat == 0.0


def test_it_loops_by_default():
    t = _play(bars=1)  # four beats long
    t.playing = True
    t.tick(3.0)  # six beats at 120 bpm
    assert t.beat == pytest.approx(2.0)
    assert t.playing and not t.finished


def test_without_looping_it_stops_at_the_end():
    t = _play(bars=1)
    t.playing, t.loop = True, False
    t.tick(10.0)
    assert t.beat == pytest.approx(4.0)
    assert not t.playing and t.finished


def test_toggling_after_the_end_starts_over():
    t = _play(bars=1)
    t.playing, t.loop = True, False
    t.tick(10.0)
    t.toggle()
    assert t.beat == 0.0 and t.playing and not t.finished


# --------------------------------------------------------------------------- #
# Seeking
# --------------------------------------------------------------------------- #


def test_seek_clamps_to_the_song():
    t = _play(bars=2)  # eight beats
    t.seek(-5.0)
    assert t.beat == 0.0
    t.seek(999.0)
    assert t.beat == pytest.approx(8.0)


def test_seek_bar_counts_from_one():
    t = _play(bars=4)
    t.seek_bar(3)
    assert t.beat == pytest.approx(8.0)


def test_seek_bar_clamps_rather_than_raising():
    t = _play(bars=4)
    t.seek_bar(99)
    assert t.beat == pytest.approx(12.0)
    t.seek_bar(0)
    assert t.beat == 0.0


def test_rewinding_from_mid_bar_returns_to_its_start_first():
    """What a player expects from a rewind key: the first press restarts the
    bar you are in, the second goes to the one before."""
    t = _play(bars=4)
    t.seek(9.0)  # partway through bar 3
    t.nudge_bars(-1)
    assert t.beat == pytest.approx(8.0), "should return to the start of bar 3"
    t.nudge_bars(-1)
    assert t.beat == pytest.approx(4.0), "and only then to bar 2"


def test_nudging_forward_from_mid_bar_goes_to_the_next_bar():
    t = _play(bars=4)
    t.seek(9.0)
    t.nudge_bars(1)
    assert t.beat == pytest.approx(12.0)


def test_the_rate_is_clamped():
    t = _play()
    for _ in range(20):
        t.scale_rate(0.5)
    assert t.rate == pytest.approx(MIN_RATE)
    for _ in range(40):
        t.scale_rate(2.0)
    assert t.rate == pytest.approx(MAX_RATE)


# --------------------------------------------------------------------------- #
# What is under the fingers
# --------------------------------------------------------------------------- #


def test_only_the_notes_sounding_now_are_drawn():
    notes = [
        SongNote(string=6, fret=3, start=0.0, duration=1.0),
        SongNote(string=5, fret=2, start=4.0, duration=1.0),
    ]
    t = _play(notes)
    assert {p.fret for p in t.resolved().positions} == {3}
    t.seek(4.0)
    assert {p.fret for p in t.resolved().positions} == {2}


def test_a_held_note_keeps_its_dot():
    """A whole note struck two beats ago is still a finger on the fretboard."""
    t = _play([SongNote(string=5, fret=7, start=0.0, duration=4.0)])
    t.seek(3.0)
    assert [p.fret for p in t.resolved().positions] == [7]
    t.seek(4.0)
    assert t.resolved().positions == ()


def test_a_very_short_note_is_held_long_enough_to_see():
    """A sixteenth at speed lasts four frames, which reads as a flicker rather
    than as an instruction, so the dot outlives the note by a display floor."""
    t = _play([SongNote(string=1, fret=5, start=0.0, duration=0.05)])
    t.seek(0.2)
    assert t.resolved().positions, "the dot should still be lit"
    t.seek(t.min_visible + 0.01)
    assert not t.resolved().positions, "but not indefinitely"


def test_open_strings_are_reported_as_open_not_as_fret_zero():
    t = _play([SongNote(string=1, fret=0, start=0.0, duration=1.0)])
    resolved = t.resolved()
    assert resolved.open == (1,)
    assert resolved.positions == ()


def test_the_newer_note_wins_when_the_display_floor_overlaps_a_string():
    """Holding short notes open can make two notes on one string overlap. A
    string has one finger on it, so the later note replaces the earlier."""
    t = _play([
        SongNote(string=3, fret=4, start=0.0, duration=0.02),
        SongNote(string=3, fret=9, start=0.1, duration=1.0),
    ])
    t.seek(0.15)
    frets = [p.fret for p in t.resolved().positions]
    assert frets == [9], f"expected only the newer note, got {frets}"


def test_nothing_sounding_is_an_empty_selection_not_an_error():
    t = _play([SongNote(string=6, fret=3, start=10.0, duration=1.0)])
    resolved = t.resolved()
    assert resolved.positions == () and resolved.open == ()
    assert resolved.name


# --------------------------------------------------------------------------- #
# The label
# --------------------------------------------------------------------------- #


def test_the_label_says_where_you_are():
    t = _play(bars=4)
    t.seek(5.0)
    label = t.label
    assert "bar 2/4" in label and "Song" in label and "Guitar" in label


def test_the_label_shows_a_slowed_tempo_and_the_paused_state():
    t = _play(bpm=100.0)
    t.rate = 0.5
    assert "0.5x" in t.label
    assert "50 bpm" in t.label, "the shown tempo should be the one being played"
    assert "PAUSED" in t.label
    t.playing = True
    assert "PAUSED" not in t.label


def test_elapsed_is_wall_clock_seconds():
    t = _play(bpm=120.0)
    t.seek(8.0)
    assert t.elapsed == pytest.approx(4.0)
