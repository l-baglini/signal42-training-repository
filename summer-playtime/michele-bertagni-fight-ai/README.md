# Fight AI

A 2D fighting game in the browser where **Human** and **AI** beat each other up
according to what Reddit actually said about AI in the last few days.

There are no controls. Nobody plays it — you watch it. Every punch is caused by a
real post, and the post that caused it is shown underneath the arena while the
fighters recover.

## How a fight is decided

Claude reads the titles of the posts published in the window you choose, across
[r/singularity](https://www.reddit.com/r/singularity/) and
[r/artificial](https://www.reddit.com/r/artificial/), and judges each one for how
it feels about *people using AI*:

| verdict | what happens on screen |
|---------|------------------------|
| **positive** — AI is useful, impressive, working well | the **AI** lands a punch or a kick |
| **negative** — AI is harmful, overhyped, taking jobs | the **Human** lands a punch or a kick |
| **neutral** — news or a question with no stance | a **clinch**: both block, nobody is hurt |

Both fighters start with **10 health points**. Every hit takes one. The first to
reach zero falls to the ground. If the window runs out of posts before anyone is
knocked out, whoever has more health left wins on points.

The scoreboard is therefore not invented by the game. It is a live readout of the
mood of two communities, delivered as a fistfight.

## What a run looks like

1. Pick how far back to look and press **FIGHT**.
2. The fighters spar while the feeds are read and the first verdicts come back —
   a warm-up, so the first twenty seconds are not two idle sprites. No damage is
   dealt and the HUD says `WARM-UP`.
3. The first real verdict ends the warm-up and the match begins.
4. Each exchange is paced for a spectator: roughly 1.4 s between blows, a longer
   pause before the blow that ends it, health bars that drain rather than snap.
   A knockout takes about half a minute.
5. Under the arena, every hit is captioned with the post title that caused it,
   linked to the thread, badged with the subreddit it came from — and, when the
   guard spotted one, with an `injection attempt` warning.

## Choosing the window

**TODAY**, **YESTERDAY**, and up to **4 DAYS AGO**, counted back from the day you
are using the app. Each option is cumulative — YESTERDAY means from midnight
yesterday until now, so it includes today too — and each button shows the dates
it actually covers.

Four days is the ceiling because that is where the data runs out: without Reddit
API credentials the app reads the public Atom feed, which reaches back about a
hundred posts per subreddit. Measured on a normal day, the five options yielded
13 / 44 / 69 / 88 / 99 posts.

## Requirements

- **Node 20+**
- **[Claude Code](https://claude.com/claude-code)** on your `PATH` (`claude`),
  signed in with a Claude subscription — **no API key required**
- optionally, free Reddit API credentials to look further back than four days

## Setup

```bash
npm install
cp .env.example .env
claude auth login      # opens the browser; the only login step there is
```

## Running it

```bash
npm run serve
```

Then open <http://localhost:8787>.

That is the whole application: the Fastify server also serves the compiled
frontend, so it is one process on one port, same-origin, with a strict
`Content-Security-Policy` intact. `npm run serve` is just
`npm run build && npm start` — once built, `npm start` alone is enough.

The server says which mode it started in. If it reports *no bundle found*, then
`web/dist` is missing and `npm run build` will fix it.

### Development mode

```bash
npm run dev            # API on :8787, Vite with hot reload on :5173
```

Use <http://localhost:5173> while developing; Vite proxies `/api` to the server
and the production bundle is not involved.

## Configuration

Everything lives in `.env`, and every value has a working default — the app runs
with the file untouched.

| variable | default | what it controls |
|----------|---------|------------------|
| `REDDIT_SUBREDDITS` | `singularity,artificial` | communities to read, comma separated, merged chronologically |
| `REDDIT_CLIENT_ID` / `_SECRET` | empty | optional Reddit API credentials (see below) |
| `CLASSIFIER_MODEL` | `claude-haiku-4-5-20251001` | the model that judges the titles |
| `MAX_POSTS` | `400` | hard cap on posts per fight |
| `CLASSIFY_BATCH_SIZE` | `20` | titles per Claude call |
| `PORT` / `HOST` | `8787` / `127.0.0.1` | where the server listens |

## Signing in to Claude

There is no way to take a `claude.ai` browser session and call the Anthropic API
with it, and this app does not try. It uses the supported path instead: the
Claude Code CLI's OAuth login against a Claude subscription.

The server never handles credentials. It shells out to the local `claude` binary,
which already holds them. If you are signed out, the start screen offers a
**Sign in to Claude** button that launches the browser flow and waits for it to
complete; `claude auth status` tells you where you stand.

On a headless machine with no browser, `claude setup-token` mints a long-lived
token for `CLAUDE_CODE_OAUTH_TOKEN`.

## Reading Reddit

Reddit bot-walls the anonymous JSON endpoints (verified: **403** on
`/r/singularity/new.json`, **200** on `/new/.rss`), so the app reads the Atom
feeds.

- **Without credentials** — up to ~100 recent posts per subreddit, which is what
  sets the four-day ceiling. Reddit rate-limits anonymous reads per IP, so the
  feeds are fetched one at a time and cached to `.cache/` across restarts. If a
  subreddit is refused anyway, the fight continues on the other one and the UI
  names the community it lost. Replaying fights repeatedly will still earn you a
  429 eventually — wait a few minutes, or add credentials.
- **With credentials** — create a free *script* app at
  <https://www.reddit.com/prefs/apps>, put the id and secret in `.env`, and the
  window is fetched in full with pagination, well past four days.

## The interesting part: prompt injection

Every title is written by a stranger who knows an LLM will read it, on subreddits
where people find prompt injection funny. The defence is not a cleverer prompt,
it is **capability minimisation**: the classifier subprocess runs with no tools,
no MCP servers, no settings files, one turn, an empty working directory and a
scrubbed environment, and its answer is validated against a three-value enum
before it can affect anything.

The worst outcome of a perfect injection is therefore one wrong punch in a
cartoon — and it is written to the audit log with the title that caused it, and
badged in the UI while the fight plays.

**[docs/SECURITY.md](./docs/SECURITY.md)** is the document worth reading: the
threat model, what the server does and does not send to the browser, and what
actually leaves your machine. **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)**
covers the pipeline.

## Layout

```
server/   Node + Fastify. Reddit fetch, guard, locked-down Claude call,
          fight rules, Server-Sent Events.
web/      Vite + TypeScript + Canvas 2D. Range picker, arena, HP bars, ticker.
docs/     Architecture and the prompt-injection threat model.
audit/    JSONL trail of every classified title (gitignored).
.cache/   Cached Reddit feeds (gitignored).
```

The concept this grew from is in **[IDEA.md](./IDEA.md)**.

## Scripts

| command | what it does |
|---------|--------------|
| `npm run serve` | build everything, then run it on <http://localhost:8787> |
| `npm start` | run an already-built bundle |
| `npm run build` | typecheck and build both workspaces |
| `npm run dev` | API plus Vite hot reload, for development |
| `npm test` | 23 tests: sanitiser, injection heuristics, output validation, redaction, fight rules, time windows |
| `npm run auth:status` | show your Claude login state |

## Deploying it elsewhere

Copy `server/dist`, `web/dist`, `node_modules`, `package.json` and `.env`, and
make sure the machine has Node 20+ and a `claude` CLI **already signed in as the
user that runs the process**.

The server binds to `127.0.0.1` on purpose. `HOST=0.0.0.0` works, but there is no
authentication in front of it: anyone who can reach the port can spend your
Claude subscription. A genuinely public deployment wants an API key with billing
and a real authorisation layer, neither of which this project provides.

## Licence

Not yet chosen.
