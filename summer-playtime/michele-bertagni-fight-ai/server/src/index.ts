/**
 * Fight AI - local server.
 *
 * Binds to 127.0.0.1 by design: this drives your personal Claude login and is
 * not meant to be exposed. See docs/ARCHITECTURE.md.
 *
 * Wire discipline: this server never sends prose to the browser. Every frame
 * carries structured state and short codes; all human-readable text is written
 * by the client. Server-side diagnostics - exception messages, subprocess
 * stderr, stack traces - go to the server log on this machine and stop there.
 * See docs/SECURITY.md section 9.
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticPlugin from '@fastify/static';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config, MAX_DAYS_BACK, isDayOffset, startOfDayBack, type DayOffset } from './config.js';
import { getAuthStatus, startLogin } from './auth/claude-auth.js';
import { fetchPosts } from './reddit/fetch.js';
import { RedditError } from './reddit/types.js';
import { sanitizeTitle } from './guard/sanitize.js';
import { detectInjection } from './guard/heuristics.js';
import { redact } from './guard/redact.js';
import { classifyBatch, chunk, type ClassifyItem } from './llm/classify.js';
import { FightState, type Classified, type FightEvent } from './fight/build.js';
import { delayBefore, PACING, sleep } from './fight/pacing.js';
import { audit } from './audit/audit.js';

const app = Fastify({ logger: { level: 'info' } });

const isLoopback = ['127.0.0.1', 'localhost', '::1'].includes(config.host);
/** Account identity leaves the process only when nobody else can reach it. */
const exposeAccountDetails = isLoopback;

/**
 * Production: the Vite build is served by this same server, so the whole app is
 * one origin on one port and the strict CSP in index.html holds.
 * Development: the Vite dev server on :5173 proxies /api here instead, so we
 * only need CORS in that case.
 *
 * Resolves to <repo>/web/dist both from src/ (tsx) and from dist/ (compiled).
 */
const webDist = join(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
const hasBundle = existsSync(join(webDist, 'index.html'));

if (hasBundle) {
  await app.register(staticPlugin, { root: webDist, index: ['index.html'] });
} else {
  await app.register(cors, { origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] });
}

app.get('/api/health', async () => ({ ok: true }));

/** The client renders its own labels; the server only states the limit. */
app.get('/api/ranges', async () => ({ maxDaysBack: MAX_DAYS_BACK }));

/**
 * Your own account identity is useful on your own machine - it tells you which
 * subscription is paying for the fight. It is not something to hand to whoever
 * can reach the port, so it is withheld as soon as the server is not on
 * loopback. See docs/SECURITY.md section 9.
 */
app.get('/api/auth/status', async () => {
  const status = await getAuthStatus();
  if (exposeAccountDetails) return status;
  const { email: _email, ...rest } = status;
  return { ...rest, accountDetailsHidden: true };
});

app.post('/api/auth/login', async () => startLogin());

/**
 * The fight itself, streamed as Server-Sent Events so the browser receives
 * exchanges at the pace a viewer can actually follow.
 */
