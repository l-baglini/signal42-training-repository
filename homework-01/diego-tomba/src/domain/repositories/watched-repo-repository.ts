/**
 * watched-repo-repository.ts
 * --------------------------
 * Port for persisting the repositories under monitoring.
 */

import type { WatchedRepo, NewWatchedRepo } from '../entities/watched-repo.ts';

/** Contract for persisting watched repositories. */
export interface WatchedRepoRepository {
  /** Returns all watched repositories, newest first. */
  list(): Promise<WatchedRepo[]>;

  /** Returns a single watched repository by id, or null if absent. */
  findById(id: number): Promise<WatchedRepo | null>;

  /** Returns only the repositories that have scheduled monitoring enabled. */
  listScheduled(): Promise<WatchedRepo[]>;

  /** Creates a watched repository. */
  create(repo: NewWatchedRepo): Promise<WatchedRepo>;

  /** Updates a subset of a watched repository's fields. */
  update(id: number, patch: Partial<NewWatchedRepo>): Promise<WatchedRepo>;

  /** Removes a watched repository. */
  remove(id: number): Promise<void>;
}
