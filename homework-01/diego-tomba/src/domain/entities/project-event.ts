/**
 * project-event.ts
 * -----------------
 * Domain entity representing an event on a Project board (e.g. GitHub
 * Projects v2, or equivalent boards on GitLab).
 *
 * It captures the movement of an item between board columns/states, useful
 * for tracking team velocity and for automated storytelling.
 */

/** Status-change event on a Project board. */
export interface ProjectEvent {
  /** Title of the project the item belongs to. */
  projectTitle: string;

  /** Unique identifier of the item on the board. */
  itemId: string;

  /** Type of content associated with the item. */
  contentType: 'issue' | 'pull_request' | 'draft_issue';

  /** Sequential number of the content, null for drafts. */
  contentNumber: number | null;

  /** Title of the associated content. */
  contentTitle: string;

  /** Current status of the item on the board (e.g. "In Progress", "Done"). */
  status: string | null;

  /** Previous status, null if the item was just added. */
  previousStatus: string | null;

  /** Date of the item's last update. */
  updatedAt: Date;
}
