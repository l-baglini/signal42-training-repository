import { describe, expect, it } from 'vitest';
import { applyHomography, dotPixel } from '../geometry';
import {
  countVisible,
  registerMarkers,
  solveTrackingHomography,
} from '../markers';
import type { DetectedMarker, StringNumber, UV } from '../types';

/**
 * End-to-end synthetic tracking test (no hardware):
 *  1. pick a calibration homography H_calib and synthesize marker corners in its
 *     image,
 *  2. register the markers → fretboard-space anchors,
 *  3. "move the camera" to a new homography H_moved, re-project the SAME markers,
 *  4. solve the tracking homography from those moved corners,
 *  5. assert the recovered H reproduces fret positions under H_moved.
 *
 * Markers are placed in the fretboard plane (coplanar case), so recovery is exact.
 */

const H_CALIB = [
  [800, 30, 120],
  [-50, 600, 90],
  [0.05, 0.02, 1],
];

const H_MOVED = [
  [760, 70, 160],
  [-30, 640, 70],
  [0.04, 0.05, 1],
];

// Three small square markers (in fretboard-space) spread along the neck.
function squareAt(uCenter: number, vCenter: number, half = 0.03): UV[] {
  return [
    { u: uCenter - half, v: vCenter - half },
    { u: uCenter + half, v: vCenter - half },
    { u: uCenter + half, v: vCenter + half },
    { u: uCenter - half, v: vCenter + half },
  ];
}

const MARKER_FRETBOARD: Record<number, UV[]> = {
  0: squareAt(0.05, 0.1),
  1: squareAt(0.3, 0.9),
  2: squareAt(0.48, 0.5),
};

function detectUnder(H: number[][], ids: number[]): DetectedMarker[] {
  return ids.map((id) => ({
    id,
    corners: MARKER_FRETBOARD[id]!.map((uv) => applyHomography(H, uv)),
  }));
}

describe('registerMarkers + solveTrackingHomography', () => {
  it('tracks the guitar after the camera moves (all 3 markers visible)', () => {
    const atCalib = detectUnder(H_CALIB, [0, 1, 2]);
    const anchors = registerMarkers(H_CALIB, atCalib);

    const atMoved = detectUnder(H_MOVED, [0, 1, 2]);
    const Htrack = solveTrackingHomography(anchors, atMoved);
    expect(Htrack).not.toBeNull();

    const strings: StringNumber[] = [1, 3, 6];
    for (const s of strings) {
      for (const f of [1, 3, 5, 7, 12]) {
        const expected = dotPixel(H_MOVED, s, f);
        const actual = dotPixel(Htrack!, s, f);
        expect(actual.x).toBeCloseTo(expected.x, 2);
        expect(actual.y).toBeCloseTo(expected.y, 2);
      }
    }
  });

  it('still tracks with only one marker visible (partial occlusion)', () => {
    const anchors = registerMarkers(H_CALIB, detectUnder(H_CALIB, [0, 1, 2]));
    const atMoved = detectUnder(H_MOVED, [1]); // only marker 1 visible
    const Htrack = solveTrackingHomography(anchors, atMoved);
    expect(Htrack).not.toBeNull();
    // Coplanar synthetic + normalized DLT → near-exact even from one marker.
    const expected = dotPixel(H_MOVED, 3, 4);
    const actual = dotPixel(Htrack!, 3, 4);
    expect(actual.x).toBeCloseTo(expected.x, 2);
    expect(actual.y).toBeCloseTo(expected.y, 2);
  });

  it('returns null when no registered marker is visible', () => {
    const anchors = registerMarkers(H_CALIB, detectUnder(H_CALIB, [0, 1]));
    const atMoved = detectUnder(H_MOVED, [2]); // id 2 was never registered
    expect(solveTrackingHomography(anchors, atMoved)).toBeNull();
  });

  it('ignores detected ids that were not registered', () => {
    const anchors = registerMarkers(H_CALIB, detectUnder(H_CALIB, [0]));
    const detected = detectUnder(H_MOVED, [0, 2]);
    expect(countVisible(anchors, detected)).toBe(1);
    expect(solveTrackingHomography(anchors, detected)).not.toBeNull();
  });
});

describe('countVisible', () => {
  it('counts only registered + currently-detected markers', () => {
    const anchors = registerMarkers(H_CALIB, detectUnder(H_CALIB, [0, 1, 2]));
    expect(countVisible(anchors, detectUnder(H_MOVED, [0, 2]))).toBe(2);
    expect(countVisible(anchors, [])).toBe(0);
    expect(countVisible(undefined, detectUnder(H_MOVED, [0]))).toBe(0);
  });
});
