import { describe, expect, it } from 'vitest';
import {
  applyHomography,
  calibrationTargets,
  dotPixel,
  dotUV,
  fretU,
  getPerspectiveTransform,
  gridLines,
  imageToFretboard,
  invertHomography,
  OPEN_MARKER_U,
  solveHomographyDLT,
  stringV,
} from '../geometry';
import type { Point, StringNumber, UV } from '../types';

describe('fretU — non-linear (12th-root-of-2) fret spacing', () => {
  it('places the nut at 0 and fret 12 at exactly 0.5', () => {
    expect(fretU(0)).toBe(0);
    expect(fretU(12)).toBeCloseTo(0.5, 12);
    expect(fretU(24)).toBeCloseTo(0.75, 12);
  });

  it('is monotonic and non-linear (frets bunch toward the bridge)', () => {
    const d1 = fretU(1) - fretU(0);
    const d12 = fretU(12) - fretU(11);
    expect(d1).toBeGreaterThan(d12); // first fret space wider than the 12th
  });
});

describe('stringV — across-the-neck coordinate', () => {
  it('maps low E (6) → 0 and high E (1) → 1', () => {
    expect(stringV(6)).toBe(0);
    expect(stringV(1)).toBe(1);
    expect(stringV(4)).toBeCloseTo(0.4, 12);
  });
});

describe('dotUV — finger dot location', () => {
  it('centers a fretted dot in the fret space between f-1 and f', () => {
    const { u } = dotUV(3, 5);
    expect(u).toBeCloseTo((fretU(4) + fretU(5)) / 2, 12);
  });

  it('puts open/muted markers just behind the nut', () => {
    expect(dotUV(6, 0).u).toBe(OPEN_MARKER_U);
    expect(dotUV(6, 0).u).toBeLessThan(0);
  });

  it('uses the correct v per string', () => {
    expect(dotUV(1, 3).v).toBe(1);
    expect(dotUV(6, 3).v).toBe(0);
  });
});

describe('applyHomography', () => {
  it('is identity under the identity homography', () => {
    const I = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const p = applyHomography(I, { u: 0.3, v: 0.7 });
    expect(p.x).toBeCloseTo(0.3, 12);
    expect(p.y).toBeCloseTo(0.7, 12);
  });
});

describe('getPerspectiveTransform — input guards', () => {
  it('throws unless exactly 4 correspondences are given', () => {
    expect(() =>
      getPerspectiveTransform([{ u: 0, v: 0 }], [{ x: 0, y: 0 }]),
    ).toThrow();
  });

  it('throws on a degenerate (collinear) tap set', () => {
    const src = calibrationTargets(0, 12);
    const collinear: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ];
    expect(() => getPerspectiveTransform(src, collinear)).toThrow();
  });
});

/**
 * The PRD §9 synthetic-homography round-trip: this proves the geometry math with
 * NO hardware. Pick a known H (with perspective), project the 4 calibration
 * targets to get synthetic "taps", solve for H', then assert that H' reproduces
 * a battery of test (string,fret) pixels to within epsilon.
 */
describe('synthetic-homography round-trip (PRD §9)', () => {
  const H_KNOWN = [
    [820, 40, 130],
    [-55, 610, 95],
    [0.06, 0.03, 1],
  ];
  const EPS = 1e-6;

  function roundTripFor(farFret: number, nearFret = 0) {
    const targets: UV[] = calibrationTargets(nearFret, farFret);
    const taps: Point[] = targets.map((uv) => applyHomography(H_KNOWN, uv));
    const Hsolved = getPerspectiveTransform(targets, taps);
    return Hsolved;
  }

  it('recovers a transform matching the known H on every fretted position', () => {
    const Hsolved = roundTripFor(12);

    const strings: StringNumber[] = [1, 2, 3, 4, 5, 6];
    const frets = [0, 1, 2, 3, 5, 7, 9, 12, 15];
    for (const s of strings) {
      for (const f of frets) {
        const expected = dotPixel(H_KNOWN, s, f);
        const actual = dotPixel(Hsolved, s, f);
        expect(actual.x).toBeCloseTo(expected.x, 4);
        expect(actual.y).toBeCloseTo(expected.y, 4);
      }
    }
  });

  it('reproduces the tapped corners themselves to within epsilon', () => {
    const targets = calibrationTargets(0, 12);
    const Hsolved = roundTripFor(12);
    for (const uv of targets) {
      const expected = applyHomography(H_KNOWN, uv);
      const actual = applyHomography(Hsolved, uv);
      expect(Math.abs(actual.x - expected.x)).toBeLessThan(EPS);
      expect(Math.abs(actual.y - expected.y)).toBeLessThan(EPS);
    }
  });

  it('works for a non-default far fret (e.g. 9)', () => {
    const Hsolved = roundTripFor(9);
    const expected = dotPixel(H_KNOWN, 3, 7);
    const actual = dotPixel(Hsolved, 3, 7);
    expect(actual.x).toBeCloseTo(expected.x, 4);
    expect(actual.y).toBeCloseTo(expected.y, 4);
  });
});

