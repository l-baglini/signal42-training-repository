"""Core domain types.

INVARIANTS — keep these consistent everywhere:
  - String numbering: 1 = high E (thinnest) ... 6 = low E (thickest). Fret 0 = open.
  - Fingers: 1 = index, 2 = middle, 3 = ring, 4 = pinky.
  - Fretboard space (u, v) is a normalised flat rectangle that a homography maps to pixels:
      u in [0, 1] along the neck: u = 0 at the NUT, increasing toward the bridge.
      v in [0, 1] across the neck: v = 0 at LOW E (string 6), v = 1 at HIGH E (string 1).

Framework-free and pure, so it is unit-testable in isolation.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

StringNumber = int  # 1..6, validated at construction where it matters
Finger = int  # 1..4

ChordQuality = Literal["major", "minor", "diminished", "augmented", "dominant7", "minor7", "major7"]


@dataclass(frozen=True)
class FretPosition:
    """A single finger placement, or an open-string root."""

    string: StringNumber
    fret: int  # 0 = open / nut
    finger: Finger | None = None  # absent for plain scale notes
    is_root: bool = False


@dataclass(frozen=True)
class ChordVoicing:
    name: str
    quality: ChordQuality
    positions: tuple[FretPosition, ...]
    open: tuple[StringNumber, ...] = ()  # strings played open -> draw "O"
    muted: tuple[StringNumber, ...] = ()  # strings not played -> draw "X"
    base_fret: int | None = None  # set for movable/barre shapes


@dataclass(frozen=True)
class ScaleBox:
    """A curated, fixed-position scale shape (one-finger-per-fret box)."""

    name: str
    root: str  # e.g. "G"
    scale_name: str  # e.g. "major"
    positions: tuple[FretPosition, ...]


@dataclass(frozen=True)
class UV:
    """A fretboard-space point."""

    u: float
    v: float


@dataclass(frozen=True)
class Point:
    """An image-space (pixel) point."""

    x: float
    y: float


@dataclass(frozen=True)
class Selection:
    """What the UI currently has selected."""

    #: ``mode_box`` is one mode of one key, played as a four-fret box: id is
    #: ``"<key>:<degree>"``, e.g. ``"G:2"`` for Dorian in the key of G. See
    #: :mod:`fretguide.modes` for why modes are addressed by key and degree rather than
    #: by their own root.
    mode: Literal["scale", "chord", "scale_generated", "mode_box", "penta_box"]
    id: str


@dataclass
class ResolvedSelection:
    """A selection resolved to a renderable set of positions."""

    name: str
    positions: tuple[FretPosition, ...]
    open: tuple[StringNumber, ...] = ()
    muted: tuple[StringNumber, ...] = ()
    base_fret: int | None = None


@dataclass
class ValidationIssue:
    string: StringNumber
    fret: int
    note: str
    reason: str


@dataclass
class TrackerStatus:
    """Live tracking state surfaced to the UI."""

    locked: bool
    inliers: int = 0
    spread: float = 0.0  # fraction of the neck the inliers span; see geometry.inlier_spread
    reason: str = ""
    stale_ms: float = 0.0
    fields: dict = field(default_factory=dict)
