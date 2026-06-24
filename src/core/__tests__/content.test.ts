import { describe, expect, it } from 'vitest';
import {
  CHORD_IDS,
  CHORDS,
  G_MAJOR_BOX,
  resolveSelection,
  SCALE_IDS,
} from '../content';
import type { FretPosition } from '../types';

const key = (p: FretPosition) => `${p.string}-${p.fret}`;

describe('A.1 — G major box', () => {
  it('contains exactly the Appendix A.1 positions', () => {
    const expected = new Set([
      '6-3',
      '6-5',
      '5-2',
      '5-3',
      '5-5',
      '4-2',
      '4-4',
      '4-5',
      '3-2',
      '3-4',
      '3-5',
      '2-3',
      '2-5',
      '1-2',
      '1-3',
      '1-5',
    ]);
    const actual = new Set(G_MAJOR_BOX.positions.map(key));
    expect(actual).toEqual(expected);
    expect(G_MAJOR_BOX.positions).toHaveLength(16);
  });

  it('flags exactly the three roots (6,3), (4,5), (1,3)', () => {
    const roots = new Set(
      G_MAJOR_BOX.positions.filter((p) => p.isRoot).map(key),
    );
    expect(roots).toEqual(new Set(['6-3', '4-5', '1-3']));
  });

  it('uses one-finger-per-fret (index on fret 2)', () => {
    for (const p of G_MAJOR_BOX.positions) {
      expect(p.finger).toBe((p.fret - 1) as 1 | 2 | 3 | 4);
    }
  });
});

describe('A.2 — diatonic chord voicings', () => {
  it('ships the seven diatonic chords of G major', () => {
    expect(CHORD_IDS).toEqual(['G', 'Am', 'Bm', 'C', 'D', 'Em', 'F#dim']);
  });

  const cases: Record<
    string,
    {
      fretted: string[];
      open: number[];
      muted: number[];
      roots: string[];
      baseFret?: number;
      quality: 'major' | 'minor' | 'diminished';
    }
  > = {
    G: {
      fretted: ['6-3', '5-2', '1-3'],
      open: [4, 3, 2],
      muted: [],
      roots: ['6-3', '1-3'],
      quality: 'major',
    },
    Am: {
      fretted: ['4-2', '3-2', '2-1'],
      open: [5, 1],
      muted: [6],
      roots: ['5-0'],
      quality: 'minor',
    },
    Bm: {
      fretted: ['5-2', '4-4', '3-4', '2-3', '1-2'],
      open: [],
      muted: [6],
      roots: ['5-2'],
      baseFret: 2,
      quality: 'minor',
    },
    C: {
      fretted: ['5-3', '4-2', '2-1'],
      open: [3, 1],
      muted: [6],
      roots: ['5-3'],
      quality: 'major',
    },
    D: {
      fretted: ['3-2', '2-3', '1-2'],
      open: [4],
      muted: [6, 5],
      roots: ['4-0'],
      quality: 'major',
    },
    Em: {
      fretted: ['5-2', '4-2'],
      open: [6, 3, 2, 1],
      muted: [],
      roots: ['6-0'],
      quality: 'minor',
    },
    'F#dim': {
      fretted: ['4-4', '3-2', '2-1', '1-2'],
      open: [],
      muted: [6, 5],
      roots: ['4-4', '1-2'],
      quality: 'diminished',
    },
  };

  for (const [name, spec] of Object.entries(cases)) {
    it(`${name}: positions, open/muted, roots, quality match Appendix A.2`, () => {
      const v = CHORDS[name]!;
      const fretted = v.positions.filter((p) => p.fret >= 1).map(key);
      expect(new Set(fretted)).toEqual(new Set(spec.fretted));
      expect(new Set(v.open)).toEqual(new Set(spec.open));
      expect(new Set(v.muted)).toEqual(new Set(spec.muted));
      const roots = v.positions.filter((p) => p.isRoot).map(key);
      expect(new Set(roots)).toEqual(new Set(spec.roots));
      expect(v.quality).toBe(spec.quality);
      expect(v.baseFret).toBe(spec.baseFret);
    });
  }

  it('Bm is the only barre chord (has a baseFret)', () => {
    const withBase = CHORD_IDS.filter((id) => CHORDS[id]!.baseFret !== undefined);
    expect(withBase).toEqual(['Bm']);
  });

  it('Bm models the barred index as two finger-1 positions (strings 5 and 1)', () => {
    const indexed = CHORDS.Bm!.positions.filter((p) => p.finger === 1);
    expect(new Set(indexed.map((p) => p.string))).toEqual(new Set([5, 1]));
  });
});

describe('resolveSelection', () => {
  it('resolves the scale selection', () => {
    const r = resolveSelection({ mode: 'scale', id: 'g-major-box' });
    expect(r?.name).toBe(G_MAJOR_BOX.name);
    expect(r?.open).toEqual([]);
    expect(r?.muted).toEqual([]);
  });

  it('resolves a chord selection with open/muted strings', () => {
    const r = resolveSelection({ mode: 'chord', id: 'C' });
    expect(r?.name).toBe('C');
    expect(new Set(r?.muted)).toEqual(new Set([6]));
  });

  it('returns null for an unknown id', () => {
    expect(resolveSelection({ mode: 'chord', id: 'Z9' })).toBeNull();
    expect(resolveSelection({ mode: 'scale', id: 'nope' })).toBeNull();
  });

  it('exposes a single scale id in v1', () => {
    expect(SCALE_IDS).toEqual(['g-major-box']);
  });
});
