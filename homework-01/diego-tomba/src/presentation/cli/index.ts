#!/usr/bin/env -S npx tsx
/**
 * index.ts
 * --------
 * Single CLI entry point built on commander. Exposes the tool as a
 * `repowatcher` binary with two subcommands:
 *
 *   repowatcher watch   — fetch repository events and generate a storytelling report
 *   repowatcher agent   — run a Claude agent while tracking token usage and cost
 *
 * Each subcommand gathers configuration through {@link resolveConfig}
 * (flags > env vars > interactive prompt), then delegates to the matching
 * handler. Error handling is centralized here so the handlers can stay focused
 * on their workflow.
 */

import { createRequire } from "node:module";
import { Command } from "commander";
import { input } from "@inquirer/prompts";
import { resolveConfig } from "./resolve-config.ts";
import { watchRepo } from "./watch-repo.ts";
import { runAgent } from "./run-agent.ts";

const require = createRequire(import.meta.url);
const pkg = require("../../../package.json") as { version: string };

/**
 * Runs an async handler, reporting any failure to stderr and exiting with a
 * non-zero status. Keeps the per-command actions free of boilerplate.
 *
 * @param label - Short context label included in the error message.
 * @param fn - The async handler to execute.
 */
async function run(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`❌ ${label}:`, (err as Error).message);
    process.exit(1);
  }
}

const program = new Command();

program
  .name("repowatcher")
  .description(
    "Monitor GitHub/GitLab repositories with AI-powered storytelling and " +
      "Claude Agent SDK cost estimation.",
  )
  .version(pkg.version);

program
  .command("watch")
  .description("Fetch recent repository events and generate a storytelling report")
  .option("-o, --owner <owner>", "repository owner (user or organization)")
  .option("-r, --repo <repo>", "repository name")
  .option("-p, --platform <platform>", "git platform: github | gitlab")
  .option("-t, --token <token>", "GitHub authentication token")
  .option("-d, --db <path>", "path to the SQLite database file")
  .action((options) =>
    run("Monitoring failed", async () => {
      const config = await resolveConfig(options, { requireToken: true });
      await watchRepo(config);
    }),
  );

program
  .command("agent")
  .description("Run a Claude agent, tracking token usage and updating cost estimates")
  .argument("[taskType]", "grouping key used to aggregate cost estimates")
  .option("-t, --token <token>", "GitHub authentication token (optional)")
  .option("-d, --db <path>", "path to the SQLite database file")
  .action((taskType, options) =>
    run("Agent run failed", async () => {
      const config = await resolveConfig(options, { requireToken: false });
      const resolvedTaskType =
        taskType ??
        (await input({
          message: "Task type (label used to group cost estimates):",
          default: "default",
        }));
      await runAgent(config, resolvedTaskType);
    }),
  );

program.parseAsync(process.argv);
