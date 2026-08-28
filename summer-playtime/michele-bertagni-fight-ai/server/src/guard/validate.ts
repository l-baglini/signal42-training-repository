/**
 * Strict validation of whatever the classifier printed.
 * See docs/SECURITY.md section 4.
 *
 * The contract is deliberately tiny: an array of {id, sentiment}, one entry per
 * title we sent, ids drawn from the exact set we sent, sentiment from a closed
 * enum of three literals. Anything else - prose, extra keys, invented ids, a
 * different length, a duplicate - fails the whole batch. A failed batch is not
 * retried with a "please behave" nudge; it is handed to the deterministic
 * fallback classifier instead, so a manipulated model simply loses its vote.
 */
import { z } from 'zod';

export const SENTIMENTS = ['positive', 'negative', 'neutral'] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

const VerdictSchema = z
  .object({
    id: z.number().int().nonnegative(),
    sentiment: z.enum(SENTIMENTS),
  })
  .strict(); // extra keys are a protocol violation, not something to ignore

const BatchSchema = z.array(VerdictSchema);

export type Verdict = z.infer<typeof VerdictSchema>;

export type ValidationResult =
  | { ok: true; verdicts: Map<number, Sentiment> }
  | { ok: false; reason: string };

/**
 * Pull the first top-level JSON array out of the model's stdout.
 * Models like to wrap JSON in markdown fences (observed in practice), so we
 * tolerate that, and nothing else.
 */
function extractJsonArray(text: string): string | null {
  const unfenced = text.replace(/```[a-zA-Z]*\s*/g, '').replace(/```/g, '');
  const start = unfenced.indexOf('[');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < unfenced.length; i++) {
    const ch = unfenced[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return unfenced.slice(start, i + 1);
    }
  }
  return null;
}

export function validateBatch(rawOutput: string, expectedIds: number[]): ValidationResult {
  const json = extractJsonArray(rawOutput);
  if (!json) return { ok: false, reason: 'no JSON array in output' };
  if (json.length > 64 * 1024) return { ok: false, reason: 'output too large' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'malformed JSON' };
  }

  const result = BatchSchema.safeParse(parsed);
  if (!result.success) return { ok: false, reason: `schema: ${result.error.issues[0]?.message}` };

  const verdicts = result.data;
  if (verdicts.length !== expectedIds.length) {
    return { ok: false, reason: `expected ${expectedIds.length} verdicts, got ${verdicts.length}` };
  }

  const expected = new Set(expectedIds);
  const seen = new Set<number>();
  const out = new Map<number, Sentiment>();

  for (const v of verdicts) {
    if (!expected.has(v.id)) return { ok: false, reason: `unknown id ${v.id}` };
    if (seen.has(v.id)) return { ok: false, reason: `duplicate id ${v.id}` };
    seen.add(v.id);
    out.set(v.id, v.sentiment);
  }

  return { ok: true, verdicts: out };
}
