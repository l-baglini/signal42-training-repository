/**
 * @file git-platform.port.ts
 * @description Generic port for Git platforms (GitHub, GitLab, etc.).
 *              Defines the contract every platform adapter must implement.
 *              Designed to be provider-agnostic, so new platforms can be
 *              supported easily in the future.
 */

import type { PullRequest } from '../../domain/entities/pull-request.ts';
import type { Issue } from '../../domain/entities/issue.ts';
import type { ProjectEvent } from '../../domain/entities/project-event.ts';

/**
 * Port for interacting with remote Git platforms.
 *
 * Every concrete implementation (e.g. GitHubAdapter, GitLabAdapter) must
 * honor this contract, guaranteeing interchangeability across platforms.
 */
export interface GitPlatformPort {
  /**
   * Fetches the recent pull requests for a repository.
   *
   * @param owner - Repository owner (user or organization)
   * @param repo - Repository name
   * @param since - Optional cutoff date; if omitted, fetches the most recent
   * @returns The pull requests found
   */
  fetchRecentPullRequests(owner: string, repo: string, since?: Date): Promise<PullRequest[]>;

  /**
   * Fetches the recent issues for a repository.
   *
   * @param owner - Repository owner (user or organization)
   * @param repo - Repository name
   * @param since - Optional cutoff date; if omitted, fetches the most recent
   * @returns The issues found
   */
  fetchRecentIssues(owner: string, repo: string, since?: Date): Promise<Issue[]>;

  /**
   * Fetches the project board events for a repository.
   *
   * @param owner - Repository owner (user or organization)
   * @param repo - Repository name
   * @returns The project board events
   */
  fetchProjectEvents(owner: string, repo: string): Promise<ProjectEvent[]>;

  /**
   * Name of the platform handled by this adapter.
   * Examples: 'github', 'gitlab'
   */
  get platformName(): string;
}
