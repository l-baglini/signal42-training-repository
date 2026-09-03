/**
 * get-usage-summary.use-case.ts
 * -----------------------------
 * Computes the current-period (calendar month) Claude spend and compares it to
 * the configured budget. Powers the header usage indicator.
 *
 * Honest note: the Anthropic API does not expose a queryable remaining credit
 * balance via the SDK. This summary therefore reflects locally-tracked spend
 * (the SDK's reported total_cost_usd per run) against a user-set budget — not a
 * live account balance.
 */

import type { UsageRepository } from '../../domain/repositories/usage-repository.ts';

/** Per-task-type spend breakdown. */
export interface UsageByTask {
  taskType: string;
  costUsd: number;
  runs: number;
}

/** Usage summary for the indicator. */
export interface UsageSummary {
  /** Spend in the current calendar month, in USD. */
  periodSpendUsd: number;

  /** Configured monthly budget in USD (0 = unset). */
  budgetUsd: number;

  /** Percentage of budget used (0-100+), or null when no budget is set. */
  pct: number | null;

  /** Number of runs counted in the period. */
  runs: number;

  /** Spend grouped by task type, highest first. */
  byTaskType: UsageByTask[];

  /** ISO date of the start of the period. */
  periodStart: string;
}

function startOfCurrentMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export class GetUsageSummaryUseCase {
  constructor(private readonly usageRepo: UsageRepository) {}

  /**
   * @param budgetUsd - Configured monthly budget (0 = unset).
   * @param now - Injectable clock for testing; defaults to the current time.
   */
  async execute(budgetUsd: number, now: Date = new Date()): Promise<UsageSummary> {
    const periodStart = startOfCurrentMonth(now);
    const samples = await this.usageRepo.samplesSince(periodStart);

    let periodSpendUsd = 0;
    const byTask = new Map<string, { costUsd: number; runs: number }>();
    for (const s of samples) {
      periodSpendUsd += s.cost;
      const cur = byTask.get(s.taskType) ?? { costUsd: 0, runs: 0 };
      cur.costUsd += s.cost;
      cur.runs += 1;
      byTask.set(s.taskType, cur);
    }

    const byTaskType: UsageByTask[] = [...byTask.entries()]
      .map(([taskType, v]) => ({ taskType, costUsd: v.costUsd, runs: v.runs }))
      .sort((a, b) => b.costUsd - a.costUsd);

    return {
      periodSpendUsd,
      budgetUsd,
      pct: budgetUsd > 0 ? (periodSpendUsd / budgetUsd) * 100 : null,
      runs: samples.length,
      byTaskType,
      periodStart: periodStart.toISOString(),
    };
  }
}
