import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, setSession } from '../api.js';
import AuthLayout from './AuthLayout.jsx';

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { token, user } = await api('/api/auth/login', { method: 'POST', body: { email, password } });
      setSession(token, user);
      navigate(params.get('returnTo') || '/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Log in" subtitle="Your coworkers' desks aren't going to trash themselves.">
      <form onSubmit={submit} className="space-y-3">
        <input className="input" type="email" placeholder="work email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="input" type="password" placeholder="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? '…' : 'Log in'}</button>
      </form>
      <p className="text-sm text-slate-400 mt-4">
        New here? <Link className="text-chaos-red font-semibold" to={`/register?returnTo=${encodeURIComponent(params.get('returnTo') || '/')}`}>Create an account</Link>
      </p>
    </AuthLayout>
  );
}
