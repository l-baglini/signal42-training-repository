import { useState } from 'react';
import { SKIN_TONES, HAIRSTYLES, HAIR_COLORS, OUTFITS, DEFAULT_AVATAR } from './parts.js';
import AvatarSVG from './AvatarSVG.jsx';
import { api, getStoredUser, updateStoredUser } from '../api.js';

function Swatch({ color, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 w-9 rounded-full border-2 transition-transform hover:scale-110 ${
        selected ? 'border-white scale-110' : 'border-transparent'
      }`}
      style={{ background: color }}
    />
  );
}

export default function AvatarCreator({ initial, onSaved }) {
  const user = getStoredUser();
  const [config, setConfig] = useState({ ...DEFAULT_AVATAR, ...(initial || {}) });
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [jobTitle, setJobTitle] = useState(user?.jobTitle || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key, value) => setConfig((c) => ({ ...c, [key]: value }));

  async function save() {
    setSaving(true);
    setError('');
    try {
      const { user: updated } = await api('/api/auth/me/avatar', {
        method: 'PUT',
        body: { avatar: config, displayName, jobTitle },
      });
      updateStoredUser(updated);
      onSaved(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col md:flex-row gap-8">
      <div className="flex flex-col items-center gap-3 shrink-0">
        <div className="panel p-6 bg-white/5">
          <AvatarSVG config={config} size={140} />
        </div>
        <div className="text-center">
          <div className="font-bold">{displayName || 'Your name'}</div>
          <div className="text-sm text-slate-400">{jobTitle || 'Job title tagline'}</div>
        </div>
      </div>

      <div className="flex-1 space-y-5">
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Skin tone</h3>
          <div className="flex gap-2 flex-wrap">
            {SKIN_TONES.map((color, i) => (
              <Swatch key={i} color={color} selected={config.skin === i} onClick={() => set('skin', i)} />
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Hairstyle</h3>
          <div className="grid grid-cols-4 gap-2">
            {HAIRSTYLES.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => set('hair', h.id)}
                className={`rounded-lg p-1 text-xs flex flex-col items-center gap-1 border ${
                  config.hair === h.id ? 'border-chaos-red bg-white/10' : 'border-white/10 hover:bg-white/5'
                }`}
              >
                <AvatarSVG config={{ ...config, hair: h.id }} size={36} />
                {h.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Hair colour</h3>
          <div className="flex gap-2 flex-wrap">
            {HAIR_COLORS.map((color, i) => (
              <Swatch key={i} color={color} selected={config.hairColor === i} onClick={() => set('hairColor', i)} />
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Outfit</h3>
          <div className="grid grid-cols-3 gap-2">
            {OUTFITS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => set('outfit', o.id)}
                className={`rounded-lg px-2 py-1.5 text-sm border ${
                  config.outfit === o.id ? 'border-chaos-red bg-white/10' : 'border-white/10 hover:bg-white/5'
                }`}
              >
                <span className="inline-block h-3 w-3 rounded-full mr-2 align-middle" style={{ background: o.body }} />
                {o.name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-400">Display name</h3>
            <input className="input" value={displayName} maxLength={30} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-400">Job title tagline</h3>
            <input
              className="input"
              value={jobTitle}
              maxLength={40}
              placeholder="e.g. Chief Meeting Survivor"
              onChange={(e) => setJobTitle(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button className="btn-primary w-full" disabled={saving || !displayName.trim()} onClick={save}>
          {saving ? 'Saving…' : 'Save avatar'}
        </button>
      </div>
    </div>
  );
}
