"""Choosing *where* to play a note.

A pitch is not a place. E4 sounds at five different spots on a guitar neck, and
picking between them is what a player does without thinking and what a score
file for any other instrument never records. This module is the adapter between
"which notes" and "where the fingers go" — the layer a MusicXML or MIDI file
needs and a Guitar Pro file does not, because Guitar Pro already stores the
answer.

**It is a shortest path, not a per-note choice.** The cheapest place for one
note is routinely a terrible place given where the hand was a beat ago; deciding
note by note produces a part that is correct in pitch and unplayable in fact.
The state carried between notes is the **hand position** — the fret the index
finger sits at — because that is what the next note's cost actually depends on.

Every weight below is tuned against real transcriptions and carries its measured
contribution; see ``tools/eval_fingering.py``. That evaluation exists because
"is this fingering sensible?" is otherwise a question no test can ask — a solver
always returns *a* place for every note and the notes always sound right, so it
can be confidently, self-consistently wrong, and only a human's own choices
reveal it.

**Agreement is a distance, not a score.** 71.8% of placements match the
transcriber's; the rest are mostly a second good answer rather than a bad one.
Cocaine's riff is transcribed as a power chord at the seventh fret and solved as
the same chord at the second — identical pitches, identical shape, different
register, and a guitarist would accept both. Do not chase this number to 100%:
past a point it would mean overfitting to four people's habits.

A useful by-product: constraining the solve to the twelve frets the camera can
pose costs only 2.8 points of agreement (69.0%), so most parts can be re-fingered
into camera range rather than being undrawable there. See
``score.SongTrack.fits_camera``, which is about a *written* fingering; this
module can often supply another one.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from .score import SongNote
from .theory import OPEN_NOTES, pitch_to_midi
from .types import StringNumber

#: Open-string MIDI numbers, string 1 (high E) to string 6 (low E).
STANDARD_TUNING: dict[StringNumber, int] = {
    s: pitch_to_midi(p) for s, p in sorted(OPEN_NOTES.items())
}


@dataclass(frozen=True)
class PitchNote:
    """A note with no place yet — what a MusicXML or MIDI file gives you."""

    midi: int
    start: float  # beats
    duration: float  # beats


@dataclass(frozen=True)
class Hand:
    """What a left hand can do, in frets."""

    #: Frets reachable without shifting. Four fingers nominally cover four
    #: frets; five is playable low on the neck where the frets are wide, which
    #: is exactly why three of the seven modal boxes in `modes.py` span five.
    span: int = 4
    max_fret: int = 12
    #: Barres let one finger cover a whole fret, so a chord repeating the same
    #: fret across strings does not count against the span.
    lowest_fret: int = 0


@dataclass(frozen=True)
class Weights:
    """The cost model. Tuned in ``tools/eval_fingering.py``, not guessed."""

    # Tuned by coordinate descent against 8284 notes of human transcription,
    # and each one's contribution measured by removing it. Agreement with the
    # transcribers is 71.8%; placing every note at its nearest available spot,
    # with all six weights at zero, scores 64.7%.
    travel: float = 2.5  # per fret the hand shifts between events        -3.0%
    stretch: float = 0.2  # per fret of span inside one event             -0.4%
    open_string: float = 0.5  # bonus per open string                     -0.6%
    height: float = 0.1  # per fret up the neck                           -9.0%
    string_gap: float = 1.0  # per string *skipped* inside a chord        -2.4%
    low_string: float = 0.1  # bonus per string number, i.e. thicker      -0.5%

    # `height` dominating is worth knowing: most of what makes a fingering look
    # human is simply staying near the nut, and the interesting weights are the
    # ones that decide when *not* to.
    #
    # Two further weights were tried and removed. A `haste` term charging for
    # moving far in little time, and a `string_change` term charging for
    # crossing strings between single notes: both tuned to exactly 0.0, i.e.
    # they cost agreement rather than buying it. Physically plausible is not the
    # same as true, and an unmeasured knob is worse than no knob.


@dataclass(frozen=True)
class Placement:
    string: StringNumber
    fret: int

    @property
    def open(self) -> bool:
        return self.fret == 0


@dataclass(frozen=True)
class Voicing:
    """One instant's choices, and where they leave the hand."""

    placements: tuple[Placement, ...]
    position: int | None  # lowest fretted fret; None when everything is open

    @property
    def frets(self) -> tuple[int, ...]:
        return tuple(p.fret for p in self.placements if not p.open)


