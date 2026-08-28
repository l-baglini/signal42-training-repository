/**
 * Sanitisation of untrusted Reddit titles before they are shown to Claude.
 * See docs/SECURITY.md section 3.
 *
 * This is defence in depth, NOT the main defence. The main defence is that the
 * classifier subprocess has no capabilities at all. Never rely on this file to
 * stop an injection - rely on it to make injections shorter, flatter, and unable
 * to forge our own delimiters.
 */

const cc = (n: number): string => String.fromCodePoint(n);

/** Build a character-class regex from code point ranges (keeps this source ASCII). */
const charClass = (ranges: ReadonlyArray<readonly [number, number]>, flags = 'g'): RegExp =>
  new RegExp(
    '[' + ranges.map(([a, b]) => (a === b ? cc(a) : `${cc(a)}-${cc(b)}`)).join('') + ']',
    flags,
  );

/** Soft hyphen, zero-width, bidi overrides, BOM: invisible steering characters. */
const INVISIBLE = charClass([
  [0x00ad, 0x00ad], // soft hyphen
  [0x200b, 0x200f], // ZWSP, ZWNJ, ZWJ, LRM, RLM
  [0x202a, 0x202e], // bidi embedding / override
  [0x2060, 0x2064], // word joiner, invisible operators
  [0x2066, 0x2069], // bidi isolates
  [0xfeff, 0xfeff], // BOM
]);

/** C0/C1 control characters - a title has no business containing any. */
const CONTROL = charClass([
  [0x0000, 0x001f],
  [0x007f, 0x009f],
]);

const URLS = /\b(?:https?:\/\/|www\.)\S+/gi;
const BACKTICKS = /`+/g;
const ELLIPSIS = cc(0x2026);

/** Fullwidth lookalikes for < and > (U+FF1C / U+FF1E). */
const FULLWIDTH_LT = cc(0xff1c);
const FULLWIDTH_GT = cc(0xff1e);

export interface SanitizedTitle {
  /** Exactly what Reddit returned, kept only for the audit log. */
  raw: string;
  /** What is safe to put in a prompt. */
  clean: string;
  /** True when sanitisation had to remove or rewrite something. */
  altered: boolean;
  truncated: boolean;
}

/**
 * Angle brackets become fullwidth lookalikes, so a title can never close our
 * <untrusted_data> block or forge a new one. Visually near-identical, so the
 * sentiment of the title is unaffected.
 */
const defuseDelimiters = (s: string): string =>
  s.replace(/</g, FULLWIDTH_LT).replace(/>/g, FULLWIDTH_GT);

export function sanitizeTitle(raw: string, maxChars: number): SanitizedTitle {
  const stripped = raw
    .normalize('NFKC') // homoglyph / fullwidth / ligature tricks
    .replace(INVISIBLE, '')
    .replace(CONTROL, ' ')
    .replace(URLS, ' ')
    .replace(BACKTICKS, ' ');

  const defused = defuseDelimiters(stripped).replace(/\s+/g, ' ').trim();
  const truncated = defused.length > maxChars;
  const clean = truncated ? defused.slice(0, maxChars) + ELLIPSIS : defused;

  return { raw, clean, altered: clean !== raw.trim(), truncated };
}

/** Display-side shortening for the ticker; the browser still uses textContent. */
export const forDisplay = (s: string, max = 120): string =>
  s.length > max ? s.slice(0, max) + ELLIPSIS : s;
