import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, getToken } from '../api.js';
import BuildScene from '../game/three/BuildScene.js';
import { FLOOR_BRUSHES, CATALOG } from '../game/three/catalog.js';

const SIZES = [
  { label: 'Small', width: 18, height: 14 },
  { label: 'Medium', width: 24, height: 18 },
  { label: 'Large', width: 32, height: 24 },
];

function blankLayout(width, height) {
  const tiles = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => (x === 0 || y === 0 || x === width - 1 || y === height - 1 ? 1 : 0))
  );
  return { width, height, tiles, objects: [] };
}

export default function BuildPage() {
  const { id: workspaceId } = useParams();
  const navigate = useNavigate();
  const hostRef = useRef(null);
  const sceneRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [brushKey, setBrushKey] = useState('object:desk');
  const [stats, setStats] = useState({ deskCount: 0, objectCount: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fatal, setFatal] = useState('');
  const [size, setSize] = useState(SIZES[1]);

  // guard: only the admin of a workspace with no layout yet may build
  useEffect(() => {
    if (!getToken()) return navigate('/login');
    api(`/api/workspaces/${workspaceId}`)
      .then((d) => {
        if (d.workspace.hasLayout) return navigate(`/w/${workspaceId}`, { replace: true });
        if (d.you.role !== 'admin') return navigate(`/w/${workspaceId}`, { replace: true });
        setReady(true);
      })
      .catch((e) => setFatal(e.message));
  }, [workspaceId, navigate]);

  const initScene = useCallback((layout) => {
    if (sceneRef.current) {
      sceneRef.current.dispose();
      sceneRef.current = null;
    }
    sceneRef.current = new BuildScene({ canvas: hostRef.current, layout, onStats: setStats });
    const [kind, val] = brushKey.split(':');
    applyBrush(kind, val);
  }, [brushKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // create the editor scene once ready (start from a blank medium office)
  useEffect(() => {
    if (!ready || !hostRef.current) return;
    initScene(blankLayout(size.width, size.height));
    const onResize = () => sceneRef.current?.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyBrush(kind, val) {
    const s = sceneRef.current;
    if (!s) return;
    if (kind === 'floor') s.setBrush({ kind: 'floor', tile: Number(val) });
    else if (kind === 'object') s.setBrush({ kind: 'object', type: val });
    else if (kind === 'tool') s.setBrush({ kind: 'tool', tool: val });
  }
  function pick(kind, val) {
    setBrushKey(`${kind}:${val}`);
    applyBrush(kind, val);
  }

  function changeSize(s) {
    setSize(s);
    initScene(blankLayout(s.width, s.height));
  }
  function loadDefault() {
    api('/api/default-layout').then(({ layout }) => {
      setSize({ label: 'Default', width: layout.width, height: layout.height });
      initScene(layout);
    });
  }

  async function save() {
    const layout = sceneRef.current?.getLayout();
    if (!layout) return;
    setSaving(true);
    setError('');
    try {
      await api(`/api/workspaces/${workspaceId}/layout`, { method: 'PUT', body: { layout } });
      navigate(`/w/${workspaceId}`, { replace: true });
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  const byCat = useMemo(() => {
    const m = {};
    for (const c of CATALOG) (m[c.cat] ||= []).push(c);
    return m;
  }, []);

  if (fatal) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="panel p-8 text-center">
          <p className="text-3xl mb-2">🚧</p>
          <p className="font-semibold">{fatal}</p>
        </div>
      </div>
    );
  }

  const sel = (k) => (brushKey === k ? 'border-chaos-red bg-white/15' : 'border-white/10 hover:bg-white/10');

  return (
    <div className="h-screen w-screen overflow-hidden relative select-none bg-chaos-dark">
      <canvas ref={hostRef} className="absolute inset-0 w-full h-full block" />

      {/* top bar */}
      <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between px-4 py-2 bg-gradient-to-b from-chaos-dark/95 to-transparent">
        <div className="flex items-center gap-3">
          <span className="font-black text-lg"><span className="text-chaos-red">■</span> Build your office</span>
          <div className="flex gap-1">
            {SIZES.map((s) => (
              <button key={s.label} onClick={() => changeSize(s)} className={`btn text-xs ${size.label === s.label ? 'bg-chaos-red text-white' : 'bg-white/10 hover:bg-white/20'}`}>
                {s.label}
              </button>
            ))}
            <button onClick={loadDefault} className="btn text-xs bg-white/10 hover:bg-white/20" title="Start from the classic office">Default</button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-300">
            🗄️ Desks: <b className={stats.deskCount ? 'text-emerald-400' : 'text-red-400'}>{stats.deskCount}</b>
            <span className="text-slate-500"> · {stats.objectCount} objects</span>
          </span>
          <button className="btn-primary" disabled={saving || stats.deskCount < 1} onClick={save}>
            {saving ? 'Saving…' : 'Open the office →'}
          </button>
        </div>
      </div>
      {error && <div className="absolute top-14 right-4 z-30 panel px-3 py-2 text-sm text-red-300">{error}</div>}

      {/* left palette */}
      <div className="absolute top-16 left-3 z-30 panel p-3 w-56 max-h-[80vh] overflow-y-auto space-y-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Floors & walls</h3>
          <div className="grid grid-cols-3 gap-1">
            {FLOOR_BRUSHES.map((f) => (
              <button key={f.tile} onClick={() => pick('floor', f.tile)} className={`rounded-lg border p-1 text-[10px] flex flex-col items-center gap-0.5 ${sel(`floor:${f.tile}`)}`} title={f.label}>
                <span className="h-5 w-5 rounded" style={{ background: f.swatch }} />
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {Object.entries(byCat).map(([cat, items]) => (
          <div key={cat}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">{cat}</h3>
            <div className="grid grid-cols-3 gap-1">
              {items.map((c) => (
                <button key={c.type} onClick={() => pick('object', c.type)} className={`rounded-lg border p-1 text-[10px] flex flex-col items-center gap-0.5 ${sel(`object:${c.type}`)}`} title={c.label}>
                  <span className="text-lg leading-none">{c.emoji}</span>
                  <span className="truncate w-full text-center">{c.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Tools</h3>
          <div className="grid grid-cols-2 gap-1">
            <button onClick={() => pick('tool', 'move')} className={`rounded-lg border p-1.5 text-xs ${sel('tool:move')}`}>✋ Move</button>
            <button onClick={() => pick('tool', 'erase')} className={`rounded-lg border p-1.5 text-xs ${sel('tool:erase')}`}>🧹 Erase</button>
          </div>
        </div>
      </div>

      {/* controls hint */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 panel px-4 py-2 text-xs text-slate-300 text-center">
        <b>Left-click</b> to paint / place · <b>R</b> rotate · <b>Move</b> tool to drag, <b>Delete</b> to remove ·
        <b> right-drag</b> orbit · <b>middle-drag</b> pan · <b>scroll</b> zoom
        {stats.deskCount < 1 && <div className="text-amber-300 mt-1">Place at least one 🗄️ desk — players spawn at desks.</div>}
      </div>
    </div>
  );
}
