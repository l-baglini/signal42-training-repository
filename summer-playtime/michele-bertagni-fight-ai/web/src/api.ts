/**
 * Types mirrored from the server.
 *
 * The server sends state and codes, never prose - all wording lives in
 * messages.ts on this side. Post titles are the one exception: they are Reddit
 * content, they are game material, and they are treated as hostile text
 * (rendered with textContent, never logged, never evaluated).
 */
export type Fighter = 'HUMAN' | 'AI';
export type Move = 'punch' | 'kick';
export interface Hp { human: number; ai: number }

export type FightEvent =
  | { t: 'hit'; attacker: Fighter; move: Move; hp: Hp; title: string; permalink: string; subreddit: string; flagged: boolean; flagReasons: string[]; source: 'model' | 'fallback' }
  | { t: 'clinch'; title: string; permalink: string; subreddit: string; flagged: boolean; source: 'model' | 'fallback' }
  | { t: 'ko'; winner: Fighter; loser: Fighter; hp: Hp };

export type StatusEvent =
  | { phase: 'auth'; loggedIn: boolean }
  | { phase: 'fetching'; days: number; subreddits: string[] }
  | { phase: 'ready'; postCount: number; sources: string[]; skipped: string[]; stale: string[]; adapter: 'oauth' | 'rss'; incompleteWindow: boolean; flaggedCount: number }
  | { phase: 'degraded' };

export type ErrorCode =
  | 'no-posts' | 'internal' | 'bad-range' | 'connection'
  | 'reddit-rate-limited' | 'reddit-unavailable';

export interface AuthStatus {
  loggedIn: boolean;
  authMethod?: string;
  email?: string;
  subscriptionType?: string;
  accountDetailsHidden?: boolean;
  errorCode?: 'cli-missing' | 'status-unreadable';
}

export const getRanges = (): Promise<{ maxDaysBack: number }> =>
  fetch('/api/ranges').then((r) => r.json() as Promise<{ maxDaysBack: number }>);

export const getAuthStatus = (): Promise<AuthStatus> =>
  fetch('/api/auth/status').then((r) => r.json() as Promise<AuthStatus>);

export const startLogin = (): Promise<{ url?: string; code: 'url-ready' | 'no-browser' | 'cli-missing' }> =>
  fetch('/api/auth/login', { method: 'POST' }).then((r) => r.json());

export interface FightHandlers {
  onStatus: (status: StatusEvent) => void;
  onEvent: (event: FightEvent) => void;
  onDecision: (payload: { winner: string; hp: Hp }) => void;
  onError: (code: ErrorCode) => void;
  onEnd: () => void;
}

export function streamFight(daysBack: number, h: FightHandlers): () => void {
  const source = new EventSource(`/api/fight?days=${encodeURIComponent(String(daysBack))}`);
  source.addEventListener('status', (e) => h.onStatus(JSON.parse((e as MessageEvent<string>).data)));
  source.addEventListener('fight', (e) => h.onEvent(JSON.parse((e as MessageEvent<string>).data)));
  source.addEventListener('decision', (e) => h.onDecision(JSON.parse((e as MessageEvent<string>).data)));
  source.addEventListener('error', (e) => {
    const data = (e as MessageEvent<string>).data;
    h.onError(data ? (JSON.parse(data).code as ErrorCode) : 'connection');
  });
  source.addEventListener('end', () => { source.close(); h.onEnd(); });
  return () => source.close();
}
