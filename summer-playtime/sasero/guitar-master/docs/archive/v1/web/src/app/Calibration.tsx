/**
 * Calibration: the 4-tap guided control panel (PRD §5.4, B1–B4) + near/far fret
 * selection and live marker-detection feedback.
 *
 * The visual markers and grid-preview are drawn on the OverlayCanvas; this panel
 * owns the guided prompts, undo, near/far-fret selection, and accept/cancel.
 * Taps are captured by the canvas in the fixed prompted order:
 *   1) Near × Low E  2) Near × High E  3) Far × High E  4) Far × Low E
 *
 * On Accept we also snapshot any visible ArUco markers (detectNow) so live
 * tracking can re-solve the homography per frame afterwards.
 */

import { useEffect, useState } from 'react';
import { calibrationPrompts } from '../core/geometry';
import type { DetectedMarker } from '../core/types';
import { useStore } from './store';

const NEAR_FRET_CHOICES = [0, 1, 2, 3, 5, 7];
const FAR_FRET_CHOICES = [5, 7, 9, 12, 15];

interface CalibrationProps {
  /** Detect markers in the current frame (for registration on Accept). */
  detectNow: () => DetectedMarker[];
}

export function Calibration({ detectNow }: CalibrationProps) {
  const calibrating = useStore((s) => s.calibrating);
  const draftTaps = useStore((s) => s.draftTaps);
  const draftNearFret = useStore((s) => s.draftNearFret);
  const draftFarFret = useStore((s) => s.draftFarFret);
  const calibration = useStore((s) => s.calibration);
  const startCalibration = useStore((s) => s.startCalibration);
  const cancelCalibration = useStore((s) => s.cancelCalibration);
  const undoTap = useStore((s) => s.undoTap);
  const commitCalibration = useStore((s) => s.commitCalibration);
  const setDraftNearFret = useStore((s) => s.setDraftNearFret);
  const setDraftFarFret = useStore((s) => s.setDraftFarFret);

  // Live count of markers visible during calibration, for user feedback.
  const [markerCount, setMarkerCount] = useState(0);
  useEffect(() => {
    if (!calibrating) return;
    const tick = () => setMarkerCount(detectNow().length);
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [calibrating, detectNow]);

  if (!calibrating) {
    const trackable =
      calibration?.markerAnchors &&
      Object.keys(calibration.markerAnchors).length > 0;
    return (
      <div className="panel-section">
        <h2>Calibration</h2>
        <p className="muted">
          {calibration
            ? `Calibrated (frets ${calibration.nearFret}–${calibration.farFret}). ${
                trackable
                  ? `${Object.keys(calibration.markerAnchors!).length} marker(s) registered for tracking.`
                  : 'No markers registered — overlay is fixed until you recalibrate.'
              }`
            : 'Not calibrated. Tap the 4 fretboard corners to align the overlay.'}
        </p>
        <button className="primary" onClick={startCalibration}>
          {calibration ? 'Recalibrate' : 'Start calibration'} <kbd>C</kbd>
        </button>
      </div>
    );
  }

  const prompts = calibrationPrompts(draftNearFret, draftFarFret);
  const next = draftTaps.length; // index of the next tap to place
  const done = draftTaps.length === 4;
  const lockFrets = draftTaps.length > 0;

  return (
    <div className="panel-section calibrating">
      <h2>Calibration — tap {Math.min(next + 1, 4)} of 4</h2>

      <div className="fret-fields">
        <label className="field">
          <span>Near fret</span>
          <select
            value={draftNearFret}
            onChange={(e) => setDraftNearFret(Number(e.target.value))}
            disabled={lockFrets}
          >
            {NEAR_FRET_CHOICES.filter((f) => f < draftFarFret).map((f) => (
              <option key={f} value={f}>
                {f === 0 ? 'Nut' : `Fret ${f}`}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Far fret</span>
          <select
            value={draftFarFret}
            onChange={(e) => setDraftFarFret(Number(e.target.value))}
            disabled={lockFrets}
          >
            {FAR_FRET_CHOICES.filter((f) => f > draftNearFret).map((f) => (
              <option key={f} value={f}>
                Fret {f}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ol className="tap-list">
        {prompts.map((p, i) => (
          <li
            key={i}
            className={i < next ? 'done' : i === next ? 'current' : 'pending'}
          >
            {i < next ? '✓ ' : i === next ? '→ ' : ''}
            {p.label}
          </li>
        ))}
      </ol>

      {!done ? (
        <p className="muted">Click the point on the video for the “→” step.</p>
      ) : (
        <p className="muted">
          Check the green grid lines up with the real frets, then accept.
        </p>
      )}

      <p className={markerCount > 0 ? 'marker-ok' : 'muted'}>
        {markerCount > 0
          ? `● ${markerCount} marker(s) detected — tracking will be enabled.`
          : '○ No markers detected — calibration still works, but the overlay won’t follow movement.'}
      </p>

      <div className="button-row">
        <button onClick={undoTap} disabled={draftTaps.length === 0}>
          Undo last tap
        </button>
        <button
          className="primary"
          onClick={() => commitCalibration(detectNow())}
          disabled={!done}
        >
          Accept
        </button>
        <button onClick={cancelCalibration}>Cancel</button>
      </div>
    </div>
  );
}
