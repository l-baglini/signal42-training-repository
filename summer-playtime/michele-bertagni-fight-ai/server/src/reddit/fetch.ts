import { config } from '../config.js';
import { fetchViaOAuth } from './oauth.js';
import { fetchViaRss } from './rss.js';
import type { FetchResult } from './types.js';

const hasOAuthCreds = (): boolean =>
  Boolean(config.reddit.clientId && config.reddit.clientSecret);

/**
 * Fetch posts from `sinceMs` up to now across every configured subreddit,
 * oldest first, deduplicated, capped at MAX_POSTS.
 *
 * Chronological order matters, and it matters more with several sources: the
 * communities interleave, so the fight plays out the mood of the window as it
 * actually unfolded rather than one subreddit after the other.
 */
export async function fetchPosts(sinceMs: number): Promise<FetchResult> {
  const wantOAuth =
    config.reddit.adapter === 'oauth' ||
    (config.reddit.adapter === 'auto' && hasOAuthCreds());

  let result: FetchResult;
  if (wantOAuth) {
    try {
      result = await fetchViaOAuth(sinceMs, config.limits.maxPosts);
    } catch {
      // The API failure is logged by the caller; the client only learns which
      // adapter ended up being used.
      result = await fetchViaRss(sinceMs);
    }
  } else {
    result = await fetchViaRss(sinceMs);
  }

  // A crosspost can appear in both feeds; keep the first sighting only.
  const seen = new Set<string>();
  const posts = result.posts
    .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
    .sort((a, b) => a.createdUtc - b.createdUtc)
    .slice(0, config.limits.maxPosts);

  return { ...result, posts };
}
