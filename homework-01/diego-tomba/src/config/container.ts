/**
 * container.ts
 * ------------
 * Manual Dependency Injection (Composition Root).
 *
 * This is where the "wiring" happens: we create the concrete implementations
 * (Prisma repositories, Octokit and Claude adapters) and inject them into the
 * use cases. The use cases only know about the interfaces — they have no idea
 * whether Prisma/SQLite, Postgres or a mock sits underneath.
 *
 * Why manual DI and not a framework? With a handful of services a framework
 * would add complexity (decorators, reflection, magic) without a real benefit.
 */

import { loadEnv } from './env.ts';
import type { EnvConfig } from './env.ts';

// Infrastructure — persistence (Prisma)
import { prisma } from '../infrastructure/persistence/prisma/prisma-client.ts';
import { PrismaUsageRepository } from '../infrastructure/persistence/prisma/prisma-usage.repository.ts';
import { PrismaRepoEventRepository } from '../infrastructure/persistence/prisma/prisma-repo-event.repository.ts';
import { PrismaSettingsRepository } from '../infrastructure/persistence/prisma/prisma-settings.repository.ts';
import { PrismaWatchedRepoRepository } from '../infrastructure/persistence/prisma/prisma-watched-repo.repository.ts';
import { PrismaPromptRepository } from '../infrastructure/persistence/prisma/prisma-prompt.repository.ts';
import { PrismaReportRepository } from '../infrastructure/persistence/prisma/prisma-report.repository.ts';

// Infrastructure — external adapters
import { OctokitGitPlatformAdapter } from '../infrastructure/github/octokit-git-platform.adapter.ts';
import { ClaudeNarratorAdapter } from '../infrastructure/ai/claude-narrator.adapter.ts';

// Domain repositories (interfaces exposed for thin CRUD in the API layer)
import type { SettingsRepository } from '../domain/repositories/settings-repository.ts';
import type { WatchedRepoRepository } from '../domain/repositories/watched-repo-repository.ts';
import type { PromptRepository } from '../domain/repositories/prompt-repository.ts';
import type { ReportRepository } from '../domain/repositories/report-repository.ts';
import type { UsageRepository } from '../domain/repositories/usage-repository.ts';

// Use cases
import { RecordUsageUseCase } from '../application/use-cases/record-usage.use-case.ts';
import { GetEstimateUseCase } from '../application/use-cases/get-estimate.use-case.ts';
import { FetchRepoEventsUseCase } from '../application/use-cases/fetch-repo-events.use-case.ts';
import { GenerateStorytellingUseCase } from '../application/use-cases/generate-storytelling.use-case.ts';
import { RunRepoWatchUseCase } from '../application/use-cases/run-repo-watch.use-case.ts';
import { GetUsageSummaryUseCase } from '../application/use-cases/get-usage-summary.use-case.ts';

/**
 * Application container: exposes the use cases (and the repositories used for
 * thin CRUD) already wired with their concrete dependencies.
 */
export interface AppContainer {
  config: EnvConfig;
  // Use cases
  recordUsage: RecordUsageUseCase;
  getEstimate: GetEstimateUseCase;
  fetchRepoEvents: FetchRepoEventsUseCase;
  generateStorytelling: GenerateStorytellingUseCase;
  runRepoWatch: RunRepoWatchUseCase;
  getUsageSummary: GetUsageSummaryUseCase;
  // Repositories (for CRUD in the presentation layer)
  settingsRepo: SettingsRepository;
  watchedRepoRepo: WatchedRepoRepository;
  promptRepo: PromptRepository;
  reportRepo: ReportRepository;
  usageRepo: UsageRepository;
  // Lifecycle
  close: () => Promise<void>;
}

/**
 * Builds the application container from an explicit configuration.
 *
 * Configuration gathering is the responsibility of the presentation layer
 * (CLI flags/env, or the web settings store); the container just receives a
 * fully-resolved {@link EnvConfig}. When no config is passed, it falls back to
 * {@link loadEnv} for the environment-only path (CLI).
 *
 * @param config - The resolved configuration; defaults to {@link loadEnv}.
 * @returns The wired {@link AppContainer}.
 */
export function createContainer(config: EnvConfig = loadEnv()): AppContainer {
  // Repositories (infrastructure → implement the domain interfaces)
  const usageRepo = new PrismaUsageRepository(prisma);
  const eventRepo = new PrismaRepoEventRepository(prisma);
  const settingsRepo = new PrismaSettingsRepository(prisma);
  const watchedRepoRepo = new PrismaWatchedRepoRepository(prisma);
  const promptRepo = new PrismaPromptRepository(prisma);
  const reportRepo = new PrismaReportRepository(prisma);

  // External adapters
  const gitPlatform = new OctokitGitPlatformAdapter(config.githubToken);
  const narrator = new ClaudeNarratorAdapter(config.anthropicToken);

  // Use cases (application → depend only on the interfaces)
  const recordUsage = new RecordUsageUseCase(usageRepo);
  const getEstimate = new GetEstimateUseCase(usageRepo);
  const fetchRepoEvents = new FetchRepoEventsUseCase(gitPlatform, eventRepo);
  const generateStorytelling = new GenerateStorytellingUseCase(
    eventRepo,
    narrator,
  );
  const runRepoWatch = new RunRepoWatchUseCase(
    fetchRepoEvents,
    generateStorytelling,
    recordUsage,
    promptRepo,
    reportRepo,
  );
  const getUsageSummary = new GetUsageSummaryUseCase(usageRepo);

  return {
    config,
    recordUsage,
    getEstimate,
    fetchRepoEvents,
    generateStorytelling,
    runRepoWatch,
    getUsageSummary,
    settingsRepo,
    watchedRepoRepo,
    promptRepo,
    reportRepo,
    usageRepo,
    close: async () => {
      await prisma.$disconnect();
    },
  };
}
