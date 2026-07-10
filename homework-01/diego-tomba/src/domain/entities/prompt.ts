/**
 * prompt.ts
 * ---------
 * Domain entity for a narrator-guiding prompt.
 *
 * Prompts let the user steer the AI storytelling (tone, focus, language, what
 * to highlight). Exactly one prompt is active at a time; the active prompt's
 * content is injected into the narrator's instructions.
 */

/** A reusable narrator prompt. */
export interface Prompt {
  /** Persistence id. */
  id: number;

  /** Human-readable label. */
  name: string;

  /** The guidance text injected into the narrator prompt. */
  content: string;

  /** Whether this prompt is the active one. */
  isActive: boolean;

  /** Creation timestamp. */
  createdAt: Date;
}

/** Fields accepted when creating a prompt. */
export interface NewPrompt {
  name: string;
  content: string;
}
