import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, clearSession, getStoredUser } from '../api.js';

export default function Hub() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const [memberships, setMemberships] = useState(null);
  const [name, setName] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/auth/me')
      .then((d) => setMemberships(d.memberships))
      .catch(() => {
        clearSession();
        navigate('/login');
      });
  }, [navigate]);

  async function createWorkspace(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { workspace } = await api('/api/workspaces', { method: 'POST', body: { name } });
      navigate(`/w/${workspace.id}/build`); // design the office before opening it
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  function joinViaLink(e) {
    e.preventDefault();
    const match = inviteUrl.match(/invite\/([a-f0-9]+)/i);
    if (match) navigate(`/invite/${match[1]}`);
    else setError('That does not look like an Office Chaos invite link');
  }

  return (
    <div className="min-h-screen p-6 max-w-3xl mx-auto">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-black">
          <span className="text-chaos-red">■</span> OFFICE CHAOS
        </h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-400">{user?.displayName}</span>
          <button
            className="btn-ghost text-sm"
            onClick={() => {
              clearSession();
              navigate('/login');
            }}
          >
            Log out
          </button>
        </div>
      </header>

      <section className="panel p-5 mb-6">
        <h2 className="font-bold text-lg mb-3">Your workspaces</h2>
        {memberships === null ? (
          <p className="text-slate-400">Loading…</p>
        ) : memberships.length === 0 ? (
          <p className="text-slate-400">No workspace yet. Create one or paste an invite link below.</p>
        ) : (
          <ul className="space-y-2">
            {memberships.map((m) => (
              <li key={m.workspaceId}>
                <Link
                  to={`/w/${m.workspaceId}`}
                  className="flex items-center justify-between rounded-lg bg-white/5 px-4 py-3 hover:bg-white/10 transition-colors"
                >
                  <span className="font-semibold">{m.workspaceName}</span>
                  <span className="text-xs text-slate-400">
                    desk #{m.deskIndex + 1} {m.role === 'admin' && '· admin'} · enter →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid md:grid-cols-2 gap-6">
        <section className="panel p-5">
          <h2 className="font-bold mb-1">Create a workspace</h2>
          <p className="text-sm text-slate-400 mb-3">One per company or team — an isolated game room.</p>
          <form onSubmit={createWorkspace} className="flex gap-2">
            <input className="input" placeholder="e.g. ACME Corp" value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} />
            <button className="btn-primary shrink-0" disabled={busy}>Create</button>
          </form>
        </section>

        <section className="panel p-5">
          <h2 className="font-bold mb-1">Join with an invite link</h2>
          <p className="text-sm text-slate-400 mb-3">A colleague sent you a link? Paste it here.</p>
          <form onSubmit={joinViaLink} className="flex gap-2">
            <input className="input" placeholder="https://…/invite/abc123" value={inviteUrl} onChange={(e) => setInviteUrl(e.target.value)} />
            <button className="btn-ghost shrink-0">Join</button>
          </form>
        </section>
      </div>
      {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
    </div>
  );
}
