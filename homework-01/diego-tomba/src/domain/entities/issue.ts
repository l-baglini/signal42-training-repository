/**
 * issue.ts
 * ---------
 * Domain entity representing an Issue (report / request).
 *
 * The fields are platform-agnostic: names and types abstract away the
 * differences between GitHub and GitLab, so the domain stays independent of
 * the source platform.
 */

/** Normalized representation of an Issue. */
export interface Issue {
  /** Unique identifier on the platform. */
  id: number;

  /** Sequential Issue number within the repository. */
  number: number;

  /** Issue title. */
  title: string;

  /** Current state: open or closed. */
  state: 'open' | 'closed';

  /** Author username. */
  author: string;

  /** Labels associated with the Issue. */
  labels: string[];

  /** Issue creation date. */
  createdAt: Date;

  /** Date of the last update. */
  updatedAt: Date;

  /** Close date, null if still open. */
  closedAt: Date | null;

  /** Full URL to the Issue on the platform. */
  url: string;

  /** Number of comments on the Issue. */
  commentsCount: number;
}
