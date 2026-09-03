/**
 * @file generate-storytelling.use-case.ts
 * @description Use case for generating the repository storytelling.
 *              Fetches the recent events from the repository and sends them to
 *              the AI narrator (Claude Agent SDK) to produce a structured
 *              narrative in Markdown. By default it considers the last 7 days
 *              of activity.
 */

import type { RepoEventRepository } from '../../domain/repositories/repo-event-repository.ts';
import type { AiNarratorPort, StorytellingResult } from '../ports/ai-narrator.port.ts';

/** Default lookback window: 7 days in milliseconds */
const DEFAULT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Use case: Generate the narrative storytelling of the repository.
 *
 * Responsibility: fetch the repository events from the specified period and
 * delegate to the AI narrator the transformation into a readable narrative.
 * Useful for generating weekly reports, narrative changelogs or project
 * updates in storytelling form.
 */
export class GenerateStorytellingUseCase {
  constructor(
    private readonly eventRepo: RepoEventRepository,
    private readonly narrator: AiNarratorPort,
  ) {}

  /**
   * Runs the storytelling generation.
   *
   * @param owner - Repository owner (user or organization)
   * @param repo - Repository name
   * @param platform - Name of the Git platform (e.g. 'github', 'gitlab')
   * @param since - Optional date from which to consider events; default: last 7 days
   * @param guidance - Optional user prompt that steers the narrator
   * @returns The storytelling result with markdown, metadata and generation cost
   */
  async execute(
    owner: string,
    repo: string,
    platform: string,
    since?: Date,
    guidance?: string,
  ): Promise<StorytellingResult> {
    // If not specified, use a 7-day lookback window
    const lookback = since ?? new Date(Date.now() - DEFAULT_LOOKBACK_MS);

    // Fetch the events from the repository starting at the lookback date
    const events = await this.eventRepo.getEventsSince(owner, repo, lookback);

    // Delegate the narrative generation to the AI narrator (Claude Agent SDK)
    return this.narrator.generateStorytelling(
      events,
      { owner, repo, platform },
      guidance,
    );
  }
}
