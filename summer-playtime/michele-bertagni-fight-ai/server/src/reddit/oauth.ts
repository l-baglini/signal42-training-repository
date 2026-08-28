/**
 * Full-history adapter: Reddit's official API.
 *
 * Needs a free "script" app from https://www.reddit.com/prefs/apps
 * (client id + secret in .env). Application-only OAuth, read-only, no Reddit
 * account access. This is the adapter you want for the 1-month range: it
 * paginates back through /new until it passes the start of the window.
 */
import { config } from '../config.js';
import type { FetchResult, RedditPost } from './types.js';

interface TokenCache { token: string; expiresAt: number }
let cached: TokenCache | null = null;

async function getToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;

  const basic = Buffer.from(
    `${config.reddit.clientId}:${config.reddit.clientSecret}`,
  ).toString('base64');

  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': config.reddit.userAgent,
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Reddit token request failed: ${res.status}`);

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error('Reddit returned no access token');

  cached = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return cached.token;
}

interface ListingChild {
  data?: { id?: string; title?: string; created_utc?: number; permalink?: string };
}

async function fetchSubreddit(
  subreddit: string,
  token: string,
  sinceMs: number,
  maxPosts: number,
): Promise<RedditPost[]> {
  const posts: RedditPost[] = [];
  let after: string | undefined;
  let reachedWindowStart = false;

  // At most 10 pages of 100 - Reddit's listings stop around 1000 anyway.
  for (let page = 0; page < 10 && posts.length < maxPosts; page++) {
    const url = new URL(`https://oauth.reddit.com/r/${subreddit}/new`);
    url.searchParams.set('limit', '100');
    url.searchParams.set('raw_json', '1');
    if (after) url.searchParams.set('after', after);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': config.reddit.userAgent },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Reddit API responded ${res.status}`);

    const json = (await res.json()) as { data?: { children?: ListingChild[]; after?: string | null } };
    const children = json.data?.children ?? [];
    if (children.length === 0) { reachedWindowStart = true; break; }

    for (const child of children) {
      const d = child.data;
      if (!d?.id || !d.title || typeof d.created_utc !== 'number') continue;
      if (d.created_utc * 1000 < sinceMs) { reachedWindowStart = true; continue; }
      posts.push({
        id: d.id,
        title: d.title,
        createdUtc: d.created_utc,
        permalink: `https://www.reddit.com${d.permalink ?? `/r/${subreddit}/`}`,
        subreddit,
      });
    }

    if (reachedWindowStart) break;
    after = json.data?.after ?? undefined;
    if (!after) break;
  }

  return posts;
}

/** Every configured subreddit, in parallel, merged by the caller. */
export async function fetchViaOAuth(sinceMs: number, maxPosts: number): Promise<FetchResult> {
  const token = await getToken();
  const subs = config.reddit.subreddits;
  const perSub = Math.max(25, Math.ceil(maxPosts / Math.max(1, subs.length)));

  const results = await Promise.all(
    subs.map((sub) => fetchSubreddit(sub, token, sinceMs, perSub)),
  );

  return { posts: results.flat(), adapter: 'oauth' };
}
