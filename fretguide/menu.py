"""What you can practise, and how you move through it. No drawing, no toolkit.

The catalogue is a tree, browsed as columns: choose in one column and the next shows what
is inside. Chords sit one level down; scales sit under a key, then under what kind of
scale, then the individual shape.

    Chords ─── G, Am, Bm, C, D, Em, F#dim
    Scales ─── C, C#, D … ─── Modals ─────────── I Ionian … VII Locrian
                              Minor pentatonic ─ 1st … 5th shape
                              Major pentatonic ─ 1st … 5th shape
                              Whole neck ─────── Blues, Harmonic minor, …

A flat list will not do this. There are 12 keys and four kinds of scale in each, which is
several hundred things to practise; the tree is what keeps any one of them four keystrokes
away, and what keeps the panel short enough to sit beside the neck rather than over it.

**This module knows nothing about how it is displayed.** It is pure state and pure Python,
so it can be tested exhaustively here, and so the OpenCV app and the native shell can
render the same menu without sharing a line of drawing code. The rendering is the cheap
half; this is the half worth getting right and only writing once.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .content import CHORD_IDS
from .modes import key_modes, key_pentatonics
from .theory import _SHARP_NAMES
from .types import Selection

#: Keys, starting at A. The chromatic table underneath starts at C, but guitarists count
#: from A -- it is the open fifth string, the reference pitch, and where every book starts.
KEYS: tuple[str, ...] = tuple(_SHARP_NAMES[9:] + _SHARP_NAMES[:9])

#: Scales offered across the whole neck rather than as a shape. Unlike the modes and the
#: pentatonic positions these really are different note sets, so the full map is the useful
#: view of them.
WHOLE_NECK: tuple[tuple[str, str], ...] = (
    ("Major pentatonic", "major pentatonic"),
    ("Minor pentatonic", "minor pentatonic"),
    ("Blues", "blues"),
    ("Harmonic minor", "harmonic minor"),
)

ORDINALS = ("1st", "2nd", "3rd", "4th", "5th")


@dataclass(frozen=True)
class Node:
    """One entry. A branch has ``children``; a leaf has a ``selection``. Never both."""

    label: str
    selection: Selection | None = None
    children: tuple[Node, ...] = ()
    #: The second line a renderer may show for the highlighted entry -- for a mode, its
    #: root, the chord it belongs over and its position. Not decoration: those three facts
    #: are the entire difference between one mode of a key and another.
    detail: str = ""

    @property
    def is_branch(self) -> bool:
        return bool(self.children)


def _chord_nodes() -> tuple[Node, ...]:
    return tuple(Node(cid, selection=Selection("chord", cid)) for cid in CHORD_IDS)


def _key_node(key: str, max_fret: int) -> Node:
    modals = tuple(
        Node(m.label, selection=Selection("mode_box", f"{key}:{m.degree}"), detail=m.detail)
        for m in key_modes(key, max_fret=max_fret)
    )
    pents = key_pentatonics(key, max_fret=max_fret)

    def shapes(minor: bool) -> tuple[Node, ...]:
        flavour = "min" if minor else ""
        root = pents[0].relative_minor if minor else key
        return tuple(
            Node(f"{ORDINALS[p.index - 1]} shape",
                 selection=Selection("penta_box", f"{key}:{p.index}:{flavour}"),
                 detail=f"{root} · pos {_roman(p.position)} · from {p.from_mode}"
                        + (f" · {p.clipped} frets off the neck" if p.clipped else ""))
            for p in pents
        )

    whole = tuple(
        Node(label, selection=Selection("scale_generated", f"{key} {name}"))
        for label, name in WHOLE_NECK
    )
    return Node(key, children=(
        Node("Modals", children=modals),
        Node("Minor pentatonic", children=shapes(minor=True)),
        Node("Major pentatonic", children=shapes(minor=False)),
        Node("Whole neck", children=whole),
    ))


def build_root(max_fret: int = 12) -> tuple[Node, ...]:
    """The whole catalogue. Cheap enough to build outright -- a few hundred small nodes."""
    return (
        Node("Chords", children=_chord_nodes()),
        Node("Scales", children=tuple(_key_node(k, max_fret) for k in KEYS)),
    )


def _roman(n: int) -> str:
    if n <= 0:
        return "open"
    out = ""
    for sym, val in (("X", 10), ("IX", 9), ("V", 5), ("IV", 4), ("I", 1)):
        while n >= val:
            out += sym
            n -= val
    return out


@dataclass
class Menu:
    """A cursor over the tree, one index per visible column.

    Moving *applies* the selection rather than merely highlighting it, so the overlay
    changes on the real fretboard as you move. Committing to a choice you cannot see would
    be the wrong way round for this app: the whole product is that you look at the guitar,
    not at the UI.

    Indices deeper than the column you are moving in are kept, not reset, so stepping
    through keys holds your place in the mode list -- you are comparing the same shape
    across keys, and landing back at the top each time would make that the one thing the
    menu is bad at.
    """

    open: bool = False
    column: int = 0
    max_fret: int = 12
    _root: tuple[Node, ...] = field(default_factory=tuple, init=False)
    _path: list[int] = field(default_factory=list, init=False)

    def __post_init__(self) -> None:
        self._root = build_root(self.max_fret)
        self._path = []
        self._normalise()

    # -- structure ---------------------------------------------------------- #

    def _normalise(self) -> None:
        """Extend or trim the path so it names exactly one node per visible column."""
        path: list[int] = []
        nodes = self._root
        depth = 0
        while nodes:
            i = self._path[depth] if depth < len(self._path) else 0
            i = max(0, min(i, len(nodes) - 1))
            path.append(i)
            nodes = nodes[i].children
            depth += 1
        self._path = path
        self.column = max(0, min(self.column, len(path) - 1))

    @property
    def columns(self) -> list[tuple[Node, ...]]:
        """The visible columns, outermost first."""
        out = [self._root]
        for i, chosen in enumerate(self._path):
            node = out[i][chosen]
            if node.is_branch:
                out.append(node.children)
        return out

    def node_at(self, column: int) -> Node | None:
        cols = self.columns
        if not 0 <= column < len(cols):
            return None
        return cols[column][self._path[column]]

    def index_at(self, column: int) -> int:
        return self._path[column] if 0 <= column < len(self._path) else 0

    @property
    def trail(self) -> list[str]:
        """Labels of the chosen node in every column — the path you are standing on."""
        return [n.label for n in (self.node_at(i) for i in range(len(self.columns))) if n]

    # -- what is currently chosen ------------------------------------------- #

    def selection(self) -> Selection | None:
        """The deepest node on the path, which is always a leaf.

        Not the focused column's node: moving through keys should change what is drawn
        even though a key is a branch, because the mode you were looking at still applies
        in the new key.
        """
        leaf = self.node_at(len(self.columns) - 1)
        return leaf.selection if leaf else None

    def detail(self) -> str:
        leaf = self.node_at(len(self.columns) - 1)
        return leaf.detail if leaf else ""

    def sync_to(self, selection: Selection) -> bool:
        """Move the cursor onto ``selection`` if the catalogue contains it.

        Lets the menu open showing what is already on screen instead of resetting to the
        top, and keeps it honest when a hotkey changed the selection behind its back.
        """
        found = self._find(self._root, selection, [])
        if found is None:
            return False
        self._path = found
        self.column = len(found) - 1
        self._normalise()
        return True

    def _find(self, nodes, selection, prefix) -> list[int] | None:
        for i, node in enumerate(nodes):
            here = [*prefix, i]
            if node.selection == selection:
                return here
            if node.is_branch:
                deeper = self._find(node.children, selection, here)
                if deeper is not None:
                    return deeper
        return None

    # -- movement ----------------------------------------------------------- #

    def move(self, delta: int) -> None:
        """Up or down within the focused column, wrapping."""
        cols = self.columns
        n = len(cols[self.column])
        self._path[self.column] = (self._path[self.column] + delta) % n
        self._normalise()

    def descend(self) -> bool:
        """Into the next column, if the focused entry has one."""
        if self.column + 1 < len(self.columns):
            self.column += 1
            return True
        return False

    def ascend(self) -> bool:
        if self.column > 0:
            self.column -= 1
            return True
        return False

    def focus(self, column: int) -> None:
        self.column = max(0, min(column, len(self.columns) - 1))

    def click(self, column: int, index: int) -> bool:
        """Mouse. Returns True if the click landed on something."""
        cols = self.columns
        if not 0 <= column < len(cols) or not 0 <= index < len(cols[column]):
            return False
        self.column = column
        self._path[column] = index
        self._normalise()
        return True

    def toggle(self) -> None:
        self.open = not self.open


# --------------------------------------------------------------------------- #
# Layout — where the rows sit, in frame pixels. Still no toolkit.
# --------------------------------------------------------------------------- #

#: Width of each column at the baseline scale, widening as the entries get wordier:
#: "Scales", then a key, then "Minor pentatonic", then "III Phrygian".
COLUMN_WIDTHS: tuple[int, ...] = (110, 95, 175, 190)


@dataclass(frozen=True)
class Layout:
    """Row rectangles for the visible columns, in the coordinates of the frame drawn on.

    Kept here rather than in the drawing code so that hit-testing is decidable: a menu
    whose clicks land one row off is not something you want to debug by clicking at it.
    Both renderers ask this for the rectangles and then only paint them.
    """

    x: int = 24
    y: int = 60
    row_h: int = 30
    widths: tuple[int, ...] = COLUMN_WIDTHS
    pad: int = 8

    @classmethod
    def for_frame(cls, width: int, height: int, anchor: str = "left") -> Layout:
        """Scale with the frame, so the menu is the same size relative to the video.

        The frame is 1920 wide in the app and 640 in a test; a menu in fixed pixels would
        be unreadable in one and cover the neck in the other.
        """
        k = max(0.5, min(2.0, width / 1280))
        widths = tuple(int(w * k) for w in COLUMN_WIDTHS)
        margin, pad = int(24 * k), int(8 * k)
        x = margin if anchor == "left" else width - (sum(widths) + pad * 2) - margin
        return cls(x=max(0, x), y=int(60 * k), row_h=int(30 * k), widths=widths, pad=pad)

    def column_x(self, column: int) -> int:
        return self.x + self.pad + sum(self.widths[:column])

    def column_w(self, column: int) -> int:
        return self.widths[min(column, len(self.widths) - 1)]

    def row_rect(self, column: int, index: int) -> tuple[int, int, int, int]:
        """(x, y, w, h) of one row."""
        return (self.column_x(column), self.y + self.pad + index * self.row_h,
                self.column_w(column), self.row_h)

    def panel_rect(self, menu: Menu) -> tuple[int, int, int, int]:
        cols = menu.columns
        rows = max(len(c) for c in cols) + 1  # + a footer line for the detail
        return (self.x, self.y,
                sum(self.widths[:len(cols)]) + self.pad * 2,
                rows * self.row_h + self.pad * 2)

    def footer_rect(self, menu: Menu) -> tuple[int, int, int, int]:
        cols = menu.columns
        rows = max(len(c) for c in cols)
        return (self.column_x(0), self.y + self.pad + rows * self.row_h,
                sum(self.widths[:len(cols)]), self.row_h)

    def hit(self, px: float, py: float, menu: Menu) -> tuple[int, int] | None:
        """Which (column, row) a point falls in, or None for outside the panel."""
        bx, by, bw, bh = self.panel_rect(menu)
        if not (bx <= px < bx + bw and by <= py < by + bh):
            return None
        cols = menu.columns
        column = 0
        for i in range(len(cols)):
            if px >= self.column_x(i):
                column = i
        index = int((py - self.y - self.pad) // self.row_h)
        if not 0 <= index < len(cols[column]):
            return None
        return column, index


def preferred_anchor(board_points, width: int, height: int, menu: Menu) -> str:
    """Which edge to put the menu against: whichever hides less of the fretboard.

    A menu that covers the neck defeats itself -- you open it to choose a scale and it
    hides the notes it just drew. The neck is a long diagonal, so one side is always
    emptier, but *which* side is not simply "opposite the centroid": the panel is a tall
    rectangle in one corner, and a neck can sit centrally while overlapping one corner far
    more than the other. So both candidate positions are actually measured.

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
