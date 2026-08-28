/**
 * "Open the Claude login and use that login" - the supported version.
 *
 * There is no way to take a claude.ai browser session and call the Anthropic API
 * with it; that is not a supported flow. What IS supported, and what this does,
 * is the Claude Code CLI's OAuth login against a Claude subscription. No API key
 * anywhere: the CLI holds the credentials, we only ask it questions.
 *
 *   claude auth status --json   -> { loggedIn, authMethod, email, subscriptionType }
 *   claude auth login           -> prints an https://claude.ai/... URL, opens the browser
 *
 * The server never reads, stores or forwards the token itself.
 */
import { spawn } from 'node:child_process';
import { config } from '../config.js';

export interface AuthStatus {
  loggedIn: boolean;
  /** e.g. "claude.ai" for subscription OAuth, "apiKey" when a key is set. */
  authMethod?: string;
  email?: string;
  subscriptionType?: string;
  /** A code, never a server message: the client owns the wording. */
  errorCode?: 'cli-missing' | 'status-unreadable';
}

/**
 * The CLI needs a fairly complete environment to open a browser (DISPLAY,
 * XDG_*, BROWSER), so this inherits rather than allow-lists - but the app's own
 * secrets have no business being in a child process that does not need them.
 */
function envWithoutAppSecrets(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('REDDIT_')) delete env[key];
  }
  return env;
}

function run(args: string[], timeoutMs: number): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const child = spawn(config.claudeBin, args, { stdio: ['ignore', 'pipe', 'pipe'], env: envWithoutAppSecrets() });
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (c: Buffer) => { out += c.toString('utf8'); });
    child.stderr.on('data', (c: Buffer) => { err += c.toString('utf8'); });
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, out, err: String(e) }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? -1, out, err }); });
  });
}

export async function getAuthStatus(): Promise<AuthStatus> {
  const { code, out, err } = await run(['auth', 'status', '--json'], 15_000);
  if (code === -1) {
    process.stderr.write(`[auth] claude CLI unavailable: ${err.trim()}\n`);
    return { loggedIn: false, errorCode: 'cli-missing' };
  }
  try {
    const parsed = JSON.parse(out) as Partial<AuthStatus>;
    return {
      loggedIn: parsed.loggedIn === true,
      ...(parsed.authMethod ? { authMethod: parsed.authMethod } : {}),
      ...(parsed.email ? { email: parsed.email } : {}),
      ...(parsed.subscriptionType ? { subscriptionType: parsed.subscriptionType } : {}),
    };
  } catch {
    return { loggedIn: false, errorCode: 'status-unreadable' };
  }
}

const OAUTH_URL = /https:\/\/(?:claude\.ai|console\.anthropic\.com)\/\S+/;

/**
 * Starts `claude auth login` and resolves with the URL it prints, so the
 * frontend can open it. The child is left running to finish the OAuth exchange;
 * the frontend then polls /api/auth/status until `loggedIn` flips to true.
 *
 * Note: on some setups the CLI wants a real terminal. If no URL appears within
 * the timeout we say so, and the UI falls back to telling the user to run
 * `claude auth login` in a terminal themselves - which is a one-time action.
 */
export type LoginStart = { url?: string; code: 'url-ready' | 'no-browser' | 'cli-missing' };

export function startLogin(timeoutMs = 30_000): Promise<LoginStart> {
  return new Promise((resolve) => {
    const child = spawn(config.claudeBin, ['auth', 'login'], { stdio: ['ignore', 'pipe', 'pipe'], env: envWithoutAppSecrets() });
    let buffer = '';
    let done = false;

    const finish = (payload: LoginStart) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(payload);
    };

    const scan = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const match = OAUTH_URL.exec(buffer);
      if (match) finish({ url: match[0], code: 'url-ready' });
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ code: 'no-browser' });
    }, timeoutMs);

    child.stdout.on('data', scan);
    child.stderr.on('data', scan);
    child.on('error', () => finish({ code: 'cli-missing' }));
  });
}
