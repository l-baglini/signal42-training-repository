/**
 * Watchability tuning. The fight has no player, so pacing IS the gameplay: it
 * has to be slow enough to read the title that caused each punch, and fast
 * enough that nobody walks away. A ~20-hit match lands around 35 seconds.
 */
export const PACING = {
  introMs: 1500,        // "HUMAN vs AI ... FIGHT!"
  exchangeMs: 1400,     // between two exchanges
  impactMs: 350,        // hit connects -> health bar starts draining
  clinchMs: 900,        // neutral title: shorter, it is only a beat
  finalBlowMs: 2200,    // dramatic pause before the hit that ends it
  knockoutMs: 3000,     // knockdown -> result screen
} as const;

/** Delay to wait *before* emitting an event. */
export function delayBefore(opts: { isFirst: boolean; isClinch: boolean; isFinal: boolean }): number {
  if (opts.isFirst) return PACING.introMs;
  if (opts.isFinal) return PACING.finalBlowMs;
  if (opts.isClinch) return PACING.clinchMs;
  return PACING.exchangeMs;
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
