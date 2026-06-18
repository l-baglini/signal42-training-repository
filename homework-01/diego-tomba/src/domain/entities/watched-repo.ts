/**
 * watched-repo.ts
 * ---------------
 * Domain entity for a repository the user wants to keep an eye on.
 */

import type { Platform } from './repo-event.ts';

/** A repository under monitoring. */
export interface WatchedRepo {
  /** Persistence id. */
  id: number;

  /** Repository owner (user or organization). */
  owner: string;

  /** Repository name. */
  name: string;

  /** Git platform (github | gitlab). */
  platform: Platform;

  /**
   * Optional cron expression for scheduled monitoring. When null the repo is
   * only ever run on-demand.
   */
  scheduleCron: string | null;

  /** Whether scheduled runs are active for this repo. */
  enabled: boolean;

  /** Creation timestamp. */
  createdAt: Date;
}

/** Fields accepted when creating a watched repo. */
export interface NewWatchedRepo {
  owner: string;
  name: string;
  platform: Platform;
  scheduleCron?: string | null;
  enabled?: boolean;
}
