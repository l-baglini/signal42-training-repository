"""Modes as they are actually taught: seven of them, all inside one key.

The app could already draw "A dorian" — and that was the problem. Every mode of a key is
the *same set of notes*: G ionian, A dorian, B phrygian, C lydian, D mixolydian, E aeolian
and F# locrian are one scale, and on a whole-neck map all seven light up identically. Only
the root markers move. A learner staring at that cannot see what distinguishes a mode,
because on those terms nothing does.

What distinguishes them is the three things a teacher supplies and a note-set does not:

  the parent key   everything here is "in G", which is why the notes never change
  the chord        each mode belongs over one chord of the key — Dorian over Am, not
                   over G — and that is what makes it sound like Dorian at all
  the position     each is played as a four-fret box at its own place on the neck, so
                   seven modes become seven distinct shapes in seven distinct places

Boxes are derived, not transcribed. Given the position, everything else follows: the notes
are whichever belong to the key inside that four-fret window, and the finger is
``fret - position + 1``, which is what "playing in position" means. That derivation
reproduces the curated G_MAJOR_BOX in content.py exactly, so the rule is the one that box
was built by.
"""

from __future__ import annotations

from dataclasses import dataclass

from .theory import _SHARP_NAMES, chroma, chroma_at, scale_chromas
from .types import FretPosition, StringNumber

#: The seven modes, in the order they are built. Degree, English name, the Italian name a
#: lot of teaching material uses, and the chord quality the mode belongs over.
#:
#: The chord is not decoration. Dorian over Am is what makes those notes sound Dorian;
#: play them over G and you have simply played G major starting on the second degree.
MODES: tuple[tuple[int, str, str, str, str], ...] = (
    (1, "Ionian", "Ionico", "", "major"),
    (2, "Dorian", "Dorico", "m", "minor"),
    (3, "Phrygian", "Frigio", "m", "minor"),
    (4, "Lydian", "Lidio", "", "major"),
    (5, "Mixolydian", "Misolidio", "7", "dominant"),
    (6, "Aeolian", "Eolio", "m", "minor"),
    (7, "Locrian", "Locrio", "m7b5", "half-diminished"),
)

#: Semitones from the parent key's tonic to each mode's root — the major scale.
DEGREE_SEMITONES: tuple[int, ...] = (0, 2, 4, 5, 7, 9, 11)

#: The fret each mode's box starts at, in the key of G, taken from the roman numerals on
#: the source sheet: II, IV, VII, VII, IX, XI, II.
#:
#: Only the positions come from the sheet. The notes and fingerings are derived, because
#: reading finger numbers off a scan is exactly the way to teach somebody a wrong shape.
POSITIONS_IN_G: tuple[int, ...] = (2, 4, 7, 7, 9, 11, 2)

#: How wide a box is. Four frets, one per finger — "position II" means the index finger
#: is at fret 2 and the little finger at fret 5.
BOX_FRETS = 4


@dataclass(frozen=True)
class Mode:
    """One mode of one key: what it is called, what it sits over, and where it is played."""

    key: str  #: parent key, e.g. "G"
    degree: int  #: 1..7
    name: str  #: "Dorian"
    italian: str  #: "Dorico"
    root: str  #: the mode's own tonic, e.g. "A"
    chord: str  #: the chord it belongs over, e.g. "Am"
    quality: str  #: "minor", "dominant", …
    position: int  #: fret the box starts at; the index finger's fret
    #: Frets of the box that fall past the end of the tracked neck, so cannot be drawn.
    #: Non-zero is a real limitation, not a rounding error — see :func:`key_modes`.
    clipped: int = 0

    @property
    def roman(self) -> str:
        return ("I", "II", "III", "IV", "V", "VI", "VII")[self.degree - 1]

    @property
    def roman_position(self) -> str:
        """The position as a teaching sheet writes it: II, IV, VII, ..."""
        return _roman(self.position)

    @property
    def label(self) -> str:
        return f"{self.roman}  {self.name}"

    @property
    def detail(self) -> str:
        tail = f"  ({self.clipped} frets off the neck)" if self.clipped else ""
        return f"{self.root} · over {self.chord} · pos {_roman(self.position)}{tail}"


def _roman(n: int) -> str:
    """Fret positions are written in roman numerals on every sheet of this kind.

    Position 0 is not "0", it is the open position — the one where the nut does the work
    of the index finger.
    """
    if n <= 0:
        return "open"
    numerals = (("X", 10), ("IX", 9), ("V", 5), ("IV", 4), ("I", 1))
    out = ""
    for sym, val in numerals:
        while n >= val:
            out += sym
            n -= val
    return out


def transpose(note: str, semitones: int) -> str:
    return _SHARP_NAMES[(chroma(note) + semitones) % 12]


def key_modes(key: str, max_fret: int = 12) -> list[Mode]:
    """The seven modes of ``key``, each with its root, its chord and its box position.

    Positions are the sheet's G positions moved by the interval between G and ``key``, so
    every key gets the same seven shapes in the same relative places — which is the point
    of learning them as shapes. A box is dropped an octave when that brings it back onto
    the neck.

    **Some boxes do not fit.** The tracker poses frets 0–12 and no further, because the
    model predicts the nut through the twelfth fret and nothing beyond. Aeolian sits at
    position XI even in the key of G, so its box runs to fret 14 and two of its four frets
    are off the end. ``Mode.clipped`` says how many, and the app says so rather than
    quietly drawing two-thirds of a shape and letting you learn it that way.
    """
    shift = (chroma(key) - chroma("G")) % 12
    out: list[Mode] = []
    for i, (degree, name, italian, suffix, quality) in enumerate(MODES):
        root = transpose(key, DEGREE_SEMITONES[i])
        position = POSITIONS_IN_G[i] + shift
        if position + BOX_FRETS - 1 > max_fret and position - 12 >= 0:
            position -= 12  # the same shape an octave down, fully on the neck
        clipped = max(0, position + BOX_FRETS - 1 - max_fret)
        out.append(Mode(key=key, degree=degree, name=name, italian=italian, root=root,
                        chord=f"{root}{suffix}", quality=quality, position=position,
                        clipped=clipped))
    return out


def mode_box(mode: Mode, max_fret: int = 12,
             strings: tuple[StringNumber, ...] = (6, 5, 4, 3, 2, 1)) -> tuple[FretPosition, ...]:
    """The notes of one mode's box, fingered.

    Every note of the parent key that falls inside the four-fret window, with
    ``finger = fret - position + 1`` — the definition of playing in position. Notes below
    the mode's own root on the lowest string are left out, so the box *starts* on the
    tonic and you hear the mode rather than the parent scale.
    """
    allowed = scale_chromas(mode.key, "major")
    root_chroma = chroma(mode.root)
    lo, hi = mode.position, min(mode.position + BOX_FRETS - 1, max_fret)

    lowest = strings[0]
    floor_fret = next((f for f in range(lo, hi + 1) if chroma_at(lowest, f) == root_chroma), lo)

    out: list[FretPosition] = []
    for s in strings:
        for f in range(lo, hi + 1):
            if chroma_at(s, f) not in allowed:
                continue
            if s == lowest and f < floor_fret:
                continue
            out.append(FretPosition(string=s, fret=f, finger=f - mode.position + 1,
                                    is_root=chroma_at(s, f) == root_chroma))
    return tuple(out)
