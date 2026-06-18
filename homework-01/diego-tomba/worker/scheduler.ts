/**
 * worker/scheduler.ts
 * -------------------
 * The scheduling engine: node-cron jobs for every watched repository that has a
 * schedule, executing the full monitoring pipeline (fetch → storytelling →
 * report → usage) on each firing.
 *
 * It reconciles the schedule every minute, so adding/removing/pausing repos in
 * the UI takes effect without a restart. Credentials are read fresh from
 * settings on every run, so updating a token in the UI is picked up too.
 *
 * Exposed as `startScheduler()` and driven by the standalone worker
 * (worker/index.ts), kept separate from the web server for robustness.
 */

import cron, { type ScheduledTask } from 'node-cron';
import { prisma } from '../src/infrastructure/persistence/prisma/prisma-client.ts';
import { PrismaSettingsRepository } from '../src/infrastructure/persistence/prisma/prisma-settings.repository.ts';
import { createContainer } from '../src/config/container.ts';
import { DEFAULT_CONFIG } from '../src/config/env.ts';
import type { WatchedRepo } from '../src/domain/entities/watched-repo.ts';

const RECONCILE_INTERVAL_MS = 60_000;

/** Build a container using the current persisted settings. */
async function buildContainer() {
  const settings = await new PrismaSettingsRepository(prisma).get();
  const container = createContainer({
    githubToken: settings.githubToken,
    anthropicToken: settings.anthropicToken,
    repoOwner: DEFAULT_CONFIG.repoOwner,
    repoName: DEFAULT_CONFIG.repoName,
    platform: DEFAULT_CONFIG.platform,
    dbPath: DEFAULT_CONFIG.dbPath,
  });
  return { container, settings };
}

async function runRepo(repo: WatchedRepo): Promise<void> {
  const { container, settings } = await buildContainer();
  if (!settings.githubToken) {
    console.warn(
      `[worker] Skipping ${repo.owner}/${repo.name}: GitHub token not configured.`,
    );
    return;
  }
  console.log(`[worker] Running ${repo.owner}/${repo.name}…`);
  try {
    const res = await container.runRepoWatch.execute(
      repo.owner,
      repo.name,
      repo.platform,
    );
    console.log(
      `[worker] ${repo.owner}/${repo.name}: report #${res.report.id}, ` +
        `${res.story.eventsProcessed} events, $${res.story.costUsd.toFixed(4)}`,
    );
  } catch (err) {
    console.error(
      `[worker] ${repo.owner}/${repo.name} failed:`,
      (err as Error).message,
    );
  }
}

/** Active cron tasks, keyed by repo id, with the cron they were created for. */
const tasks = new Map<number, { cron: string; task: ScheduledTask }>();

async function reconcile(): Promise<void> {
  const { container } = await buildContainer();
  const scheduled = await container.watchedRepoRepo.listScheduled();
  const seen = new Set<number>();

  for (const repo of scheduled) {
    if (!repo.scheduleCron || !cron.validate(repo.scheduleCron)) {
      if (repo.scheduleCron) {
        console.warn(
          `[worker] Invalid cron for ${repo.owner}/${repo.name}: "${repo.scheduleCron}"`,
        );
      }
      continue;
    }
    seen.add(repo.id);
    const existing = tasks.get(repo.id);
    if (existing && existing.cron === repo.scheduleCron) continue;

    // New or changed schedule: replace the task.
    existing?.task.stop();
    const task = cron.schedule(repo.scheduleCron, () => {
      void runRepo(repo);
    });
    tasks.set(repo.id, { cron: repo.scheduleCron, task });
    console.log(
      `[worker] Scheduled ${repo.owner}/${repo.name} @ "${repo.scheduleCron}"`,
    );
  }

  // Drop tasks for repos that are no longer scheduled/enabled.
  for (const [id, entry] of tasks) {
    if (!seen.has(id)) {
      entry.task.stop();
      tasks.delete(id);
      console.log(`[worker] Unscheduled repo #${id}`);
    }
  }
}

let started = false;

/** Starts the scheduler (idempotent). */
export async function startScheduler(): Promise<void> {
  if (started) return;
  started = true;
  console.log('🔭 RepoWatcher scheduler started.');
  await reconcile();
  setInterval(() => {
    void reconcile();
  }, RECONCILE_INTERVAL_MS);
}
