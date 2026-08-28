"""Songs: the score model, and the Guitar Pro reader.

The reader tests build their own ``.gp5`` files and read them back. There is a
``partitures/`` directory on the author's machine full of real tabs; it is
gitignored and copyrighted, so a test that reached for it would be a test that
fails on a fresh clone -- the same reason ``test_source.py`` fabricates a
dataset instead of using ``dataset/frames/``.
"""

from __future__ import annotations

import pytest

from fretguide.score import (
    CAMERA_MAX_FRET,
    Bar,
    Song,
    SongNote,
    SongTrack,
    TempoChange,
    read_guitarpro,
)
from fretguide.theory import OPEN_NOTES, pitch_to_midi

# --------------------------------------------------------------------------- #
# The model -- no dependency, no file
# --------------------------------------------------------------------------- #


def _song(**kw) -> Song:
    base = dict(
        title="t",
        artist="a",
        tracks=(),
        bars=(Bar(1, 0.0, 4.0), Bar(2, 4.0, 4.0)),
        tempos=(TempoChange(0.0, 120.0),),
    )
    return Song(**{**base, **kw})


def test_seconds_at_uses_the_tempo():
    # 120 bpm: a quarter note is half a second, so four beats is two seconds.
    assert _song().seconds_at(4.0) == pytest.approx(2.0)


def test_seconds_at_walks_a_tempo_change():
    song = _song(tempos=(TempoChange(0.0, 120.0), TempoChange(4.0, 60.0)))
    # Four beats at 120 (2 s) then four at 60 (4 s). Dividing the whole song by
    # either single tempo would give 4 s or 8 s -- both wrong.
    assert song.seconds_at(8.0) == pytest.approx(6.0)
    assert song.seconds_at(4.0) == pytest.approx(2.0)
    assert song.seconds_at(6.0) == pytest.approx(4.0)


def test_seconds_at_is_monotonic_across_a_change():
    song = _song(tempos=(TempoChange(0.0, 200.0), TempoChange(3.0, 40.0)))
    times = [song.seconds_at(b / 4) for b in range(0, 33)]
    assert times == sorted(times)


def test_bar_at_finds_the_containing_bar():
    song = _song()
    assert song.bar_at(0.0).number == 1
    assert song.bar_at(3.9).number == 1
    assert song.bar_at(4.0).number == 2
    assert song.bar_at(-1.0) is None


def test_notes_between_includes_notes_still_ringing():
    # A whole note struck at beat 0 is still a finger on the fretboard at beat 3.
    held = SongNote(string=5, fret=2, start=0.0, duration=4.0)
    later = SongNote(string=1, fret=5, start=6.0, duration=1.0)
    track = SongTrack(name="x", notes=(held, later), string_count=6)
    assert _song().notes_between(track, 3.0, 3.1) == (held,)
    assert _song().notes_between(track, 4.0, 5.0) == ()
    assert _song().notes_between(track, 6.5, 6.6) == (later,)


def test_camera_reach_is_reported_not_silently_dropped():
    low = SongTrack(name="rhythm", notes=(SongNote(6, 3, 0.0, 1.0),), string_count=6)
    high = SongTrack(
        name="solo",
        notes=(SongNote(1, 5, 0.0, 1.0), SongNote(1, 15, 1.0, 1.0)),
        string_count=6,
    )
    assert low.fits_camera and low.frets_above_camera == 0.0
    assert not high.fits_camera
    assert high.frets_above_camera == pytest.approx(0.5)
    assert high.max_fret == 15 > CAMERA_MAX_FRET


def test_bass_and_drums_are_not_playable_on_a_six_string_neck():
    assert not SongTrack("Bass", (), string_count=4).playable
    assert not SongTrack("Drums", (), string_count=6, percussion=True).playable
    assert SongTrack("Guitar", (), string_count=6).playable


def test_empty_track_reports_no_frets_rather_than_raising():
    empty = SongTrack(name="silent", notes=(), string_count=6)
    assert empty.max_fret == 0
    assert empty.frets_above_camera == 0.0
    assert empty.fits_camera


