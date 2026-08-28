#!/usr/bin/env python3
"""Score the fingering solver against human transcriptions.

"Is this fingering sensible?" is the one question about song mode that no unit
test can ask. A solver can be confidently, self-consistently wrong — it will
always return *a* place for every note, and the notes will always sound right.
Only somebody's actual choices reveal whether the places are the ones a player
would use.

Guitar Pro files carry exactly that: a human's string-and-fret decisions for a
known sequence of pitches. So throw the fingering away, hand the pitches to the
solver, and compare. Agreement is a distance, not a verdict — a transcriber's
choice is one good answer, not the only one — but a solver agreeing with people
most of the time is doing something right, and one agreeing a third of the time
is not.

    tools/eval_fingering.py partitures/*.gp3 partitures/*.gp4

Needs the [score] extra and real files; it is a tool, not a test, because the
files it wants are gitignored.
"""

from __future__ import annotations

import argparse
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fretguide.fingering import Hand, Weights, solve, to_pitches  # noqa: E402
from fretguide.score import SongTrack, read_guitarpro  # noqa: E402


def score_track(track: SongTrack, hand: Hand, weights: Weights) -> dict | None:
    """Compare the solver's placement of a track against the transcriber's."""
    human = [n for n in track.notes if not n.dead]
    if len(human) < 20:
        return None
    result = solve(to_pitches(human), hand=hand, weights=weights)
    # Match on (start, pitch): the solver returns notes in its own order, and a
    # chord's notes share a start, so pair them up by what they sound.
    want = {}
    for n in human:
        want.setdefault(round(n.start, 6), []).append(n)
    got = {}
    for n in result.notes:
        got.setdefault(round(n.start, 6), []).append(n)

    same_string = total = 0
    fret_gap: list[int] = []
    for start, ours in got.items():
        theirs = want.get(start, [])
        # Both lists are sorted by string; compare them as sets of placements.
        theirs_set = {(n.string, n.fret) for n in theirs}
        for n in ours:
            total += 1
            if (n.string, n.fret) in theirs_set:
                same_string += 1
            else:
                near = min((abs(n.fret - t.fret) for t in theirs), default=0)
                fret_gap.append(near)
    return {
        "name": track.name,
        "notes": total,
        "agree": same_string / total if total else 0.0,
        "median_gap": statistics.median(fret_gap) if fret_gap else 0.0,
        "unplayable": result.unplayable,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("files", nargs="+", type=Path)
    ap.add_argument("--max-fret", type=int, default=24)
    ap.add_argument("--span", type=int, default=4)
    ap.add_argument("--travel", type=float, default=Weights.travel)
    ap.add_argument("--stretch", type=float, default=Weights.stretch)
    ap.add_argument("--open-string", type=float, default=Weights.open_string)
    ap.add_argument("--height", type=float, default=Weights.height)
    ap.add_argument("--string-gap", type=float, default=Weights.string_gap)
    args = ap.parse_args()

    hand = Hand(span=args.span, max_fret=args.max_fret)
    weights = Weights(
        travel=args.travel,
        stretch=args.stretch,
        open_string=args.open_string,
        height=args.height,
        string_gap=args.string_gap,
    )

    rows = []
    for path in args.files:
        song = read_guitarpro(path)
        for track in song.tracks:
            if not track.playable or not track.standard_tuning:
                continue
            row = score_track(track, hand, weights)
            if row:
                row["song"] = song.title
                rows.append(row)

    if not rows:
        print("no comparable tracks found", file=sys.stderr)
        return 1

    print(f"{'song':22} {'track':16} {'notes':>6} {'agree':>7} {'med gap':>8} {'unplayable':>11}")
    for r in rows:
        print(
            f"{r['song'][:22]:22} {r['name'][:16]:16} {r['notes']:>6} "
            f"{r['agree']:>6.1%} {r['median_gap']:>8.1f} {r['unplayable']:>11}"
        )
    total = sum(r["notes"] for r in rows)
    overall = sum(r["agree"] * r["notes"] for r in rows) / total
    print(f"\n{'':39} {total:>6} {overall:>6.1%}   <- weighted overall")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
