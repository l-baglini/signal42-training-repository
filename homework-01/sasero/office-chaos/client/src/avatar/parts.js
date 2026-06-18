// Avatar configuration palettes (FR-2.1..2.4). The avatar is stored as a
// JSON config of indexes into these arrays (FR-2.5).

// FR-2.1: 6 skin tones (Fitzpatrick scale reference)
export const SKIN_TONES = ['#f9ddc4', '#f0c8a0', '#d9a066', '#b07b48', '#7c4a2d', '#54311c'];

// FR-2.2: 8 hairstyle silhouettes
export const HAIRSTYLES = [
  { id: 0, name: 'Bald' },
  { id: 1, name: 'Buzz' },
  { id: 2, name: 'Bob' },
  { id: 3, name: 'Spiky' },
  { id: 4, name: 'Long' },
  { id: 5, name: 'Curly' },
  { id: 6, name: 'Mohawk' },
  { id: 7, name: 'Ponytail' },
];

// FR-2.3: 12 hair colours, fantasy included
export const HAIR_COLORS = [
  '#0e0e10', '#3b2219', '#5a3825', '#8b5a2b', '#c68642', '#d2b48c',
  '#e8e8e8', '#f1c40f', '#e74c3c', '#9b59b6', '#3498db', '#ff69b4',
];

// FR-2.4: 6 office archetypes
export const OUTFITS = [
  { id: 0, name: 'Casual', body: '#2a9d8f', accent: '#1d6e64' },
  { id: 1, name: 'Suit', body: '#22304a', accent: '#c0392b' },
  { id: 2, name: 'Hoodie', body: '#6b7280', accent: '#4b5563' },
  { id: 3, name: 'Startup Vest', body: '#1f2937', accent: '#f59e0b' },
  { id: 4, name: 'Creative', body: '#e76f51', accent: '#f4a261' },
  { id: 5, name: 'Sporty', body: '#264653', accent: '#2a9d8f' },
];

export const DEFAULT_AVATAR = { skin: 1, hair: 2, hairColor: 1, outfit: 0 };

// SVG path fragments for each hairstyle, drawn over a head centred at
// (32, 22) with radius 13 in a 64x80 viewBox. Shared by the React preview;
// the Phaser texture generator draws simplified canvas equivalents.
export function hairPath(style) {
  switch (style) {
    case 1: return 'M19 20 a13 13 0 0 1 26 0 l0 -2 a13 13 0 0 0 -26 0 z M19 18 a13 13 0 0 1 26 0 l-1 2 a12 12 0 0 0 -24 0 z';
    case 2: return 'M18 24 q-2 -16 14 -16 q16 0 14 16 l-3 6 q1 -12 -4 -14 q2 6 -7 6 q-9 0 -7 -6 q-5 2 -4 14 z';
    case 3: return 'M19 20 l2 -8 l3 5 l3 -7 l3 6 l2 -7 l3 7 l3 -5 l3 8 q1 3 -2 2 q-9 -6 -18 0 q-3 1 -2 -1 z';
    case 4: return 'M18 22 q-1 -14 14 -14 q15 0 14 14 l1 22 l-7 0 l-1 -16 q-7 5 -14 0 l-1 16 l-7 0 z';
    case 5: return 'M17 22 q-3 -8 5 -9 q-1 -6 7 -5 q3 -4 8 -1 q8 -2 8 5 q7 2 4 10 q-2 4 -5 2 q-9 -8 -21 0 q-4 2 -6 -2 z';
    case 6: return 'M29 6 l6 0 l1 14 q-4 -3 -8 0 z';
    case 7: return 'M18 22 q0 -14 14 -14 q14 0 14 14 l-2 3 q0 -10 -5 -12 q2 5 -7 5 q-9 0 -7 -5 q-5 2 -5 12 z M44 22 q6 8 2 18 l-4 -2 q3 -8 -1 -14 z';
    default: return '';
  }
}
