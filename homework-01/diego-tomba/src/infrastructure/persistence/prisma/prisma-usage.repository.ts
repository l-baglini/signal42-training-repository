/**
 * prisma-usage.repository.ts
 * --------------------------
 * Prisma-backed UsageRepository.
 *
 * Replaces the original node:sqlite adapter. Statistics (mean, percentiles) are
 * still computed in the domain (EstimatorService), not in SQL — the repository
 * only loads the raw rows.
 */

import type { PrismaClient } from '@prisma/client';
import type {
  UsageRepository,
  UsageSample,
} from '../../../domain/repositories/usage-repository.ts';
import type { UsageRecord } from '../../../domain/entities/usage-record.ts';

export class PrismaUsageRepository implements UsageRepository {
  constructor(private readonly db: PrismaClient) {}

  async record(r: UsageRecord): Promise<void> {
    await this.db.usageRecord.create({
      data: {
        taskType: r.taskType,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        cacheCreationTokens: r.cacheCreationTokens,
        cacheReadTokens: r.cacheReadTokens,
        costUsd: r.costUsd,
        durationMs: r.durationMs,
      },
    });
  }

  async samplesFor(
    taskType: string,
  ): Promise<{ cost: number; input: number; output: number }[]> {
    const rows = await this.db.usageRecord.findMany({
      where: { taskType },
      orderBy: { createdAt: 'asc' },
      select: { costUsd: true, inputTokens: true, outputTokens: true },
    });
    return rows.map((row) => ({
      cost: row.costUsd,
      input: row.inputTokens,
      output: row.outputTokens,
    }));
  }

  async taskTypes(): Promise<string[]> {
    const rows = await this.db.usageRecord.findMany({
      distinct: ['taskType'],
      select: { taskType: true },
      orderBy: { taskType: 'asc' },
    });
    return rows.map((row) => row.taskType);
  }

  async samplesSince(since: Date): Promise<UsageSample[]> {
    const rows = await this.db.usageRecord.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      select: {
        taskType: true,
        costUsd: true,
        inputTokens: true,
        outputTokens: true,
        createdAt: true,
      },
    });
    return rows.map((row) => ({
      taskType: row.taskType,
      cost: row.costUsd,
      input: row.inputTokens,
      output: row.outputTokens,
      createdAt: row.createdAt,
    }));
  }
}
