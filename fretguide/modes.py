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

**Fingerings are transcribed, not derived, and that was a correction.** The first version
of this module computed them as ``fret - position + 1`` -- one finger per fret, straight
across. That reproduces the Ionian box exactly, which looked like proof and was not:
Ionian is simply the case where the hand does not move. The Dorian box, read off the
sheet, plays fret 5 with the index finger on the outer four strings and fret 4 with it on
the G and D strings. The hand *shifts between strings*, and no offset formula produces
that. Validating a rule against the one shape that could not disprove it is how this went
wrong; shapes are now stored as given.

What is still derived, safely, is which notes a box contains -- whichever belong to the
parent key inside its fret span -- and every stored note is checked against the key by the
tests. Transposing to another key moves the whole shape up the neck, which is exact,
because a box is a shape.
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

#: The fret each mode's box starts at in the key of G, read from the roman numerals on the
#: source sheet: II, IV, VII, VII, IX, XI, II. Used only for boxes not yet transcribed --
#: where a shape exists in SHAPES_IN_G, its own frets are the authority.
POSITIONS_IN_G: tuple[int, ...] = (2, 4, 7, 7, 9, 11, 2)

#: How wide an untranscribed box is assumed to be. Five, not four: the Dorian box spans
#: frets 4-8, and a four-fret assumption dropped its top note on three strings.
BOX_FRETS = 5

#: Transcribed shapes, in the key of G: ``degree -> ((string, fret, finger), ...)``.
#:
#: These come from the teaching sheet and were read back and confirmed one box at a time.
#: A degree absent from here has not been confirmed, and :func:`mode_box` returns its notes
#: without fingerings rather than inventing them -- a wrong fingering is worse than none,
#: because it is the part a learner copies without questioning it.
SHAPES_IN_G: dict[int, tuple[tuple[int, int, int], ...]] = {
    1: (  # Ionico - frets 2-5, hand does not shift
        (1, 2, 1), (1, 3, 2), (1, 5, 4),
        (2, 3, 2), (2, 5, 4),
        (3, 2, 1), (3, 4, 3), (3, 5, 4),
        (4, 2, 1), (4, 4, 3), (4, 5, 4),
        (5, 2, 1), (5, 3, 2), (5, 5, 4),
        (6, 3, 2), (6, 5, 4),
    ),
    2: (  # Dorico - frets 4-8. Index at fret 5 on the outer strings, at fret 4 on G and D.
        (1, 5, 1), (1, 7, 3), (1, 8, 4),
        (2, 5, 1), (2, 7, 3), (2, 8, 4),
        (3, 4, 1), (3, 5, 2), (3, 7, 4),
        (4, 4, 1), (4, 5, 2), (4, 7, 4),
        (5, 5, 1), (5, 7, 3),
        (6, 5, 1), (6, 7, 3), (6, 8, 4),
    ),
}


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
    position: int  #: fret the box starts at
    #: True when this box's fingering was transcribed from the sheet and read back.
    #: False means the notes are right but nobody has confirmed which finger plays
    #: them, so none are shown rather than guessed.
    verified: bool = False
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
        bits = [self.root, f"over {self.chord}", f"pos {_roman(self.position)}"]
        if not self.verified:
            bits.append("fingering unconfirmed")
        if self.clipped:
            bits.append(f"{self.clipped} frets off the neck")
        return " · ".join(bits)


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
    """The seven modes of ``key``, each with its root, its chord and its box.

    A transcribed shape supplies its own fret span; the rest fall back on the position
    read from the sheet. Either way the whole thing moves by the interval between G and
    ``key``, because a box is a shape and transposing it is exact.

    **Some boxes do not fit.** The tracker poses frets 0-12 and no further, because the
    model predicts the nut through the twelfth fret and nothing beyond. ``Mode.clipped``
    says how many frets fall off the end, and the app says so rather than quietly drawing
    part of a shape and letting you learn it that way.
    """
    shift = (chroma(key) - chroma("G")) % 12
    out: list[Mode] = []
    for i, (degree, name, italian, suffix, quality) in enumerate(MODES):
        root = transpose(key, DEGREE_SEMITONES[i])
        shape = SHAPES_IN_G.get(degree)
        if shape:
            lo, hi = min(f for _, f, _ in shape), max(f for _, f, _ in shape)
        else:
            lo, hi = POSITIONS_IN_G[i], POSITIONS_IN_G[i] + BOX_FRETS - 1
        lo, hi = lo + shift, hi + shift
        if hi > max_fret and lo - 12 >= 0:
            lo, hi = lo - 12, hi - 12  # the same shape an octave down, fully on the neck
        out.append(Mode(key=key, degree=degree, name=name, italian=italian, root=root,
                        chord=f"{root}{suffix}", quality=quality, position=lo,
                        clipped=max(0, hi - max_fret), verified=shape is not None))
    return out


def mode_box(mode: Mode, max_fret: int = 12,
             strings: tuple[StringNumber, ...] = (6, 5, 4, 3, 2, 1)) -> tuple[FretPosition, ...]:
    """The notes of one mode's box.

    A transcribed shape is returned as given, moved to the key. Everything else falls back
    to the notes of the parent key inside the box's span, **with no fingerings at all** --
    those have not been confirmed for that mode, and a wrong finger number is worse than
    no finger number, being the part a learner copies without questioning it.
    """
    shift = (chroma(mode.key) - chroma("G")) % 12
    root_chroma = chroma(mode.root)
    shape = SHAPES_IN_G.get(mode.degree)

    if shape:
        lo = min(f for _, f, _ in shape)
        drop = lo + shift - mode.position  # how far key_modes moved it, octave included
        notes = [(s, f + shift - drop, finger) for s, f, finger in shape]
    else:
        allowed = scale_chromas(mode.key, "major")
        notes = [(s, f, None)
                 for s in strings
                 for f in range(mode.position, mode.position + BOX_FRETS)
                 if chroma_at(s, f) in allowed]

    return tuple(
        FretPosition(string=s, fret=f, finger=finger,
                     is_root=chroma_at(s, f) == root_chroma)
        for s, f, finger in notes
        if 0 <= f <= max_fret
    )