@dataclass(frozen=True)
class Solution:
    notes: tuple[SongNote, ...]
    #: Notes with no place on the neck at all — out of range for this tuning and
    #: fret count. Reported rather than silently dropped.
    unplayable: int = 0


def candidates(midi: int, hand: Hand, tuning: dict[StringNumber, int] | None = None) -> tuple[Placement, ...]:
    """Every place a pitch can be played, high strings first."""
    tuning = tuning or STANDARD_TUNING
    out = [
        Placement(string=s, fret=midi - open_midi)
        for s, open_midi in sorted(tuning.items())
        if hand.lowest_fret <= midi - open_midi <= hand.max_fret
        # An open string is always available even below `lowest_fret`, which
        # bounds where the *hand* may go, not where the nut is.
        or midi == open_midi
    ]
    return tuple(dict.fromkeys(out))


def _voicings(pitches: Sequence[int], hand: Hand, tuning: dict[StringNumber, int]) -> list[Voicing]:
    """Every simultaneously playable way to sound ``pitches`` at once.

    Two physical constraints, and they are the only ones that matter here: one
    note per string, and every fretted note within the hand's span of the
    others. A barre is why repeated frets cost nothing extra.
    """
    options = [candidates(p, hand, tuning) for p in pitches]
    if any(not o for o in options):
        return []

    found: list[Voicing] = []
    chosen: list[Placement] = []
    used: set[int] = set()

    def walk(i: int) -> None:
        if len(found) > 4096:  # a pathological cluster must not blow up the solve
            return
        if i == len(options):
            fretted = [p.fret for p in chosen if not p.open]
            found.append(
                Voicing(tuple(chosen), min(fretted) if fretted else None)
            )
            return
        for placement in options[i]:
            if placement.string in used:
                continue
            fretted = [p.fret for p in chosen if not p.open]
            if not placement.open and fretted:
                lo, hi = min(fretted + [placement.fret]), max(fretted + [placement.fret])
                if hi - lo >= hand.span:
                    continue
            used.add(placement.string)
            chosen.append(placement)
            walk(i + 1)
            chosen.pop()
            used.discard(placement.string)

    walk(0)
    return found


def _internal(v: Voicing, w: Weights) -> float:
    frets = v.frets
    cost = -w.open_string * sum(1 for p in v.placements if p.open)
    if frets:
        cost += w.stretch * (max(frets) - min(frets))
        cost += w.height * min(frets)
    cost -= w.low_string * sum(p.string for p in v.placements) / len(v.placements)
    if len(v.placements) > 1:
        # Chords are played on adjacent strings. Without this the solver happily
        # voices Cocaine's E5 riff across strings 4, 2 and 1 -- the right pitches,
        # skipping the third string, which no player would do. It was the single
        # largest source of disagreement with the transcribers: 5% agreement on
        # that track before, and it is a shape constraint rather than a
        # preference, which is why it is scored separately from `stretch`.
        strings = sorted(p.string for p in v.placements)
        cost += w.string_gap * (strings[-1] - strings[0] - (len(strings) - 1))
    return cost


def _windows(v: Voicing, hand: Hand) -> tuple[int, ...] | None:
    """Hand positions from which this voicing is reachable.

    A position is a *window* of `span` frets, not a single fret. Modelling it as
    the lowest fretted note -- which is the obvious thing, and what this did
    first -- charges travel for playing fret 9 then fret 7, though both sit under
    one unmoved hand. Returns None for an all-open voicing: it constrains the
    hand not at all, and the player may leave it wherever it was.
    """
    frets = v.frets
    if not frets:
        return None
    lo, hi = min(frets), max(frets)
    return tuple(range(max(1, hi - hand.span + 1), lo + 1))


_INF = float("inf")


