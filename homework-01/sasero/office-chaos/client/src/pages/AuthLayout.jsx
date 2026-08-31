export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-4xl font-black tracking-tight">
            <span className="text-chaos-red">■</span> OFFICE CHAOS
          </h1>
          <p className="text-slate-400 mt-1">The workplace stress-relief multiplayer game</p>
        </div>
        <div className="panel p-6">
          <h2 className="text-xl font-bold mb-1">{title}</h2>
          {subtitle && <p className="text-sm text-slate-400 mb-4">{subtitle}</p>}
          {children}
        </div>
        <p className="text-center text-xs text-slate-500 mt-4">
          All destruction is 100% fictional. No real desks were harmed.
        </p>
      </div>
    </div>
  );
}
