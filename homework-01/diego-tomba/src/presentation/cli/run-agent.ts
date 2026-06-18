/**
 * run-agent.ts
 * -------------
 * Handler for the `agent` subcommand: runs a Claude agent, tracks token
 * usage and updates the cost estimate.
 *
 * This is the presentation layer: it only reads input, calls the use cases
 * and prints output. All domain logic lives elsewhere (Clean Architecture).
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { createContainer } from "../../config/container.ts";
import type { EnvConfig } from "../../config/env.ts";

/**
 * Runs a Claude agent for the given task type, recording usage and printing
 * the prior and updated cost estimates.
 *
 * @param config - The resolved application configuration.
 * @param taskType - Grouping key for the estimate. Labeling tasks well here is
 *                   what makes the estimates meaningful: different tasks should
 *                   use different labels, otherwise the average aggregates
 *                   incomparable runs.
 */
export async function runAgent(
  config: EnvConfig,
  taskType: string,
): Promise<void> {
  const container = createContainer(config);

  // Phase 1: prior estimate from history
  const { estimate: priorEstimate, suggestedBudgetUsd: suggestedBudget } =
    await container.getEstimate.execute(taskType);

  if (priorEstimate.sampleSize === 0) {
    console.log(
      `[estimate] No history for "${taskType}". First run: ` +
        `proceeding without a data-derived budget.`,
    );
  } else {
    console.log(
      `[estimate] "${taskType}" over ${priorEstimate.sampleSize} previous runs:\n` +
        `        average cost $${priorEstimate.cost.mean.toFixed(4)}, ` +
        `p90 $${priorEstimate.cost.p90.toFixed(4)}\n` +
        `        input  ~${Math.round(priorEstimate.input.mean)} tok (p90 ${Math.round(priorEstimate.input.p90)})\n` +
        `        output ~${Math.round(priorEstimate.output.mean)} tok (p90 ${Math.round(priorEstimate.output.p90)})\n` +
        `        suggested budget: $${suggestedBudget}`,
    );
  }

  // Phase 2: execution with deduplicated tracking.
  // The SDK may emit the same message more than once with parallel tool
  // calls: we count each message id only once, otherwise the totals would
  // be inflated. (Explicit requirement of the "Track cost and usage" docs.)
  const seenIds = new Set<string>();
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreation = 0;
  let cacheRead = 0;
  let costUsd = 0;

  const started = Date.now();

  const response = query({
    prompt: "Run your real task here...",
    options: {
      // The economic fuse: we pass the suggested budget ONLY when history
      // gave us one (> 0). On the first run we let it fall through.
      ...(suggestedBudget > 0 ? { maxBudgetUsd: suggestedBudget } : {}),
    },
  });

  for await (const message of response) {
    if (message.type === "assistant" && !seenIds.has(message.message.id)) {
      seenIds.add(message.message.id);
      const u = message.message.usage;
      inputTokens += u.input_tokens ?? 0;
      outputTokens += u.output_tokens ?? 0;
      cacheCreation += u.cache_creation_input_tokens ?? 0;
      cacheRead += u.cache_read_input_tokens ?? 0;
    }

    // The "result" message carries the total cost already computed by the
    // SDK: more reliable than our own rate multiplication, because it
    // accounts for the reduced/increased cache rates.
    if (message.type === "result" && "total_cost_usd" in message) {
      costUsd = (message as { total_cost_usd?: number }).total_cost_usd ?? 0;
    }
  }

  const durationMs = Date.now() - started;

  // Phase 3: record and show how the estimate evolves
  await container.recordUsage.execute({
    taskType,
    inputTokens,
    outputTokens,
    cacheCreationTokens: cacheCreation,
    cacheReadTokens: cacheRead,
    costUsd,
    durationMs,
  });

  const { estimate: newEstimate } = await container.getEstimate.execute(taskType);

  console.log(
    `\n[run] completed in ${(durationMs / 1000).toFixed(1)}s\n` +
      `      input ${inputTokens} tok (of which ${cacheRead} from cache), ` +
      `output ${outputTokens} tok\n` +
      `      real cost $${costUsd.toFixed(4)}\n` +
      `[updated estimate] now over ${newEstimate.sampleSize} runs: ` +
      `average cost $${newEstimate.cost.mean.toFixed(4)}, ` +
      `p90 $${newEstimate.cost.p90.toFixed(4)}`,
  );

  await container.close();
}
