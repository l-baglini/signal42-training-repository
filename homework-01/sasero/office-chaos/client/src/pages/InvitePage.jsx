import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';

export default function InvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const accepted = useRef(false);

  useEffect(() => {
    if (accepted.current) return; // StrictMode double-invoke guard
    accepted.current = true;
    api(`/api/invites/${token}/accept`, { method: 'POST' })
      .then(({ workspace }) => navigate(`/w/${workspace.id}`, { replace: true }))
      .catch((err) => setError(err.message));
  }, [token, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="panel p-8 text-center max-w-sm">
        {error ? (
          <>
            <p className="text-3xl mb-2">😬</p>
            <p className="font-semibold mb-2">{error}</p>
            <p className="text-sm text-slate-400 mb-4">Ask your colleague for a fresh link — they expire after 48 hours.</p>
            <Link to="/" className="btn-ghost inline-block">Back to safety</Link>
          </>
        ) : (
          <p className="text-slate-300">Joining the chaos…</p>
        )}
      </div>
    </div>
  );
}
