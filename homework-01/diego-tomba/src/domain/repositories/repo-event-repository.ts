/**
 * repo-event-repository.ts
 * --------------------------
 * Port (interface) for persisting repository events.
 *
 * Defines the contract for saving and querying the events collected from
 * GitHub, GitLab or any future platform. Queries are scoped per repository so
 * reports never mix events belonging to different repos. The concrete
 * implementation (Prisma/SQLite, PostgreSQL, etc.) lives in the infrastructure
 * layer.
 */

import type { RepoEvent } from '../entities/repo-event.ts';

/** Contract for persisting repository events. */
export interface RepoEventRepository {
  /**
   * Saves a batch of events for a repository. The implementation should handle
   * the upsert to avoid duplicates of the same event (scoped per repository).
   *
   * @param owner - Repository owner the events belong to.
   * @param repo - Repository name the events belong to.
   * @param events - The events to persist.
   */
  saveEvents(owner: string, repo: string, events: RepoEvent[]): Promise<void>;

  /**
   * Fetches all events for a repository recorded on or after a given date.
   * Useful for generating incremental reports or storytelling.
   *
   * @param owner - Repository owner.
   * @param repo - Repository name.
   * @param since - Start date (inclusive).
   * @returns The events, ordered chronologically.
   */
  getEventsSince(owner: string, repo: string, since: Date): Promise<RepoEvent[]>;

  /**
   * Returns the timestamp of the last completed fetch for a repository, or null
   * if a fetch was never performed. Used to determine the starting point of the
   * next incremental fetch.
   *
   * @param owner - Repository owner.
   * @param repo - Repository name.
   * @returns The last fetch timestamp, or null if absent.
   */
  getLatestFetchTimestamp(owner: string, repo: string): Promise<Date | null>;
}
