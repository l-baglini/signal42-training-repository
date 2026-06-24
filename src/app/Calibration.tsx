/**
 * Calibration: the 4-tap guided control panel (PRD §5.4, B1–B4).
 *
 * The visual markers and grid-preview are drawn on the OverlayCanvas; this
 * panel owns the guided prompts, undo, far-fret selection, and accept/cancel.
 * Taps are captured by the canvas in the fixed prompted order:
 *   1) Nut × Low E  2) Nut × High E  3) Far × High E  4) Far × Low E
 */

import { calibrationPrompts } from '../core/geometry';
import { useStore } from './store';

const FAR_FRET_CHOICES = [5, 7, 9, 12, 15];

export function Calibration() {
  const calibrating = useStore((s) => s.calibrating);
  const draftTaps = useStore((s) => s.draftTaps);
  const draftFarFret = useStore((s) => s.draftFarFret);
  const calibration = useStore((s) => s.calibration);
  const startCalibration = useStore((s) => s.startCalibration);
  const cancelCalibration = useStore((s) => s.cancelCalibration);
  const undoTap = useStore((s) => s.undoTap);
  const commitCalibration = useStore((s) => s.commitCalibration);
  const setDraftFarFret = useStore((s) => s.setDraftFarFret);

  if (!calibrating) {
    return (
      <div className="panel-section">
        <h2>Calibration</h2>
        <p className="muted">
          {calibration
            ? `Calibrated to fret ${calibration.farFret}. Recalibrate if the guitar drifts.`
            : 'Not calibrated. Tap the 4 fretboard corners to align the overlay.'}
        </p>
        <button className="primary" onClick={startCalibration}>
          {calibration ? 'Recalibrate' : 'Start calibration'} <kbd>C</kbd>
        </button>
      </div>
    );
  }

  const prompts = calibrationPrompts(draftFarFret);
  const next = draftTaps.length; // index of the next tap to place
  const done = draftTaps.length === 4;

  return (
    <div className="panel-section calibrating">
      <h2>Calibration — tap {Math.min(next + 1, 4)} of 4</h2>

      <label className="field">
        <span>Far fret</span>
        <select
          value={draftFarFret}
          onChange={(e) => setDraftFarFret(Number(e.target.value))}
          disabled={draftTaps.length > 0}
        >
          {FAR_FRET_CHOICES.map((f) => (
            <option key={f} value={f}>
              Fret {f}
            </option>
          ))}
        </select>
      </label>

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

      <div className="button-row">
        <button onClick={undoTap} disabled={draftTaps.length === 0}>
          Undo last tap
        </button>
        <button
          className="primary"
          onClick={commitCalibration}
          disabled={!done}
        >
          Accept
        </button>
        <button onClick={cancelCalibration}>Cancel</button>
      </div>
    </div>
  );
}