# --------------------------------------------------------------------------- #
# The Guitar Pro reader -- against files the test writes itself
# --------------------------------------------------------------------------- #

gp = pytest.importorskip("guitarpro")


def _write(tmp_path, measures, tuning=None, name="Guitar", tempo=120, percussion=False):
    """Build a one-track song and write it out.

    ``measures`` is a list of measure specs; each is a dict with ``beats``
    (a list of ``(duration_value, [(string, fret, type)])``) and optional
    ``repeat_open`` / ``repeat_close`` / ``alternative`` / ``sig``.
    """
    song = gp.Song()
    song.tempo = tempo
    song.title = "fixture"
    song.tracks = []
    song.measureHeaders = []

    track = gp.Track(song, 1)
    track.name = name
    track.isPercussionTrack = percussion
    # Sorted by string number: the writer numbers strings by their position in
    # this list, and OPEN_NOTES is declared low-E-first, so handing it over
    # unsorted silently writes the tuning upside down.
    pitches = tuning or {s: pitch_to_midi(p) for s, p in OPEN_NOTES.items()}
    track.strings = [gp.GuitarString(n, pitches[n]) for n in sorted(pitches)]
    track.measures = []

    start = gp.Duration.quarterTime
    for i, spec in enumerate(measures):
        header = gp.MeasureHeader()
        header.number = i + 1
        header.start = start
        num, den = spec.get("sig", (4, 4))
        header.timeSignature.numerator = num
        header.timeSignature.denominator.value = den
        header.isRepeatOpen = spec.get("repeat_open", False)
        header.repeatClose = spec.get("repeat_close", 0)
        header.repeatAlternative = spec.get("alternative", 0)
        song.measureHeaders.append(header)

        measure = gp.Measure(track, header)
        voice = measure.voices[0]
        voice.beats = []
        at = start
        for value, notes in spec["beats"]:
            beat = gp.Beat(voice)
            beat.start = at
            beat.duration = gp.Duration(value=value)
            beat.notes = []
            # Beat defaults to BeatStatus.empty, which the writer emits as a beat
            # with nothing in it -- the notes are dropped on the way to disk and
            # the fixture silently tests nothing.
            beat.status = gp.BeatStatus.normal if notes else gp.BeatStatus.rest
            for string, fret, kind in notes:
                note = gp.Note(beat)
                note.string, note.value = string, fret
                note.type = getattr(gp.NoteType, kind)
                beat.notes.append(note)
            voice.beats.append(beat)
            at += beat.duration.time
        measure.voices[0] = voice
        track.measures.append(measure)
        start += num * gp.Duration.quarterTime * 4 // den

    song.tracks.append(track)
    path = tmp_path / "fixture.gp5"
    gp.write(song, str(path))
    return path


def test_the_fixture_actually_writes_what_it_claims(tmp_path):
    """Guards the fixture, not the reader.

    ``gp.Beat`` defaults to ``BeatStatus.empty``, and the writer honours that by
    emitting a beat with no notes. An earlier version of ``_write`` left the
    default, so every fixture wrote a silent file and the tie test passed by
    finding zero notes where it expected one. Assert the round trip carries the
    notes, or the rest of this file is measuring nothing.
    """
    written = [(1, 0), (3, 5), (6, 12)]
    path = _write(tmp_path, [{"beats": [(4, [(s, f, "normal")]) for s, f in written]}])
    got = [(n.string, n.fret) for n in read_guitarpro(path).tracks[0].notes]
    assert sorted(got) == sorted(written)


def test_string_numbering_survives_the_round_trip(tmp_path):
    """Invariant 2: string 1 is high E on both sides of the file format.

    A convention mismatch here would put every note on the wrong string while
    every count and duration still looked perfect, so it is asserted against the
    notes themselves rather than against the tuning table.
    """
    beats = [(4, [(s, s, "normal")]) for s in (1, 2, 3, 4, 5, 6)]
    path = _write(tmp_path, [{"beats": beats[:4]}, {"beats": beats[4:] + [(4, []), (4, [])]}])
    song = read_guitarpro(path)
    got = {(n.string, n.fret) for n in song.tracks[0].notes}
    assert got == {(s, s) for s in range(1, 7)}


