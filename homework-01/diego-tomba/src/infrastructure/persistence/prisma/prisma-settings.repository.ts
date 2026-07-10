/**
 * prisma-settings.repository.ts
 * -----------------------------
 * Prisma-backed SettingsRepository.
 *
 * Settings are stored as key-value rows. Secrets are kept in plain text — this
 * is a local single-user tool and the trade-off is documented.
 */

import type { PrismaClient } from '@prisma/client';
import type { SettingsRepository } from '../../../domain/repositories/settings-repository.ts';
import type { AppSettings } from '../../../domain/entities/settings.ts';
import { DEFAULT_SETTINGS } from '../../../domain/entities/settings.ts';

const KEYS = {
  githubToken: 'github_token',
  anthropicToken: 'anthropic_token',
  monthlyBudgetUsd: 'monthly_budget_usd',
} as const;

export class PrismaSettingsRepository implements SettingsRepository {
  constructor(private readonly db: PrismaClient) {}

  async get(): Promise<AppSettings> {
    const rows = await this.db.settings.findMany();
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return {
      githubToken: map.get(KEYS.githubToken) ?? DEFAULT_SETTINGS.githubToken,
      anthropicToken:
        map.get(KEYS.anthropicToken) ?? DEFAULT_SETTINGS.anthropicToken,
      monthlyBudgetUsd: map.has(KEYS.monthlyBudgetUsd)
        ? Number(map.get(KEYS.monthlyBudgetUsd))
        : DEFAULT_SETTINGS.monthlyBudgetUsd,
    };
  }

  async update(patch: Partial<AppSettings>): Promise<void> {
    const entries: { key: string; value: string }[] = [];
    if (patch.githubToken !== undefined)
      entries.push({ key: KEYS.githubToken, value: patch.githubToken });
    if (patch.anthropicToken !== undefined)
      entries.push({ key: KEYS.anthropicToken, value: patch.anthropicToken });
    if (patch.monthlyBudgetUsd !== undefined)
      entries.push({
        key: KEYS.monthlyBudgetUsd,
        value: String(patch.monthlyBudgetUsd),
      });

    await this.db.$transaction(
      entries.map((e) =>
        this.db.settings.upsert({
          where: { key: e.key },
          create: { key: e.key, value: e.value },
          update: { value: e.value },
        }),
      ),
    );
  }
}
