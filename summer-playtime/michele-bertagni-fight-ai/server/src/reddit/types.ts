export interface RedditPost {
  id: string;
  title: string;
  /** Seconds since epoch, UTC. */
  createdUtc: number;
  permalink: string;
  /** Which community this came from, e.g. "singularity". */
  subreddit: string;
}

export interface FetchResult {
  posts: RedditPost[];
  adapter: 'oauth' | 'rss';
  /**
   * True when the adapter could not reach back to the start of the requested
   * window. A flag, not a sentence: the client writes the wording.
   */
  incompleteWindow?: boolean;
  /** Subreddits that could not be read at all. Names only - the client says so. */
  skipped?: string[];
  /** Subreddits served from a stale cache because the live read failed. */
  stale?: string[];
  /** Per-subreddit failures that did not sink the fight. Server log only. */
  failures?: Error[];
}

/** A Reddit-side failure the client is allowed to know the shape of. */
export class RedditError extends Error {
  constructor(
    readonly code: 'rate-limited' | 'unavailable',
    /** Detail for the server log only - never sent to the browser. */
    message: string,
  ) {
    super(message);
    this.name = 'RedditError';
  }
}
