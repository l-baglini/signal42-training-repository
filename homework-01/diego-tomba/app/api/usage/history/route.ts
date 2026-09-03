import { NextResponse } from 'next/server';
import { getContainer } from '@/lib/server-container';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const days = Number(searchParams.get('days') ?? '90');
  const since = new Date(Date.now() - days * DAY_MS);

  const { container } = await getContainer();
  const samples = await container.usageRepo.samplesSince(since);

  // Daily spend series for the chart (oldest → newest).
  const byDay = new Map<string, number>();
  for (const s of samples) {
    const day = s.createdAt.toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + s.cost);
  }
  const series = [...byDay.entries()]
    .map(([date, costUsd]) => ({ date, costUsd }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Per-task-type statistical estimates (mean, p90, suggested budget).
  const taskTypes = await container.usageRepo.taskTypes();
  const estimates = await Promise.all(
    taskTypes.map(async (taskType) => {
      const { estimate, suggestedBudgetUsd } =
        await container.getEstimate.execute(taskType);
      return {
        taskType,
        sampleSize: estimate.sampleSize,
        costMean: estimate.cost.mean,
        costP90: estimate.cost.p90,
        suggestedBudgetUsd,
      };
    }),
  );

  return NextResponse.json({
    series,
    estimates,
    recent: samples.slice(0, 50).map((s) => ({
      taskType: s.taskType,
      costUsd: s.cost,
      inputTokens: s.input,
      outputTokens: s.output,
      createdAt: s.createdAt,
    })),
  });
}
