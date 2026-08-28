#!/usr/bin/env python3
"""Write a song's part out as a WAV, so it can be listened to.

This exists because of a limit rather than a feature. The waveform can be
checked here without hardware — a note's spectrum peaks where it should, the
mix does not clip — but *whether it sounds right* cannot be, and no test will
ever say. So: render it to a file, play it with anything, and use your ears.

    tools/preview_audio.py --song song.gp3 --bars 1-8 --out riff.wav
    paplay riff.wav

Needs the [score] extra to read the file. It does **not** need [audio] or a
sound device — synthesis is pure numpy and the file is written with the stdlib,
which is the point: this works on a machine that cannot make a noise at all.
"""

from __future__ import annotations

import argparse
import sys
import wave
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fretguide.fingering import STANDARD_TUNING, Hand, solve, to_pitches  # noqa: E402
from fretguide.score import read_guitarpro  # noqa: E402
from fretguide.synth import SAMPLE_RATE, render  # noqa: E402


def parse_bars(text: str | None, total: int) -> tuple[int, int]:
    if not text:
        return 1, total
    lo, _, hi = text.partition("-")
    return int(lo), int(hi or lo)


def write_wav(path: Path, samples: np.ndarray, sr: int) -> None:
    """Mono 16-bit PCM. Clipped rather than wrapped: a sample past full scale
    should be loud, not inverted, and `render` keeps headroom anyway."""
    pcm = (np.clip(samples, -1.0, 1.0) * 32767.0).astype("<i2")
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--song", required=True, type=Path)
    ap.add_argument("--track", type=int, default=None, help="omit for the first guitar part")
    ap.add_argument("--bars", default=None, help="e.g. '1-8'; omit for the whole song")
    ap.add_argument("--rate", type=float, default=1.0, help="tempo multiplier, e.g. 0.5")
    ap.add_argument("--refinger", action="store_true", help="re-solve the fingering first")
    ap.add_argument("--max-fret", type=int, default=24)
    ap.add_argument("--out", type=Path, default=Path("diagnostics/song.wav"))
    args = ap.parse_args()

    song = read_guitarpro(args.song)
    track = (song.tracks[args.track] if args.track is not None
             else next((t for t in song.tracks if t.playable), None))
    if track is None:
        print("no six-string guitar track in that file", file=sys.stderr)
        return 1

    if args.refinger:
        from dataclasses import replace
        result = solve(to_pitches(track.notes), Hand(max_fret=args.max_fret))
        track = replace(track, notes=result.notes)

    lo, hi = parse_bars(args.bars, len(song.bars))
    lo, hi = max(1, lo), min(len(song.bars), hi)
    start, end = song.bars[lo - 1].start, song.bars[hi - 1].end
    notes = tuple(n for n in track.notes if start <= n.start < end)
    if not notes:
        print(f"bars {lo}-{hi} of {track.name} are silent", file=sys.stderr)
        return 1

    mix = render(notes, song, STANDARD_TUNING, rate=args.rate)
    # Trim to the requested bars at both ends. `render` places notes at their
    # absolute time in the song and sizes the buffer for the whole piece, so
    # bars 5-12 would otherwise arrive with a silent minute in front and three
    # behind. The tail keeps the last chord's ring rather than cutting it dead.
    head = max(0, int(song.seconds_at(start) / args.rate * SAMPLE_RATE))
    span = (song.seconds_at(end) - song.seconds_at(start)) / args.rate + 1.5
    mix = mix[head : head + int(span * SAMPLE_RATE)]

    write_wav(args.out, mix, SAMPLE_RATE)
    print(f"{args.out}  {len(mix) / SAMPLE_RATE:.1f} s  "
          f"{song.title} · {track.name} · bars {lo}-{hi}"
          + (f" · {args.rate:g}x" if args.rate != 1.0 else ""))
    print(f"  {len(notes)} notes, peak {float(np.max(np.abs(mix))):.2f}")
    print(f"  listen:  paplay {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
