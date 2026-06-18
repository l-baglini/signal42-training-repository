/**
 * pricing.ts
 * ----------
 * Per-token-type cost ESTIMATES for the report cost panel.
 *
 * The SDK reports the accurate blended total (`costUsd`); these rates let us
 * break that total down by token type for display. Cache write is billed at
 * ~1.25× the input rate and cache read at ~0.1×, per Anthropic pricing.
 *
 * If the model isn't recognized, returns null and the UI shows token counts
 * without per-type dollar estimates (the real total is always shown).
 */

interface Rate {
  /** Input $ per million tokens. */
  input: number;
  /** Output $ per million tokens. */
  output: number;
}

// Matched by substring against the model id (most specific first).
const RATES: { match: string; rate: Rate }[] = [
  { match: 'opus', rate: { input: 5, output: 25 } },
  { match: 'fable', rate: { input: 10, output: 50 } },
  { match: 'sonnet', rate: { input: 3, output: 15 } },
  { match: 'haiku', rate: { input: 1, output: 5 } },
];

const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;
const PER_MTOK = 1_000_000;

export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface CostBreakdown {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  /** Sum of the estimated per-type costs. */
  estimatedTotal: number;
}

/**
 * Estimates per-type costs from token counts and the model id.
 * Returns null when the model's rates are unknown.
 */
export function estimateCostBreakdown(
  model: string | null,
  tokens: TokenCounts,
): CostBreakdown | null {
  if (!model) return null;
  const lower = model.toLowerCase();
  const entry = RATES.find((r) => lower.includes(r.match));
  if (!entry) return null;

  const { input, output } = entry.rate;
  const breakdown: CostBreakdown = {
    input: (tokens.inputTokens / PER_MTOK) * input,
    output: (tokens.outputTokens / PER_MTOK) * output,
    cacheWrite:
      (tokens.cacheCreationTokens / PER_MTOK) * input * CACHE_WRITE_MULTIPLIER,
    cacheRead:
      (tokens.cacheReadTokens / PER_MTOK) * input * CACHE_READ_MULTIPLIER,
    estimatedTotal: 0,
  };
  breakdown.estimatedTotal =
    breakdown.input +
    breakdown.output +
    breakdown.cacheWrite +
    breakdown.cacheRead;
  return breakdown;
}
