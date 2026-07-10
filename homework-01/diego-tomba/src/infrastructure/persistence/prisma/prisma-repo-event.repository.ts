/**
 * prisma-repo-event.repository.ts
 * --------------------------------
 * Prisma-backed RepoEventRepository.
 *
 * Events are stored scoped per repository (repoOwner, repoName) and deduplicated
 * via the compound unique index (repoOwner, repoName, platform, eventType,
 * externalId). The event payload is serialized as JSON in the `data` column so
 * the domain entities can evolve without schema migrations.
 */

import type { PrismaClient } from '@prisma/client';
import type { RepoEventRepository } from '../../../domain/repositories/repo-event-repository.ts';
import type { RepoEvent } from '../../../domain/entities/repo-event.ts';

export class PrismaRepoEventRepository implements RepoEventRepository {
  constructor(private readonly db: PrismaClient) {}

  async saveEvents(
    owner: string,
    repo: string,
    events: RepoEvent[],
  ): Promise<void> {
    if (events.length === 0) return;

    const now = new Date();

    // INSERT OR REPLACE semantics via upsert on the dedup key: an event can be
    // updated (e.g. a PR merged after a previous fetch).
    await this.db.$transaction(
      events.map((event) => {
        const externalId = this.deriveExternalId(event);
        const data = JSON.stringify(event);
        return this.db.repoEvent.upsert({
          where: {
            repo_event_dedup: {
              repoOwner: owner,
              repoName: repo,
              platform: event.platform,
              eventType: event.type,
              externalId,
            },
          },
          create: {
            repoOwner: owner,
            repoName: repo,
            platform: event.platform,
            eventType: event.type,
            externalId,
            data,
            fetchedAt: now,
          },
          update: { data, fetchedAt: now },
        });
      }),
    );
  }

  async getEventsSince(
    owner: string,
    repo: string,
    since: Date,
  ): Promise<RepoEvent[]> {
    const rows = await this.db.repoEvent.findMany({
      where: { repoOwner: owner, repoName: repo, fetchedAt: { gte: since } },
      orderBy: { fetchedAt: 'asc' },
      select: { data: true },
    });
    return rows.map((row) => this.deserializeEvent(row.data));
  }

  async getLatestFetchTimestamp(
    owner: string,
    repo: string,
  ): Promise<Date | null> {
    const row = await this.db.repoEvent.findFirst({
      where: { repoOwner: owner, repoName: repo },
      orderBy: { fetchedAt: 'desc' },
      select: { fetchedAt: true },
    });
    return row?.fetchedAt ?? null;
  }

  // ───────────────────── Private methods ─────────────────────

  /**
   * Derives the external id used for deduplication. PR and Issue use the
   * platform numeric id; ProjectEvent uses the opaque GraphQL node id.
   */
  private deriveExternalId(event: RepoEvent): string {
    switch (event.type) {
      case 'pr':
      case 'issue':
        return String((event.data as { id: number }).id);
      case 'project':
        return String((event.data as { itemId: string }).itemId);
      default:
        return `unknown-${Date.now()}`;
    }
  }

  /**
   * Deserializes an event's JSON, rebuilding the Date fields that JSON.parse
   * leaves as ISO strings.
   */
  private deserializeEvent(jsonStr: string): RepoEvent {
    const parsed = JSON.parse(jsonStr) as RepoEvent;

    if (parsed.data && typeof parsed.data === 'object') {
      const d = parsed.data as unknown as Record<string, unknown>;
      for (const key of ['createdAt', 'updatedAt', 'mergedAt', 'closedAt']) {
        if (typeof d[key] === 'string') {
          d[key] = new Date(d[key] as string);
        }
      }
    }

    return parsed;
  }
}
