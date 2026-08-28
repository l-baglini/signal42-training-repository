/**
 * v1 curated content — PRD Appendix A (locked). Encoded VERBATIM; do not improvise
 * voicings. This is data, not a theory engine (the general tonal-driven engine is C4,
 * deferred). `theory.ts` validates every note here against its chord/scale.
 *
 * Conventions (PRD §4): string 1 = high E … 6 = low E; fret 0 = open;
 * fingers 1=index..4=pinky.
 *
 * Modeling note: `positions` lists every fretted finger placement (fret ≥ 1).
 * Open-string ROOTS are additionally listed with fret:0 so their root status is
 * captured for emphasis; the `open`/`muted` arrays drive the O/X markers at the nut.
 */

import type { ChordVoicing, ScaleBox, Selection, StringNumber } from './types';

// ── A.1 — Scale: G major (Ionian), Option A box (frets 2–5) ──────────────────
// 2-octave box, one-finger-per-fret with index on fret 2. Root = G.
// Roots to emphasize: (string 6, fret 3), (string 4, fret 5), (string 1, fret 3).
export const G_MAJOR_BOX: ScaleBox = {
  name: 'G major (Ionian) — box, frets 2–5',
  root: 'G',
  scaleName: 'major',
  positions: [
    // String 6 (low E): 3 (f2) ·root, 5 (f4)  → G, A
    { string: 6, fret: 3, finger: 2, isRoot: true },
    { string: 6, fret: 5, finger: 4 },
    // String 5 (A): 2 (f1), 3 (f2), 5 (f4)  → B, C, D
    { string: 5, fret: 2, finger: 1 },
    { string: 5, fret: 3, finger: 2 },
    { string: 5, fret: 5, finger: 4 },
    // String 4 (D): 2 (f1), 4 (f3), 5 (f4) ·root  → E, F#, G
    { string: 4, fret: 2, finger: 1 },
    { string: 4, fret: 4, finger: 3 },
    { string: 4, fret: 5, finger: 4, isRoot: true },
    // String 3 (G): 2 (f1), 4 (f3), 5 (f4)  → A, B, C
    { string: 3, fret: 2, finger: 1 },
    { string: 3, fret: 4, finger: 3 },
    { string: 3, fret: 5, finger: 4 },
    // String 2 (B): 3 (f2), 5 (f4)  → D, E
    { string: 2, fret: 3, finger: 2 },
    { string: 2, fret: 5, finger: 4 },
    // String 1 (high E): 2 (f1), 3 (f2) ·root, 5 (f4)  → F#, G, A
    { string: 1, fret: 2, finger: 1 },
    { string: 1, fret: 3, finger: 2, isRoot: true },
    { string: 1, fret: 5, finger: 4 },
  ],
};

// ── A.2 — Chords: diatonic triads of G major ─────────────────────────────────
// Notation per string from low E (6) → high E (1): number = fretted, 0 = open, x = muted.

