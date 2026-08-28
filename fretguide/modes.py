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

**Fingerings are transcribed, not derived**, and the reason is worth stating because it
looks at first as though they should be derivable.

The *notes* are derivable, completely: all seven modes of a key are one scale, so a box is
just a window on it, and given the window the notes follow. The *fingering* is not, and
the sheet says exactly why:

    4-fret boxes  Ionico, Frigio, Lidio, Locrio   one hand position, finger = fret - lo + 1
    5-fret boxes  Dorico, Misolidio, Eolio        two hand positions; the hand shifts

Four fingers cannot cover five frets, so in three of the seven boxes the hand moves, and
*which strings it moves on* is a playing decision rather than a consequence of the notes.
Dorico plays fret 5 with the index finger on the outer four strings and fret 4 with it on
the G and D strings. No offset formula expresses that.

The first version of this module computed fingerings and checked the result against Ionico
-- which is a 4-fret box, so it agreed, and proved nothing about the other three. All
seven shapes are now read from the sheet and stored.

Two boxes are the same box. Frigio and Lidio share frets 7-10 and differ only in the low
E: Frigio's root B is fret 7, Lidio's root C is fret 8, so Lidio does not play that first
note. Locrio and Ionico are the same pair one degree round, at frets 2-5.
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
    1: (  # Ionico - G - II - frets 2-5
        (1, 2, 1), (1, 3, 2), (1, 5, 4),
        (2, 3, 2), (2, 5, 4),
        (3, 2, 1), (3, 4, 3), (3, 5, 4),
        (4, 2, 1), (4, 4, 3), (4, 5, 4),
        (5, 2, 1), (5, 3, 2), (5, 5, 4),
        (6, 3, 2), (6, 5, 4),
    ),
    2: (  # Dorico - Am - IV - frets 4-8. Index at 5 on the outer strings, at 4 on G and D.
        (1, 5, 1), (1, 7, 3), (1, 8, 4),
        (2, 5, 1), (2, 7, 3), (2, 8, 4),
        (3, 4, 1), (3, 5, 2), (3, 7, 4),
        (4, 4, 1), (4, 5, 2), (4, 7, 4),
        (5, 5, 1), (5, 7, 3),
        (6, 5, 1), (6, 7, 3), (6, 8, 4),
    ),
    3: (  # Frigio - Bm - VII - frets 7-10
        (1, 7, 1), (1, 8, 2), (1, 10, 4),
        (2, 7, 1), (2, 8, 2), (2, 10, 4),
        (3, 7, 1), (3, 9, 3),
        (4, 7, 1), (4, 9, 3), (4, 10, 4),
        (5, 7, 1), (5, 9, 3), (5, 10, 4),
        (6, 7, 1), (6, 8, 2), (6, 10, 4),
    ),
    4: (  # Lidio - C - VII - frets 7-10. Frigio's box exactly, minus the low E's fret 7:
        # that note is B, which is Frigio's root but sits below Lidio's, so Lidio starts
        # on the C at fret 8 instead.
        (1, 7, 1), (1, 8, 2), (1, 10, 4),
        (2, 7, 1), (2, 8, 2), (2, 10, 4),
        (3, 7, 1), (3, 9, 3),
        (4, 7, 1), (4, 9, 3), (4, 10, 4),
        (5, 7, 1), (5, 9, 3), (5, 10, 4),
        (6, 8, 2), (6, 10, 4),
    ),
    5: (  # Misolidio - D7 - IX - frets 9-13
        (1, 10, 1), (1, 12, 3),
        (2, 10, 1), (2, 12, 3), (2, 13, 4),
        (3, 9, 1), (3, 11, 3), (3, 12, 4),
        (4, 9, 1), (4, 10, 2), (4, 12, 4),
        (5, 9, 1), (5, 10, 2), (5, 12, 4),
        (6, 10, 2), (6, 12, 4),
    ),
    6: (  # Eolio - Em - XI - frets 11-15
        #
        # String 4 is fingered 1-3, where the sheet has 2-4. A deliberate change, not a
        # transcription slip: the sheet's fingering keeps the hand back at fret 11 for
        # this string, but string 4's lowest note here is fret 12, so there is nothing
        # down there to reach for. Fingering it from 12 leaves string 3 as the only place
        # in the box where the hand has to move.
        (1, 12, 1), (1, 14, 3), (1, 15, 4),
        (2, 12, 1), (2, 13, 2), (2, 15, 4),
        (3, 11, 1), (3, 12, 2), (3, 14, 4),
        (4, 12, 1), (4, 14, 3),
        (5, 12, 1), (5, 14, 3), (5, 15, 4),
        (6, 12, 1), (6, 14, 3), (6, 15, 4),
    ),
    7: (  # Locrio - F#m7b5 - II - frets 2-5. Ionico's box exactly, plus the low E's fret
        # 2: that note is F#, which is Locrio's root, so here the box starts a fret lower.
        (1, 2, 1), (1, 3, 2), (1, 5, 4),
        (2, 3, 2), (2, 5, 4),
        (3, 2, 1), (3, 4, 3), (3, 5, 4),
        (4, 2, 1), (4, 4, 3), (4, 5, 4),
        (5, 2, 1), (5, 3, 2), (5, 5, 4),
        (6, 2, 1), (6, 3, 2), (6, 5, 4),
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


#: Which modal boxes yield a pentatonic position, in fret order.
#:
#: Take the 4th and 7th out of a modal box and what remains is the pentatonic in that
#: position -- two notes on every string, the same fingering, the same place on the neck.
#: The seven modes occupy only five distinct windows, which is exactly the number of
#: pentatonic positions, and that is not a coincidence: they are the same five shapes.
#:
#: Ionico and Locrio share a window and collapse to one box once the 7th goes, since the
#: only note separating them *was* the 7th. Frigio and Lidio share a window too, but
#: Lidio loses its lowest note with the 4th and ends up with a single note on the low E,
#: so Frigio is the one that carries that position.
PENTATONIC_FROM: tuple[int, ...] = (1, 2, 3, 5, 6)


@dataclass(frozen=True)
class Pentatonic:
    """One pentatonic position: a modal box with the 4th and 7th removed."""

    key: str  #: the key you asked for -- and the root you hear
    minor: bool
    parent: str  #: the major key whose notes these are; == key when major
    index: int  #: 1..5, numbered from the shape that starts on the root
    from_mode: str  #: the modal box it is carved out of, e.g. "Ionico"
    #: Semitones the parent modal box is moved by to place this shape on the neck. A box
    #: is a shape and repeats every octave; this picks which copy of it you are shown.
    octave_shift: int
    relative: str  #: the same notes under their other name
    position: int
    clipped: int = 0

    @property
    def label(self) -> str:
        return f"{ORDINALS[self.index - 1]} shape"

    @property
    def name(self) -> str:
        return f"{self.key} {'minor' if self.minor else 'major'} pentatonic"

    @property
    def detail(self) -> str:
        bits = [f"{self.key} {'min' if self.minor else 'maj'}",
                f"rel. {self.relative}", f"pos {_roman(self.position)}"]
        if self.clipped:
            bits.append(f"{self.clipped} frets off the neck")
        return " · ".join(bits)


#: How the five shapes are labelled, in the order a sheet numbers them.
ORDINALS = ("1st", "2nd", "3rd", "4th", "5th")


def key_pentatonics(key: str, minor: bool = False, max_fret: int = 12) -> list[Pentatonic]:
    """The five pentatonic positions of ``key``, major or minor, running up the neck.

    **The minor pentatonic of A is A minor pentatonic**, not the relative minor of A
    major. Ask for the minor pentatonic in a key and you mean the one rooted on that key;
    its *notes* come from the relative major three semitones up, which is why the boxes are
    carved out of that key's modal shapes rather than this one's.

    Numbering starts at the shape that begins on the root -- the one whose lowest note on
    the low E string is the tonic -- and the rest follow it up the neck. That is where a
    teaching sheet starts counting, and it is the only starting point that is a property
    of the scale rather than of where the frets happen to fall.
    """
    parent = transpose(key, 3) if minor else key
    by_degree = {m.degree: m for m in key_modes(parent, max_fret=24)}

    # Each shape repeats every octave, so first bring every one down to its lowest
    # playable copy; then they can be ordered without an arbitrary octave getting in the
    # way. Without this the boxes come out scattered over three octaves in whatever order
    # the modal positions happened to land.
    canon: list[tuple[Mode, int]] = []
    for degree in PENTATONIC_FROM:
        m = by_degree[degree]
        shift = 0
        while m.position + shift - 12 >= 0:
            shift -= 12
        canon.append((m, shift))
    canon.sort(key=lambda t: t[0].position + t[1])

    root_chroma = chroma(key)
    first = 0
    for i, (m, shift) in enumerate(canon):
        low = [p.fret for p in _pentatonic_notes(m, parent, 24) if p.string == 6]
        if low and chroma_at(6, min(low) + shift) == root_chroma:
            first = i
            break

    ordered = canon[first:] + canon[:first]
    out: list[Pentatonic] = []
    previous = -99
    for index, (m, shift) in enumerate(ordered, start=1):
        while m.position + shift < previous:  # keep them ascending, not wrapping round
            shift += 12
        previous = m.position + shift
        notes = _pentatonic_notes(m, parent, 24)
        hi = max(p.fret for p in notes) + shift
        lo = min(p.fret for p in notes) + shift
        # A shape that runs off the end goes back an octave, if there is room for it
        # down there. On a twelve-fret neck that puts the last two shapes low -- which is
        # what a teaching sheet does with them too, for the same reason.
        while hi > max_fret and lo - 12 >= 0:
            shift, lo, hi = shift - 12, lo - 12, hi - 12
        # The relative of a minor key is its parent major (A minor -> C major); of a major
        # key it is the sixth degree (A major -> F# minor). Not the same interval, and
        # getting it backwards labels every minor box with a key three semitones wrong.
        relative = (f"{parent} major" if minor else f"{transpose(key, 9)} minor")
        # The pentatonic's own first fret, not the modal window's. The window can open a
        # fret earlier on a note the pentatonic drops, and reporting that would put every
        # position label one out.
        out.append(Pentatonic(
            key=key, minor=minor, parent=parent, index=index, from_mode=m.italian,
            relative=relative, position=lo, clipped=max(0, hi - max_fret),
            octave_shift=shift))
    return out


def _pentatonic_notes(mode: Mode, parent: str, max_fret: int) -> tuple[FretPosition, ...]:
    """A modal box with the parent key's 4th and 7th taken out. Roots not yet assigned."""
    dropped = {(chroma(parent) + 5) % 12, (chroma(parent) + 11) % 12}
    return tuple(p for p in mode_box(mode, max_fret=max_fret)
                 if chroma_at(p.string, p.fret) not in dropped)


def pentatonic_box(pent: Pentatonic, max_fret: int = 12) -> tuple[FretPosition, ...]:
    """The notes of one pentatonic position, fingered as its parent modal box is.

    Major and minor share every shape -- A minor pentatonic and C major pentatonic are one
    scale -- so what the flavour decides is which note is marked as home, not where your
    fingers go.
    """
    mode = next(m for m in key_modes(pent.parent, max_fret=24)
                if m.italian == pent.from_mode)
    root_chroma = chroma(pent.key)
    return tuple(
        FretPosition(string=p.string, fret=p.fret + pent.octave_shift, finger=p.finger,
                     is_root=chroma_at(p.string, p.fret) == root_chroma)
        for p in _pentatonic_notes(mode, pent.parent, 24)
        if 0 <= p.fret + pent.octave_shift <= max_fret
    )


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
