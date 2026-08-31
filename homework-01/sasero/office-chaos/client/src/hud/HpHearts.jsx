// FR-6.3: HP bar visible on HUD (3 hit points)
export default function HpHearts({ hp, max = 3, ko }) {
  return (
    <div className="flex items-center gap-1 text-xl" title={ko ? 'Knocked out!' : `${hp}/${max} HP`}>
      {ko
        ? <span className="animate-spin inline-block">💫</span>
        : Array.from({ length: max }, (_, i) => (
            <span key={i} className={i < hp ? '' : 'opacity-25 grayscale'}>❤️</span>
          ))}
    </div>
  );
}
