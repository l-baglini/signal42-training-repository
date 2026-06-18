/**
 * settings.ts
 * -----------
 * Domain entity for the application settings.
 *
 * In a local single-user setup these are stored in the database (not in the
 * environment) so the web UI can read and write them at runtime. Secrets are
 * kept in plain text locally; this is acceptable for a personal tool running on
 * the user's own machine, and is documented as such.
 */

/** Fully-resolved application settings. */
export interface AppSettings {
  /** GitHub authentication token (PAT or fine-grained). */
  githubToken: string;

  /** Anthropic API key used by the Claude Agent SDK narrator. */
  anthropicToken: string;

  /** Monthly spend budget in USD, used by the usage indicator (0 = unset). */
  monthlyBudgetUsd: number;
}

/** Default settings, applied when nothing is stored yet. */
export const DEFAULT_SETTINGS: AppSettings = {
  githubToken: '',
  anthropicToken: '',
  monthlyBudgetUsd: 0,
};
