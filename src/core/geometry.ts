/**
 * Geometry: the two-stage fretboard-space → image-pixel mapping.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  TWO STAGES, BOTH REQUIRED (PRD §5.4). Doing only one is the classic       │
 * │  failure mode — flagged here per the spec.                                 │
 * │                                                                            │
 * │    1. NON-LINEAR FRET SPACING:  u(n) = 1 - 2^(-n/12)                        │
 * │       Frets bunch up toward the bridge. NEVER linearly interpolate fret    │
 * │       positions — that is wrong even with a perfect camera.                │
 * │                                                                            │
 * │    2. PERSPECTIVE:  a 3×3 homography H maps the flat (u,v) plane to the    │
 * │       perspective-projected pixels of the camera image.                    │
 * │                                                                            │
 * │  A dot's pixel = applyHomography(H, dotUV(string, fret)).                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Framework-free and pure: no React/DOM imports. Fully unit-tested.
 */

import { Matrix, solve } from 'ml-matrix';
import type { Point, StringNumber, UV } from './types';

/**
 * Fractional distance from the nut to fret `n`, as a fraction of scale length
 * (equal temperament, 12th-root-of-2). u(0)=0 (nut), u(12)=0.5, u(24)=0.75.
 */
export function fretU(n: number): number {
  return 1 - Math.pow(2, -n / 12);
}

/**
 * v-coordinate (across the neck) for a string.
 * String 6 (low E) → 0, string 1 (high E) → 1.  v = (6 - s) / 5.
 */
export function stringV(s: StringNumber): number {
  return (6 - s) / 5;
}

/**
 * u slightly behind the nut where open ("O") / muted ("X") markers are drawn.
 * Negative so it projects just outside the playable region, toward the headstock.
 */
export const OPEN_MARKER_U = -0.045;

/**
 * Fretboard-space coordinate of a finger dot.
 *
 * For a fretted note (fret f ≥ 1) the dot is centered in the fret *space*
 * between fret f-1 and fret f:  u = (u(f-1) + u(f)) / 2.
 * For an open/muted string (fret 0) the marker sits just behind the nut.
 */
export function dotUV(string: StringNumber, fret: number): UV {
  const v = stringV(string);
  if (fret <= 0) {
    return { u: OPEN_MARKER_U, v };
  }
  const u = (fretU(fret - 1) + fretU(fret)) / 2;
  return { u, v };
}

/**
 * Solve the 3×3 homography H mapping the 4 fretboard-space points `src`
 * to the 4 tapped image points `dst` (standard getPerspectiveTransform).
 *
 * H has 8 unknowns (h33 fixed to 1). Each correspondence gives 2 linear
 * equations, so 4 points → an 8×8 system, solved with ml-matrix.
 *
 *   x = (h11·u + h12·v + h13) / (h31·u + h32·v + 1)
 *   y = (h21·u + h22·v + h23) / (h31·u + h32·v + 1)
 *
 * Throws if fewer than 4 correspondences are supplied.
 */
export function getPerspectiveTransform(
  src: readonly UV[],
  dst: readonly Point[],
): number[][] {
  if (src.length !== 4 || dst.length !== 4) {
    throw new Error(
      `getPerspectiveTransform needs exactly 4 correspondences, got ${src.length}/${dst.length}`,
    );
  }

  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { u, v } = src[i]!;
    const { x, y } = dst[i]!;
    // Row for x:  h11·u + h12·v + h13 + 0 + 0 + 0 - h31·u·x - h32·v·x = x
    a.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    b.push(x);
    // Row for y:  0 + 0 + 0 + h21·u + h22·v + h23 - h31·u·y - h32·v·y = y
    a.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    b.push(y);
  }

  const h = solve(new Matrix(a), Matrix.columnVector(b)).to1DArray();
  if (h.some((value) => !Number.isFinite(value))) {
    throw new Error(
      'Degenerate calibration: the 4 taps are collinear or coincident.',
    );
  }

  return [
    [h[0]!, h[1]!, h[2]!],
    [h[3]!, h[4]!, h[5]!],
    [h[6]!, h[7]!, 1],
  ];
}

/** Apply a 3×3 homography to a fretboard-space point, returning image pixels. */
export function applyHomography(H: number[][], uv: UV): Point {
  const { u, v } = uv;
  const r0 = H[0]!;
  const r1 = H[1]!;
  const r2 = H[2]!;
  const w = r2[0]! * u + r2[1]! * v + r2[2]!;
  return {
    x: (r0[0]! * u + r0[1]! * v + r0[2]!) / w,
    y: (r1[0]! * u + r1[1]! * v + r1[2]!) / w,
  };
}

/** Convenience: pixel location of a finger dot, combining both stages. */
export function dotPixel(
  H: number[][],
  string: StringNumber,
  fret: number,
): Point {
  return applyHomography(H, dotUV(string, fret));
}

/**
 * The 4 fretboard-space reference points for calibration, in the fixed prompted
 * order (PRD §5.4). The far fret defaults to 12; its u is computed from u(n).
 *
 *   Tap 1: Nut × Low E        → (0, 0)
 *   Tap 2: Nut × High E       → (0, 1)
 *   Tap 3: Far fret × High E  → (u(far), 1)
 *   Tap 4: Far fret × Low E   → (u(far), 0)
 */
export function calibrationTargets(farFret: number): UV[] {
  const uFar = fretU(farFret);
  return [
    { u: 0, v: 0 },
    { u: 0, v: 1 },
    { u: uFar, v: 1 },
    { u: uFar, v: 0 },
  ];
}

export interface CalibrationPrompt {
  label: string;
  uv: UV;
}

/** Human-readable prompts paired with their fretboard-space targets. */
export function calibrationPrompts(farFret: number): CalibrationPrompt[] {
  const targets = calibrationTargets(farFret);
  return [
    { label: 'Nut × Low E (thickest string)', uv: targets[0]! },
    { label: 'Nut × High E (thinnest string)', uv: targets[1]! },
    { label: `Fret ${farFret} × High E (thinnest string)`, uv: targets[2]! },
    { label: `Fret ${farFret} × Low E (thickest string)`, uv: targets[3]! },
  ];
}

export interface GridLine {
  from: Point;
  to: Point;
}

/**
 * Project a faint confirmation/orientation grid: a line per fret (0..maxFret)
 * across all strings, plus a line per string along the neck. Used for the
 * calibration sanity-check overlay and the optional grid toggle.
 */
export function gridLines(H: number[][], maxFret: number): GridLine[] {
  const lines: GridLine[] = [];
  // Fret lines (across the neck), at each fret's u from v=0 to v=1.
  for (let n = 0; n <= maxFret; n++) {
    const u = fretU(n);
    lines.push({
      from: applyHomography(H, { u, v: 0 }),
      to: applyHomography(H, { u, v: 1 }),
    });
  }
  // String lines (along the neck), from nut to the far fret.
  const uEnd = fretU(maxFret);
  for (let s = 1 as StringNumber; s <= 6; s++) {
    const v = stringV(s as StringNumber);
    lines.push({
      from: applyHomography(H, { u: 0, v }),
      to: applyHomography(H, { u: uEnd, v }),
    });
  }
  return lines;
}