def _arrival(
    prev: dict[int, tuple[float, Voicing, int | None]], top: int, travel: float
) -> tuple[list[float], list[int | None]]:
    """Cheapest way to have the hand at each window, and where it came from.

    A distance transform in two linear passes rather than comparing every window
    against every other. Valid because shifting costs a fixed rate per fret, so
    the best route to window i is either "already there" or "one fret further
    than the best route to a neighbour".
    """
    cost = [_INF] * (top + 2)
    src: list[int | None] = [None] * (top + 2)
    for w, (c, _, _) in prev.items():
        if c < cost[w]:
            cost[w], src[w] = c, w
    for i in range(1, top + 1):
        if cost[i - 1] + travel < cost[i]:
            cost[i], src[i] = cost[i - 1] + travel, src[i - 1]
    for i in range(top - 1, 0, -1):
        if cost[i + 1] + travel < cost[i]:
            cost[i], src[i] = cost[i + 1] + travel, src[i + 1]
    return cost, src


def solve(
    notes: Sequence[PitchNote],
    hand: Hand = Hand(),
    weights: Weights = Weights(),
    tuning: dict[StringNumber, int] | None = None,
) -> Solution:
    """Assign every note a string and fret, minimising total hand effort.

    Notes sharing a start time are solved together as one voicing, so a chord is
    placed as a chord rather than as six independent decisions that happen to
    collide on the same string.

    The search keeps one best route per hand window per event. Two voicings that
    leave the hand in the same place are interchangeable from there on, so
    collapsing them loses nothing and holds the state space to the ~20 windows a
    neck has instead of the thousands of shapes an event admits.
    """
    tuning = tuning or STANDARD_TUNING
    events = _group(notes)
    top = max(1, hand.max_fret)

    unplayable = 0
    kept: list[list[PitchNote]] = []
    table: list[dict[int, tuple[float, Voicing, int | None]]] = []
    prev: dict[int, tuple[float, Voicing, int | None]] = {}

    for _start, group in events:
        options = _voicings([n.midi for n in group], hand, tuning)
        if not options:
            unplayable += len(group)
            continue
        if prev:
            arrive, source = _arrival(prev, top, weights.travel)
        else:
            arrive, source = [0.0] * (top + 2), [None] * (top + 2)

        layer: dict[int, tuple[float, Voicing, int | None]] = {}
        for v in options:
            base = _internal(v, weights)
            reach = _windows(v, hand)
            for win in reach if reach is not None else range(1, top + 1):
                total = arrive[win] + base
                if total == _INF:
                    continue
                current = layer.get(win)
                if current is None or total < current[0]:
                    layer[win] = (total, v, source[win])
        if not layer:
            unplayable += len(group)
            continue
        kept.append(group)
        table.append(layer)
        prev = layer

    if not table:
        return Solution(notes=(), unplayable=unplayable)

    out: list[SongNote] = []
    win = min(prev, key=lambda k: prev[k][0])
    for layer, group in zip(reversed(table), reversed(kept)):
        _, voicing, back = layer[win]
        for note, placement in zip(group, voicing.placements):
            out.append(
                SongNote(
                    string=placement.string,
                    fret=placement.fret,
                    start=note.start,
                    duration=note.duration,
                )
            )
        win = back if back is not None else win
    out.sort(key=lambda n: (n.start, -n.string))
    return Solution(notes=tuple(out), unplayable=unplayable)


def _group(notes: Sequence[PitchNote]) -> list[tuple[float, list[PitchNote]]]:
    """Notes sharing an onset, in time order."""
    events: dict[float, list[PitchNote]] = {}
    for n in notes:
        events.setdefault(n.start, []).append(n)
    return sorted(events.items())


def to_pitches(notes: Sequence[SongNote], tuning: dict[StringNumber, int] | None = None) -> tuple[PitchNote, ...]:
    """Throw away the fingering, keeping the music.

    Only useful for one thing, and it is the important thing: it turns a human's
    transcription into solver input, so what the solver picks can be compared
    against what a person actually chose.
    """
    tuning = tuning or STANDARD_TUNING
    return tuple(
        PitchNote(midi=tuning[n.string] + n.fret, start=n.start, duration=n.duration)
        for n in notes
        if not n.dead and n.string in tuning
    )
