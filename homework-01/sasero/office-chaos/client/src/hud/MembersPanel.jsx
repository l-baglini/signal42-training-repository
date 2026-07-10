import AvatarSVG from '../avatar/AvatarSVG.jsx';

const STATUS_DOT = {
  online: 'bg-emerald-400',
  afk: 'bg-amber-400',
  offline: 'bg-slate-600',
};

// FR-8.5 presence + FR-1.5 admin moderation
export default function MembersPanel({ members, presence, isAdmin, meId, onRemove }) {
  return (
    <div className="panel w-72 max-h-[28vh] flex flex-col">
      <div className="px-3 py-2 border-b border-white/10 text-sm font-semibold">
        Colleagues ({members.length}/20)
      </div>
      <ul className="overflow-y-auto p-1">
        {members.map((m) => {
          const status = presence[m.userId] || 'offline';
          return (
            <li key={m.userId} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/5">
              <span className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[status]}`} title={status} />
              <AvatarSVG config={m.avatar} size={18} />
              <div className="flex-1 min-w-0">
                <span className="text-sm truncate">
                  {m.displayName}
                  {m.userId === meId && <span className="text-slate-500"> (you)</span>}
                  {m.role === 'admin' && ' 👑'}
                </span>
                {m.jobTitle && <div className="text-[10px] text-slate-500 truncate">{m.jobTitle}</div>}
              </div>
              <span className="text-[10px] text-slate-500">desk {m.deskIndex + 1}</span>
              {isAdmin && m.userId !== meId && (
                <button
                  className="text-xs text-red-400 hover:text-red-300 px-1"
                  title="Remove from workspace"
                  onClick={() => onRemove(m)}
                >
                  ✕
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
