// Sprint stamina bar (hold Left Shift to run). Turns red + "EXHAUSTED" while
// locked out after a full drain, until it recovers enough to sprint again.
export default function SprintMeter({ stamina = 100, locked = false }) {
  const pct = Math.max(0, Math.min(100, stamina));
  const color = locked ? 'bg-red-500' : pct > 50 ? 'bg-sky-400' : pct > 20 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="w-40">
      <div className="flex justify-between text-xs mb-1">
        <span className="font-semibold uppercase tracking-wide text-slate-300">⚡ Sprint</span>
        <span className={locked ? 'text-red-400 font-bold' : 'text-slate-400'}>
          {locked ? 'EXHAUSTED' : 'Shift'}
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-black/40 overflow-hidden">
        <div className={`h-full ${color} transition-[width] duration-100`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