export const CHORDS: Record<string, ChordVoicing> = {
  // G major  `3 2 0 0 0 3`  — 6:3:2, 5:2:1, 1:3:3.  Root 6:3 (and 1:3)
  G: {
    name: 'G',
    quality: 'major',
    positions: [
      { string: 6, fret: 3, finger: 2, isRoot: true },
      { string: 5, fret: 2, finger: 1 },
      { string: 1, fret: 3, finger: 3, isRoot: true },
    ],
    open: [4, 3, 2],
    muted: [],
  },

  // Am  `x 0 2 2 1 0`  — 4:2:2, 3:2:3, 2:1:1.  Root 5:0 (open A)
  Am: {
    name: 'Am',
    quality: 'minor',
    positions: [
      { string: 5, fret: 0, isRoot: true },
      { string: 4, fret: 2, finger: 2 },
      { string: 3, fret: 2, finger: 3 },
      { string: 2, fret: 1, finger: 1 },
    ],
    open: [5, 1],
    muted: [6],
  },

  // Bm (barre)  `x 2 4 4 3 2`  — 5:2:1 (barre), 4:4:3, 3:4:4, 2:3:2, 1:2:1 (barre).  Root 5:2
  Bm: {
    name: 'Bm',
    quality: 'minor',
    baseFret: 2,
    positions: [
      { string: 5, fret: 2, finger: 1, isRoot: true },
      { string: 4, fret: 4, finger: 3 },
      { string: 3, fret: 4, finger: 4 },
      { string: 2, fret: 3, finger: 2 },
      { string: 1, fret: 2, finger: 1 }, // barred index together with string 5
    ],
    open: [],
    muted: [6],
  },

  // C major  `x 3 2 0 1 0`  — 5:3:3, 4:2:2, 2:1:1.  Root 5:3
  C: {
    name: 'C',
    quality: 'major',
    positions: [
      { string: 5, fret: 3, finger: 3, isRoot: true },
      { string: 4, fret: 2, finger: 2 },
      { string: 2, fret: 1, finger: 1 },
    ],
    open: [3, 1],
    muted: [6],
  },

  // D major  `x x 0 2 3 2`  — 3:2:1, 2:3:3, 1:2:2.  Root 4:0 (open D)
  D: {
    name: 'D',
    quality: 'major',
    positions: [
      { string: 4, fret: 0, isRoot: true },
      { string: 3, fret: 2, finger: 1 },
      { string: 2, fret: 3, finger: 3 },
      { string: 1, fret: 2, finger: 2 },
    ],
    open: [4],
    muted: [6, 5],
  },

  // Em  `0 2 2 0 0 0`  — 5:2:2, 4:2:3.  Root 6:0 (open low E)
  Em: {
    name: 'Em',
    quality: 'minor',
    positions: [
      { string: 6, fret: 0, isRoot: true },
      { string: 5, fret: 2, finger: 2 },
      { string: 4, fret: 2, finger: 3 },
    ],
    open: [6, 3, 2, 1],
    muted: [],
  },

  // F#dim  `x x 4 2 1 2`  — 4:4:4, 3:2:2, 2:1:1, 1:2:3.  Root 4:4 (and 1:2)
  // Hardest shape; voicing F#–A–C–F# is the chosen one (do not substitute).
  'F#dim': {
    name: 'F#dim',
    quality: 'diminished',
    positions: [
      { string: 4, fret: 4, finger: 4, isRoot: true },
      { string: 3, fret: 2, finger: 2 },
      { string: 2, fret: 1, finger: 1 },
      { string: 1, fret: 2, finger: 3, isRoot: true },
    ],
    open: [],
    muted: [6, 5],
  },
};

/** Scales keyed by id (single-entry in v1, structured for more to drop in). */
export const SCALES: Record<string, ScaleBox> = {
  'g-major-box': G_MAJOR_BOX,
};

/** Ordered ids for the UI selectors. */
export const SCALE_IDS: string[] = ['g-major-box'];
export const CHORD_IDS: string[] = ['G', 'Am', 'Bm', 'C', 'D', 'Em', 'F#dim'];

export interface ResolvedSelection {
  name: string;
  /** Fretted finger placements (fret ≥ 1) plus open-string roots (fret 0). */
  positions: ChordVoicing['positions'];
  open: StringNumber[];
  muted: StringNumber[];
  baseFret?: number;
}

/**
 * Resolve the current selection to the renderable position set.
 * Returns null if the selection id is unknown.
 */
export function resolveSelection(sel: Selection): ResolvedSelection | null {
  if (sel.mode === 'scale') {
    const box = SCALES[sel.id];
    if (!box) return null;
    return { name: box.name, positions: box.positions, open: [], muted: [] };
  }
  const chord = CHORDS[sel.id];
  if (!chord) return null;
  const resolved: ResolvedSelection = {
    name: chord.name,
    positions: chord.positions,
    open: chord.open,
    muted: chord.muted,
  };
  if (chord.baseFret !== undefined) resolved.baseFret = chord.baseFret;
  return resolved;
}
