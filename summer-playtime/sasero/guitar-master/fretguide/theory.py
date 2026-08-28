"""Music theory: (string, fret) -> note, plus scale/chord pitch-class sets.

Hand-rolled rather than pulling in a library. The v1 TypeScript used `tonal`; the
Python equivalents are all heavier than the ~80 lines of interval arithmetic actually
needed here, and this way the maths is unit-tested in place.

Conventions: string 1 = high E ... 6 = low E; fret 0 = open. Standard tuning.
Comparisons are done by *chroma* (0-11) so enharmonic spellings (F# vs Gb) match.
"""

from __future__ import annotations

from .types import ChordVoicing, FretPosition, ScaleBox, StringNumber, ValidationIssue

#: Open-string notes in standard tuning, scientific pitch notation.
OPEN_NOTES: dict[StringNumber, str] = {6: "E2", 5: "A2", 4: "D3", 3: "G3", 2: "B3", 1: "E4"}

_LETTER_SEMITONE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
_SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

#: Chord quality -> semitone intervals from the root.
CHORD_INTERVALS: dict[str, tuple[int, ...]] = {
    "": (0, 4, 7),  # major
    "maj": (0, 4, 7),
    "m": (0, 3, 7),  # minor
    "min": (0, 3, 7),
    "dim": (0, 3, 6),
    "aug": (0, 4, 8),
    "7": (0, 4, 7, 10),  # dominant 7th
    "m7": (0, 3, 7, 10),
    "min7": (0, 3, 7, 10),
    "maj7": (0, 4, 7, 11),
    "dim7": (0, 3, 6, 9),
    "m7b5": (0, 3, 6, 10),
    "sus2": (0, 2, 7),
    "sus4": (0, 5, 7),
}

#: Scale name -> semitone intervals from the root.
SCALE_INTERVALS: dict[str, tuple[int, ...]] = {
    "major": (0, 2, 4, 5, 7, 9, 11),
    "ionian": (0, 2, 4, 5, 7, 9, 11),
    "dorian": (0, 2, 3, 5, 7, 9, 10),
    "phrygian": (0, 1, 3, 5, 7, 8, 10),
    "lydian": (0, 2, 4, 6, 7, 9, 11),
    "mixolydian": (0, 2, 4, 5, 7, 9, 10),
    "aeolian": (0, 2, 3, 5, 7, 8, 10),
    "minor": (0, 2, 3, 5, 7, 8, 10),  # natural minor
    "natural minor": (0, 2, 3, 5, 7, 8, 10),
    "locrian": (0, 1, 3, 5, 6, 8, 10),
    "harmonic minor": (0, 2, 3, 5, 7, 8, 11),
    "melodic minor": (0, 2, 3, 5, 7, 9, 11),
    "major pentatonic": (0, 2, 4, 7, 9),
    "minor pentatonic": (0, 3, 5, 7, 10),
    "blues": (0, 3, 5, 6, 7, 10),
    "chromatic": tuple(range(12)),
}


def parse_note(name: str) -> tuple[int, int | None]:
    """Parse a note name -> ``(chroma, octave or None)``. Accepts 'F#', 'Bb', 'E2'."""
    s = name.strip()
    if not s:
        raise ValueError("empty note name")
    letter = s[0].upper()
    if letter not in _LETTER_SEMITONE:
        raise ValueError(f"bad note name: {name!r}")
    semi = _LETTER_SEMITONE[letter]
    i = 1
    while i < len(s) and s[i] in "#b♯♭":
        semi += 1 if s[i] in "#♯" else -1
        i += 1
    octave = int(s[i:]) if i < len(s) and (s[i:].lstrip("-").isdigit()) else None
    return semi % 12, octave


def chroma(name: str) -> int:
    """Chroma (0-11) of a note or pitch-class name."""
    return parse_note(name)[0]


def pitch_to_midi(name: str) -> int:
    """MIDI number of a note with an octave, e.g. 'E2' -> 40."""
    c, octave = parse_note(name)
    if octave is None:
        raise ValueError(f"{name!r} has no octave")
    # Preserve the letter's own octave semantics: C4 = 60.
    return c + (octave + 1) * 12


def midi_to_name(midi: int) -> str:
    """MIDI number -> sharp-spelled note name with octave, e.g. 40 -> 'E2'."""
    return f"{_SHARP_NAMES[midi % 12]}{midi // 12 - 1}"


def note_at(string: StringNumber, fret: int) -> str:
    """Note (with octave) sounding at a string/fret in standard tuning."""
    return midi_to_name(pitch_to_midi(OPEN_NOTES[string]) + fret)


def pitch_class_at(string: StringNumber, fret: int) -> str:
    """Pitch class (no octave) at a string/fret, e.g. 'G', 'F#'."""
    return _SHARP_NAMES[chroma_at(string, fret)]