def test_standard_tuning_is_checked_not_assumed(tmp_path):
    drop_d = {s: pitch_to_midi(p) for s, p in OPEN_NOTES.items()}
    drop_d[6] -= 2  # low E -> D
    path = _write(tmp_path, [{"beats": [(4, [(6, 0, "normal")])]}], tuning=drop_d)
    track = read_guitarpro(path).tracks[0]
    assert not track.standard_tuning
    # The finger still goes on the sixth string at fret 0 -- only the pitch moved.
    assert track.notes[0].string == 6 and track.notes[0].fret == 0


def test_standard_tuning_is_recognised(tmp_path):
    path = _write(tmp_path, [{"beats": [(4, [(6, 3, "normal")])]}])
    assert read_guitarpro(path).tracks[0].standard_tuning


def test_a_tie_extends_the_note_it_continues(tmp_path):
    """A tied note is a held finger, not a second instruction to place one."""
    path = _write(
        tmp_path,
        [
            {"beats": [(4, [(5, 7, "normal")]), (4, [(5, 7, "tie")]), (4, []), (4, [])]},
        ],
    )
    notes = read_guitarpro(path).tracks[0].notes
    assert len(notes) == 1, "the tie should not have produced a second note"
    assert notes[0].start == pytest.approx(0.0)
    assert notes[0].duration == pytest.approx(2.0), "one quarter tied to another is a half"


def test_a_dead_note_is_kept_and_marked(tmp_path):
    path = _write(tmp_path, [{"beats": [(4, [(4, 5, "dead")])]}])
    note = read_guitarpro(path).tracks[0].notes[0]
    assert note.dead and note.fret == 5


def test_a_repeat_is_unrolled_into_playback_order(tmp_path):
    """Page order is not playback order; a transport that confuses them drifts."""
    path = _write(
        tmp_path,
        [
            {"beats": [(4, [(6, 1, "normal")])], "repeat_open": True},
            {"beats": [(4, [(6, 2, "normal")])], "repeat_close": 2},
            {"beats": [(4, [(6, 3, "normal")])]},
        ],
    )
    song = read_guitarpro(path)
    frets = [n.fret for n in song.tracks[0].notes]
    assert frets == [1, 2, 1, 2, 3], f"expected the first two bars twice, got {frets}"
    assert len(song.bars) == 5
    assert [b.number for b in song.bars] == [1, 2, 3, 4, 5]


def test_an_unrolled_repeat_lengthens_the_song(tmp_path):
    spec = [
        {"beats": [(4, [(6, 1, "normal")])], "repeat_open": True},
        {"beats": [(4, [(6, 2, "normal")])], "repeat_close": 2},
    ]
    looped = read_guitarpro(_write(tmp_path, spec))
    assert looped.length == pytest.approx(16.0)  # four 4/4 bars, not two


def test_a_time_signature_change_changes_the_bar_length(tmp_path):
    path = _write(
        tmp_path,
        [
            {"beats": [(4, [(6, 1, "normal")])], "sig": (4, 4)},
            {"beats": [(4, [(6, 2, "normal")])], "sig": (3, 4)},
        ],
    )
    song = read_guitarpro(path)
    assert [b.length for b in song.bars] == [4.0, 3.0]
    assert song.length == pytest.approx(7.0)


def test_notes_land_in_the_bar_they_were_written_in(tmp_path):
    path = _write(
        tmp_path,
        [
            {"beats": [(4, [(6, 1, "normal")]), (4, [(6, 2, "normal")])]},
            {"beats": [(4, [(6, 3, "normal")])]},
        ],
    )
    song = read_guitarpro(path)
    by_fret = {n.fret: n for n in song.tracks[0].notes}
    assert song.bar_at(by_fret[1].start).number == 1
    assert song.bar_at(by_fret[2].start).number == 1
    assert song.bar_at(by_fret[3].start).number == 2


def test_percussion_is_flagged_so_it_never_reaches_the_neck(tmp_path):
    path = _write(tmp_path, [{"beats": [(4, [(6, 38, "normal")])]}], percussion=True, name="Drums")
    assert not read_guitarpro(path).tracks[0].playable
