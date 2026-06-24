/**
 * Global app state (Zustand) + localStorage persistence.
 *
 * Persisted (PRD F2): { deviceId, calibration, selection, showGrid }.
 * NOT persisted: the in-progress calibration draft (taps being tapped).
 *
 * COORDINATE CONVENTION: calibration taps and the homography H operate in
 * NORMALIZED display space — (0,0) = top-left of the displayed video content,
 * (1,1) = bottom-right. This is resolution-independent, so a stored calibration
 * reproduces the same overlay across window resizes and reloads (PRD A2, B2, §7).
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Calibration, Selection, Tap } from '../core/types';
import { getPerspectiveTransform, calibrationTargets } from '../core/geometry';

export const DEFAULT_FAR_FRET = 12;

const DEFAULT_SELECTION: Selection = { mode: 'chord', id: 'G' };

interface PersistedState {
  deviceId: string | null;
  calibration: Calibration | null;
  selection: Selection;
  showGrid: boolean;
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

  // ── Calibration draft (not persisted) ──
  calibrating: boolean;
  draftTaps: Tap[];
  draftFarFret: number;
  startCalibration: () => void;
  cancelCalibration: () => void;
  addTap: (tap: Tap) => void;
  undoTap: () => void;
  setDraftFarFret: (fret: number) => void;
  /** Solve H from the 4 draft taps and commit; no-op unless exactly 4 taps. */
  commitCalibration: () => void;

  resetAll: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      deviceId: null,
      calibration: null,
      selection: DEFAULT_SELECTION,
      showGrid: false,

      calibrating: false,
      draftTaps: [],
      draftFarFret: DEFAULT_FAR_FRET,

      setDeviceId: (id) => set({ deviceId: id }),
      setSelection: (s) => set({ selection: s }),
      toggleGrid: () => set((st) => ({ showGrid: !st.showGrid })),
      setCalibration: (c) => set({ calibration: c }),

      startCalibration: () =>
        set((st) => ({
          calibrating: true,
          draftTaps: [],
          // Seed the draft far fret from the existing calibration if any.
          draftFarFret: st.calibration?.farFret ?? DEFAULT_FAR_FRET,
        })),

      cancelCalibration: () => set({ calibrating: false, draftTaps: [] }),

      addTap: (tap) =>
        set((st) =>
          st.draftTaps.length >= 4 ? st : { draftTaps: [...st.draftTaps, tap] },
        ),

      undoTap: () => set((st) => ({ draftTaps: st.draftTaps.slice(0, -1) })),

      setDraftFarFret: (fret) => set({ draftFarFret: fret, draftTaps: [] }),

      commitCalibration: () => {
        const { draftTaps, draftFarFret } = get();
        if (draftTaps.length !== 4) return;
        const targets = calibrationTargets(draftFarFret);
        const H = getPerspectiveTransform(targets, draftTaps);
        const calibration: Calibration = {
          H,
          taps: draftTaps,
          farFret: draftFarFret,
          createdAt: Date.now(),
        };
        set({ calibration, calibrating: false, draftTaps: [] });
      },

      resetAll: () =>
        set({
          deviceId: null,
          calibration: null,
          selection: DEFAULT_SELECTION,
          showGrid: false,
          calibrating: false,
          draftTaps: [],
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
      }),
    },
  ),
);
