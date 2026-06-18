/**
 * pull-request.ts
 * ----------------
 * Domain entity representing a Pull Request (or Merge Request on GitLab).
 *
 * The fields are platform-agnostic: names and types abstract away the
 * differences between GitHub and GitLab, so the domain stays independent of
 * the source platform.
 */

/** Normalized representation of a Pull Request. */
export interface PullRequest {
  /** Unique identifier on the platform. */
  id: number;

  /** Sequential PR number within the repository. */
  number: number;

  /** PR title. */
  title: string;

  /** Current state: open, closed, or merged into the target branch. */
  state: 'open' | 'closed' | 'merged';

  /** Author username. */
  author: string;

  /** Labels associated with the PR. */
  labels: string[];

  /** PR creation date. */
  createdAt: Date;

  /** Date of the last update. */
  updatedAt: Date;

  /** Merge date, null if not yet merged. */
  mergedAt: Date | null;

  /** Close date, null if still open. */
  closedAt: Date | null;

  /** Full URL to the PR on the platform. */
  url: string;

  /** Number of added lines. */
  additions: number;

  /** Number of removed lines. */
  deletions: number;

  /** Number of changed files. */
  changedFiles: number;
}
