/**
 * Deterministic lexicon classifier.
 *
 * Used whenever the model's answer fails validation, the subprocess times out,
 * or Claude is not logged in. It is dumb on purpose: no network, no model, no
 * way for a post title to influence anything but its own score. The fight always
 * finishes, even offline.
 */
import type { Sentiment } from '../guard/validate.js';

const POSITIVE = [
  'amazing', 'awesome', 'breakthrough', 'brilliant', 'game changer', 'gamechanger',
  'helped me', 'helping', 'impressive', 'incredible', 'insane', 'love', 'productive',
  'saved me', 'shipped', 'solved', 'stunning', 'useful', 'wild', 'works great',
  'better than', 'finally', 'huge win', 'underrated', 'crushed it',
];

const NEGATIVE = [
  'slop', 'garbage', 'useless', 'hate', 'scam', 'bubble', 'overhyped', 'hype',
  'stole', 'stealing', 'job loss', 'laid off', 'layoffs', 'replace', 'replacing',
  'dangerous', 'ruining', 'ruined', 'worse', 'fails', 'failed', 'broken',
  'disappointing', 'regret', 'nonsense', 'lies', 'hallucinat', 'enshittif',
  'wrong', 'terrible', 'lawsuit', 'privacy', 'surveillance',
];

const countHits = (haystack: string, needles: string[]): number =>
  needles.reduce((n, w) => (haystack.includes(w) ? n + 1 : n), 0);

export function fallbackClassify(clean: string): Sentiment {
  const t = clean.toLowerCase();
  const pos = countHits(t, POSITIVE);
  const neg = countHits(t, NEGATIVE);
  if (pos > neg) return 'positive';
  if (neg > pos) return 'negative';
  return 'neutral';
}
