/**
 * Marker math (pure, framework-free, lib-free) for live tracking.
 *
 * The "registration at calibration" idea (see plan / DECISIONS.md): markers are
 * attached rigidly to the guitar. During the one manual calibration we know
 * H_calib (fretboard-space → image), so we map each detected marker corner back
 * through H_calib⁻¹ to get its fretboard-space (u,v) ANCHOR. Anchors are
 * camera-independent, so they persist and drive per-frame re-solves of H.
 *
 * ArUco detection itself (DOM/ImageData) lives in the app layer; this module only
 * does the geometry, so it stays unit-testable.
 */

import { imageToFretboard, solveHomographyDLT } from './geometry';
import type { DetectedMarker, Point, UV } from './types';

/**
 * Register detected markers into fretboard-space using the calibration
 * homography. Returns { markerId → 4 fretboard-space corners }.
 */
export function registerMarkers(
  Hcalib: number[][],
  detected: readonly DetectedMarker[],
): Record<number, UV[]> {
  const anchors: Record<number, UV[]> = {};
  for (const m of detected) {
    anchors[m.id] = m.corners.map((c) => imageToFretboard(Hcalib, c));
  }
  return anchors;
}

/**
 * Re-solve the fretboard-space → image homography from the markers currently
 * visible, pairing each registered fretboard-space corner with its current image
 * position. Returns null if too few correspondences are available (needs ≥ 4
 * points, i.e. at least one fully-registered marker).
 */
export function solveTrackingHomography(
  anchors: Record<number, UV[]>,
  detected: readonly DetectedMarker[],
): number[][] | null {
  const src: UV[] = [];
  const dst: Point[] = [];
  for (const m of detected) {
    const anchor = anchors[m.id];
    if (!anchor || anchor.length !== m.corners.length) continue;
    for (let i = 0; i < anchor.length; i++) {
      src.push(anchor[i]!);
      dst.push(m.corners[i]!);
    }
  }
  if (src.length < 4) return null;
  try {
    return solveHomographyDLT(src, dst);
  } catch {
    return null;
  }
}

/** How many registered markers are currently visible. */
export function countVisible(
  anchors: Record<number, UV[]> | undefined,
  detected: readonly DetectedMarker[],
): number {
  if (!anchors) return 0;
  let n = 0;
  for (const m of detected) if (anchors[m.id]) n++;
  return n;
}
