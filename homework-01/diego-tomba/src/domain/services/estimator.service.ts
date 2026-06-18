/**
 * estimator.service.ts
 * ---------------------
 * Domain service with pure functions for statistical estimation.
 *
 * Turns the raw history into a usable estimate.
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

import type { Estimate } from '../entities/estimate.ts';

/**
 * Computes the arithmetic mean of an array of values.
 *
 * @param values - Array of numbers.
 * @returns The mean, or 0 if the array is empty.
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Percentile with linear interpolation. With few samples a "hard" percentile
 * (take the element at the index) is noisy; interpolating between the two
 * adjacent elements gives a more stable value.
 *
 * @param values - Array of numbers.
 * @param p - Desired percentile (0-100).
 * @returns The value at the requested percentile, or 0 if the array is empty.
 */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];

  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  const frac = rank - low;
  return sorted[low] + (sorted[high] - sorted[low]) * frac;
}

/**
 * Builds a statistical estimate from the raw samples.
 *
 * @param taskType - The task type to compute the estimate for.
 * @param samples - Array of observations with cost, input and output.
 * @returns The Estimate object with mean and p90 for each dimension.
 */
export function buildEstimate(
  taskType: string,
  samples: { cost: number; input: number; output: number }[],
): Estimate {
  const costs = samples.map((s) => s.cost);
  const inputs = samples.map((s) => s.input);
  const outputs = samples.map((s) => s.output);

  return {
    taskType,
    sampleSize: samples.length,
    cost: { mean: mean(costs), p90: percentile(costs, 90) },
    input: { mean: mean(inputs), p90: percentile(inputs, 90) },
    output: { mean: mean(outputs), p90: percentile(outputs, 90) },
  };
}

/**
 * Suggests a value for max_budget_usd derived from the estimate.
 *
 * Adaptive margin logic: with few samples the estimate is unreliable, so we
 * raise the cushion above the p90 to avoid throttling a task we simply hadn't
 * yet observed in its expensive variant. As the history grows, the margin
 * tightens and the budget hugs the real behavior. This is where the estimate
 * becomes "increasingly accurate": not because the math changes, but because
 * confidence in the data grows.
 *
 * @param est - The estimate to derive the suggested budget from.
 * @returns The suggested budget in USD, rounded to 4 decimals.
 */
export function suggestBudgetUsd(est: Estimate): number {
  if (est.sampleSize === 0) {
    // No data: return 0 as a "I have no baseline, you decide" signal.
    return 0;
  }

  let safetyMargin: number;
  if (est.sampleSize < 5) {
    safetyMargin = 2.0; // very little data: double the p90
  } else if (est.sampleSize < 20) {
    safetyMargin = 1.5;
  } else {
    safetyMargin = 1.25; // solid history: thin margin
  }

  // Rounding to 4 decimals: per-run costs are often fractions of a cent.
  return Math.round(est.cost.p90 * safetyMargin * 10000) / 10000;
}
