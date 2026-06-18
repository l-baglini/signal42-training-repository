/**
 * report.ts
 * ---------
 * Domain entity for a generated storytelling report, persisted for history.
 */

/** A stored storytelling report. */
export interface Report {
  /** Persistence id. */
  id: number;

  /** Repository owner the report is about. */
  repoOwner: string;

  /** Repository name the report is about. */
  repoName: string;

  /** Narrative content in Markdown. */
  markdown: string;

  /** Number of repository events processed to produce the report. */
  eventsProcessed: number;

  /** Real cost in USD for the generation. */
  costUsd: number;

  /** Fresh (non-cached) input tokens. */
  inputTokens: number;

  /** Output tokens generated. */
  outputTokens: number;

  /** Input tokens written to cache. */
  cacheCreationTokens: number;

  /** Input tokens read from cache. */
  cacheReadTokens: number;

  /** Model that produced the report, when known. */
  model: string | null;

  /** When the report was generated. */
  generatedAt: Date;
}

/** Fields accepted when saving a new report. */
export interface NewReport {
  repoOwner: string;
  repoName: string;
  markdown: string;
  eventsProcessed: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  model: string | null;
}
