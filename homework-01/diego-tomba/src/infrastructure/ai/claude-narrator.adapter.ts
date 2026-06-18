/**
 * claude-narrator.adapter.ts
 * --------------------------
 * Concrete adapter for storytelling generation via the Claude Agent SDK.
 *
 * Implements the application-layer AiNarratorPort, isolating the dependency
 * on the Claude SDK within the infrastructure layer.
 *
 * The prompt is structured to produce a detailed Markdown report with
 * sections for PRs, Issues, board movements and notable highlights. The cost
 * is tracked from the `total_cost_usd` field of the SDK result message, which
 * is more reliable than a manual computation because it accounts for the
 * differentiated cache rates.
 */

import type {
  AiNarratorPort,
  StorytellingResult,
} from '../../application/ports/ai-narrator.port.ts';
import type { RepoEvent } from '../../domain/entities/repo-event.ts';
import { query } from '@anthropic-ai/claude-agent-sdk';

/**
 * Safety cap for a single storytelling report. A report should never cost
 * more than this; the SDK aborts the run if the budget would be exceeded.
 */
const MAX_STORYTELLING_BUDGET_USD = 0.5;

export class ClaudeNarratorAdapter implements AiNarratorPort {
  /**
   * @param anthropicToken - Optional Anthropic API key. When provided it is
   *   injected into the environment for the Claude Agent SDK (which reads
   *   ANTHROPIC_API_KEY). When omitted the SDK falls back to the ambient
   *   environment — the path the CLI relies on.
   */
  constructor(private readonly anthropicToken?: string) {}

  /**
   * Generates a storytelling report from the repository events.
   *
   * If there are no events, an empty report is returned without invoking
   * Claude (cost saving). Otherwise it builds a detailed prompt and streams
   * the SDK response, tracking the total cost for reporting.
   *
   * @param events - List of repository events to analyze.
   * @param repoContext - Repository context (owner, name, platform).
   * @param guidance - Optional user guidance injected into the prompt.
   * @returns A Markdown report with generation metadata.
   */
  async generateStorytelling(
    events: RepoEvent[],
    repoContext: { owner: string; repo: string; platform: string },
    guidance?: string,
  ): Promise<StorytellingResult> {
    // Make the configured token available to the Claude Agent SDK, which reads
    // it from the environment.
    if (this.anthropicToken) {
      process.env.ANTHROPIC_API_KEY = this.anthropicToken;
    }

    // No events: avoid invoking Claude unnecessarily.
    if (events.length === 0) {
      return {
        markdown: `# No recent events\n\nThere are no recent events for ${repoContext.owner}/${repoContext.repo}.`,
        generatedAt: new Date(),
        eventsProcessed: 0,
        costUsd: 0,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
        },
        model: null,
      };
    }

    // Prepare the event context as readable JSON
    const eventsJson = JSON.stringify(events, null, 2);

    // Optional user guidance steers tone/focus/language. Placed prominently so
    // the model treats it as a priority instruction.
    const guidanceSection = guidance?.trim()
      ? `\nAdditional guidance from the user (follow it closely):\n${guidance.trim()}\n`
      : '';

    // Replace the SDK's default agentic (Claude Code) system prompt with a
    // plain technical-writer prompt. Otherwise the agent emits a preamble
    // ("I'll analyze…") and waits to act via tools, leaving the report empty.
    const systemPrompt =
      'You are an expert open-source repository analyst and technical writer. ' +
      'When asked for a report you reply with the COMPLETE report in Markdown ' +
      'and nothing else: no preamble, no "I\'ll analyze…", no meta-commentary, ' +
      'no closing questions or offers to continue. Produce the entire report in ' +
      'a single response.';

    // User prompt: the task, the required structure, optional guidance and data.
    const prompt = `Generate a storytelling report in Markdown for the repository ${repoContext.owner}/${repoContext.repo} on ${repoContext.platform}.

The report must:
1. Have a title with the repository name and the period covered
2. An executive summary of the main activities
3. PR section: group by state (merged, open, closed), highlight the most significant ones
4. Issues section: new issues, resolved issues, theme trends
5. Board/Projects section: if there are events, describe the movements
6. A "To keep an eye on" section with items that deserve attention
${guidanceSection}
Output only the Markdown report.

Events:\n${eventsJson}`;

    let costUsd = 0;
    // Final consolidated text from the SDK's `result` message (success).
    let resultText = '';
    // Fallback: text streamed across assistant messages, in case `result` is
    // empty for some reason.
    let assistantText = '';
    let errorDetail = '';
    let usage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    };
    let model: string | null = null;

    const response = query({
      prompt,
      options: {
        // Plain writer system prompt (replaces the Claude Code agentic preset).
        systemPrompt,
        // Safety cap for report generation.
        maxBudgetUsd: MAX_STORYTELLING_BUDGET_USD,
        // This is a single text-generation task: all the data is already in the
        // prompt. Disabling tools and using a single turn keeps it fast, cheap
        // and deterministic (no agentic file/web exploration or preamble).
        allowedTools: [],
        maxTurns: 1,
      },
    });

    // Stream the SDK response.
    for await (const message of response) {
      // Accumulate assistant text blocks (the streamed narrative).
      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (block.type === 'text') assistantText += block.text;
        }
      }

      // The "result" message carries the SDK-computed total cost and, on
      // success, the final consolidated text in `result`. Error subtypes
      // (e.g. budget/turn limits) carry `errors` instead.
      if (message.type === 'result') {
        costUsd = message.total_cost_usd ?? 0;

        // Token breakdown by type (fresh input / output / cache write / read).
        const u = message.usage;
        usage = {
          inputTokens: u.input_tokens ?? 0,
          outputTokens: u.output_tokens ?? 0,
          cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
          cacheReadTokens: u.cache_read_input_tokens ?? 0,
        };
        // Primary model name (there is usually a single entry).
        model = Object.keys(message.modelUsage ?? {})[0] ?? null;

        if (message.subtype === 'success') {
          resultText = message.result;
        } else {
          errorDetail = message.errors?.join('; ') || message.subtype;
        }
      }
    }

    const markdown = (resultText || assistantText).trim();

    return {
      markdown:
        markdown ||
        `# Report non generato\n\nClaude non ha prodotto output${errorDetail ? ` (${errorDetail})` : ''}.`,
      generatedAt: new Date(),
      eventsProcessed: events.length,
      costUsd,
      usage,
      model,
    };
  }
}
