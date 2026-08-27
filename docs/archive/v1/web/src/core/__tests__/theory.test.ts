import { describe, expect, it } from 'vitest';
import {
  chordPitchClasses,
  noteAt,
  pitchClassAt,
  scalePitchClasses,
  validateChord,
  validateRoots,
  validateScale,
} from '../theory';
import { CHORD_IDS, CHORDS, G_MAJOR_BOX } from '../content';

describe('(string, fret) → note math', () => {
  it('matches the PRD examples', () => {
    // string 6 (low E), fret 3 = G
    expect(pitchClassAt(6, 3)).toBe('G');
    // string 5 (A), fret 3 = C
    expect(pitchClassAt(5, 3)).toBe('C');
  });

  it('returns open-string notes at fret 0', () => {
    expect(noteAt(6, 0)).toBe('E2');
    expect(noteAt(1, 0)).toBe('E4');
    expect(pitchClassAt(4, 0)).toBe('D');
  });
});

describe('tonal chord/scale pitch classes', () => {
  it('C major → {C, E, G}', () => {
    expect(new Set(chordPitchClasses('C'))).toEqual(new Set(['C', 'E', 'G']));
  });

  it('F#dim → {F#, A, C}', () => {
    expect(new Set(chordPitchClasses('F#dim'))).toEqual(
      new Set(['F#', 'A', 'C']),
    );
  });

  it('G major scale → G A B C D E F#', () => {
    expect(scalePitchClasses('G', 'major')).toEqual([
      'G',
      'A',
      'B',
      'C',
      'D',
      'E',
      'F#',
    ]);
  });
});

describe('curated data validation (PRD C3)', () => {
  it('every G major box note belongs to the G major scale', () => {
    expect(validateScale(G_MAJOR_BOX)).toEqual([]);
  });

  it('every chord position note belongs to its chord quality', () => {
    for (const id of CHORD_IDS) {
      const voicing = CHORDS[id]!;
      expect(validateChord(voicing), `${id} has out-of-chord notes`).toEqual(
        [],
      );
    }
  });

  it('every flagged root actually sounds the root pitch class (chords)', () => {
    for (const id of CHORD_IDS) {
      const voicing = CHORDS[id]!;
      // Chord tonic = the root pitch class (first letter(s) before quality).
      const tonic = chordPitchClasses(id)[0]!;
      expect(
        validateRoots(tonic, voicing.positions),
        `${id} root mismatch`,
      ).toEqual([]);
    }
  });

  it('every flagged root in the scale box sounds G', () => {
    expect(validateRoots('G', G_MAJOR_BOX.positions)).toEqual([]);
  });
});
