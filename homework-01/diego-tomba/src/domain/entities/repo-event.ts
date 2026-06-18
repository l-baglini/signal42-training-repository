/**
 * repo-event.ts
 * --------------
 * Discriminated union type that aggregates all repository events into a
 * single type, tagged by category and platform.
 *
 * The `platform` field distinguishes the event's origin (GitHub, GitLab,
 * etc.) without coupling the domain to a specific API. The `type` field acts
 * as the discriminator for pattern matching in consumers (switch/if
 * narrowing).
 */

import type { PullRequest } from './pull-request.ts';
import type { Issue } from './issue.ts';
import type { ProjectEvent } from './project-event.ts';

/** Supported platforms (extensible in the future). */
export type Platform = 'github' | 'gitlab';

/**
 * Repository event: discriminated union by type.
 *
 * Each variant contains:
 *  - `type`: discriminator for TypeScript narrowing
 *  - `platform`: source platform of the event
 *  - `data`: payload specific to the event type
 *  - `fetchedAt`: timestamp of when the event was fetched
 */
export type RepoEvent =
  | { type: 'pr'; platform: Platform; data: PullRequest; fetchedAt: Date }
  | { type: 'issue'; platform: Platform; data: Issue; fetchedAt: Date }
  | { type: 'project'; platform: Platform; data: ProjectEvent; fetchedAt: Date };
