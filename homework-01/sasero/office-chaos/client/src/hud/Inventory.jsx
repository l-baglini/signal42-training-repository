const WEAPONS = {
  fists: { emoji: '👊', name: 'Bare Hands' },
  keyboard: { emoji: '⌨️', name: 'Keyboard' },
  stapler: { emoji: '📎', name: 'Stapler' },
  chair: { emoji: '🪑', name: 'Office Chair' },
  monitor: { emoji: '🖥️', name: 'Monitor' },
};

function Slot({ index, active, emoji, label, sub, children, onSelect, dim }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(index)}
      className={`relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left transition-colors ${
        active ? 'border-chaos-red bg-white/10' : 'border-white/10 hover:bg-white/5'
      }`}
    >
      <span className="absolute -top-1.5 -left-1.5 h-4 w-4 rounded bg-chaos-dark border border-white/20 text-[9px] font-bold flex items-center justify-center">
        {index}
      </span>
      <span className={`text-2xl leading-none ${dim ? 'opacity-30 grayscale' : ''}`}>{emoji}</span>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
        {sub ? <div className="text-sm font-semibold leading-tight">{sub}</div> : children}
      </div>
    </button>
  );
}

// Three selectable tool slots: 1 weapon/hands · 2 extinguisher · 3 lighter.
export default function Inventory({ activeSlot = 1, onSelect, weapon = 'fists' }) {
  const w = WEAPONS[weapon] || WEAPONS.fists;
  return (
    <div className="panel p-2 flex items-center gap-2">
      <Slot index={1} active={activeSlot === 1} emoji={w.emoji} label="Weapon" sub={w.name} onSelect={onSelect} />
      <Slot index={2} active={activeSlot === 2} emoji="🧯" label="Extinguisher" sub="Put out fire" onSelect={onSelect} />
      <Slot index={3} active={activeSlot === 3} emoji="🔥" label="Lighter" sub="Set fire" onSelect={onSelect} />
    </div>
  );
}
