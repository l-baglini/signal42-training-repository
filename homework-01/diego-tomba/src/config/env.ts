/**
 * env.ts
 * ------
 * Reading and validation of environment variables.
 *
 * All configuration coming from the external environment is centralized
 * here: a single place to check what is missing and fail fast, rather than
 * discovering a missing token halfway through execution.
 */

/** Supported Git platforms. */
export type Platform = "github" | "gitlab";

/** Application configuration resolved from the environment (or the CLI). */
export interface EnvConfig {
  /** GitHub authentication token (PAT or fine-grained). */
  githubToken: string;

  /** Owner of the repository to monitor (default: "prebid"). */
  repoOwner: string;

  /** Name of the repository to monitor (default: "Prebid.js"). */
  repoName: string;

  /** Target Git platform (default: "github"). */
  platform: Platform;

  /** Path to the SQLite database file (default: "./repowatcher.db"). */
  dbPath: string;

  /** Anthropic API key for the Claude Agent SDK narrator (optional). */
  anthropicToken?: string;
}

/** Default configuration values, applied when no other source provides one. */
export const DEFAULT_CONFIG = {
  repoOwner: "prebid",
  repoName: "Prebid.js",
  platform: "github" as Platform,
  dbPath: "./repowatcher.db",
} as const;

/**
 * Validates that the given value is a supported {@link Platform}.
 *
 * @param value - The platform string to validate.
 * @returns The value narrowed to {@link Platform}.
 * @throws {Error} If the platform is not "github" or "gitlab".
 */
export function assertPlatform(value: string): Platform {
  if (value !== "github" && value !== "gitlab") {
    throw new Error(
      `Platform "${value}" is not supported. Valid values: github, gitlab.`,
    );
  }
  return value;
}

/**
 * Reads configuration from environment variables without throwing.
 *
 * Unlike {@link loadEnv}, this never fails on a missing token: it returns a
 * partial config so that callers (e.g. the CLI resolver) can layer flags and
 * interactive prompts on top of the environment values.
 *
 * @returns A partial config containing only the values present in the environment.
 */
export function readEnvConfig(): Partial<EnvConfig> {
  const config: Partial<EnvConfig> = {};

  if (process.env.GITHUB_TOKEN) config.githubToken = process.env.GITHUB_TOKEN;
  if (process.env.REPO_OWNER) config.repoOwner = process.env.REPO_OWNER;
  if (process.env.REPO_NAME) config.repoName = process.env.REPO_NAME;
  if (process.env.GIT_PLATFORM) {
    config.platform = assertPlatform(process.env.GIT_PLATFORM);
  }
  if (process.env.DB_PATH) config.dbPath = process.env.DB_PATH;
  if (process.env.ANTHROPIC_API_KEY)
    config.anthropicToken = process.env.ANTHROPIC_API_KEY;

  return config;
}

/**
 * Loads the full configuration from environment variables.
 *
 * @returns The resolved {@link EnvConfig}.
 * @throws {Error} If the required GITHUB_TOKEN variable is not set, or if
 *                 GIT_PLATFORM holds an unsupported value.
 */
export function loadEnv(): EnvConfig {
  const githubToken = process.env.GITHUB_TOKEN;

  if (!githubToken) {
    throw new Error(
      "Environment variable GITHUB_TOKEN is not set.\n" +
        "Create a Personal Access Token at https://github.com/settings/tokens\n" +
        "with the 'public_repo' and 'read:project' scopes, then export it:\n" +
        "  export GITHUB_TOKEN=ghp_xxx",
    );
  }

  return {
    githubToken,
    repoOwner: process.env.REPO_OWNER ?? DEFAULT_CONFIG.repoOwner,
    repoName: process.env.REPO_NAME ?? DEFAULT_CONFIG.repoName,
    platform: assertPlatform(process.env.GIT_PLATFORM ?? DEFAULT_CONFIG.platform),
    dbPath: process.env.DB_PATH ?? DEFAULT_CONFIG.dbPath,
    anthropicToken: process.env.ANTHROPIC_API_KEY,
  };
}
