/**
 * usage-repository.ts
 * ---------------------
 * Port (interface) for persisting usage records.
 *
 * Defines the contract that any infrastructure adapter (Prisma/SQLite,
 * PostgreSQL, in-memory for tests, etc.) must honor to save and query the
 * history of agent runs.
 *
 * The domain depends ONLY on this interface, never on the concrete
 * implementation: this is the Dependency Inversion Principle (DIP) applied.
 */

import type { UsageRecord } from '../entities/usage-record.ts';

/** A single usage sample with its timestamp, used by the web usage views. */
export interface UsageSample {
  taskType: string;
  cost: number;
  input: number;
  output: number;
  createdAt: Date;
}

/** Contract for persisting agent usage records. */
export interface UsageRepository {
  /**
   * Records a completed run.
   * The implementation must treat every record as append-only (immutable).
   *
   * @param r - The usage record to persist.
   */
  record(r: UsageRecord): Promise<void>;

  /**
   * Returns all raw observations for a task type.
   * Statistics (mean, percentiles) are computed in the domain, not in the
   * repository.
   *
   * @param taskType - The task type whose samples to fetch.
   * @returns The samples with cost, input and output values.
   */
  samplesFor(
    taskType: string,
  ): Promise<{ cost: number; input: number; output: number }[]>;

  /** Returns the distinct task types that have at least one record. */
  taskTypes(): Promise<string[]>;

  /**
   * Returns all usage samples created on or after the given date, newest first.
   * Used to compute the current-period spend and the usage history view.
   *
   * @param since - Lower bound (inclusive) on the creation timestamp.
   */
  samplesSince(since: Date): Promise<UsageSample[]>;
}
