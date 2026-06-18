import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import AvatarSVG from '../avatar/AvatarSVG.jsx';

const TITLE_EMOJI = ['🏆', '🥈', '🥉'];

function Row({ entry, columns }) {
  return (
    <li className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-white/5">
      <span className="w-5 text-right text-xs text-slate-400">{entry.rank}</span>
      <AvatarSVG config={entry.avatar} size={20} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">{entry.displayName}</div>
        {entry.title && (
          <div className="text-[10px] text-amber-300">
            {TITLE_EMOJI[entry.rank - 1]} {entry.title}
          </div>
        )}
      </div>
      <div className="text-right text-xs text-slate-300 whitespace-nowrap">{columns(entry)}</div>
    </li>
  );
}

// FR-7.4: both boards visible from the main HUD, togglable via tabs
export default function LeaderboardPanel({ workspaceId, refreshKey }) {
  const [tab, setTab] = useState('destruction');
  const [board, setBoard] = useState(null);
  const [shame, setShame] = useState(null);

  const load = useCallback(() => {
    api(`/api/workspaces/${workspaceId}/leaderboard`).then(setBoard).catch(() => {});
  }, [workspaceId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load, refreshKey]);

  const entries = board ? board[tab] : [];

  return (
    <div className="panel w-72 flex flex-col max-h-[60vh]">
      <div className="flex border-b border-white/10">
        {[
          ['destruction', '💥 Destruction'],
          ['pvp', '🥊 PvP'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-2 text-sm font-semibold ${
              tab === key ? 'text-white border-b-2 border-chaos-red' : 'text-slate-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <ul className="flex-1 overflow-y-auto p-1">
        {entries.length === 0 && (
          <li className="text-center text-xs text-slate-500 py-6">
            Nothing yet this week.<br />Go break something. 🔨
          </li>
        )}
        {entries.map((e) =>
          tab === 'destruction' ? (
            <Row key={e.userId} entry={e} columns={(x) => <>
              <b>{x.destructionScore}</b> pts
              <div className="text-[10px] text-slate-500">{x.destructions} 💥 · {x.fires} 🔥 · {x.combos} ⛓️</div>
            </>} />
          ) : (
            <Row key={e.userId} entry={e} columns={(x) => <>
              <b>{x.kos}</b> KO{x.kos === 1 ? '' : 's'}
              <div className="text-[10px] text-slate-500">streak {x.bestKoStreak} · KO'd {x.timesKnockedOut}×</div>
            </>} />
          )
        )}
      </ul>
      <div className="border-t border-white/10 p-2 flex justify-between items-center text-[10px] text-slate-500">
        <span>Resets Monday 00:00 UTC</span>
        <button
          className="text-slate-300 hover:text-white font-semibold"
          onClick={() => api(`/api/workspaces/${workspaceId}/hall-of-shame`).then((d) => setShame(d.snapshots)).catch(() => {})}
        >
          Hall of Shame →
        </button>
      </div>

      {shame && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShame(null)}>
          <div className="panel p-5 max-w-md w-full max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-3">🏛️ All-Time Hall of Shame</h3>
            {shame.length === 0 && <p className="text-sm text-slate-400">No finished weeks yet. History is written on Mondays.</p>}
            {shame.map((s) => (
              <div key={s.weekStart} className="mb-4">
                <div className="text-xs text-slate-400 mb-1">Week of {new Date(s.weekStart).toLocaleDateString()}</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white/5 rounded p-2">
                    <div className="font-semibold mb-1">💥 Destruction</div>
                    {(s.data.destructionTop3 || []).map((e, i) => (
                      <div key={e.userId}>{TITLE_EMOJI[i]} {e.displayName} — {e.destructionScore}</div>
                    ))}
                  </div>
                  <div className="bg-white/5 rounded p-2">
                    <div className="font-semibold mb-1">🥊 PvP</div>
                    {(s.data.pvpTop3 || []).map((e, i) => (
                      <div key={e.userId}>{TITLE_EMOJI[i]} {e.displayName} — {e.kos} KOs</div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            <button className="btn-ghost w-full mt-2" onClick={() => setShame(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
