/**
 * The locked-down bridge to Claude. This file is the security boundary of the
 * whole application - read docs/SECURITY.md section 1 before changing a single
 * flag here.
 *
 * We drive the local `claude` CLI in headless mode, which reuses the OAuth login
 * of your Claude subscription (no API key). The subprocess is given:
 *   - no tools, no MCP servers, no settings files, no CLAUDE.md
 *   - one turn, so it cannot loop, plan or retry
 *   - an empty temp directory as cwd, so there is nothing to read
 *   - a scrubbed environment, so there is nothing to steal
 *   - closed stdin and a hard timeout
 *
 * A perfectly successful prompt injection therefore lands in a process whose
 * only remaining capability is printing text - and that text is then validated
 * against a three-value enum before it can affect anything.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { config } from '../config.js';
import { validateBatch, type Sentiment } from '../guard/validate.js';
import { fallbackClassify } from './fallback.js';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt.js';

/**
 * DO NOT add capabilities to this list. In particular never add:
 *   --dangerously-skip-permissions, --permission-mode bypassPermissions,
 *   --add-dir, --allowedTools <anything>, --mcp-config <a real server>
 */
const LOCKDOWN_ARGS = [
  '-p',
  '--setting-sources', '',                    // no user/project/local settings, no CLAUDE.md
  '--strict-mcp-config',                      // ignore any globally configured MCP server
  '--mcp-config', '{"mcpServers":{}}',
  '--allowedTools', '',                       // no tool is permitted
  '--restricted',                             // no Bash/REPL/code execution, no WebFetch
  '--max-turns', '1',                         // single shot
  '--output-format', 'json',
] as const;

/** Only what the CLI needs to authenticate and run. No app secrets, no .env. */
function scrubbedEnv(): NodeJS.ProcessEnv {
  const pass = ['PATH', 'HOME', 'LANG', 'CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY'];
  const env: NodeJS.ProcessEnv = {};
  for (const key of pass) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

export interface ClassifyItem {
  id: number;
  /** Sanitised title only - never the raw one. */
  clean: string;
}

export interface BatchOutcome {
  verdicts: Map<number, Sentiment>;
  /** "model" when Claude's answer passed validation, "fallback" otherwise. */
  source: 'model' | 'fallback';
  /** Why we fell back, for the audit log and the UI. */
  degradedReason?: string;
}

/** Runs `claude -p` in a jail and returns its stdout, or throws. */
async function runClaude(userPrompt: string): Promise<string> {
  const jail = await mkdtemp(join(tmpdir(), 'fight-ai-jail-'));
  try {
    return await new Promise<string>((resolve, reject) => {
      const child = spawn(
        config.claudeBin,
        [
          ...LOCKDOWN_ARGS,
          '--model', config.classifierModel,
          '--system-prompt', SYSTEM_PROMPT,
          userPrompt,
        ],
        {
          cwd: jail,               // empty directory: nothing to discover
          env: scrubbedEnv(),
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

      let stdout = '';
      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        settled = true;
        child.kill('SIGKILL');
        reject(new Error(`classifier timed out after ${config.limits.classifyTimeoutMs}ms`));
      }, config.limits.classifyTimeoutMs);

      // Bound stdout so a runaway response cannot exhaust memory.
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
        if (stdout.length > 512 * 1024) child.kill('SIGKILL');
      });
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });

      child.on('error', (err) => { clearTimeout(timer); if (!settled) reject(err); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (settled) return;
        if (code !== 0) return reject(new Error(`claude exited ${code}: ${stderr.slice(0, 300)}`));
        resolve(stdout);
      });
    });
  } finally {
    await rm(jail, { recursive: true, force: true }).catch(() => {});
  }
}

/** The CLI wraps the assistant text in an envelope; pull out `.result`. */
function unwrapCliJson(stdout: string): string {
  try {
    const envelope: unknown = JSON.parse(stdout);
    if (
      envelope && typeof envelope === 'object' &&
      'result' in envelope && typeof envelope.result === 'string'
    ) {
      if ('is_error' in envelope && envelope.is_error === true) {
        throw new Error('claude reported is_error');
      }
      return envelope.result;
    }
  } catch {
    /* fall through - validateBatch will reject it anyway */
  }
  return stdout;
}

const everythingFallback = (items: ReadonlyArray<ClassifyItem>): Map<number, Sentiment> =>
  new Map(items.map((i) => [i.id, fallbackClassify(i.clean)]));

/**
 * Classify one batch. Never throws: on any failure at all the batch is resolved
 * by the deterministic fallback, so a hostile or unavailable model degrades the
 * fight's accuracy and nothing else.
 */
export async function classifyBatch(items: ReadonlyArray<ClassifyItem>): Promise<BatchOutcome> {
  if (items.length === 0) return { verdicts: new Map(), source: 'model' };

  const payload = items.map((i) => ({ id: i.id, text: i.clean }));
  const ids = items.map((i) => i.id);

  try {
    const stdout = await runClaude(buildUserPrompt(payload));
    const result = validateBatch(unwrapCliJson(stdout), ids);
    if (result.ok) return { verdicts: result.verdicts, source: 'model' };
    return {
      verdicts: everythingFallback(items),
      source: 'fallback',
      degradedReason: `invalid model output (${result.reason})`,
    };
  } catch (err) {
    return {
      verdicts: everythingFallback(items),
      source: 'fallback',
      degradedReason: err instanceof Error ? err.message : 'classifier failed',
    };
  }
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

