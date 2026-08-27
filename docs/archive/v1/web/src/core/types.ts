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
  /** Which fret was tapped as the "near" reference (default 0 = nut). */
  nearFret: number;
  /** Which fret was tapped as the "far" reference (default 12). */
  farFret: number;
  /**
   * ArUco markers registered to fretboard-space at calibration time: marker id →
   * its 4 corners in fretboard-space (u,v). Enables live tracking — re-solving H
   * each frame from the markers' current image positions. Absent if no markers
   * were visible during calibration.
   */
  markerAnchors?: Record<number, UV[]>;
  /** Epoch ms when this calibration was created. */
  createdAt: number;
}

/** A marker detected in the current frame (corners in normalized image space). */
export interface DetectedMarker {
  id: number;
  /** Four corners in normalized image space [0,1], same convention as taps. */
  corners: Point[];
}

/** Live tracking status surfaced to the UI. */
export interface TrackingStatus {
  /** Total markers the camera currently sees (registered or not). */
  detected: number;
  /** Number of registered markers currently visible (0 = lost). */
  visible: number;
  /** Total markers registered at calibration. */
  registered: number;
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
