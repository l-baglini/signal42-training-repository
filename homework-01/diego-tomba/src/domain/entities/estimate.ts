/**
 * estimate.ts
 * ------------
 * Domain entity representing the statistical estimate for a task type.
 *
 * It exposes two numbers per dimension (cost, input, output):
 *   - mean: the expected value, for the aggregate budget.
 *   - p90:  the 90th percentile, to set a safety threshold.
 *
 * Why two numbers and not one: the mean is the center of the distribution,
 * but by definition you exceed it about half the time. If you want a cap
 * (max_budget_usd) that does NOT trip constantly, you must tune it on a high
 * percentile, not the mean. The p90 is a good compromise: it covers the vast
 * majority of cases without chasing the extreme outlier, which would make you
 * overestimate the budget.
 */

/** Statistical estimate built from a task type's history. */
export interface Estimate {
  /** Task type the estimate refers to. */
  taskType: string;

  /** Number of observations: below a minimum threshold, distrust the estimate. */
  sampleSize: number;

  /** Cost distribution in USD. */
  cost: { mean: number; p90: number };

  /** Input token distribution. */
  input: { mean: number; p90: number };

  /** Output token distribution. */
  output: { mean: number; p90: number };
}
