/**
 * prisma-report.repository.ts
 * ---------------------------
 * Prisma-backed ReportRepository.
 */

import type { PrismaClient } from '@prisma/client';
import type { ReportRepository } from '../../../domain/repositories/report-repository.ts';
import type { Report, NewReport } from '../../../domain/entities/report.ts';

export class PrismaReportRepository implements ReportRepository {
  constructor(private readonly db: PrismaClient) {}

  async list(limit?: number): Promise<Report[]> {
    return this.db.report.findMany({
      orderBy: { generatedAt: 'desc' },
      ...(limit ? { take: limit } : {}),
    });
  }

  async findById(id: number): Promise<Report | null> {
    return this.db.report.findUnique({ where: { id } });
  }

  async save(report: NewReport): Promise<Report> {
    return this.db.report.create({
      data: {
        repoOwner: report.repoOwner,
        repoName: report.repoName,
        markdown: report.markdown,
        eventsProcessed: report.eventsProcessed,
        costUsd: report.costUsd,
        inputTokens: report.inputTokens,
        outputTokens: report.outputTokens,
        cacheCreationTokens: report.cacheCreationTokens,
        cacheReadTokens: report.cacheReadTokens,
        model: report.model,
      },
    });
  }
}
