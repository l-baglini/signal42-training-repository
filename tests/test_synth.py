"""The sound of a plucked string.

The waveform is testable; whether it is *pleasant* is not, and nothing here
pretends otherwise — that needs speakers and ears, and `tools/preview_audio.py`
exists to provide them. What can be asserted is everything that would make it
wrong rather than ugly: a note sounds the pitch it was asked for, it decays, it
carries no DC, and a mix of them does not clip.

Pitch is measured *from the waveform* by FFT rather than from the arithmetic
that produced it, which is the whole point: the two bugs this file caught —
a DC offset that outlived every note, and the loop filter's half-sample delay
putting A4 eight cents flat — were both invisible to the code and obvious to
the spectrum.
"""

from __future__ import annotations

import numpy as np
import pytest

from fretguide.score import Bar, Song, SongNote, SongTrack, TempoChange
from fretguide.synth import (
    HEADROOM,
    SAMPLE_RATE,
    bank,
    fundamental,
    pluck,
    render,
)
from fretguide.theory import pitch_to_midi

TUNING = {1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40}


def cents(got: float, want: float) -> float:
    return 1200.0 * np.log2(got / want)


def hz(midi: int) -> float:
    return 440.0 * 2.0 ** ((midi - 69) / 12.0)


# --------------------------------------------------------------------------- #
# One note
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize("name", ["E2", "A2", "D3", "G3", "B3", "E4", "A4", "E5", "E6"])
def test_a_pluck_sounds_the_pitch_it_was_asked_for(name):
    """Within 10 cents across the whole guitar range, measured off the audio.

    Two things conspire to break this and both did. The delay line is a whole
    number of samples, which quantises the pitch a quarter-tone flat at the top
    of the neck; and the loop filter adds half a sample of delay of its own,
    which is a further eight cents everywhere.
    """
    midi = pitch_to_midi(name)
    got = fundamental(pluck(midi, 1.0))
    assert abs(cents(got, hz(midi))) < 10.0, f"{name}: {got:.1f} Hz, wanted {hz(midi):.1f}"


def test_the_whole_guitar_range_is_in_tune():
    worst = max(
        abs(cents(fundamental(pluck(m, 0.7)), hz(m)))
        for m in range(pitch_to_midi("E2"), pitch_to_midi("E6") + 1, 3)
    )
    assert worst < 10.0, f"worst pitch error {worst:.1f} cents"


def test_a_pluck_carries_no_dc_offset():
    """The feedback filter has unity gain at DC, so any offset in the initial
    excitation never decays: it outlives the note and eats headroom."""
    for name in ("E2", "G3", "E5"):
        buf = pluck(pitch_to_midi(name), 1.0)
        assert abs(float(np.mean(buf))) < 1e-3, f"{name} has a DC offset"


def test_a_pluck_decays():
    buf = pluck(pitch_to_midi("A2"), 2.5)
    third = len(buf) // 3
    early = float(np.max(np.abs(buf[:third])))
    late = float(np.max(np.abs(buf[-third:])))
    assert late < early * 0.25, f"{late:.3f} vs {early:.3f} — not decaying"


def test_a_pluck_starts_and_ends_quietly():
    """No click at either end: a buffer beginning at full amplitude pops, and
    one truncated mid-cycle snaps."""
    buf = pluck(pitch_to_midi("D3"), 0.5)
    assert abs(float(buf[0])) < 0.05
    assert abs(float(buf[-1])) < 0.05


def test_a_pluck_stays_inside_full_scale():
    for name in ("E2", "A4", "E6"):
        assert float(np.max(np.abs(pluck(pitch_to_midi(name), 1.0)))) <= 1.02


def test_plucks_are_deterministic():
    """Same seed, same waveform — so a rendered song does not change between
    runs and a golden comparison stays possible."""
    a = pluck(60, 0.3, seed=7)
    b = pluck(60, 0.3, seed=7)
    assert np.array_equal(a, b)
    assert not np.array_equal(a, pluck(60, 0.3, seed=8))


def test_the_fundamental_is_the_strongest_partial():
    """White-noise excitation gives every harmonic a random amplitude, so the
    loudest partial is often not the fundamental — a low E came out sounding its
    seventeenth. The excitation is shaped 1/h precisely to prevent that."""
    for name in ("E2", "A2", "G3"):
        midi = pitch_to_midi(name)
        assert abs(cents(fundamental(pluck(midi, 1.0)), hz(midi))) < 10.0


