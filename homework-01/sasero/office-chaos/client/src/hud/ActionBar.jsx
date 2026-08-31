const EMOJIS = ['😂', '🔥', '👏', '😱', '💀', '🍿'];

export default function ActionBar({ onMeeting, onEmoji }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* FR-3.3: manual meeting trigger */}
      <button className="btn-ghost text-sm" onClick={onMeeting} title="+10 stress. Simulates real life.">
        📅 Log a meeting <span className="text-red-400 font-bold">+10</span>
      </button>
      <div className="flex gap-1 ml-1">
        {EMOJIS.map((e) => (
          <button
            key={e}
            className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/25 text-base"
            onClick={() => onEmoji(e)}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
