/**
 * report-repository.ts
 * --------------------
 * Port for persisting generated storytelling reports.
 */

import type { Report, NewReport } from '../entities/report.ts';

/** Contract for persisting reports. */
export interface ReportRepository {
  /**
   * Returns reports, newest first.
   *
   * @param limit - Optional maximum number of reports to return.
   */
  list(limit?: number): Promise<Report[]>;

  /** Returns a single report by id, or null if absent. */
  findById(id: number): Promise<Report | null>;

  /** Saves a new report and returns it. */
  save(report: NewReport): Promise<Report>;
}
