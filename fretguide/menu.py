"""What you can practise, and how you move through it. No drawing, no toolkit.

The catalogue is large enough to need structure: 7 curated chord voicings, and every one
of 11 scale types in all 12 keys, which is 132 scales. A flat list of 139 things is not a
menu, it is a phone book.

So it is two columns. The left holds Chords plus the twelve roots; the right holds
whatever that choice contains, in labelled groups. Picking a key and then a mode is the
order you practise in -- you are working in A today, and you want to see what fits.

**This module knows nothing about how it is displayed.** It is pure state and pure
Python, so it can be tested exhaustively here, and so the OpenCV app and the native shell
can render the same menu without sharing a line of drawing code. The rendering is the
cheap half; this is the half worth getting right and only writing once.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .content import CHORD_IDS
from .modes import key_modes, key_pentatonics
from .theory import _SHARP_NAMES
from .types import Selection

#: Roots, starting at A. The chromatic table starts at C, but guitarists count from A --
#: it is the open fifth string, the reference pitch, and where every book starts.
ROOTS: tuple[str, ...] = tuple(_SHARP_NAMES[9:] + _SHARP_NAMES[:9])

#: Scales offered whole-neck, after the modal and pentatonic boxes. Unlike the modes
#: these really are different note sets, so a full-neck map is the useful view of them --
#: and it keeps the minor pentatonic reachable when you want the whole thing rather than
#: one position.
WHOLE_NECK: tuple[tuple[str, str], ...] = (
    ("Major pentatonic", "major pentatonic"),
    ("Minor pentatonic", "minor pentatonic"),
    ("Blues", "blues"),
    ("Harmonic minor", "harmonic minor"),
)

CHORDS_GROUP = "Chords"


@dataclass(frozen=True)
class Row:
    """One line in a column. ``selection`` is None for a group heading.

    ``detail`` is the second line a renderer may show under the label -- for a mode, the
    root, the chord it belongs over and the position. That is not decoration: those three
    facts are the entire difference between one mode of a key and another.
    """

    label: str
    selection: Selection | None = None
    heading: bool = False
    detail: str = ""

    @property
    def selectable(self) -> bool:
        return self.selection is not None or not self.heading


def left_rows() -> list[Row]:
    """The left column: Chords, then the twelve roots."""
    rows = [Row(CHORDS_GROUP)]
    rows += [Row(r) for r in ROOTS]
    return rows


def right_rows(left_label: str, max_fret: int = 12) -> list[Row]:
    """The right column: chord voicings, or everything inside one key.

    The modes come first and come as boxes. Listing them as "A dorian, A lydian, ..." was
    the earlier design and it could not work: every mode of a key is the same note set, so
    on a whole-neck map all seven are the same picture. Shown as degrees of a key -- with
    the chord each belongs over and the position each is played at -- they are seven
    distinct shapes in seven distinct places, which is what a teacher draws and what makes
    them learnable. See :mod:`fretguide.modes`.
    """
    if left_label == CHORDS_GROUP:
        return [Row(cid, Selection("chord", cid)) for cid in CHORD_IDS]

    rows: list[Row] = [Row(f"Modes of {left_label}", heading=True)]
    for m in key_modes(left_label, max_fret=max_fret):
        rows.append(Row(m.label, Selection("mode_box", f"{left_label}:{m.degree}"),
                        detail=m.detail))

    pents = key_pentatonics(left_label, max_fret=max_fret)
    rows.append(Row(f"Pentatonic — {left_label} maj / {pents[0].relative_minor} min",
                    heading=True))
    for pent in pents:
        rows.append(Row(pent.label, Selection("penta_box", f"{left_label}:{pent.index}:"),
                        detail=pent.detail))

    rows.append(Row("Whole neck", heading=True))
    for label, scale_name in WHOLE_NECK:
        rows.append(Row(label, Selection("scale_generated", f"{left_label} {scale_name}")))
    return rows


@dataclass
class Menu:
    """Cursor state over the two columns.

    Moving the cursor *applies* the selection rather than merely highlighting it, so the
    overlay changes on the real fretboard as you move through the list. Committing to a
    choice you cannot see would be the wrong way round for this app: the whole product is
    that you look at the guitar, not at the UI.
    """

    open: bool = False
    #: 0 = left column has focus, 1 = right.
    column: int = 0
    left_index: int = 0
    right_index: int = 0
    _left: list[Row] = field(default_factory=left_rows, init=False)
    _right: list[Row] = field(default_factory=list, init=False)

    def __post_init__(self) -> None:
        self._rebuild_right()

    # -- content ------------------------------------------------------------ #

    @property
    def left(self) -> list[Row]:
        return self._left

    @property
    def right(self) -> list[Row]:
        return self._right

    @property
    def left_label(self) -> str:
        return self._left[self.left_index].label

    def _rebuild_right(self) -> None:
        self._right = right_rows(self.left_label)
        self.right_index = self._nearest_selectable(self.right_index)

    def _nearest_selectable(self, start: int) -> int:
        """Group headings are not landing spots; slide off them rather than stopping."""
        if not self._right:
            return 0
        n = len(self._right)
        start = max(0, min(start, n - 1))
        for offset in range(n):
            for i in (start + offset, start - offset):
                if 0 <= i < n and self._right[i].selection is not None:
                    return i
        return 0

    # -- what is currently chosen ------------------------------------------- #

    def selection(self) -> Selection | None:
        row = self._right[self.right_index] if self._right else None
        return row.selection if row else None

    def sync_to(self, selection: Selection) -> bool:
        """Move the cursor onto ``selection`` if the catalogue contains it.

        Lets the menu open showing what is already on screen instead of resetting to the
        top, and keeps it honest when a hotkey changed the selection behind its back.
        """
        for li, lrow in enumerate(self._left):
            for ri, rrow in enumerate(right_rows(lrow.label)):
                if rrow.selection == selection:
                    self.left_index, self.right_index = li, ri
                    self._rebuild_right()
                    self.right_index = ri
                    return True
        return False

    # -- movement ----------------------------------------------------------- #

    def move(self, delta: int) -> None:
        """Up/down within the focused column."""
        if self.column == 0:
            self.left_index = (self.left_index + delta) % len(self._left)
            self._rebuild_right()
        elif self._right:
            i = self.right_index
            for _ in range(len(self._right)):
                i = (i + delta) % len(self._right)
                if self._right[i].selection is not None:
                    break
            self.right_index = i

    def focus(self, column: int) -> None:
        self.column = 0 if column <= 0 else 1

    def click(self, column: int, index: int) -> bool:
        """Mouse. Returns True if the click landed on something selectable."""
        rows = self._left if column == 0 else self._right
        if not 0 <= index < len(rows):
            return False
        if column == 0:
            self.column, self.left_index = 0, index
            self._rebuild_right()
            return True
        if rows[index].selection is None:
            return False  # a group heading; ignore rather than move the cursor oddly
        self.column, self.right_index = 1, index
        return True

    def toggle(self) -> None:
        self.open = not self.open


# --------------------------------------------------------------------------- #
# Layout — where the rows sit, in frame pixels. Still no toolkit.
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class Layout:
    """Row rectangles for the two columns, in the coordinates of the frame drawn on.

    Kept here rather than in the drawing code so that hit-testing is decidable: a menu
    whose clicks land one row off is not something you want to debug by clicking at it.
    Both renderers ask this for the rectangles and then only paint them.
    """

    x: int = 24
    y: int = 60
    row_h: int = 30
    left_w: int = 150
    right_w: int = 260
    pad: int = 8

    @classmethod
    def for_frame(cls, width: int, height: int, anchor: str = "left") -> Layout:
        """Scale with the frame, so the menu is the same size relative to the video.

        The frame is 1920 wide in the app and 640 in a test; a menu in fixed pixels would
        be unreadable in one and cover the neck in the other.

        ``anchor`` puts the panel against the left or right edge — see
        :func:`preferred_anchor`, which keeps it off the fretboard.
        """
        k = max(0.5, min(2.0, width / 1280))
        margin, left_w, right_w, pad = int(24 * k), int(150 * k), int(260 * k), int(8 * k)
        x = margin if anchor == "left" else width - (left_w + right_w + pad * 2) - margin
        return cls(x=max(0, x), y=int(60 * k), row_h=int(30 * k),
                   left_w=left_w, right_w=right_w, pad=pad)

    def column_x(self, column: int) -> int:
        return self.x + self.pad if column == 0 else self.x + self.pad + self.left_w

    def column_w(self, column: int) -> int:
        return self.left_w if column == 0 else self.right_w

    def row_rect(self, column: int, index: int) -> tuple[int, int, int, int]:
        """(x, y, w, h) of one row."""
        return (self.column_x(column), self.y + self.pad + index * self.row_h,
                self.column_w(column), self.row_h)

    def panel_rect(self, menu: Menu) -> tuple[int, int, int, int]:
        # One extra row for the footer, which carries the current mode's root, its chord
        # and its position. Those three facts are the whole difference between one mode of
        # a key and another, so there has to be room for them.
        rows = max(len(menu.left), len(menu.right)) + 1
        return (self.x, self.y,
                self.left_w + self.right_w + self.pad * 2,
                rows * self.row_h + self.pad * 2)

    def footer_rect(self, menu: Menu) -> tuple[int, int, int, int]:
        rows = max(len(menu.left), len(menu.right))
        return (self.column_x(0), self.y + self.pad + rows * self.row_h,
                self.left_w + self.right_w, self.row_h)

    def hit(self, px: float, py: float, menu: Menu) -> tuple[int, int] | None:
        """Which (column, row) a point falls in, or None for outside the panel.

        Returns the row even when it is a heading; :meth:`Menu.click` decides that such a
        click does nothing. Separating "where did they click" from "what does it mean"
        keeps this function about geometry alone.
        """
        bx, by, bw, bh = self.panel_rect(menu)
        if not (bx <= px < bx + bw and by <= py < by + bh):
            return None
        column = 0 if px < self.column_x(1) else 1
        rows = menu.left if column == 0 else menu.right
        index = int((py - self.y - self.pad) // self.row_h)
        if not 0 <= index < len(rows):
            return None
        return column, index


def preferred_anchor(board_points, width: int, height: int, menu: Menu) -> str:
    """Which edge to put the menu against: whichever hides less of the fretboard.

    A menu that covers the neck defeats itself — you open it to choose a scale and it
    hides the notes it just drew. The neck is a long diagonal, so one side is always
    emptier, but *which* side is not simply "opposite the centroid": the panel is a tall
    rectangle in one corner, and a neck can sit centrally while overlapping one corner far
    more than the other. So both candidate positions are actually measured.

    ``board_points`` is any set of image-space points covering the board — the projected
    fret grid does nicely. Passing None (no pose) puts it on the left.

    Decided once when the menu opens, not per frame. The guitar drifts, and a panel that
    hopped sides mid-selection would be far worse than one occasionally over the neck.
    """
    if board_points is None or len(board_points) == 0:
        return "left"
    pts = np.asarray(board_points, dtype=float).reshape(-1, 2)

    def covered(anchor: str) -> int:
        bx, by, bw, bh = Layout.for_frame(width, height, anchor).panel_rect(menu)
        inside = ((pts[:, 0] >= bx) & (pts[:, 0] < bx + bw)
                  & (pts[:, 1] >= by) & (pts[:, 1] < by + bh))
        return int(inside.sum())

    # Ties go left: with nothing to choose between them, the same side every time is less
    # surprising than one that depends on sub-pixel drift.
    return "right" if covered("right") < covered("left") else "left"