describe('calibrationTargets — configurable near + far fret', () => {
  it('defaults near to the nut (u=0)', () => {
    const t = calibrationTargets(0, 12);
    expect(t[0]).toEqual({ u: 0, v: 0 });
    expect(t[2]!.u).toBeCloseTo(0.5, 12); // far = fret 12
  });

  it('places the near edge at a non-zero fret when requested', () => {
    const t = calibrationTargets(3, 12);
    expect(t[0]!.u).toBeCloseTo(fretU(3), 12);
    expect(t[1]!.u).toBeCloseTo(fretU(3), 12);
    expect(t[2]!.u).toBeCloseTo(fretU(12), 12);
  });

  it('round-trips a homography solved from a fret-3↔fret-12 span', () => {
    const H = [
      [700, 30, 110],
      [-40, 560, 80],
      [0.05, 0.02, 1],
    ];
    const targets = calibrationTargets(3, 12);
    const taps = targets.map((uv) => applyHomography(H, uv));
    const solved = getPerspectiveTransform(targets, taps);
    const a = dotPixel(H, 4, 7);
    const b = dotPixel(solved, 4, 7);
    expect(b.x).toBeCloseTo(a.x, 4);
    expect(b.y).toBeCloseTo(a.y, 4);
  });
});

describe('solveHomographyDLT (least-squares, N ≥ 4)', () => {
  const H = [
    [820, 40, 130],
    [-55, 610, 95],
    [0.06, 0.03, 1],
  ];

  it('matches the exact 4-point solver on 4 points', () => {
    const src: UV[] = calibrationTargets(0, 12);
    const dst = src.map((uv) => applyHomography(H, uv));
    const solved = solveHomographyDLT(src, dst);
    for (const uv of [
      { u: 0.2, v: 0.3 },
      { u: 0.4, v: 0.8 },
    ]) {
      const e = applyHomography(H, uv);
      const a = applyHomography(solved, uv);
      expect(a.x).toBeCloseTo(e.x, 3);
      expect(a.y).toBeCloseTo(e.y, 3);
    }
  });

  it('recovers H from many (>4) spread points', () => {
    const src: UV[] = [];
    for (const u of [0, 0.1, 0.25, 0.4, 0.5, 0.7]) {
      for (const v of [0, 0.5, 1]) src.push({ u, v });
    }
    const dst = src.map((uv) => applyHomography(H, uv));
    const solved = solveHomographyDLT(src, dst);
    const e = applyHomography(H, { u: 0.33, v: 0.66 });
    const a = applyHomography(solved, { u: 0.33, v: 0.66 });
    expect(a.x).toBeCloseTo(e.x, 3);
    expect(a.y).toBeCloseTo(e.y, 3);
  });

  it('throws on fewer than 4 points', () => {
    expect(() =>
      solveHomographyDLT(
        [
          { u: 0, v: 0 },
          { u: 1, v: 0 },
          { u: 1, v: 1 },
        ],
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
        ],
      ),
    ).toThrow();
  });
});

describe('invertHomography + imageToFretboard', () => {
  const H = [
    [820, 40, 130],
    [-55, 610, 95],
    [0.06, 0.03, 1],
  ];

  it('inverse-maps image points back to their fretboard-space origin', () => {
    for (const uv of [
      { u: 0, v: 0 },
      { u: 0.5, v: 1 },
      { u: 0.3, v: 0.7 },
    ]) {
      const img = applyHomography(H, uv);
      const back = imageToFretboard(H, img);
      expect(back.u).toBeCloseTo(uv.u, 9);
      expect(back.v).toBeCloseTo(uv.v, 9);
    }
  });

  it('invertHomography ∘ H ≈ identity on a probe point', () => {
    const Hinv = invertHomography(H);
    const uv = { u: 0.42, v: 0.13 };
    const img = applyHomography(H, uv);
    const back = applyHomography(Hinv, { u: img.x, v: img.y });
    // applyHomography on Hinv treats (x,y) as (u,v) inputs — same algebra.
    expect(back.x).toBeCloseTo(uv.u, 9);
    expect(back.y).toBeCloseTo(uv.v, 9);
  });
});

describe('gridLines', () => {
  it('emits one line per fret (0..maxFret) plus one per string', () => {
    const I = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const lines = gridLines(I, 12);
    expect(lines).toHaveLength(13 + 6); // 13 fret lines + 6 string lines
  });
});
