/**
 * Global app state (Zustand) + localStorage persistence.
 *
 * Persisted (PRD F2): { deviceId, calibration, selection, showGrid, tracking }.
 * NOT persisted: the in-progress calibration draft, and the live tracking status
 * (transient, recomputed each session). The per-frame tracked homography is held
 * in a React ref (see App/useMarkerTracking), NOT here, to avoid 30 Hz churn.
 *
 * COORDINATE CONVENTION: calibration taps, marker corners, and the homography H
 * all operate in NORMALIZED image space — (0,0) = top-left of the displayed video
 * content, (1,1) = bottom-right. Resolution-independent, so a stored calibration
 * reproduces across resizes and reloads (PRD A2, B2, §7).
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Calibration,
  DetectedMarker,
  Selection,
  Tap,
  TrackingStatus,
} from '../core/types';
import { calibrationTargets, getPerspectiveTransform } from '../core/geometry';
import { registerMarkers } from '../core/markers';

export const DEFAULT_NEAR_FRET = 0;
export const DEFAULT_FAR_FRET = 12;

const DEFAULT_SELECTION: Selection = { mode: 'chord', id: 'G' };

interface PersistedState {
  deviceId: string | null;
  calibration: Calibration | null;
  selection: Selection;
  showGrid: boolean;
  /** Whether live marker tracking is enabled. */
  tracking: boolean;
}

interface AppState extends PersistedState {
  // ── Camera ──
  setDeviceId: (id: string | null) => void;

  // ── Selection ──
  setSelection: (s: Selection) => void;

  // ── Overlay ──
  toggleGrid: () => void;

  // ── Committed calibration ──
  setCalibration: (c: Calibration | null) => void;

  // ── Live marker tracking ──
  toggleTracking: () => void;
  /** Latest tracking status for the UI (visible/registered marker counts). */
  markerStatus: TrackingStatus | null;
  setMarkerStatus: (s: TrackingStatus | null) => void;

  // ── Calibration draft (not persisted) ──
  calibrating: boolean;
  draftTaps: Tap[];
  draftNearFret: number;
  draftFarFret: number;
  startCalibration: () => void;
  cancelCalibration: () => void;
  addTap: (tap: Tap) => void;
  undoTap: () => void;
  setDraftNearFret: (fret: number) => void;
  setDraftFarFret: (fret: number) => void;
  /**
   * Solve H from the 4 draft taps and commit; no-op unless exactly 4 taps. If
   * markers were detected in the current frame, register them to fretboard-space
   * so live tracking can re-solve H per frame.
   */
  commitCalibration: (detected?: DetectedMarker[]) => void;

  resetAll: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      deviceId: null,
      calibration: null,
      selection: DEFAULT_SELECTION,
      showGrid: false,
      tracking: false,

      markerStatus: null,

      calibrating: false,
      draftTaps: [],
      draftNearFret: DEFAULT_NEAR_FRET,
      draftFarFret: DEFAULT_FAR_FRET,

      setDeviceId: (id) => set({ deviceId: id }),
      setSelection: (s) => set({ selection: s }),
      toggleGrid: () => set((st) => ({ showGrid: !st.showGrid })),
      setCalibration: (c) => set({ calibration: c }),

      toggleTracking: () => set((st) => ({ tracking: !st.tracking })),
      setMarkerStatus: (s) => set({ markerStatus: s }),

      startCalibration: () =>
        set((st) => ({
          calibrating: true,
          draftTaps: [],
          // Seed the draft frets from the existing calibration if any.
          draftNearFret: st.calibration?.nearFret ?? DEFAULT_NEAR_FRET,
          draftFarFret: st.calibration?.farFret ?? DEFAULT_FAR_FRET,
        })),

      cancelCalibration: () => set({ calibrating: false, draftTaps: [] }),

      addTap: (tap) =>
        set((st) =>
          st.draftTaps.length >= 4 ? st : { draftTaps: [...st.draftTaps, tap] },
        ),

      undoTap: () => set((st) => ({ draftTaps: st.draftTaps.slice(0, -1) })),

      setDraftNearFret: (fret) => set({ draftNearFret: fret, draftTaps: [] }),
      setDraftFarFret: (fret) => set({ draftFarFret: fret, draftTaps: [] }),

      commitCalibration: (detected) => {
        const { draftTaps, draftNearFret, draftFarFret } = get();
        if (draftTaps.length !== 4) return;
        const targets = calibrationTargets(draftNearFret, draftFarFret);
        const H = getPerspectiveTransform(targets, draftTaps);
        const calibration: Calibration = {
          H,
          taps: draftTaps,
          nearFret: draftNearFret,
          farFret: draftFarFret,
          createdAt: Date.now(),
        };
        if (detected && detected.length > 0) {
          const anchors = registerMarkers(H, detected);
          if (Object.keys(anchors).length > 0) {
            calibration.markerAnchors = anchors;
          }
        }
        set({ calibration, calibrating: false, draftTaps: [] });
      },

      resetAll: () =>
        set({
          deviceId: null,
          calibration: null,
          selection: DEFAULT_SELECTION,
          showGrid: false,
          tracking: false,
          markerStatus: null,
          calibrating: false,
          draftTaps: [],
          draftNearFret: DEFAULT_NEAR_FRET,
          draftFarFret: DEFAULT_FAR_FRET,
        }),
    }),
    {
      name: 'fretguide',
      // Persist only the durable slice (PRD F2).
      partialize: (st): PersistedState => ({
        deviceId: st.deviceId,
        calibration: st.calibration,
        selection: st.selection,
        showGrid: st.showGrid,
        tracking: st.tracking,
      }),
    },
  ),
);
