/**
 * settings-repository.ts
 * ----------------------
 * Port for reading and writing the application settings.
 */

import type { AppSettings } from '../entities/settings.ts';

/** Contract for persisting application settings. */
export interface SettingsRepository {
  /**
   * Returns the full settings, with defaults applied for anything not stored.
   */
  get(): Promise<AppSettings>;

  /**
   * Updates the provided subset of settings, leaving the rest untouched.
   *
   * @param patch - Partial settings to persist.
   */
  update(patch: Partial<AppSettings>): Promise<void>;
}
