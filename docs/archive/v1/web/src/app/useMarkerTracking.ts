/**
 * useMarkerTracking: runs ArUco detection on the live video and re-solves the
 * fretboard homography per frame when tracking is enabled.
 *
 * - Detection is throttled (~15 Hz) and run on a downscaled frame for speed; the
 *   overlay still redraws at full rAF using the most-recent H (guitar drift is
 *   slow, so this is smooth). PRD §7 performance.
 * - The tracked H is written to a shared ref (read by OverlayCanvas) to avoid
 *   30 Hz React re-renders. Only the low-frequency status goes through the store.
 * - `detectNow()` returns the current frame's markers for calibration-time
 *   registration.
 *
 * Local-only: js-aruco2 is pure JS, runs entirely in-browser, no network.
 */

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { AR } from 'js-aruco2';
import { useStore } from './store';
import { countVisible, solveTrackingHomography } from '../core/markers';
import type { DetectedMarker } from '../core/types';

/** The live tracked homography shared with the overlay. */
export interface LiveHomography {
  /** Null when tracking is off or markers are not currently solvable. */
  H: number[][] | null;
  /** Epoch ms of the last successful solve (for staleness checks). */
  updatedAt: number;
  /** Latest markers the camera saw, normalized — drawn as a debug overlay. */
  markers: import('../core/types').DetectedMarker[];
}

const DICTIONARY = 'ARUCO_MIP_36h12';
const DETECT_INTERVAL_MS = 66; // ~15 Hz
const STATUS_INTERVAL_MS = 300; // ~3 Hz status updates
// Detection resolution. Bigger = small/distant markers read better, at more CPU.
const DETECT_WIDTH = 960;

export function useMarkerTracking(
  videoRef: RefObject<HTMLVideoElement>,
  liveHRef: RefObject<LiveHomography>,
) {
  const detectorRef = useRef<InstanceType<typeof AR.Detector> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastStatusRef = useRef(0);

  // Lazily create the detector + offscreen canvas once.
  const ensure = useCallback(() => {
    if (!detectorRef.current) {
      detectorRef.current = new AR.Detector({ dictionaryName: DICTIONARY });
    }
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    return { detector: detectorRef.current, canvas: canvasRef.current };
  }, []);

  /** Detect markers in the current video frame; corners in normalized space. */
  const detectNow = useCallback((): DetectedMarker[] => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return [];
    const { detector, canvas } = ensure();

    const scale = Math.min(1, DETECT_WIDTH / video.videoWidth);
    const dw = Math.max(1, Math.round(video.videoWidth * scale));
    const dh = Math.max(1, Math.round(video.videoHeight * scale));
    if (canvas.width !== dw || canvas.height !== dh) {
      canvas.width = dw;
      canvas.height = dh;
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];
    ctx.drawImage(video, 0, 0, dw, dh);
    const image = ctx.getImageData(0, 0, dw, dh);

    return detector.detect(image).map((m) => ({
      id: m.id,
      corners: m.corners.map((c) => ({ x: c.x / dw, y: c.y / dh })),
    }));
  }, [videoRef, ensure]);

  // Throttled detection loop. Always mounted; cheaply no-ops when tracking is off.
  useEffect(() => {
    const setMarkerStatus = useStore.getState().setMarkerStatus;
    const id = window.setInterval(() => {
      const st = useStore.getState();
      const anchors = st.calibration?.markerAnchors;

      // Always detect so the user can see what the camera reads (debug overlay
      // + "camera sees N" status), even before calibration / tracking.
      const detected = detectNow();
      if (liveHRef.current) {
        liveHRef.current.markers = detected;
        // Re-solve H only when tracking with registered anchors; otherwise the
        // overlay falls back to the fixed calibration H.
        if (st.tracking && anchors) {
          const H = solveTrackingHomography(anchors, detected);
          liveHRef.current.H = H;
          if (H) liveHRef.current.updatedAt = Date.now();
        } else {
          liveHRef.current.H = null;
        }
      }

      const now = Date.now();
      if (now - lastStatusRef.current >= STATUS_INTERVAL_MS) {
        lastStatusRef.current = now;
        setMarkerStatus({
          detected: detected.length,
          visible: countVisible(anchors, detected),
          registered: anchors ? Object.keys(anchors).length : 0,
        });
      }
    }, DETECT_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [detectNow, liveHRef]);

  return { detectNow };
}
