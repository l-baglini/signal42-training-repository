/**
 * Zero-config adapter: the public Atom feed.
 *
 * Measured 2026-08-28: /r/<sub>/new.json returns 403 to anonymous clients
 * (bot wall), while /r/<sub>/new/.rss still returns 200. The feed carries up to
 * ~100 recent posts per subreddit - about four days on r/singularity, which is
 * why the picker stops there.
 *
 * Everything parsed here is untrusted input and goes through guard/ before it
 * reaches the model or the browser.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from '../config.js';
import { RedditError } from './types.js';
import type { FetchResult, RedditPost } from './types.js';

/**
 * Reddit rate-limits anonymous feed reads, and a viewer replaying fights hits
 * that quickly. A feed is the same document for every time window - the window
 * is just a filter - so one fetch per subreddit serves them all.
 *
 * Fresh for a minute; if Reddit then refuses, a copy up to ten minutes old is
 * better than no fight at all.
 */
const FRESH_MS = 60_000;
const STALE_TOLERATED_MS = 30 * 60_000;

/** Reddit's anonymous limit is per IP, so two feeds at once is what trips it. */
const POLITE_GAP_MS = 400;

interface CacheEntry { posts: RedditPost[]; fetchedAt: number }

const cache = new Map<string, CacheEntry>();

/**
 * The cache is also written to disk.
 *
 * An in-memory cache dies with the process, so restarting the server - which is
 * exactly what you do while working on it - re-fetches every feed and walks
 * straight into the rate limit. Public post titles on disk cost nothing and make
 * restarts free.
 */
const cacheFile = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../.cache/reddit-feeds.json',
);
let diskLoaded = false;

async function loadFromDisk(): Promise<void> {
  if (diskLoaded) return;
  diskLoaded = true;
  try {
    const raw = await readFile(cacheFile, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
    for (const [sub, entry] of Object.entries(parsed)) {
      if (Array.isArray(entry?.posts) && typeof entry.fetchedAt === 'number') {
        cache.set(sub, entry);
      }
    }
  } catch {
    // No cache yet, or an unreadable one. Either way we just fetch.
  }
}

async function saveToDisk(): Promise<void> {
  try {
    await mkdir(dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, JSON.stringify(Object.fromEntries(cache)), 'utf8');
  } catch {
    // Caching is an optimisation; failing to persist must never break a fight.
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const decodeEntities = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&amp;/g, '&');

const tag = (entry: string, name: string): string | undefined =>
  new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(entry)?.[1]?.trim();

async function downloadFeed(subreddit: string): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${subreddit}/new/.rss?limit=100`;
  const res = await fetch(url, {
    headers: { 'User-Agent': config.reddit.userAgent, Accept: 'application/atom+xml' },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 429) throw new RedditError('rate-limited', `r/${subreddit} responded 429`);
  if (!res.ok) throw new RedditError('unavailable', `r/${subreddit} responded ${res.status}`);

  const xml = await res.text();
  const posts: RedditPost[] = [];

  for (const [, entry] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    if (!entry) continue;
    const title = tag(entry, 'title');
    const updated = tag(entry, 'updated') ?? tag(entry, 'published');
    const id = tag(entry, 'id');
    const link = /<link[^>]*href="([^"]+)"/.exec(entry)?.[1];
    if (!title || !updated || !id) continue;

    const createdUtc = Math.floor(new Date(updated).getTime() / 1000);
    if (!Number.isFinite(createdUtc)) continue;

    posts.push({
      id,
      title: decodeEntities(title),
      createdUtc,
      permalink: link ? decodeEntities(link) : `https://www.reddit.com/r/${subreddit}/`,
      subreddit,
    });
  }

  return posts;
}

/** Cached feed read for one subreddit, with a stale copy as the last resort. */
async function loadFeed(subreddit: string): Promise<{ posts: RedditPost[]; fresh: boolean }> {
  await loadFromDisk();

  const hit = cache.get(subreddit);
  if (hit && Date.now() - hit.fetchedAt < FRESH_MS) return { posts: hit.posts, fresh: true };

  try {
    const posts = await downloadFeed(subreddit);
    cache.set(subreddit, { posts, fetchedAt: Date.now() });
    void saveToDisk();
    return { posts, fresh: true };
  } catch (err) {
    if (hit && Date.now() - hit.fetchedAt < STALE_TOLERATED_MS) {
      return { posts: hit.posts, fresh: false };
    }
    throw err;
  }
}

/**
 * Reads every configured subreddit in parallel.
 *
 * One subreddit failing does not cancel the fight - the others carry it, and the
 * failure is reported to the caller for the server log. Only a total failure
 * propagates.
 */
export async function fetchViaRss(sinceMs: number): Promise<FetchResult> {
  const subs = config.reddit.subreddits;

  const failures: Error[] = [];
  const skipped: string[] = [];
  const stale: string[] = [];
  const posts: RedditPost[] = [];
  const sourcesMissingWindow: string[] = [];

  // Sequential, with a small gap: two simultaneous requests from one IP is
  // precisely what Reddit's anonymous limiter objects to.
  for (const [i, sub] of subs.entries()) {
    if (i > 0) await sleep(POLITE_GAP_MS);
    try {
      const { posts: found, fresh } = await loadFeed(sub);
      posts.push(...found);
      if (!fresh) stale.push(sub);
      const oldest = Math.min(...found.map((p) => p.createdUtc * 1000));
      if (found.length > 0 && oldest > sinceMs) sourcesMissingWindow.push(sub);
    } catch (err) {
      failures.push(err instanceof Error ? err : new Error(String(err)));
      skipped.push(sub);
    }
  }

  if (posts.length === 0 && failures.length > 0) throw failures[0];

  return {
    posts: posts.filter((p) => p.createdUtc * 1000 >= sinceMs),
    adapter: 'rss',
    ...(sourcesMissingWindow.length > 0 ? { incompleteWindow: true } : {}),
    ...(skipped.length > 0 ? { skipped } : {}),
    ...(stale.length > 0 ? { stale } : {}),
    ...(failures.length > 0 ? { failures } : {}),
  };
}
