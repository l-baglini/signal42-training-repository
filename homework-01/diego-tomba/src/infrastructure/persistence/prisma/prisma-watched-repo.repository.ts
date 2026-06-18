/**
 * prisma-watched-repo.repository.ts
 * ---------------------------------
 * Prisma-backed WatchedRepoRepository.
 */

import type { PrismaClient } from '@prisma/client';
import type { WatchedRepoRepository } from '../../../domain/repositories/watched-repo-repository.ts';
import type {
  WatchedRepo,
  NewWatchedRepo,
} from '../../../domain/entities/watched-repo.ts';
import type { Platform } from '../../../domain/entities/repo-event.ts';

/** Raw Prisma row shape we map from. */
interface RepoRow {
  id: number;
  owner: string;
  name: string;
  platform: string;
  scheduleCron: string | null;
  enabled: boolean;
  createdAt: Date;
}

function toDomain(row: RepoRow): WatchedRepo {
  return {
    id: row.id,
    owner: row.owner,
    name: row.name,
    platform: row.platform as Platform,
    scheduleCron: row.scheduleCron,
    enabled: row.enabled,
    createdAt: row.createdAt,
  };
}

export class PrismaWatchedRepoRepository implements WatchedRepoRepository {
  constructor(private readonly db: PrismaClient) {}

  async list(): Promise<WatchedRepo[]> {
    const rows = await this.db.watchedRepo.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDomain);
  }

  async findById(id: number): Promise<WatchedRepo | null> {
    const row = await this.db.watchedRepo.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async listScheduled(): Promise<WatchedRepo[]> {
    const rows = await this.db.watchedRepo.findMany({
      where: { enabled: true, scheduleCron: { not: null } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toDomain);
  }

  async create(repo: NewWatchedRepo): Promise<WatchedRepo> {
    const row = await this.db.watchedRepo.create({
      data: {
        owner: repo.owner,
        name: repo.name,
        platform: repo.platform,
        scheduleCron: repo.scheduleCron ?? null,
        enabled: repo.enabled ?? true,
      },
    });
    return toDomain(row);
  }

  async update(id: number, patch: Partial<NewWatchedRepo>): Promise<WatchedRepo> {
    const row = await this.db.watchedRepo.update({
      where: { id },
      data: {
        owner: patch.owner,
        name: patch.name,
        platform: patch.platform,
        scheduleCron: patch.scheduleCron,
        enabled: patch.enabled,
      },
    });
    return toDomain(row);
  }

  async remove(id: number): Promise<void> {
    await this.db.watchedRepo.delete({ where: { id } });
  }
}
