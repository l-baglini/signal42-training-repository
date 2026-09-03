import { SKIN_TONES, HAIR_COLORS, OUTFITS, DEFAULT_AVATAR, hairPath } from './parts.js';

// Renders an avatar config as a simple illustrated character.
export default function AvatarSVG({ config, size = 64 }) {
  const c = { ...DEFAULT_AVATAR, ...(config || {}) };
  const skin = SKIN_TONES[c.skin] || SKIN_TONES[1];
  const hairColor = HAIR_COLORS[c.hairColor] || HAIR_COLORS[0];
  const outfit = OUTFITS[c.outfit] || OUTFITS[0];

  return (
    <svg viewBox="0 0 64 80" width={size} height={size * 1.25}>
      {/* body */}
      <rect x="18" y="36" width="28" height="32" rx="8" fill={outfit.body} />
      {/* outfit accent: tie / zipper / stripe */}
      {c.outfit === 1 ? (
        <polygon points="32,38 35,44 32,56 29,44" fill={outfit.accent} />
      ) : (
        <rect x="30" y="38" width="4" height="28" rx="2" fill={outfit.accent} opacity="0.85" />
      )}
      {/* arms */}
      <rect x="13" y="38" width="7" height="22" rx="3.5" fill={outfit.body} />
      <rect x="44" y="38" width="7" height="22" rx="3.5" fill={outfit.body} />
      {/* hands */}
      <circle cx="16.5" cy="61" r="3.5" fill={skin} />
      <circle cx="47.5" cy="61" r="3.5" fill={skin} />
      {/* legs */}
      <rect x="22" y="66" width="8" height="12" rx="3" fill="#33415c" />
      <rect x="34" y="66" width="8" height="12" rx="3" fill="#33415c" />
      {/* head */}
      <circle cx="32" cy="22" r="13" fill={skin} />
      {/* face */}
      <circle cx="27.5" cy="21" r="1.6" fill="#1a1a1a" />
      <circle cx="36.5" cy="21" r="1.6" fill="#1a1a1a" />
      <path d="M28 27 q4 3 8 0" stroke="#1a1a1a" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      {/* hair */}
      {hairPath(c.hair) && <path d={hairPath(c.hair)} fill={hairColor} />}
    </svg>
  );
}
