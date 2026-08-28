# Architecture

```
                 ┌──────────────────────────────────────────────┐
  browser        │  web/  (Vite + TypeScript + Canvas 2D)       │
                 │  range picker → fight arena → knockout       │
                 └───────────────┬──────────────────────────────┘
                                 │  GET /api/fight?days=2     (SSE)
                                 ▼
                 ┌──────────────────────────────────────────────┐
  local server   │  server/  (Node + Fastify, 127.0.0.1)        │
                 │                                              │
                 │  1. reddit/   fetch posts in [now-range, now]│
                 │  2. guard/    sanitise + flag each title     │
                 │  3. llm/      classify in locked-down batches│
                 │  4. guard/    validate output, else fallback │
                 │  5. fight/    build the timed event queue    │
                 │  6. audit/    append JSONL trail             │
                 └───────┬───────────────────────┬──────────────┘
                         │                       │
              Atom / OAuth API           `claude -p` subprocess
              (reddit.com)               (no tools, empty cwd)
                                                 │
                                          Anthropic API
                                       (your Claude login)
```

## Authentication: no API key needed

You asked whether the app can just open the Claude login and use it. Almost —
with one important correction.

**What is not possible:** taking a `claude.ai` browser session (cookies, the web
app's token) and calling the Anthropic API with it. That is not a supported flow
and it violates the terms of service. Any project claiming to do it is scraping.

**What is possible, and is what this project does:** the Claude Code CLI supports
OAuth login against a **Claude subscription** (Pro / Max) — no API key involved.
The server never touches credentials itself; it spawns the local `claude` binary,
which reads the login you already performed.

```bash
claude auth login     # opens the browser, standard Anthropic OAuth
claude auth status    # confirms who you are logged in as
```

The server checks `claude auth status` at startup and, if you are logged out, the
UI shows a "Sign in to Claude" button that runs `claude auth login` and waits for
the browser round-trip to complete. That is the "app opens the Claude login" you
wanted, done through the supported path.

For a headless box with no browser, `claude setup-token` (also subscription-only)
mints a long-lived token you can put in `CLAUDE_CODE_OAUTH_TOKEN`.

Caveat worth stating once: subscription auth is meant for **your own local use**.
If this ever becomes a public site serving many viewers, it needs a real API key
with billing attached.

## Pipeline

### 1. Reddit fetch (`server/src/reddit/`)

Two adapters behind one interface, because the anonymous JSON endpoint is now
bot-walled:

| Adapter | Auth | Reach | Notes |
|---------|------|-------|-------|
| `oauth` | free "script" app (`client_id` + `secret`) | ~1000 posts, paginated | lifts the four-day ceiling |
| `rss`   | none | up to ~100 newest posts | zero config, covers short ranges |

`REDDIT_ADAPTER=auto` uses `oauth` when credentials exist, otherwise `rss` and
warns in the UI when the feed did not reach back far enough. (Measured 2026-08-28:
`www.reddit.com/r/singularity/new.json` → **403**; `/new/.rss` → **200**, and a
2-day window came back with 58 posts.)

Posts are filtered to `created_utc >= now - range`, sorted oldest → newest so the
fight follows the week's mood chronologically, and capped at `MAX_POSTS`.

### 2–4. Guard + classify

See **[SECURITY.md](./SECURITY.md)** — that is the interesting document. Short
version: titles are sanitised, sent as labelled data to a `claude` subprocess with
no tools and an empty working directory, and the reply is schema-validated or
thrown away in favour of a deterministic lexicon fallback.

Batches of 20 titles per call keeps cost and latency sane. Classification is
**lazy**: the fight only needs 20 hits to reach a knockout, so the server stops
calling Claude the moment a winner is decided.

### 5. Fight construction (`server/src/fight/build.ts`)

Pure function, fully testable, no I/O:

```ts
buildFight(classified) -> { events, winner, hpTimeline }
```

- `positive` → `AI` hits `HUMAN`
- `negative` → `HUMAN` hits `AI`
- `neutral`  → a **clinch**: both fighters block, no damage, keeps the rhythm and
  keeps the neutral posts visible instead of silently dropping them
- alternating `punch` / `kick` per fighter, so the animation does not repeat
- both start at 10 HP, 1 damage per hit, first to 0 loses and falls

### 6. Streaming to the browser

The fight is delivered over **Server-Sent Events**, one event at a time, paced by
the server so the frontend never has to guess. Event shape:

```jsonc
{ "t": "hit",     "attacker": "AI", "move": "kick", "hp": {"human": 7, "ai": 9},
  "title": "…", "flagged": false, "permalink": "https://…" }
{ "t": "clinch",  "title": "…" }
{ "t": "ko",      "winner": "HUMAN" }
```

**Wire discipline:** the server never sends prose. Every frame carries state and
short codes; all wording lives in `web/src/messages.ts`. Server-side
diagnostics - exception messages, subprocess stderr, stack traces - go to the
server log on your machine and stop there, so nothing from the server can appear
in the page or the browser console. Every frame also passes through
`guard/redact.ts` as a last line of defence.

Post titles are the one exception, and they are not server text: they are Reddit
content, they are the game's material, and they are handled as hostile input
throughout.

**Two communities, one fight:** `REDDIT_SUBREDDITS` (default
`singularity,artificial`) is read one after the other with a 400 ms gap, then
merged chronologically and deduplicated by post id, so the two feeds interleave
instead of playing one after the other. The gap is deliberate: Reddit's anonymous
limit is per IP, and two simultaneous feed requests is exactly what trips it. Every hit carries its `subreddit`, which the ticker shows as a badge.
Names are validated against `^[A-Za-z0-9_]{2,21}$` before they reach a URL.

If one subreddit fails, the fight continues on the others and the failure is
logged server-side; only a total failure reaches the browser. Observed live:
r/singularity returned 429 while r/artificial carried the match.

**Feed caching:** a feed is the same document for every window - the window is
only a filter - so each subreddit is fetched once, cached for a minute, and a
stale copy is tolerated for thirty. The cache is **also written to
`.cache/reddit-feeds.json`**, because an in-memory cache dies with the process
and restarting the server is exactly what you do while working on it - every
restart would otherwise re-fetch every feed and walk into the limiter.

A subreddit that cannot be read is reported to the browser by name
(`skipped: ["artificial"]`), so the viewer is told the fight is running on fewer
voices instead of silently getting a smaller sample. Only a total failure becomes
`reddit-rate-limited`; one served from an older copy is reported as `stale`.

Pacing (tuned for watchability, `fight/pacing.ts`):

| moment | delay |
|--------|-------|
| intro / "FIGHT!" | 1500 ms |
| between exchanges | 1400 ms |
| hit impact → hp bar drain | 350 ms |
| before the final blow | 2200 ms (dramatic pause) |
| knockout → result screen | 3000 ms |

A ~20-hit match therefore runs about 30–40 seconds: long enough to read each
title, short enough to watch twice.

## Frontend (`web/`)

- **Canvas 2D**, fixed 960×540 logical resolution, scaled to fit.
- Two sprite state machines (`idle`, `walk`, `punch`, `kick`, `hit`, `ko`),
  driven purely by the incoming event stream — there is no player input by design.
- HP bars animate (tween, not snap), with a delayed "ghost" bar behind them.
- A ticker under the arena shows the post title that caused the current hit,
  with a link to the permalink and a "⚠ injection attempt" badge when the guard
  flagged it. Rendered with `textContent` only.
- Range picker on the start screen: TODAY, YESTERDAY, and up to 4 DAYS AGO,
  each a cumulative window ending now, each captioned with the dates it covers.
  Four days is where the public feed runs out (measured: 13 / 44 / 69 / 88 / 99
  posts for the five options), so the picker stops where the data does.

## Layout

```
fight-ai/
├── IDEA.md                     the concept
├── docs/ARCHITECTURE.md        this file
├── docs/SECURITY.md            prompt-injection threat model
├── server/
│   └── src/
│       ├── index.ts            Fastify app + SSE endpoint
│       ├── config.ts           env parsing, limits
│       ├── auth/claude-auth.ts login status + browser login flow
│       ├── reddit/             fetch.ts, rss.ts, oauth.ts, types.ts
│       ├── guard/              sanitize.ts, heuristics.ts, validate.ts
│       ├── llm/                classify.ts (locked-down), fallback.ts, prompt.ts
│       ├── fight/              build.ts, pacing.ts
│       └── audit/audit.ts      JSONL trail
└── web/
    └── src/
        ├── main.ts, api.ts
        ├── game/               engine.ts, fighter.ts, arena.ts
        └── ui/                 range-picker.ts, hud.ts, ticker.ts
```
