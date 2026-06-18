/**
 * @file fetch-repo-events.use-case.ts
 * @description Use case for fetching events from a Git platform.
 *              Orchestrates the parallel fetch of PRs, issues and project
 *              events, normalizes them into RepoEvent and persists them in the
 *              repository. Supports incremental fetching via the timestamp of
 *              the last fetch.
 */

import type { GitPlatformPort } from '../ports/git-platform.port.ts';
import type { RepoEventRepository } from '../../domain/repositories/repo-event-repository.ts';
import type { RepoEvent, Platform } from '../../domain/entities/repo-event.ts';

/**
 * Use case: Fetch the recent events from the Git repository.
 *
 * Responsibility: coordinate the parallel fetch of pull requests, issues and
 * project events from the configured Git platform, normalize them into the
 * unified RepoEvent format and store them in the repository for later analysis.
 *
 * The fetch is incremental: it uses the timestamp of the last fetch to avoid
 * re-downloading already-known events.
 */
export class FetchRepoEventsUseCase {
  constructor(
    private readonly gitPlatform: GitPlatformPort,
    private readonly eventRepo: RepoEventRepository,
  ) {}

  /**
   * Fetches and persists the repository events.
   *
   * @param owner - Repository owner (user or organization)
   * @param repo - Repository name
   * @returns The events just fetched and saved
   */
  async execute(owner: string, repo: string): Promise<RepoEvent[]> {
    // Determine the starting date for the incremental fetch (scoped per repo)
    const since =
      (await this.eventRepo.getLatestFetchTimestamp(owner, repo)) ?? undefined;
    const platform = this.gitPlatform.platformName as Platform;
    const now = new Date();

    // Parallel fetch of PRs, issues and project events to maximize performance
    const [prs, issues, projectEvents] = await Promise.all([
      this.gitPlatform.fetchRecentPullRequests(owner, repo, since),
      this.gitPlatform.fetchRecentIssues(owner, repo, since),
      this.gitPlatform.fetchProjectEvents(owner, repo),
    ]);

    // Normalize all events into the unified RepoEvent format
    const events: RepoEvent[] = [
      ...prs.map(pr => ({ type: 'pr' as const, platform, data: pr, fetchedAt: now })),
      ...issues.map(issue => ({ type: 'issue' as const, platform, data: issue, fetchedAt: now })),
      ...projectEvents.map(pe => ({ type: 'project' as const, platform, data: pe, fetchedAt: now })),
    ];

    // Persist only if there are new events to save
    if (events.length > 0) {
      await this.eventRepo.saveEvents(owner, repo, events);
    }

    return events;
  }
}
