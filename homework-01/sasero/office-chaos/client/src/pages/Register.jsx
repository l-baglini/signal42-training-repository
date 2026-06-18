import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, setSession } from '../api.js';
import AuthLayout from './AuthLayout.jsx';

export default function Register() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '', displayName: '', jobTitle: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { token, user } = await api('/api/auth/register', { method: 'POST', body: form });
      setSession(token, user);
      navigate(params.get('returnTo') || '/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Create account" subtitle="Under 2 minutes to your first desk destruction. Promise.">
      <form onSubmit={submit} className="space-y-3">
        <input className="input" type="email" placeholder="work email" value={form.email} onChange={set('email')} required />
        <input className="input" type="password" placeholder="password (min 8 chars)" value={form.password} onChange={set('password')} required minLength={8} />
        <input className="input" placeholder="display name" value={form.displayName} onChange={set('displayName')} required maxLength={30} />
        <input className="input" placeholder="job title tagline (optional)" value={form.jobTitle} onChange={set('jobTitle')} maxLength={40} />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? '…' : 'Sign up'}</button>
      </form>
      <p className="text-sm text-slate-400 mt-4">
        Already playing? <Link className="text-chaos-red font-semibold" to="/login">Log in</Link>
      </p>
    </AuthLayout>
  );
}
