"""Making the sound of a plucked string.

Karplus–Strong, which is a physical model rather than an imitation: fill a delay
line one period long with noise, then feed it back through a one-tap averaging
filter. The delay sets the pitch; the filter is the string shedding its high
harmonics faster than its fundamental, which is what a real string does and what
makes the result sound plucked instead of buzzy. Twenty lines, no soundfont, no
sample library, no external process.

Everything here is a pure function over numpy arrays, so the *sound* is testable
even though playing it is not: :mod:`fretguide.audio` owns the device, this
module owns the waveform. What can be asserted without speakers is quite a lot —
that a note's spectrum peaks at the frequency it was asked for, that it decays,
that the mix never clips — and what cannot is whether it is pleasant.

**Notes are cached per pitch, not per note.** A song has thousands of notes and
a few dozen distinct pitches, so one pluck per pitch is synthesised and then
*sliced* into the mix at each onset. Changing tempo re-mixes, which is addition,
rather than re-synthesising, which is not; that is the difference between the
speed keys feeling instant and feeling broken.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

import numpy as np

from .score import Song, SongNote
from .types import StringNumber

#: PipeWire's native rate on the target machine; anything else means a resample
#: in the graph for no gain. See docs/research/05-audio-stack.md.
SAMPLE_RATE = 48_000

#: Seconds for a note to fall 60 dB. Applied *per period*, so it is the same
#: wall-clock decay whatever the pitch — a fixed per-period coefficient would
#: make the low E die three times faster than the high one, which is backwards.
SUSTAIN = 3.0

#: Longest a single pluck is synthesised for. Past this a string is inaudible
#: anyway, and it bounds the per-pitch cache.
MAX_PLUCK = 4.0

#: Fades, in seconds. The attack only kills the click of starting a buffer at
#: full amplitude — the noise burst itself *is* the pluck transient and must not
#: be smoothed away. The release stops a truncated note snapping off.
ATTACK = 0.002
RELEASE = 0.08

#: Peak the finished mix is scaled to. Below 1.0 because a chord is the sum of
#: up to six strings and summing is not averaging.
HEADROOM = 0.89


def pluck(
    midi: int,
    seconds: float = MAX_PLUCK,
    sr: int = SAMPLE_RATE,
    sustain: float = SUSTAIN,
    seed: int = 0,
) -> np.ndarray:
    """One plucked string, as float32 mono in [-1, 1]."""
    freq = 440.0 * 2.0 ** ((midi - 69) / 12.0)
    period = max(2, int(round(sr / freq)))

    # Synthesise at the rate that makes `period` samples exactly one cycle, then
    # resample to `sr`. The delay line can only be a whole number of samples
    # long, so at `sr` its pitch is quantised -- harmless at the bottom of the
    # neck (1.5 cents on the low E) and not at the top, where round(sr/f) lands
    # a quarter-tone flat. Moving the quantisation into the sample rate, where
    # it is a 1% resample nobody can hear, removes it from the pitch, where it
    # is plainly out of tune.
    #
    # The +0.5 is the loop filter's own delay, and leaving it out is the classic
    # Karplus-Strong tuning error. (x[n]+x[n-1])/2 is linear phase with exactly
    # half a sample of delay at every frequency, so the feedback path is
    # period+0.5 samples long, not period. Ignoring it put A4 at 437.99 Hz --
    # measurably, and audibly, eight cents flat.
    sr_synth = (period + 0.5) * freq
    total = max(1, int(round(seconds * sr_synth)))

    # Chosen so amplitude reaches 1/1000 after `sustain` seconds, whatever the
    # pitch: there are freq*sustain periods in that time, and each multiplies by
    # `decay`.
    decay = math.exp(-math.log(1000.0) / max(freq * sustain, 1e-6))

    out = np.empty(total, dtype=np.float32)
    block = _burst(period, seed)
    carry = 0.0  # the sample before this block, for the filter's second tap
    written = 0
    while written < total:
        n = min(period, total - written)
        out[written : written + n] = block[:n]
        written += n
        if written >= total:
            break
        # y[n] = decay * (y[n-N] + y[n-N-1]) / 2, one whole period at a time.
        # Expressed blockwise it is a single vector op per period rather than a
        # Python loop per sample, which is the difference between milliseconds
        # and minutes for a song's worth of notes.
        shifted = np.empty(period)
        shifted[0] = carry
        shifted[1:] = block[:-1]
        carry = block[-1]
        block = decay * 0.5 * (block + shifted)

    out = _resample(out, max(1, int(round(seconds * sr))))
    _fade(out, sr)
    return out


def _burst(period: int, seed: int) -> np.ndarray:
    """The initial excitation, shaped like a plucked string rather than noise.

    Classic Karplus-Strong fills the delay line with white noise, which gives
    every harmonic a random amplitude -- so the fundamental is frequently *not*
    the loudest partial, and a low E can end up sounding its seventeenth. A real
    string rolls off as roughly 1/h. Built in the frequency domain with that
    envelope and random phase, which also makes the DC bin zero by construction
    rather than by subtraction: the feedback filter has unity gain at DC, so any
    offset here would outlive the note.
    """
    harmonics = period // 2
    if harmonics < 1:
        return np.zeros(period)
    rng = np.random.default_rng(seed)
    spectrum = np.zeros(harmonics + 1, dtype=complex)
    h = np.arange(1, harmonics + 1)
    spectrum[1:] = np.exp(2j * np.pi * rng.random(harmonics)) / h
    burst = np.fft.irfft(spectrum, n=period)
    peak = float(np.max(np.abs(burst)))
    return burst / peak if peak > 0 else burst


def _resample(x: np.ndarray, m: int) -> np.ndarray:
    """Length-changing resample through the frequency domain.

    Used for a ratio within a percent of 1, so there is nothing to alias and no
    filter to design -- truncating or zero-padding the spectrum is exact.
    """
    if m == len(x) or len(x) < 2:
        return x.astype(np.float32)
    return (np.fft.irfft(np.fft.rfft(x), n=m) * (m / len(x))).astype(np.float32)


def _fade(buf: np.ndarray, sr: int) -> None:
    n = len(buf)
    attack = min(n, int(ATTACK * sr))
    if attack > 1:
        buf[:attack] *= np.linspace(0.0, 1.0, attack, dtype=np.float32)
    release = min(n, int(RELEASE * sr))
    if release > 1:
        buf[n - release :] *= np.linspace(1.0, 0.0, release, dtype=np.float32)


def bank(
    midis: Sequence[int], sr: int = SAMPLE_RATE, sustain: float = SUSTAIN
) -> dict[int, np.ndarray]:
    """One pluck per distinct pitch. A song has thousands of notes and dozens
    of pitches; this is the whole reason rendering a track is fast."""
    return {m: pluck(m, MAX_PLUCK, sr, sustain, seed=m) for m in sorted(set(midis))}


def render(
    notes: Sequence[SongNote],
    song: Song,
    tuning: dict[StringNumber, int],
    rate: float = 1.0,
    sr: int = SAMPLE_RATE,
    sustain: float = SUSTAIN,
    tail: float = 1.0,
) -> np.ndarray:
    """Mix a track down to one buffer, at ``rate`` times the written tempo.

    Onsets come from the song's tempo map, so a tempo change mid-piece lands in
    the audio as well as on the neck.
    """
    playable = [n for n in notes if not n.dead and n.string in tuning]
    if not playable:
        return np.zeros(1, dtype=np.float32)

    rate = max(rate, 1e-6)
    pitches = [tuning[n.string] + n.fret for n in playable]
    plucks = bank(pitches, sr, sustain)

    length = int(round((song.seconds_at(song.length) / rate + tail) * sr)) + 1
    mix = np.zeros(max(length, 2), dtype=np.float32)

    for note, midi in zip(playable, pitches):
        at = int(round(song.seconds_at(note.start) / rate * sr))
        if at >= len(mix):
            continue
        # A guitar string rings past the note's written length, so the sound is
        # allowed to outlast the dot -- but not forever, or a fast passage turns
        # to mud. Sustaining for the note's own duration plus a release is the
        # compromise, and it is why the mix is not simply the sum of full plucks.
        held = max(song.seconds_at(note.end) - song.seconds_at(note.start), 0.0) / rate
        n = min(int(round((held + RELEASE) * sr)), len(plucks[midi]), len(mix) - at)
        if n <= 1:
            continue
        seg = plucks[midi][:n].copy()
        _fade(seg, sr)
        mix[at : at + n] += seg

    peak = float(np.max(np.abs(mix))) if mix.size else 0.0
    if peak > HEADROOM:
        mix *= HEADROOM / peak
    return mix


def fundamental(buf: np.ndarray, sr: int = SAMPLE_RATE) -> float:
    """The strongest frequency in a buffer. Exists so tests can ask what a note
    actually sounds rather than trusting the arithmetic that produced it."""
    if len(buf) < 4:
        return 0.0
    windowed = buf[: 1 << (len(buf).bit_length() - 1)]
    spectrum = np.abs(np.fft.rfft(windowed * np.hanning(len(windowed))))
    freqs = np.fft.rfftfreq(len(windowed), 1.0 / sr)
    # Ignore anything below the guitar's range. A stray DC or rumble bin is not
    # a note, and letting it win would report 0 Hz for a perfectly good pluck.
    usable = freqs >= 60.0
    spectrum, freqs = spectrum[usable], freqs[usable]
    k = int(np.argmax(spectrum))
    if 0 < k < len(spectrum) - 1:
        # Parabolic interpolation across the peak. A bin is 0.7 Hz wide, which is
        # 15 cents down at the low E -- coarse enough to fail a tuning assertion
        # on a note that is perfectly in tune.
        a, b, c = spectrum[k - 1], spectrum[k], spectrum[k + 1]
        denom = a - 2 * b + c
        if denom != 0:
            return float(freqs[k] + 0.5 * (a - c) / denom * (freqs[1] - freqs[0]))
    return float(freqs[k])
