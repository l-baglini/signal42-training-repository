/**
 * @file ai-narrator.port.ts
 * @description Port for AI-powered storytelling generation.
 *              The concrete implementation will use the Claude Agent SDK to
 *              turn repository events into a readable narrative.
 */

import type { RepoEvent } from '../../domain/entities/repo-event.ts';

/**
 * Result of a storytelling generation.
 * Contains the generated markdown, the generation metadata and the cost incurred.
 */
/** Token usage breakdown for a generation, by token type. */
export interface TokenUsage {
  /** Fresh (non-cached) input tokens. */
  inputTokens: number;
  /** Output tokens generated. */
  outputTokens: number;
  /** Input tokens written to cache (higher rate). */
  cacheCreationTokens: number;
  /** Input tokens read from cache (reduced rate). */
  cacheReadTokens: number;
}

export interface StorytellingResult {
  /** Narrative content in Markdown format */
  markdown: string;

  /** Timestamp of the storytelling generation */
  generatedAt: Date;

  /** Number of repository events processed to produce the narrative */
  eventsProcessed: number;

  /** Real cost in USD for the AI model call (from the SDK). */
  costUsd: number;

  /** Token usage broken down by type (fresh/output/cache write/read). */
  usage: TokenUsage;

  /** Model that produced the report (e.g. "claude-...") when known. */
  model: string | null;
}

/**
 * Port for the AI narrator that generates storytelling from repository events.
 *
 * The concrete implementation (e.g. ClaudeNarratorAdapter) will invoke the AI
 * model to turn a list of raw events into a structured narrative.
 */
export interface AiNarratorPort {
  /**
   * Generates a narrative storytelling from the repository events.
   *
   * @param events - List of repository events to narrate
   * @param repoContext - Repository context (owner, name, platform)
   * @param guidance - Optional user-provided guidance that steers the narrative
   *                   (tone, focus, language, what to highlight)
   * @returns The storytelling result with markdown, metadata and cost
   */
  generateStorytelling(
    events: RepoEvent[],
    repoContext: { owner: string; repo: string; platform: string },
    guidance?: string,
  ): Promise<StorytellingResult>;
}
