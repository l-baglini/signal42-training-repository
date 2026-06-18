import { useEffect, useState } from 'react';

// FR-3.1: personal stress meter 0–100, visible on the HUD
export default function StressMeter({ stress, rageUntil }) {
  const [, force] = useState(0);
  const raging = rageUntil > Date.now();

  useEffect(() => {
    if (!raging) return;
    const t = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [raging]);

  const secondsLeft = Math.max(0, Math.ceil((rageUntil - Date.now()) / 1000));
  const pct = raging ? 100 : stress;
  const color = raging ? 'bg-red-500' : pct > 75 ? 'bg-red-500' : pct > 40 ? 'bg-amber-400' : 'bg-emerald-500';

  return (
    <div className="w-56">
      <div className="flex justify-between text-xs mb-1">
        <span className="font-semibold uppercase tracking-wide text-slate-300">
          {raging ? '😡 RAGE MODE' : 'Stress'}
        </span>
        <span className={raging ? 'text-red-400 font-bold' : 'text-slate-400'}>
          {raging ? `${secondsLeft}s` : `${stress}/100`}
        </span>
      </div>
      <div className={`h-3 rounded-full bg-black/40 overflow-hidden ${raging ? 'ring-2 ring-red-500 animate-pulse' : ''}`}>
        <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