def chroma_at(string: StringNumber, fret: int) -> int:
    """Chroma (0-11) at a string/fret."""
    return (pitch_to_midi(OPEN_NOTES[string]) + fret) % 12


def split_chord_name(name: str) -> tuple[str, str]:
    """Split a chord name into ``(root, quality_suffix)``, e.g. 'F#dim' -> ('F#', 'dim')."""
    s = name.strip()
    i = 1
    while i < len(s) and s[i] in "#b♯♭":
        i += 1
    return s[:i], s[i:]


def chord_chromas(name: str) -> set[int]:
    """Chromas of a chord, e.g. 'Am' -> {9, 0, 4}."""
    root, suffix = split_chord_name(name)
    if suffix not in CHORD_INTERVALS:
        raise ValueError(f"unknown chord quality {suffix!r} in {name!r}")
    r = chroma(root)
    return {(r + i) % 12 for i in CHORD_INTERVALS[suffix]}


def chord_pitch_classes(name: str) -> list[str]:
    """Pitch classes of a chord in interval order, e.g. 'Am' -> ['A', 'C', 'E']."""
    root, suffix = split_chord_name(name)
    r = chroma(root)
    return [_SHARP_NAMES[(r + i) % 12] for i in CHORD_INTERVALS[suffix]]


def scale_chromas(root: str, scale_name: str) -> set[int]:
    """Chromas of a scale, e.g. ('G', 'major')."""
    key = scale_name.strip().lower()
    if key not in SCALE_INTERVALS:
        raise ValueError(f"unknown scale {scale_name!r}")
    r = chroma(root)
    return {(r + i) % 12 for i in SCALE_INTERVALS[key]}


def scale_pitch_classes(root: str, scale_name: str) -> list[str]:
    """Pitch classes of a scale in interval order."""
    key = scale_name.strip().lower()
    r = chroma(root)
    return [_SHARP_NAMES[(r + i) % 12] for i in SCALE_INTERVALS[key]]


def chroma_set(notes) -> set[int]:
    """The set of chromas spanned by a list of pitch-class / note names."""
    return {chroma(n) for n in notes}


# --------------------------------------------------------------------------- #
# Neck-wide generation — what v1 deferred, and what makes "any scale" possible
# --------------------------------------------------------------------------- #


def scale_positions(
    root: str,
    scale_name: str,
    min_fret: int = 0,
    max_fret: int = 12,
    strings: tuple[StringNumber, ...] = (6, 5, 4, 3, 2, 1),
) -> tuple[FretPosition, ...]:
    """Every position of a scale on the neck within a fret range.

    This is the general engine the v1 TypeScript deliberately left out (it shipped a
    single hard-coded G-major box). Fingerings are not assigned — for a neck-wide
    map the useful information is which notes belong to the scale and which are
    roots, not which finger to use.
    """
    allowed = scale_chromas(root, scale_name)
    root_chroma = chroma(root)
    out: list[FretPosition] = []
    for s in strings:
        for f in range(min_fret, max_fret + 1):
            c = chroma_at(s, f)
            if c in allowed:
                out.append(FretPosition(string=s, fret=f, is_root=(c == root_chroma)))
    return tuple(out)


# --------------------------------------------------------------------------- #
# Validation of curated data
# --------------------------------------------------------------------------- #


def validate_chord(voicing: ChordVoicing) -> list[ValidationIssue]:
    """Every sounding position in a voicing must produce a note belonging to the chord."""
    allowed = chord_chromas(voicing.name)
    names = ", ".join(chord_pitch_classes(voicing.name))
    issues: list[ValidationIssue] = []

    def check(s: StringNumber, f: int) -> None:
        if chroma_at(s, f) not in allowed:
            issues.append(
                ValidationIssue(s, f, note_at(s, f), f"note not in {voicing.name} ({names})")
            )

    for p in voicing.positions:
        check(p.string, p.fret)
    for s in voicing.open:
        check(s, 0)
    return issues


def validate_scale(box: ScaleBox) -> list[ValidationIssue]:
    """Every position in a scale box must produce a note in the scale."""
    allowed = scale_chromas(box.root, box.scale_name)
    return [
        ValidationIssue(p.string, p.fret, note_at(p.string, p.fret),
                        f"note not in {box.root} {box.scale_name}")
        for p in box.positions
        if chroma_at(p.string, p.fret) not in allowed
    ]


def validate_roots(root_pitch_class: str, positions) -> list[ValidationIssue]:
    """Positions flagged ``is_root`` must actually sound the root pitch class."""
    rc = chroma(root_pitch_class)
    return [
        ValidationIssue(p.string, p.fret, note_at(p.string, p.fret),
                        f"flagged root but is not {root_pitch_class}")
        for p in positions
        if p.is_root and chroma_at(p.string, p.fret) != rc
    ]
