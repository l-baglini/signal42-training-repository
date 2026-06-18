/**
 * run-repo-watch.use-case.ts
 * --------------------------
 * Orchestrates a full monitoring run for a single repository, reusable from the
 * web API (on-demand) and the scheduler (cron). It ties together the existing
 * use cases and persists the outcome:
 *
 *   1. Fetch + persist recent events (incremental, scoped per repo).
 *   2. Generate the storytelling, steered by the active prompt (if any).
 *   3. Save the report for history.
 *   4. Record the usage so the cost estimate and budget indicator stay current.
 */

import type { FetchRepoEventsUseCase } from './fetch-repo-events.use-case.ts';
import type { GenerateStorytellingUseCase } from './generate-storytelling.use-case.ts';
import type { RecordUsageUseCase } from './record-usage.use-case.ts';
import type { PromptRepository } from '../../domain/repositories/prompt-repository.ts';
import type { ReportRepository } from '../../domain/repositories/report-repository.ts';
import type { Report } from '../../domain/entities/report.ts';
import type { StorytellingResult } from '../ports/ai-narrator.port.ts';

/** Result of a monitoring run. */
export interface RunRepoWatchResult {
  report: Report;
  eventsFetched: number;
  story: StorytellingResult;
}

export class RunRepoWatchUseCase {
  constructor(
    private readonly fetchRepoEvents: FetchRepoEventsUseCase,
    private readonly generateStorytelling: GenerateStorytellingUseCase,
    private readonly recordUsage: RecordUsageUseCase,
    private readonly promptRepo: PromptRepository,
    private readonly reportRepo: ReportRepository,
  ) {}

  /**
   * Runs the full pipeline for a repository.
   *
   * @param owner - Repository owner.
   * @param repo - Repository name.
   * @param platform - Git platform (e.g. 'github').
   */
  async execute(
    owner: string,
    repo: string,
    platform: string,
  ): Promise<RunRepoWatchResult> {
    const events = await this.fetchRepoEvents.execute(owner, repo);

    const active = await this.promptRepo.getActive();
    const story = await this.generateStorytelling.execute(
      owner,
      repo,
      platform,
      undefined,
      active?.content,
    );

    const report = await this.reportRepo.save({
      repoOwner: owner,
      repoName: repo,
      markdown: story.markdown,
      eventsProcessed: story.eventsProcessed,
      costUsd: story.costUsd,
      inputTokens: story.usage.inputTokens,
      outputTokens: story.usage.outputTokens,
      cacheCreationTokens: story.usage.cacheCreationTokens,
      cacheReadTokens: story.usage.cacheReadTokens,
      model: story.model,
    });

    // Track cost and the real token breakdown for the budget indicator and
    // cost estimates.
    await this.recordUsage.execute({
      taskType: `storytelling:${owner}/${repo}`,
      inputTokens: story.usage.inputTokens,
      outputTokens: story.usage.outputTokens,
      cacheCreationTokens: story.usage.cacheCreationTokens,
      cacheReadTokens: story.usage.cacheReadTokens,
      costUsd: story.costUsd,
      durationMs: 0,
    });

    return { report, eventsFetched: events.length, story };
  }
}