app.get<{ Querystring: { days?: string } }>('/api/fight', async (req, reply) => {
  const days = Number.parseInt(req.query.days ?? '0', 10);
  if (!isDayOffset(days)) {
    return reply.code(400).send({ code: 'bad-range', maxDaysBack: MAX_DAYS_BACK });
  }
  const offset: DayOffset = days;

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const fightId = randomUUID();
  let closed = false;
  req.raw.on('close', () => { closed = true; });

  /**
   * Every outgoing frame passes through redact() as a last line of defence: if
   * a machine path or hostname ever reaches this point through a field nobody
   * anticipated, it does not make it onto the wire. No length cap here - the
   * frame has to stay valid JSON, and its size is already bounded by
   * MAX_TITLE_CHARS.
   */
  const send = (event: string, data: unknown): void => {
    if (closed) return;
    const frame = redact(JSON.stringify(data), Number.POSITIVE_INFINITY);
    reply.raw.write(`event: ${event}\ndata: ${frame}\n\n`);
  };

  try {
    const since = startOfDayBack(offset);

    const auth = await getAuthStatus();
    send('status', { phase: 'auth', loggedIn: auth.loggedIn });

    send('status', { phase: 'fetching', days: offset, subreddits: config.reddit.subreddits });
    const { posts, adapter, incompleteWindow, skipped, stale, failures } = await fetchPosts(since);

    // A subreddit that failed does not stop the fight; it is a server-side note.
    for (const failure of failures ?? []) {
      app.log.warn({ err: failure }, 'a subreddit could not be read');
    }

    if (posts.length === 0) {
      send('error', { code: 'no-posts' });
      return reply.raw.end();
    }

    // Sanitise everything up front; nothing raw goes further than this line.
    const prepared = posts.map((post, index) => {
      const s = sanitizeTitle(post.title, config.limits.maxTitleChars);
      return { index, post, sanitized: s, flags: detectInjection(s.clean) };
    }).filter((p) => p.sanitized.clean.length > 0);

    send('status', {
      phase: 'ready',
      postCount: prepared.length,
      sources: [...new Set(prepared.map((p) => p.post.subreddit))],
      // Names of communities, not server messages: the client phrases it.
      skipped: skipped ?? [],
      stale: stale ?? [],
      adapter,
      incompleteWindow: incompleteWindow === true,
      flaggedCount: prepared.filter((p) => p.flags.flagged).length,
    });

    const fight = new FightState();
    let emitted = 0;

    // Classify lazily, batch by batch: the fight needs at most 19 hits, so we
    // stop calling Claude the moment somebody is knocked out.
    for (const batch of chunk(prepared, config.limits.batchSize)) {
      if (closed || fight.isOver) break;

      const items: ClassifyItem[] = batch.map((b) => ({ id: b.index, clean: b.sanitized.clean }));
      const outcome = await classifyBatch(items);

      if (outcome.degradedReason) {
        // The reason is a server-side diagnostic: it is logged here, not shipped.
        app.log.warn({ reason: outcome.degradedReason }, 'batch fell back to offline scoring');
        send('status', { phase: 'degraded' });
      }

      for (const b of batch) {
        if (closed || fight.isOver) break;

        const sentiment = outcome.verdicts.get(b.index) ?? 'neutral';
        const classified: Classified = {
          clean: b.sanitized.clean,
          permalink: b.post.permalink,
          subreddit: b.post.subreddit,
          sentiment,
          flagged: b.flags.flagged,
          flagReasons: b.flags.reasons,
          source: outcome.source,
        };

        const isFinal = fight.wouldEndFight(sentiment);
        await sleep(delayBefore({ isFirst: emitted === 0, isClinch: sentiment === 'neutral', isFinal }));

        for (const event of fight.apply(classified) as FightEvent[]) {
          if (event.t === 'ko') await sleep(PACING.impactMs);
          send('fight', event);
          emitted++;
        }

        void audit({
          ts: new Date().toISOString(),
          fightId,
          range: `${offset}d`,
          subreddit: b.post.subreddit,
          rawTitle: b.post.title,
          cleanTitle: b.sanitized.clean,
          sanitizerAltered: b.sanitized.altered,
          flagged: b.flags.flagged,
          flagReasons: b.flags.reasons,
          sentiment,
          source: outcome.source,
          ...(outcome.degradedReason ? { degradedReason: outcome.degradedReason } : {}),
          outcome: sentiment === 'neutral' ? 'clinch' : sentiment === 'positive' ? 'AI hits HUMAN' : 'HUMAN hits AI',
        });
      }
    }

    if (!fight.isOver && !closed) {
      // The window ran out of posts before anyone hit zero: whoever has more
      // health left wins on points.
      const { human, ai } = fight.health;
      send('decision', {
        winner: human === ai ? 'DRAW' : human > ai ? 'HUMAN' : 'AI',
        hp: fight.health,
      });
    }

    await sleep(PACING.knockoutMs);
    send('end', { fightId, hp: fight.health });
    reply.raw.end();
  } catch (err) {
    // Full detail stays on this machine; the browser is told only what kind of
    // failure it was, as a code it can phrase itself.
    app.log.error({ err }, 'fight failed');
    const code = err instanceof RedditError
      ? (err.code === 'rate-limited' ? 'reddit-rate-limited' : 'reddit-unavailable')
      : 'internal';
    send('error', { code });
    reply.raw.end();
  }
});

// Anything that is not /api and not a built asset falls back to the app shell.
if (hasBundle) {
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ code: 'not-found' });
    return reply.sendFile('index.html');
  });
}

await app.listen({ port: config.port, host: config.host });
app.log.info(
  hasBundle
    ? `Fight AI running on http://${config.host}:${config.port}`
    : `Fight AI API on http://${config.host}:${config.port} (no bundle found - run \`npm run build\`, or use the Vite dev server)`,
);
