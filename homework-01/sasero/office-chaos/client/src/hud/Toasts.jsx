export default function Toasts({ toasts }) {
  return (
    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-40 flex flex-col gap-2 items-center pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast-in panel px-4 py-2.5 text-sm font-semibold shadow-2xl max-w-md text-center ${
            t.kind === 'error' ? 'border-red-500/50 text-red-300' :
            t.kind === 'victim' ? 'border-orange-400/60 text-orange-200' : 'text-slate-100'
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
