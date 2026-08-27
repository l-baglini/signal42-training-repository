/**
 * SelectionPanel: Scale/Chord mode toggle and the v1 content pickers (E1, E1a,
 * E1b, E2). Single G major scale box + the seven diatonic chords. Structured so
 * more scales/chords drop in as data later.
 */

import { CHORD_IDS, SCALES, SCALE_IDS } from '../core/content';
import type { Selection } from '../core/types';
import { useStore } from './store';

export function SelectionPanel() {
  const selection = useStore((s) => s.selection);
  const setSelection = useStore((s) => s.setSelection);
  const showGrid = useStore((s) => s.showGrid);
  const toggleGrid = useStore((s) => s.toggleGrid);

  const setMode = (mode: Selection['mode']) => {
    if (mode === selection.mode) return;
    setSelection(
      mode === 'scale'
        ? { mode: 'scale', id: SCALE_IDS[0]! }
        : { mode: 'chord', id: CHORD_IDS[0]! },
    );
  };

  return (
    <div className="panel-section">
      <h2>Selection</h2>

      <div className="segmented">
        <button
          className={selection.mode === 'scale' ? 'active' : ''}
          onClick={() => setMode('scale')}
        >
          Scale
        </button>
        <button
          className={selection.mode === 'chord' ? 'active' : ''}
          onClick={() => setMode('chord')}
        >
          Chord
        </button>
      </div>

      {selection.mode === 'scale' ? (
        <label className="field">
          <span>Scale</span>
          <select
            value={selection.id}
            onChange={(e) =>
              setSelection({ mode: 'scale', id: e.target.value })
            }
          >
            {SCALE_IDS.map((id) => (
              <option key={id} value={id}>
                {SCALES[id]!.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div className="field">
          <span>Chord</span>
          <div className="chord-grid">
            {CHORD_IDS.map((id) => (
              <button
                key={id}
                className={selection.id === id ? 'chip active' : 'chip'}
                onClick={() => setSelection({ mode: 'chord', id })}
              >
                {id}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="checkbox">
        <input type="checkbox" checked={showGrid} onChange={toggleGrid} />
        <span>
          Show fret grid <kbd>G</kbd>
        </span>
      </label>
    </div>
  );
}
