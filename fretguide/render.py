"""Drawing the overlay.

Legibility over live video is the whole job here: the background is a moving,
mid-grey, cluttered photograph, so every mark needs its own contrast rather than
relying on the video behind it. Hence dark outlines under light fills, and text with a
halo.

Colour convention: roots are emphasised, plain scale tones are secondary, and open/muted
strings get O/X behind the nut. Fingers are numbered when known.
"""

from __future__ import annotations

import cv2
import numpy as np

from .geometry import apply_homography, dot_uv, fret_u, grid_lines, string_v
from .types import UV, ResolvedSelection, TrackerStatus

# BGR
COL_ROOT = (60, 60, 245)  # red-ish: root notes
COL_NOTE = (235, 200, 60)  # amber: other scale/chord tones
COL_OPEN = (120, 235, 120)  # green: open strings
COL_MUTED = (140, 140, 140)
COL_GRID = (90, 90, 90)
COL_OUTLINE = (18, 18, 18)
COL_OK = (120, 230, 120)
COL_BAD = (70, 170, 255)


def _halo_text(img, text, org, scale=0.6, colour=(255, 255, 255), thick=1) -> None:
    cv2.putText(img, text, org, cv2.FONT_HERSHEY_SIMPLEX, scale, COL_OUTLINE, thick + 3, cv2.LINE_AA)
    cv2.putText(img, text, org, cv2.FONT_HERSHEY_SIMPLEX, scale, colour, thick, cv2.LINE_AA)


def local_spacing(H: np.ndarray, fret: int, string: int) -> tuple[float, float]:
    """(fret gap, string gap) in pixels at one board position.

    Both are needed because they are wildly different. Measured on a real pose: at fret 1
    the fret gap is 125 px while the strings are 27 px apart. Sizing a dot from the fret
    gap alone therefore produces something three times the string spacing, covering the
    two neighbouring strings.
    """
    f = max(fret, 1)
    v = string_v(string)
    a = apply_homography(H, UV(fret_u(f - 1), v))[0]
    b = apply_homography(H, UV(fret_u(f), v))[0]
    # Neighbouring string, whichever exists (string 1 is the high E, 6 the low E).
    other = string_v(string + 1 if string < 6 else string - 1)
    c = apply_homography(H, UV(fret_u(f), other))[0]
    d = apply_homography(H, UV(fret_u(f), v))[0]
    return float(np.linalg.norm(a - b)), float(np.linalg.norm(c - d))


def dot_radius(H: np.ndarray, fret: int, string: int, scale: float = 1.0) -> int:
    """Scale the dot to the TIGHTER local dimension, so it never covers its neighbours.

    A dot marks one string in one fret space, so it has to fit in a cell that is narrow
    across the neck and long along it. The binding constraint is almost always the string
    spacing; using the fret spacing made every dot 1.3x-3x the string gap.

    ``scale`` is a user taste multiplier (``-``/``=`` in the app).
    """
    fret_gap, string_gap = local_spacing(H, fret, string)
    r = min(fret_gap * 0.30, string_gap * 0.44) * scale
    return int(np.clip(r, 3, 40))


def draw_grid(img: np.ndarray, H: np.ndarray, max_fret: int = 12, alpha: float = 0.5) -> None:
    """Faint fret/string grid — the sanity check that the pose is actually right."""
    layer = img.copy()
    for a, b in grid_lines(H, max_fret):
        if np.isfinite([a.x, a.y, b.x, b.y]).all():
            cv2.line(layer, (int(a.x), int(a.y)), (int(b.x), int(b.y)), COL_GRID, 1, cv2.LINE_AA)
    cv2.addWeighted(layer, alpha, img, 1 - alpha, 0, dst=img)


