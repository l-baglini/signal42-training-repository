/**
 * octokit-git-platform.adapter.ts
 * --------------------------------
 * Concrete GitHub adapter implementing the GitPlatformPort.
 *
 * Uses Octokit (the official GitHub SDK) with a dynamic import to avoid
 * loading problems in contexts where the module might not be installed
 * (e.g. domain unit tests).
 *
 * Design choice: the `octokit` dynamic import happens lazily on the first
 * API call. This lets the module be imported (type-checking) without
 * requiring the dependency to be resolved at load time.
 *
 * Note: this adapter only supports GitHub. For GitLab a separate adapter
 * implementing the same interface will be created, respecting the
 * Open/Closed principle of Clean Architecture.
 */

import type { GitPlatformPort } from '../../application/ports/git-platform.port.ts';
import type { PullRequest } from '../../domain/entities/pull-request.ts';
import type { Issue } from '../../domain/entities/issue.ts';
import type { ProjectEvent } from '../../domain/entities/project-event.ts';

/** Page size for the REST list endpoints (pull requests, issues). */
const PER_PAGE = 50;

/** Maximum number of Projects v2 boards inspected per repository. */
const MAX_PROJECTS = 5;

/** Maximum number of items read from each Projects v2 board. */
const MAX_PROJECT_ITEMS = 50;

export class OctokitGitPlatformAdapter implements GitPlatformPort {
  /** Octokit instance, initialized lazily on the first API call. */
  private octokit: any;

  /**
   * @param token - Personal Access Token (PAT) or GitHub App token
   *                with the required permissions (repo, project:read).
   */
  constructor(private readonly token: string) {}

  /** Platform identifier — used for event deduplication. */
  get platformName(): string {
    return 'github';
  }

  // ───────────────────── Pull Requests ─────────────────────

  /**
   * Fetches the recent Pull Requests of a repository.
   *
   * Uses the REST `pulls.list` endpoint sorted by last update. If `since` is
   * given, PRs updated before that date are filtered out client-side (the
   * GitHub API does not support the `since` parameter for PRs).
   *
   * Known limitation: additions/deletions/changedFiles are not available on
   * the list endpoint — they would require N+1 calls to the single endpoint.
   * For now we set them to 0; a future improvement could fetch the details
   * for the most relevant PRs.
   *
   * @param owner - Repository owner (user or organization).
   * @param repo - Repository name.
   * @param since - Optional cutoff date; PRs updated before it are dropped.
   * @returns The list of normalized pull requests.
   */
  async fetchRecentPullRequests(
    owner: string,
    repo: string,
    since?: Date,
  ): Promise<PullRequest[]> {
    const ok = await this.getOctokit();
    const response = await ok.rest.pulls.list({
      owner,
      repo,
      state: 'all',
      sort: 'updated',
      direction: 'desc',
      per_page: PER_PAGE,
    });

    let prs = response.data;
    if (since) {
      prs = prs.filter((pr: any) => new Date(pr.updated_at) >= since);
    }

    return prs.map((pr: any) => ({
      id: pr.id,
      number: pr.number,
      title: pr.title,
      state: pr.merged_at ? 'merged' : (pr.state as 'open' | 'closed'),
      author: pr.user?.login ?? 'unknown',
      labels: pr.labels.map((l: any) => (typeof l === 'string' ? l : l.name ?? '')),
      createdAt: new Date(pr.created_at),
      updatedAt: new Date(pr.updated_at),
      mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
      closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
      url: pr.html_url,
      additions: 0, // Not available on the list endpoint
      deletions: 0,
      changedFiles: 0,
    }));
  }

  // ───────────────────── Issues ─────────────────────

