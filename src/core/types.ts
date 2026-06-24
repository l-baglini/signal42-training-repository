/**
 * Core domain types for FretGuide (Milestone 1).
 *
 * INVARIANTS (see PRD §4, §5.3) — keep these consistent EVERYWHERE:
 *  - String numbering: 1 = high E (thinnest) … 6 = low E (thickest). Fret 0 = open.
 *  - Fingers: 1 = index, 2 = middle, 3 = ring, 4 = pinky.
 *  - Fretboard space (u,v) is a normalized flat rectangle the homography maps to pixels:
 *      u ∈ [0,1] along the neck: u=0 at the NUT, increasing toward the bridge.
 *      v ∈ [0,1] across the neck: v=0 at LOW E (string 6), v=1 at HIGH E (string 1).
 *
 * This module is framework-free (no React/DOM) so it is unit-testable in isolation.
 */

export type StringNumber = 1 | 2 | 3 | 4 | 5 | 6;
export type Finger = 1 | 2 | 3 | 4;

export interface FretPosition {
  string: StringNumber;
  /** 0 = open/nut. */
  fret: number;
  /** 1=index … 4=pinky; absent for plain scale notes. */
  finger?: Finger;
  /** Emphasize root notes differently in the overlay. */
  isRoot?: boolean;
}

export interface ChordVoicing {
  /** Display name, e.g. "G", "Am", "F#dim". */
  name: string;
  quality: 'major' | 'minor' | 'diminished';
  positions: FretPosition[];
  /** Strings played open (draw "O" at the nut). */
  open: StringNumber[];
  /** Strings not played (draw "X" at the nut). */
  muted: StringNumber[];
  /** Set for movable/barre shapes; identifies the barred fret. */
  baseFret?: number;
}

export interface ScaleBox {
  /** Display name, e.g. "G major (Ionian)". */
  name: string;
  root: string; // e.g. "G"
  scaleName: string; // e.g. "major"
  positions: FretPosition[];
}

/** What the UI currently has selected. */
export type Selection =
  | { mode: 'scale'; id: string }
  | { mode: 'chord'; id: string };

/** A single tapped image point (CSS/display pixels relative to the video element). */
export interface Tap {
  x: number;
  y: number;
}

export interface Calibration {
  /** 3×3 homography mapping fretboard-space (u,v,1) → image pixels (x,y,w). */
  H: number[][];
  /** The 4 image points the user tapped, in the fixed prompted order. */
  taps: Tap[];
  /** Which fret was tapped as the "far" reference (default 12). */
  farFret: number;
  /** Epoch ms when this calibration was created. */
  createdAt: number;
}

/** A fretboard-space point. */
export interface UV {
  u: number;
  v: number;
}

/** An image-space (pixel) point. */
export interface Point {
  x: number;
  y: number;
}