def draw_selection(img: np.ndarray, H: np.ndarray, sel: ResolvedSelection,
                   show_fingers: bool = True, dot_scale: float = 1.0) -> None:
    """Draw the finger-placement dots for a resolved chord or scale."""
    h, w = img.shape[:2]

    for s in sel.muted:
        p = apply_homography(H, dot_uv(s, 0))[0]
        if not np.isfinite(p).all():
            continue
        x, y = int(p[0]), int(p[1])
        r = dot_radius(H, 1, s, dot_scale)
        cv2.line(img, (x - r, y - r), (x + r, y + r), COL_OUTLINE, 5, cv2.LINE_AA)
        cv2.line(img, (x + r, y - r), (x - r, y + r), COL_OUTLINE, 5, cv2.LINE_AA)
        cv2.line(img, (x - r, y - r), (x + r, y + r), COL_MUTED, 2, cv2.LINE_AA)
        cv2.line(img, (x + r, y - r), (x - r, y + r), COL_MUTED, 2, cv2.LINE_AA)

    open_roots = {p.string for p in sel.positions if p.fret == 0 and p.is_root}
    for s in sel.open:
        p = apply_homography(H, dot_uv(s, 0))[0]
        if not np.isfinite(p).all():
            continue
        x, y = int(p[0]), int(p[1])
        colour = COL_ROOT if s in open_roots else COL_OPEN
        ro = dot_radius(H, 1, s, dot_scale)
        cv2.circle(img, (x, y), ro, COL_OUTLINE, 4, cv2.LINE_AA)
        cv2.circle(img, (x, y), ro, colour, 2, cv2.LINE_AA)

    for pos in sel.positions:
        if pos.fret == 0:
            continue  # open strings are drawn above
        p = apply_homography(H, dot_uv(pos.string, pos.fret))[0]
        if not np.isfinite(p).all():
            continue
        x, y = int(p[0]), int(p[1])
        if not (-50 <= x <= w + 50 and -50 <= y <= h + 50):
            continue
        r = dot_radius(H, pos.fret, pos.string, dot_scale)
        colour = COL_ROOT if pos.is_root else COL_NOTE
        cv2.circle(img, (x, y), r + 2, COL_OUTLINE, -1, cv2.LINE_AA)
        cv2.circle(img, (x, y), r, colour, -1, cv2.LINE_AA)
        if show_fingers and pos.finger and r >= 6:
            t = str(pos.finger)
            # Font tracks the dot; a fixed 0.55 spilled out of the smaller dots.
            fs = float(np.clip(r / 16.0, 0.32, 0.75))
            th_out = 3 if r >= 10 else 2
            (tw, th), _ = cv2.getTextSize(t, cv2.FONT_HERSHEY_SIMPLEX, fs, 2)
            org = (x - tw // 2, y + th // 2)
            cv2.putText(img, t, org, cv2.FONT_HERSHEY_SIMPLEX, fs, COL_OUTLINE,
                        th_out, cv2.LINE_AA)
            cv2.putText(img, t, org, cv2.FONT_HERSHEY_SIMPLEX, fs, (255, 255, 255),
                        1, cv2.LINE_AA)


def draw_hud(img: np.ndarray, status: TrackerStatus, sel_name: str, fps: float,
             extra: str = "") -> None:
    """Status line. Being explicit about *not* being locked matters more than it sounds:
    v1's worst behaviour was drawing a confident wrong overlay with no indication."""
    h = img.shape[0]
    if status.locked:
        state, colour = "LOCKED", COL_OK
    else:
        state, colour = "NO LOCK", COL_BAD
    # The two backends measure different things, so let the status name its own numbers
    # rather than mislabelling the model's keypoints and confidence as a matcher's
    # "inliers" and "spread". Falls back to the matcher's wording when fields is empty.
    if status.fields:
        detail = "  ".join(f"{k} {v}" for k, v in status.fields.items())
    else:
        detail = f"inliers {status.inliers}  spread {status.spread:.2f}"
    _halo_text(img, f"{state}  {detail}", (12, 26), 0.62, colour, 2)
    _halo_text(img, f"{sel_name}", (12, h - 40), 0.7, (255, 255, 255), 2)
    tail = f"{fps:4.1f} fps"
    if not status.locked and status.reason:
        tail += f"   |  {status.reason}"
    if extra:
        tail += f"   |  {extra}"
    _halo_text(img, tail, (12, h - 14), 0.52, (215, 215, 215), 1)


def dim(img: np.ndarray, amount: float = 0.45) -> None:
    """Darken the frame — used when there is no trustworthy pose, so the absence of an
    overlay reads as deliberate rather than broken."""
    img[:] = (img.astype(np.float32) * (1.0 - amount)).astype(np.uint8)


def draw_debug(img: np.ndarray, H: np.ndarray, max_fret: int,
               inlier_pts: np.ndarray | None) -> None:
    """Show what the tracker is actually seeing: the board outline it has locked onto and
    the matched points supporting it.

    This is the view that distinguishes "matching is broken" from "the enrollment's four
    corners were wrong": if the outline hugs the real fretboard but the dots are offset,
    the fault is the enrollment, not the tracker.
    """
    from .geometry import apply_homography, corners_uv

    quad = apply_homography(H, corners_uv(max_fret))
    if np.isfinite(quad).all():
        cv2.polylines(img, [quad.astype(np.int32)], True, (0, 240, 255), 2, cv2.LINE_AA)
        for i, p in enumerate(quad.astype(int)):
            cv2.circle(img, tuple(p), 5, (0, 240, 255), -1, cv2.LINE_AA)
            _halo_text(img, str(i + 1), (p[0] + 7, p[1] - 7), 0.5, (0, 240, 255), 1)
    if inlier_pts is not None:
        for p in inlier_pts.astype(int):
            cv2.circle(img, tuple(p), 2, (120, 255, 120), -1, cv2.LINE_AA)


# --------------------------------------------------------------------------- #
# The practice menu
# --------------------------------------------------------------------------- #

COL_PANEL = (26, 22, 20)
#: Amber. Deliberately not COL_NOTE or COL_ROOT: a highlight the same colour as the dots
#: on the fretboard reads as content rather than as chrome, and the first version of this
#: menu picked a blue indistinguishable from the notes it was selecting.
COL_ROW_ACTIVE = (50, 165, 245)
COL_ROW_CURRENT = (70, 62, 52)
COL_HEADING = (140, 140, 140)
COL_TEXT = (235, 235, 235)


def draw_menu(img: np.ndarray, menu, layout) -> None:
    """Draw the two-column practice menu over the video.

    Everything about *what* is on screen comes from ``menu``; this only paints it. The
    same object drives the native shell, which is why none of the structure lives here.

    The panel is drawn translucent rather than solid: it covers part of the fretboard, and
    being able to see the neck through it is worth more than a crisp background — you are
    choosing what to play on the instrument you are looking at.
    """
    bx, by, bw, bh = layout.panel_rect(menu)
    h, w = img.shape[:2]
    bx, by = max(0, bx), max(0, by)
    bw, bh = min(bw, w - bx), min(bh, h - by)
    if bw <= 0 or bh <= 0:
        return

    panel = img[by:by + bh, bx:bx + bw]
    # 0.62 rather than something solid. The neck is a long diagonal and the panel is tall,
    # so on a 16:9 frame it will cover part of the board whichever side it takes -- being
    # able to read the notes through it is worth more than a crisp background. The text
    # carries its own halo (see _halo_text), so legibility does not depend on this.
    cv2.addWeighted(np.full_like(panel, COL_PANEL, dtype=np.uint8), 0.62, panel, 0.38, 0,
                    dst=panel)
    cv2.rectangle(img, (bx, by), (bx + bw - 1, by + bh - 1), (90, 80, 70), 1, cv2.LINE_AA)

    scale = max(0.4, layout.row_h / 30 * 0.52)
    for column, rows in ((0, menu.left), (1, menu.right)):
        for index, row in enumerate(rows):
            x, y, rw, rh = layout.row_rect(column, index)
            if y + rh > by + bh:
                break
            focused = menu.column == column
            at = index == (menu.left_index if column == 0 else menu.right_index)
            if at and row.selection is not None or (column == 0 and at):
                # Solid where the focus is, dimmer where it is not: with two columns you
                # must be able to see which one the arrow keys are about to move.
                colour = COL_ROW_ACTIVE if focused else COL_ROW_CURRENT
                cv2.rectangle(img, (x, y), (x + rw - 2, y + rh - 2), colour, -1)

            if row.heading:
                _halo_text(img, row.label.upper(), (x + 10, y + int(rh * 0.7)),
                           scale=scale * 0.8, colour=COL_HEADING)
            else:
                on = at and (row.selection is not None or column == 0)
                _halo_text(img, row.label, (x + 10, y + int(rh * 0.7)), scale=scale,
                           colour=COL_OUTLINE if (on and focused) else COL_TEXT)
