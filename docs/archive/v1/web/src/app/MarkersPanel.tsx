/**
 * MarkersPanel: live-tracking toggle + status, and printable ArUco markers.
 *
 * Markers are generated locally from the js-aruco2 dictionary (no network). Print
 * them, cut them out, and attach 2–3 flat to the guitar roughly in the fretboard
 * plane (see README). Then calibrate once — Accept registers the markers and
 * tracking can follow the guitar as it moves.
 */

import { useMemo } from 'react';
import { AR } from 'js-aruco2';
import { useStore } from './store';

const DICTIONARY = 'ARUCO_MIP_36h12';
const MARKER_IDS = [0, 1, 2];

export function MarkersPanel() {
  const tracking = useStore((s) => s.tracking);
  const toggleTracking = useStore((s) => s.toggleTracking);
  const calibration = useStore((s) => s.calibration);
  const status = useStore((s) => s.markerStatus);

  const registered = calibration?.markerAnchors
    ? Object.keys(calibration.markerAnchors).length
    : 0;
  const canTrack = registered > 0;

  const markerSvgs = useMemo(() => {
    const dict = new AR.Dictionary(DICTIONARY);
    return MARKER_IDS.map((id) => ({ id, svg: dict.generateSVG(id) }));
  }, []);

  const printMarkers = () => {
    const w = window.open('', '_blank', 'width=800,height=600');
    if (!w) return;
    const blocks = markerSvgs
      .map(
        ({ id, svg }) =>
          `<figure style="display:inline-block;margin:18px;text-align:center">
             <div style="width:4cm;height:4cm">${svg}</div>
             <figcaption style="font:14px sans-serif">id ${id}</figcaption>
           </figure>`,
      )
      .join('');
    w.document.write(
      `<!doctype html><title>FretGuide markers</title>
       <body style="margin:24px">
         <h2 style="font:600 18px sans-serif">FretGuide tracking markers (${DICTIONARY})</h2>
         <p style="font:14px sans-serif;max-width:48ch">Print, cut out, and attach
         flat to the guitar near the neck (roughly in the fretboard plane). Keep
         them visible and unobstructed.</p>
         ${blocks}
       </body>`,
    );
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div className="panel-section">
      <h2>Tracking</h2>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={tracking && canTrack}
          disabled={!canTrack}
          onChange={toggleTracking}
        />
        <span>Follow the guitar (marker tracking)</span>
      </label>

      <p className={status && status.detected > 0 ? 'marker-ok' : 'marker-warn'}>
        {status && status.detected > 0
          ? `Camera sees ${status.detected} marker(s) right now.`
          : 'Camera sees no markers — they must be in view and large enough to read.'}
      </p>

      <p className="muted">
        {!canTrack ? (
          'No markers registered yet. Attach markers, then calibrate — Accept registers them.'
        ) : !tracking ? (
          `${registered} marker(s) registered. Enable to follow the guitar.`
        ) : status && status.visible > 0 ? (
          <span className="marker-ok">
            ● Tracking — {status.visible}/{status.registered} markers visible.
          </span>
        ) : (
          <span className="marker-warn">
            ○ Markers lost — holding last position. Bring markers back into
            view.
          </span>
        )}
      </p>

      <div className="marker-previews">
        {markerSvgs.map(({ id, svg }) => (
          <figure key={id} className="marker-fig">
            <div
              className="marker-img"
              // Locally-generated SVG from the bundled dictionary (safe).
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <figcaption>id {id}</figcaption>
          </figure>
        ))}
      </div>
      <button onClick={printMarkers}>Print markers</button>
    </div>
  );
}
