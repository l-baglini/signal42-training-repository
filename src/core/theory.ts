/**
 * Music-theory helpers, backed by tonal. In M1 these are used for:
 *   - (string, fret) → note math, and
 *   - VALIDATING the curated Appendix-A data (every position's note must belong
 *     to its chord/scale).
 *
 * The general tonal-driven content engine (arbitrary scales/chords across the
 * neck) is C4 and deferred — not implemented here.
 *
 * Pure / framework-free.
 */

import { Chord, Interval, Note, Scale } from 'tonal';
import type { ScaleBox, StringNumber } from './types';
import type { ChordVoicing } from './types';

/**
 * Open-string notes in standard tuning (scientific pitch).
 * String 6 = low E … string 1 = high E.
 */
export const OPEN_NOTES: Record<StringNumber, string> = {
  6: 'E2',
  5: 'A2',
  4: 'D3',
  3: 'G3',
  2: 'B3',
  1: 'E4',
};

/** Note (with octave) sounding at a given string/fret in standard tuning. */
export function noteAt(string: StringNumber, fret: number): string {
  return Note.transpose(OPEN_NOTES[string], Interval.fromSemitones(fret));
}

/** Pitch class (no octave), e.g. "G", "F#". */
export function pitchClassAt(string: StringNumber, fret: number): string {
  return Note.pitchClass(noteAt(string, fret));
}

/**
 * Chroma (0–11) at a string/fret. Comparing by chroma sidesteps enharmonic
 * spelling differences (F# vs Gb) when validating membership.
 */
export function chromaAt(string: StringNumber, fret: number): number {
  return Note.chroma(noteAt(string, fret));
}

/** Pitch classes of a chord, e.g. chordPitchClasses("Am") → ["A","C","E"]. */
export function chordPitchClasses(name: string): string[] {
  return Chord.get(name).notes;
}

/** Pitch classes of a scale, e.g. scalePitchClasses("G","major") → G ionian set. */
export function scalePitchClasses(root: string, scaleName: string): string[] {
  return Scale.get(`${root} ${scaleName}`).notes;
}

/** The set of chromas (0–11) spanned by a list of pitch-class / note names. */
export function chromaSet(notes: readonly string[]): Set<number> {
  const set = new Set<number>();
  for (const n of notes) {
    const c = Note.chroma(n);
    if (c !== undefined) set.add(c);
  }
  return set;
}

export interface ValidationIssue {
  string: StringNumber;
  fret: number;
  note: string;
  reason: string;
}

/**
 * Validate that every fretted/sounding position in a chord voicing produces a
 * note belonging to the chord. Open strings listed in the voicing are checked
 * too (they sound). Returns the list of offending positions (empty = valid).
 */
export function validateChord(voicing: ChordVoicing): ValidationIssue[] {
  const allowed = chromaSet(chordPitchClasses(voicing.name));
  const issues: ValidationIssue[] = [];

  const check = (string: StringNumber, fret: number) => {
    const chroma = chromaAt(string, fret);
    if (!allowed.has(chroma)) {
      issues.push({
        string,
        fret,
        note: noteAt(string, fret),
        reason: `note not in ${voicing.name} (${chordPitchClasses(voicing.name).join(', ')})`,
      });
    }
  };

  for (const p of voicing.positions) check(p.string, p.fret);
  for (const s of voicing.open) check(s, 0);
  return issues;
}

/**
 * Validate that every position in a scale box produces a note in the scale.
 * Returns the list of offending positions (empty = valid).
 */
export function validateScale(box: ScaleBox): ValidationIssue[] {
  const allowed = chromaSet(scalePitchClasses(box.root, box.scaleName));
  const issues: ValidationIssue[] = [];
  for (const p of box.positions) {
    const chroma = chromaAt(p.string, p.fret);
    if (!allowed.has(chroma)) {
      issues.push({
        string: p.string,
        fret: p.fret,
        note: noteAt(p.string, p.fret),
        reason: `note not in ${box.root} ${box.scaleName}`,
      });
    }
  }
  return issues;
}

/**
 * Validate that positions flagged isRoot actually sound the root pitch class.
 * Applies to both chords (root = chord tonic) and scales (root = box.root).
 */
export function validateRoots(
  rootPitchClass: string,
  positions: readonly { string: StringNumber; fret: number; isRoot?: boolean }[],
): ValidationIssue[] {
  const rootChroma = Note.chroma(rootPitchClass);
  const issues: ValidationIssue[] = [];
  for (const p of positions) {
    if (!p.isRoot) continue;
    if (chromaAt(p.string, p.fret) !== rootChroma) {
      issues.push({
        string: p.string,
        fret: p.fret,
        note: noteAt(p.string, p.fret),
        reason: `flagged root but is not ${rootPitchClass}`,
      });
    }
  }
  return issues;
}
