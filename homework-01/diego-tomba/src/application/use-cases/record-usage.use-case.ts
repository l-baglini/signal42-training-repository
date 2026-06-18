/**
 * @file record-usage.use-case.ts
 * @description Use case for recording a Claude Agent SDK usage.
 *              Receives a usage record and persists it via the repository.
 *              A simple, synchronous operation: no complex business logic.
 */

import type { UsageRepository } from '../../domain/repositories/usage-repository.ts';
import type { UsageRecord } from '../../domain/entities/usage-record.ts';

/**
 * Use case: Record a new usage record.
 *
 * Responsibility: delegate the persistence of a single usage record to the
 * repository, keeping the application logic decoupled from the storage
 * infrastructure.
 */
export class RecordUsageUseCase {
  constructor(private readonly usageRepo: UsageRepository) {}

  /**
   * Persists the usage record.
   *
   * @param record - Usage record to persist (e.g. costs, tokens, duration)
   */
  async execute(record: UsageRecord): Promise<void> {
    await this.usageRepo.record(record);
  }
}
