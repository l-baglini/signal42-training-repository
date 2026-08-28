/**
 * server-container.ts
 * -------------------
 * Server-only factory that builds the Clean Architecture container from the
 * settings stored in the database (tokens, etc.). Route handlers call this to
 * get the wired use cases.
 *
 * Important: it does NOT call `container.close()` — the Prisma client is a
 * process-wide singleton shared across requests, so disconnecting per request
 * would tear down the shared connection.
 */

import { prisma } from '@core/infrastructure/persistence/prisma/prisma-client.ts';
import { PrismaSettingsRepository } from '@core/infrastructure/persistence/prisma/prisma-settings.repository.ts';
import { createContainer } from '@core/config/container.ts';
import { DEFAULT_CONFIG } from '@core/config/env.ts';
import type { AppContainer } from '@core/config/container.ts';
import type { AppSettings } from '@core/domain/entities/settings.ts';

/** Builds a container using the persisted settings for credentials. */
export async function getContainer(): Promise<{
  container: AppContainer;
  settings: AppSettings;
}> {
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
