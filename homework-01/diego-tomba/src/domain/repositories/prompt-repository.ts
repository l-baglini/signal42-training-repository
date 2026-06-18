/**
 * prompt-repository.ts
 * --------------------
 * Port for persisting narrator-guiding prompts.
 */

import type { Prompt, NewPrompt } from '../entities/prompt.ts';

/** Contract for persisting prompts. */
export interface PromptRepository {
  /** Returns all prompts, newest first. */
  list(): Promise<Prompt[]>;

  /** Returns the currently active prompt, or null if none is active. */
  getActive(): Promise<Prompt | null>;

  /** Creates a prompt. */
  create(prompt: NewPrompt): Promise<Prompt>;

  /** Updates a prompt's name and/or content. */
  update(id: number, patch: Partial<NewPrompt>): Promise<Prompt>;

  /** Marks a prompt active, deactivating all others. */
  activate(id: number): Promise<void>;

  /** Removes a prompt. */
  remove(id: number): Promise<void>;
}