  /**
   * Fetches the recent Issues of a repository.
   *
   * Caution: the GitHub API includes Pull Requests in the issues list. We
   * explicitly filter out those that carry a `pull_request` field, returning
   * only "pure" issues.
   *
   * @param owner - Repository owner (user or organization).
   * @param repo - Repository name.
   * @param since - Optional cutoff date passed through to the API.
   * @returns The list of normalized issues.
   */
  async fetchRecentIssues(
    owner: string,
    repo: string,
    since?: Date,
  ): Promise<Issue[]> {
    const ok = await this.getOctokit();
    const response = await ok.rest.issues.listForRepo({
      owner,
      repo,
      state: 'all',
      sort: 'updated',
      direction: 'desc',
      per_page: PER_PAGE,
      ...(since ? { since: since.toISOString() } : {}),
    });

    // GitHub includes PRs in the issues list — we discard them.
    const pureIssues = response.data.filter((i: any) => !i.pull_request);

    return pureIssues.map((issue: any) => ({
      id: issue.id,
      number: issue.number,
      title: issue.title,
      state: issue.state as 'open' | 'closed',
      author: issue.user?.login ?? 'unknown',
      labels: issue.labels.map((l: any) =>
        typeof l === 'string' ? l : l.name ?? '',
      ),
      createdAt: new Date(issue.created_at),
      updatedAt: new Date(issue.updated_at),
      closedAt: issue.closed_at ? new Date(issue.closed_at) : null,
      url: issue.html_url,
      commentsCount: issue.comments ?? 0,
    }));
  }

  // ───────────────────── Project Events ─────────────────────

  /**
   * Fetches the Projects v2 events associated with the repository.
   *
   * Uses the GraphQL API because Projects v2 have no dedicated REST endpoint.
   * It looks up the first 5 projects of the repository and, for each, fetches
   * up to 50 items with their current status.
   *
   * Limitation: the `previousStatus` field is not available from the current
   * query — it would require the audit log or timeline events.
   *
   * If the repository has no Projects v2 or the token lacks the required
   * permissions, an empty array is returned without throwing.
   *
   * @param owner - Repository owner (user or organization).
   * @param repo - Repository name.
   * @returns The list of project board events (empty on failure).
   */
  async fetchProjectEvents(
    owner: string,
    repo: string,
  ): Promise<ProjectEvent[]> {
    const ok = await this.getOctokit();

    try {
      // GraphQL query for repository-level Projects v2
      const result = await ok.graphql(
        `
        query($owner: String!, $repo: String!) {
          repository(owner: $owner, name: $repo) {
            projectsV2(first: ${MAX_PROJECTS}) {
              nodes {
                number
                title
                items(first: ${MAX_PROJECT_ITEMS}, orderBy: {field: POSITION, direction: DESC}) {
                  nodes {
                    id
                    updatedAt
                    content {
                      __typename
                      ... on Issue {
                        number
                        title
                      }
                      ... on PullRequest {
                        number
                        title
                      }
                      ... on DraftIssue {
                        title
                      }
                    }
                    fieldValueByName(name: "Status") {
                      ... on ProjectV2ItemFieldSingleSelectValue {
                        name
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `,
        { owner, repo },
      );

      const events: ProjectEvent[] = [];
      const projects = (result as any).repository?.projectsV2?.nodes ?? [];

      // Map the GraphQL __typename values to our content types
      const contentTypeMap: Record<string, 'issue' | 'pull_request' | 'draft_issue'> = {
        Issue: 'issue',
        PullRequest: 'pull_request',
        DraftIssue: 'draft_issue',
      };

      for (const project of projects) {
        for (const item of project.items?.nodes ?? []) {
          const content = item.content;
          if (!content) continue;

          events.push({
            projectTitle: project.title,
            itemId: item.id,
            contentType: contentTypeMap[content.__typename] ?? 'draft_issue',
            contentNumber: content.number ?? null,
            contentTitle: content.title ?? '',
            status: item.fieldValueByName?.name ?? null,
            previousStatus: null, // Not available from this query
            updatedAt: new Date(item.updatedAt),
          });
        }
      }

      return events;
    } catch (error) {
      // If GraphQL fails (no project, insufficient permissions), we return
      // an empty array instead of propagating the error. The caller can
      // still generate a report from PRs and Issues.
      console.warn(
        '[octokit] Unable to fetch Projects v2:',
        (error as Error).message,
      );
      return [];
    }
  }

  // ───────────────────── Private helpers ─────────────────────

  /**
   * Lazy initialization of Octokit via dynamic import.
   *
   * The dynamic import prevents the `octokit` module from being resolved at
   * file import time, which enables:
   * - Type-checking without the dependency installed
   * - Domain/application tests without mocking npm modules
   *
   * @returns The shared Octokit instance.
   */
  private async getOctokit(): Promise<any> {
    if (!this.octokit) {
      const { Octokit } = await import('octokit');
      this.octokit = new Octokit({ auth: this.token });
    }
    return this.octokit;
  }
}
