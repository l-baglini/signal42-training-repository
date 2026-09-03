/**
 * watch-repo.ts
 * --------------
 * Handler for the `watch` subcommand: repository monitoring.
 *
 * Workflow:
 * 1. Collect recent events (PRs, Issues, Projects) from the Git platform
 * 2. Persist them to the local database (deduplicated)
 * 3. Generate a storytelling report using the Claude Agent SDK
 * 4. Print the report to the console
 *
 * This is the presentation layer: it only reads input, calls the use cases
 * and prints output. All domain logic lives elsewhere (Clean Architecture).
 */

import { createContainer } from "../../config/container.ts";
import type { EnvConfig } from "../../config/env.ts";

/**
 * Fetches recent repository events and prints a storytelling report.
 *
 * @param config - The resolved application configuration.
 */
export async function watchRepo(config: EnvConfig): Promise<void> {
  console.log("🔭 RepoWatcher — Starting monitoring\n");

  const container = createContainer(config);
  const { repoOwner, repoName, platform } = container.config;

  console.log(`📦 Repository: ${repoOwner}/${repoName} (${platform})`);
  console.log("─".repeat(50));

  // Phase 1: fetch events from the platform
  console.log("\n⏳ Fetching recent events...");

  const events = await container.fetchRepoEvents.execute(repoOwner, repoName);

  const prCount = events.filter((e) => e.type === "pr").length;
  const issueCount = events.filter((e) => e.type === "issue").length;
  const projectCount = events.filter((e) => e.type === "project").length;

  console.log(
    `✅ Found ${events.length} events: ` +
      `${prCount} PR, ${issueCount} Issue, ${projectCount} Project`,
  );

  if (events.length === 0) {
    console.log("\n📭 No new events since the last fetch. Nothing to tell.");
    await container.close();
    return;
  }

  // Phase 2: storytelling generation with Claude
  console.log("\n🤖 Generating storytelling with Claude...\n");

  const story = await container.generateStorytelling.execute(
    repoOwner,
    repoName,
    platform,
  );

  // Phase 3: output
  console.log("═".repeat(60));
  console.log(story.markdown);
  console.log("═".repeat(60));
  console.log(
    `\n📊 Report generated: ${story.eventsProcessed} events processed, ` +
      `cost $${story.costUsd.toFixed(4)}`,
  );

  await container.close();
}
