"""Curated content: chord voicings and scale boxes, plus selection resolution.

The curated voicings are ported verbatim from the v1 TypeScript (PRD Appendix A) and
are validated against theory by the test suite — every fretted or open position must
sound a note belonging to its chord.

Chords stay curated on purpose: `theory` can tell you a chord's *notes*, but not a
playable *fingering*. Generating those needs playability constraints (hand span,
barre feasibility, muting), which is real work — see "future" at the bottom.
Scales, by contrast, are now generated for any root and any scale name.
"""

from __future__ import annotations

from .theory import scale_positions
from .types import ChordVoicing, FretPosition, ResolvedSelection, ScaleBox, Selection

# --------------------------------------------------------------------------- #
# Scale boxes (curated, one-finger-per-fret shapes)
# --------------------------------------------------------------------------- #

#: G major (Ionian), box at frets 2-5. 2-octave shape, index on fret 2. Root = G.
G_MAJOR_BOX = ScaleBox(
    name="G major (Ionian) — box, frets 2–5",
    root="G",
    scale_name="major",
    positions=(
        # String 6 (low E): G, A
        FretPosition(6, 3, finger=2, is_root=True),
        FretPosition(6, 5, finger=4),
        # String 5 (A): B, C, D
        FretPosition(5, 2, finger=1),
        FretPosition(5, 3, finger=2),
        FretPosition(5, 5, finger=4),
        # String 4 (D): E, F#, G
        FretPosition(4, 2, finger=1),
        FretPosition(4, 4, finger=3),
        FretPosition(4, 5, finger=4, is_root=True),
        # String 3 (G): A, B, C
        FretPosition(3, 2, finger=1),
        FretPosition(3, 4, finger=3),
        FretPosition(3, 5, finger=4),
        # String 2 (B): D, E
        FretPosition(2, 3, finger=2),
        FretPosition(2, 5, finger=4),
        # String 1 (high E): F#, G, A
        FretPosition(1, 2, finger=1),
        FretPosition(1, 3, finger=2, is_root=True),
        FretPosition(1, 5, finger=4),
    ),
)

SCALES: dict[str, ScaleBox] = {"g-major-box": G_MAJOR_BOX}

# --------------------------------------------------------------------------- #
# Chord voicings — diatonic triads of G major
# --------------------------------------------------------------------------- #
# Notation per string, low E (6) -> high E (1): number = fretted, 0 = open, x = muted.

CHORDS: dict[str, ChordVoicing] = {
    # G major  `3 2 0 0 0 3`
    "G": ChordVoicing(
        name="G",
        quality="major",
        positions=(
            FretPosition(6, 3, finger=2, is_root=True),
            FretPosition(5, 2, finger=1),
            FretPosition(1, 3, finger=3, is_root=True),
        ),
        open=(4, 3, 2),
        muted=(),
    ),
    # Am  `x 0 2 2 1 0`
    "Am": ChordVoicing(
        name="Am",
        quality="minor",
        positions=(
            FretPosition(5, 0, is_root=True),
            FretPosition(4, 2, finger=2),
            FretPosition(3, 2, finger=3),
            FretPosition(2, 1, finger=1),
        ),
        open=(5, 1),
        muted=(6,),
    ),
    # Bm (barre)  `x 2 4 4 3 2` — the two finger-1 positions are the single barred index
    "Bm": ChordVoicing(
        name="Bm",
        quality="minor",
        base_fret=2,
        positions=(
            FretPosition(5, 2, finger=1, is_root=True),
            FretPosition(4, 4, finger=3),
            FretPosition(3, 4, finger=4),
            FretPosition(2, 3, finger=2),
            FretPosition(1, 2, finger=1),
        ),
        open=(),
        muted=(6,),
    ),
    # C major  `x 3 2 0 1 0`
    "C": ChordVoicing(
        name="C",
        quality="major",
        positions=(
            FretPosition(5, 3, finger=3, is_root=True),
            FretPosition(4, 2, finger=2),
            FretPosition(2, 1, finger=1),
        ),
        open=(3, 1),
        muted=(6,),
    ),
    # D major  `x x 0 2 3 2`
    "D": ChordVoicing(
        name="D",
        quality="major",
        positions=(
            FretPosition(4, 0, is_root=True),
            FretPosition(3, 2, finger=1),
            FretPosition(2, 3, finger=3),
            FretPosition(1, 2, finger=2),
        ),
        open=(4,),
        muted=(6, 5),
    ),
    # Em  `0 2 2 0 0 0`
    "Em": ChordVoicing(
        name="Em",
        quality="minor",
        positions=(
            FretPosition(6, 0, is_root=True),
            FretPosition(5, 2, finger=2),
            FretPosition(4, 2, finger=3),
        ),
        open=(6, 3, 2, 1),
        muted=(),
    ),
    # F#dim  `x x 4 2 1 2` — voicing F#-A-C-F#; hardest shape, do not substitute
    "F#dim": ChordVoicing(
        name="F#dim",
        quality="diminished",
        positions=(
            FretPosition(4, 4, finger=4, is_root=True),
            FretPosition(3, 2, finger=2),
            FretPosition(2, 1, finger=1),
            FretPosition(1, 2, finger=3, is_root=True),
        ),
        open=(),
        muted=(6, 5),
    ),
}

#: Ordered ids for the UI selectors.
SCALE_IDS: list[str] = ["g-major-box"]
CHORD_IDS: list[str] = ["G", "Am", "Bm", "C", "D", "Em", "F#dim"]


def resolve_selection(sel: Selection, max_fret: int = 12) -> ResolvedSelection | None:
    """Resolve a selection to the renderable position set, or None if the id is unknown.

    ``mode="scale_generated"`` takes an id of the form ``"<root> <scale name>"``, e.g.
    ``"A minor pentatonic"``, and maps the whole neck rather than a single box.
    """
    if sel.mode == "scale":
        box = SCALES.get(sel.id)
        if box is None:
            return None
        return ResolvedSelection(name=box.name, positions=box.positions)

    if sel.mode == "scale_generated":
        root, _, scale_name = sel.id.partition(" ")
        if not root or not scale_name:
            return None
        try:
            positions = scale_positions(root, scale_name, 0, max_fret)
        except ValueError:
            return None
        return ResolvedSelection(name=f"{root} {scale_name}", positions=positions)

    chord = CHORDS.get(sel.id)
    if chord is None:
        return None
    return ResolvedSelection(
        name=chord.name,
        positions=chord.positions,
        open=chord.open,
        muted=chord.muted,
        base_fret=chord.base_fret,
    )


# Future: generate chord fingerings (CAGED movable shapes plus playability scoring)
# instead of curating them, so any chord can be shown anywhere on the neck.
