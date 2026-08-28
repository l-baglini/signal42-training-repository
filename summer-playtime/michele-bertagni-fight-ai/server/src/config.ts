import 'dotenv/config';

const int = (v: string | undefined, fallback: number): number => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * How far back the user may ask us to look: today, or up to four days back.
 *
 * The cap is deliberate. Without Reddit API credentials the app reads the public
 * Atom feed, which only reaches ~100 recent posts - roughly four days on a busy
 * subreddit. Offering a month we cannot actually deliver would just produce a
 * thin fight and a warning, so the picker stops where the data stops.
 */
export const MAX_DAYS_BACK = 4;

export type DayOffset = 0 | 1 | 2 | 3 | 4;

export const isDayOffset = (v: number): v is DayOffset =>
  Number.isInteger(v) && v >= 0 && v <= MAX_DAYS_BACK;

/**
 * Start of the local day `offset` days ago. "TODAY" means since midnight this
 * morning; "YESTERDAY" means since midnight yesterday, i.e. two days of posts.
 * Local time, because the person watching is on this machine.
 */
export function startOfDayBack(offset: DayOffset, now = new Date()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offset);
  return d.getTime();
}

/**
 * Accepts "singularity, r/artificial" and similar; keeps only safe names.
 *
 * The names go straight into a URL, so anything that is not a plain subreddit
 * name is dropped rather than escaped - there is no legitimate reason for a
 * slash, a dot or a query string to appear here.
 */
export function parseSubreddits(raw: string): string[] {
  const names = raw
    .split(',')
    .map((n) => n.trim().replace(/^\/?r\//i, ''))
    .filter((n) => /^[A-Za-z0-9_]{2,21}$/.test(n));
  return [...new Set(names)].slice(0, 5);
}

export const config = {
  port: int(process.env.PORT, 8787),
  host: process.env.HOST ?? '127.0.0.1',

  claudeBin: process.env.CLAUDE_BIN ?? 'claude',
  classifierModel: process.env.CLASSIFIER_MODEL ?? 'claude-haiku-4-5-20251001',

  reddit: {
    adapter: (process.env.REDDIT_ADAPTER ?? 'auto') as 'auto' | 'oauth' | 'rss',
    /**
     * Read in parallel and merged chronologically, so the fight reflects both
     * communities at once. `REDDIT_SUBREDDIT` (singular) is still honoured for
     * anyone who had it set.
     */
    subreddits: parseSubreddits(
      process.env.REDDIT_SUBREDDITS ?? process.env.REDDIT_SUBREDDIT ?? 'singularity,artificial',
    ),
    clientId: process.env.REDDIT_CLIENT_ID ?? '',
    clientSecret: process.env.REDDIT_CLIENT_SECRET ?? '',
    userAgent: process.env.REDDIT_USER_AGENT ?? 'web:fight-ai:0.1.0 (local, non-commercial)',
  },

  /** Hard safety limits — see docs/SECURITY.md §7. */
  limits: {
    maxPosts: int(process.env.MAX_POSTS, 400),
    maxTitleChars: int(process.env.MAX_TITLE_CHARS, 300),
    batchSize: int(process.env.CLASSIFY_BATCH_SIZE, 20),
    classifyTimeoutMs: int(process.env.CLASSIFY_TIMEOUT_MS, 90_000),
  },

  /** 10 HP each, 1 damage per hit -> a fight is decided in at most 19 hits. */
  rules: { startingHp: 10, damagePerHit: 1 },
} as const;

export const maxHitsNeeded = config.rules.startingHp * 2 - 1;
