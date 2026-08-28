/**
 * Every sentence the user reads is written here, on the client.
 *
 * The server sends structured state and short codes and nothing else, so no
 * server-side string - no exception message, no subprocess stderr, no file
 * path - can reach the page or the browser console. See docs/SECURITY.md
 * section 9.
 */
import type { AuthStatus, ErrorCode, StatusEvent } from './api.js';
import { DAY_LABELS } from './ui/range-picker.js';

const windowName = (days: number): string =>
  (DAY_LABELS[days] ?? `${days} days back`).toLowerCase();

/** "r/singularity and r/artificial" */
const listSubs = (subs: string[]): string => {
  const names = subs.map((s) => `r/${s}`);
  if (names.length <= 1) return names[0] ?? 'Reddit';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

export function statusMessage(status: StatusEvent): string {
  switch (status.phase) {
    case 'auth':
      return status.loggedIn
        ? 'Claude is ready. Reading the feed...'
        : 'Not signed in to Claude - this fight will be scored offline.';
    case 'fetching':
      return `Reading ${listSubs(status.subreddits)}, ${windowName(status.days)}...`;
    case 'ready': {
      const flagged = status.flaggedCount > 0
        ? ` ${status.flaggedCount} look like injection attempts.`
        : '';
      const thin = status.incompleteWindow
        ? ' The public feed did not reach the start of the window - add Reddit API credentials for full history.'
        : '';
      const from = status.sources.length > 0 ? ` from ${listSubs(status.sources)}` : '';
      // A community that could not be read is worth saying out loud - otherwise
      // the fight silently represents fewer voices than the viewer expects.
      const missing = status.skipped.length > 0
        ? ` ${listSubs(status.skipped)} could not be read (rate limited) - fighting without it.`
        : '';
      const cached = status.stale.length > 0
        ? ` ${listSubs(status.stale)} served from cache.`
        : '';
      return `${status.postCount} posts${from}.${missing}${cached}${flagged}${thin} Analysing sentiment...`;
    }
    case 'degraded':
      return 'Claude could not score that batch - falling back to offline scoring.';
    default:
      return '';
  }
}

export const errorMessage = (code: ErrorCode): string => ({
  'no-posts': 'No posts in that window. Try a wider one.',
  'bad-range': 'That time range is not available.',
  'reddit-rate-limited': 'Reddit is rate-limiting us. Wait a minute and fight again.',
  'reddit-unavailable': 'Reddit did not answer. Try again shortly.',
  internal: 'The fight could not be completed. Check the server log in your terminal.',
  connection: 'Lost the connection to the server.',
}[code] ?? 'Something went wrong.');

export function authMessage(status: AuthStatus): string {
  if (status.errorCode === 'cli-missing') {
    return 'The Claude Code CLI was not found. Install it, then run `claude auth login`.';
  }
  if (status.errorCode === 'status-unreadable') {
    return 'Could not read your Claude login state. Try `claude auth status` in a terminal.';
  }
  if (!status.loggedIn) {
    return 'Not signed in to Claude. The fight would be scored by the offline fallback.';
  }
  const who = status.email ? ` as ${status.email}` : '';
  const plan = status.subscriptionType ? ` (${status.subscriptionType})` : '';
  return `Signed in to Claude${who}${plan}. No API key needed.`;
}

export const loginMessage = (code: 'url-ready' | 'no-browser' | 'cli-missing'): string => ({
  'url-ready': 'Opening the Claude sign-in page in a new tab...',
  'no-browser': 'Could not open the browser automatically. Run `claude auth login` in a terminal once, then reload.',
  'cli-missing': 'The Claude Code CLI was not found. Install it, then run `claude auth login`.',
}[code]);
