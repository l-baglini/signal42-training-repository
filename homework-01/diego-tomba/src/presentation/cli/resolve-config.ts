/**
 * resolve-config.ts
 * -----------------
 * Resolves the application configuration for the CLI by layering three
 * sources, in order of precedence:
 *
 *   1. Command-line flags (highest priority)
 *   2. Environment variables
 *   3. Built-in defaults
 *
 * Any required value still missing after these layers is requested
 * interactively via an inquirer prompt. When every required value is supplied
 * up front (flags or env), no prompt is shown — keeping the CLI usable in CI.
 */

import { password } from "@inquirer/prompts";
import {
  assertPlatform,
  readEnvConfig,
  DEFAULT_CONFIG,
} from "../../config/env.ts";
import type { EnvConfig } from "../../config/env.ts";

/** Raw option values collected by commander for a subcommand. */
export interface CliOptions {
  /** Repository owner (maps to `--owner`). */
  owner?: string;

  /** Repository name (maps to `--repo`). */
  repo?: string;

  /** Target Git platform (maps to `--platform`). */
  platform?: string;

  /** GitHub token (maps to `--token`). */
  token?: string;

  /** SQLite database path (maps to `--db`). */
  db?: string;
}

/** Options controlling how the configuration is resolved. */
export interface ResolveOptions {
  /**
   * Whether a GitHub token is required. When `true` and no token is found in
   * flags or env, the user is prompted for one. When `false` the token
   * defaults to an empty string (e.g. the `agent` command never hits GitHub,
   * since the Octokit adapter is initialized lazily).
   */
  requireToken: boolean;
}

/**
 * Resolves the full {@link EnvConfig} from CLI flags, environment variables,
 * defaults, and — only when needed — an interactive prompt.
 *
 * @param options - The flag values collected by commander.
 * @param resolve - Resolution behavior, e.g. whether the token is required.
 * @returns The fully-resolved configuration.
 * @throws {Error} If the resolved platform is not a supported value.
 */
export async function resolveConfig(
  options: CliOptions,
  resolve: ResolveOptions,
): Promise<EnvConfig> {
  const env = readEnvConfig();

  const repoOwner = options.owner ?? env.repoOwner ?? DEFAULT_CONFIG.repoOwner;
  const repoName = options.repo ?? env.repoName ?? DEFAULT_CONFIG.repoName;
  const platform = assertPlatform(
    options.platform ?? env.platform ?? DEFAULT_CONFIG.platform,
  );
  const dbPath = options.db ?? env.dbPath ?? DEFAULT_CONFIG.dbPath;

  let githubToken = options.token ?? env.githubToken ?? "";

  // Prompt for the token only when it is required and still missing.
  if (resolve.requireToken && !githubToken) {
    githubToken = await password({
      message: "GitHub token (PAT with 'public_repo' + 'read:project' scopes):",
      mask: true,
      validate: (value) => value.trim().length > 0 || "A token is required.",
    });
  }

  return { githubToken, repoOwner, repoName, platform, dbPath };
}