def test_a_longer_request_gives_a_longer_buffer():
    assert len(pluck(60, 1.0)) == pytest.approx(SAMPLE_RATE, rel=0.01)
    assert len(pluck(60, 0.5)) == pytest.approx(SAMPLE_RATE / 2, rel=0.01)


def test_the_bank_holds_one_pluck_per_distinct_pitch():
    b = bank([60, 60, 64, 67, 64])
    assert sorted(b) == [60, 64, 67]


# --------------------------------------------------------------------------- #
# A song
# --------------------------------------------------------------------------- #


def _song(bars=4, bpm=120.0, tempos=None) -> Song:
    return Song(
        title="T", artist="A", tracks=(),
        bars=tuple(Bar(number=i + 1, start=i * 4.0, length=4.0) for i in range(bars)),
        tempos=tempos or (TempoChange(0.0, bpm),),
    )


def test_a_note_sounds_at_the_time_the_score_puts_it():
    """The point of the whole module: the right pitch, at the right moment."""
    song = _song()
    notes = (
        SongNote(string=5, fret=0, start=0.0, duration=1.0),  # A2
        SongNote(string=1, fret=0, start=4.0, duration=1.0),  # E4, two seconds later
    )
    mix = render(notes, song, TUNING)
    at = lambda t: mix[int(t * SAMPLE_RATE) : int((t + 0.3) * SAMPLE_RATE)]  # noqa: E731
    assert abs(cents(fundamental(at(0.02)), hz(45))) < 15.0
    assert abs(cents(fundamental(at(2.02)), hz(64))) < 15.0


def test_the_gap_between_notes_is_quiet():
    song = _song()
    notes = (SongNote(string=5, fret=0, start=0.0, duration=0.5),)
    mix = render(notes, song, TUNING)
    tail = mix[int(2.5 * SAMPLE_RATE) :]
    assert float(np.max(np.abs(tail))) < 0.05, "the note should be long gone"


def test_a_mix_never_clips():
    """Six strings summed is not six strings averaged."""
    song = _song()
    notes = tuple(
        SongNote(string=s, fret=0, start=0.0, duration=4.0) for s in range(1, 7)
    )
    mix = render(notes, song, TUNING)
    assert float(np.max(np.abs(mix))) <= HEADROOM + 1e-3


def test_the_rate_stretches_the_result():
    song = _song()
    notes = (SongNote(string=6, fret=3, start=0.0, duration=1.0),)
    full = render(notes, song, TUNING, rate=1.0)
    half = render(notes, song, TUNING, rate=0.5)
    assert len(half) > len(full) * 1.8, "half speed should be about twice as long"


def test_slowing_down_does_not_change_the_pitch():
    """The tempo keys must not transpose the song, which is what naively
    resampling the finished buffer would do."""
    song = _song()
    notes = (SongNote(string=5, fret=0, start=0.0, duration=2.0),)
    for rate in (1.0, 0.5, 2.0):
        mix = render(notes, song, TUNING, rate=rate)
        seg = mix[int(0.02 * SAMPLE_RATE) : int(0.32 * SAMPLE_RATE)]
        assert abs(cents(fundamental(seg), hz(45))) < 15.0, f"rate {rate} shifted the pitch"


def test_a_tempo_change_moves_the_later_notes():
    early = _song(tempos=(TempoChange(0.0, 120.0),))
    slowed = _song(tempos=(TempoChange(0.0, 120.0), TempoChange(4.0, 60.0)))
    notes = (SongNote(string=6, fret=3, start=8.0, duration=1.0),)
    assert len(render(notes, slowed, TUNING)) > len(render(notes, early, TUNING))


def test_muted_notes_make_no_sound():
    song = _song()
    notes = (SongNote(string=5, fret=3, start=0.0, duration=1.0, dead=True),)
    assert float(np.max(np.abs(render(notes, song, TUNING)))) < 1e-6


def test_an_empty_part_renders_silence_rather_than_failing():
    mix = render((), _song(), TUNING)
    assert mix.size >= 1 and float(np.max(np.abs(mix))) == 0.0


def test_a_track_of_a_thousand_notes_renders_quickly_enough_to_be_interactive():
    """Tempo changes re-mix. Re-mixing must stay well under a second or the
    speed keys stutter, which is why plucks are cached per pitch."""
    import time

    song = _song(bars=200)
    track = SongTrack(
        name="x",
        notes=tuple(
            SongNote(string=(i % 6) + 1, fret=i % 12, start=i * 0.25, duration=0.25)
            for i in range(1000)
        ),
        string_count=6,
    )
    t0 = time.perf_counter()
    render(track.notes, song, TUNING)
    assert time.perf_counter() - t0 < 2.0
