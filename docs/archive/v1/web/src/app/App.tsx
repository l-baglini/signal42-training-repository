/**
 * App shell: lays out the live video + overlay stage and the control panel,
 * wires the camera stream, marker tracking, hotkeys, error banner, and
 * "reset all".
 *
 * Local-only (PRD F1/§7): no network calls. The camera stream and ArUco
 * detection are in-memory only.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraPicker, CameraVideo, useCameraStream } from './Camera';
import { OverlayCanvas } from './OverlayCanvas';
import { Calibration } from './Calibration';
import { SelectionPanel } from './SelectionPanel';
import { MarkersPanel } from './MarkersPanel';
import { useMarkerTracking, type LiveHomography } from './useMarkerTracking';
import { useStore } from './store';

export function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveHRef = useRef<LiveHomography>({
    H: null,
    updatedAt: 0,
    markers: [],
  });
  const [aspect, setAspect] = useState(16 / 9);
  const [error, setError] = useState<string | null>(null);

  const deviceId = useStore((s) => s.deviceId);
  const calibration = useStore((s) => s.calibration);
  const calibrating = useStore((s) => s.calibrating);
  const startCalibration = useStore((s) => s.startCalibration);
  const toggleGrid = useStore((s) => s.toggleGrid);
  const toggleTracking = useStore((s) => s.toggleTracking);
  const resetAll = useStore((s) => s.resetAll);

  const onError = useCallback((m: string | null) => setError(m), []);
  useCameraStream(videoRef, deviceId, onError);
  const { detectNow } = useMarkerTracking(videoRef, liveHRef);

  // Hotkeys: C = (re)calibrate, G = toggle grid, T = toggle tracking.
  // Ignored while typing in inputs.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA')
      ) {
        return;
      }
      if (e.key === 'c' || e.key === 'C') {
        if (!useStore.getState().calibrating) startCalibration();
      } else if (e.key === 'g' || e.key === 'G') {
        toggleGrid();
      } else if (e.key === 't' || e.key === 'T') {
        const cal = useStore.getState().calibration;
        if (cal?.markerAnchors) toggleTracking();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [startCalibration, toggleGrid, toggleTracking]);

  const needsCalibration = !calibration && !calibrating;

  return (
    <div className="app">
      <header className="app-header">
        <h1>FretGuide</h1>
        <div className="header-actions">
          <button onClick={startCalibration} disabled={calibrating}>
            {calibration ? 'Recalibrate' : 'Calibrate'} <kbd>C</kbd>
          </button>
          <button
            className="ghost"
            onClick={() => {
              if (
                window.confirm(
                  'Reset all saved state (calibration, selection, camera)?',
                )
              ) {
                resetAll();
              }
            }}
          >
            Reset all
          </button>
        </div>
      </header>

      {error && <div className="banner error">{error}</div>}

      <main className="layout">
        <section className="stage" style={{ aspectRatio: String(aspect) }}>
          <CameraVideo videoRef={videoRef} onAspectRatio={setAspect} />
          <OverlayCanvas canvasRef={canvasRef} liveHRef={liveHRef} />
          {needsCalibration && (
            <div className="stage-hint">
              Select your camera, then press <kbd>C</kbd> to calibrate.
            </div>
          )}
          {calibrating && (
            <div className="stage-hint top">
              Tap the prompted fretboard corners on the video.
            </div>
          )}
        </section>

        <aside className="panel">
          <div className="panel-section">
            <h2>Camera</h2>
            <CameraPicker />
          </div>
          <Calibration detectNow={detectNow} />
          <MarkersPanel />
          <SelectionPanel />
        </aside>
      </main>

      <footer className="app-footer">
        <span>
          Local-only · frames never leave this device · standard tuning, string
          1 = high E
        </span>
      </footer>
    </div>
  );
}
