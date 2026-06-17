# Architecture

Personal tech-radar web app. For each **topic** followed (e.g. "Spark",
"Kubernetes", "Go"), the backend periodically searches the web, groups what it
finds into distinct **findings**, and produces one cited, study-ready
**digest** per finding using Claude.

This document records the architecture decisions made at the proposal stage
(step 2). It is the single reference for *why* each choice was made. Durable
project facts live in `CLAUDE.md`; this file is the design rationale.

Status: **approved proposal** — pre-implementation. Items marked ⚠ require live
API verification (via the `library-researcher` subagent) before coding.

---

## 1. Resolved open decisions

The decisions `CLAUDE.md` §4 left open, plus the model choice from §6.

| Decision | Choice | Justification |
|---|---|---|
| Web framework | **FastAPI 0.115.x** | Async-native (ASGI/Starlette); the workload is dozens of concurrent fetches per run; clean DI for DB sessions/config; `lifespan` manager hosts the scheduler + DB engine cleanly. |
| ORM + migrations | **SQLAlchemy 2.0.x (async) + asyncpg + Alembic 1.18.x** | Canonical async Postgres stack in 2026; Alembic autogenerate works against the async engine; pin to 2.0.x (2.1 still pre-release). |
| Runtime web-search API | **Tavily** (primary), behind a provider interface so Brave/Exa can be swapped — ⚠ verify live before coding | Purpose-built for LLM/agent use: returns ranked results **plus extracted content** in one call, supports date filtering, usable free tier — fewer round-trips for the ReAct loop than a raw SERP scraper. |
| Scheduler | **APScheduler 3.11.x `AsyncIOScheduler`, in-process** | Matches the lean default — no broker, two-service Compose. Started/stopped in FastAPI's `lifespan`. (Single-worker constraint, see §11.) |
| Fetch-and-extract library | **trafilatura** (leaning), ⚠ verify vs readability-lxml before coding | Best-maintained readable-text + image extraction in 2026; behind the `fetch` module's interface so it's swappable. |

### Claude models (ids from env — never hardcoded, `CLAUDE.md` §3)

| Use | Default model | Env var | Justification |
|---|---|---|---|
| Digest agent (ReAct loop) | **`claude-sonnet-4-6`** | `DIGEST_MODEL` | Strong long, multi-source, citation-heavy summarization; 1M context; adaptive thinking; structured outputs; ~⅗ the cost of Opus. Upgrade to `claude-opus-4-8` per-deploy by setting the env var. |
| Finding-detection / clustering | **`claude-haiku-4-5`** | `CLUSTER_MODEL` | Cheap, fast classification/grouping over titles+snippets; Opus-tier quality not needed to bucket candidates. |

**Decision (model default):** Sonnet 4.6 default, Opus 4.8 upgradable via
`DIGEST_MODEL`. Best cost/quality balance for the citation-heavy,
experienced-engineer audience.

---

## 2. Optional stores — decisions

**MongoDB → NO.** Raw scraped text is one `TEXT`/`JSONB` column per `source`
row, always read in the context of its finding. No schema-flexibility or
document-query win Postgres `JSONB` + GIN doesn't cover. Adding Mongo means a
third Compose service for zero concrete benefit.

**Qdrant → NO (with a defined upgrade trigger).** Finding-detection at this
scale (tens–low-hundreds of candidates per topic per run) is handled better and
more cheaply by: URL/title normalization dedup → cheap embedding-free
clustering → let Claude judge final grouping and novelty. Embeddings add an
embed-model dependency, a fourth service, and index lifecycle for a problem
Claude already solves in-loop.

**Upgrade trigger:** add a vector store only if cross-run novelty detection
degrades — i.e. thousands of historical findings per topic accumulate and "is
this finding new?" becomes a semantic-similarity problem that title/URL matching
misses. The schema keeps a seam for this (a `content_hash` and room for a
`pgvector` column) so it is a migration, not a rewrite. Prefer `pgvector` in
Postgres before reaching for a separate Qdrant service; if Qdrant is added, use
a small local `bge`/`e5` embedding model wired into Compose.

---

## 3. Component diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                         React SPA (Vite)                           │
│   Topic list  →  Topic detail (findings by date)  →  Digest view   │
└───────────────────────────────┬────────────────────────────────────┘
                                 │  REST/JSON  (TanStack Query)
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                      FastAPI backend (one process)                  │
│                                                                     │
│  api/         ── HTTP layer: topics, findings, digests, runs,       │
│                  read-state, image proxy                            │
│                                                                     │
│  scheduler    ── APScheduler AsyncIOScheduler (per-topic cron)      │
│        │         + POST /topics/{id}/run for manual trigger         │
│        ▼                                                            │
│  ┌─────────────── pipeline (per topic run) ──────────────────────┐ │
│  │ source_discovery → fetch → rank_dedup → finding_detection      │ │
│  │                                              │                  │ │
│  │                                              ▼                  │ │
│  │                                  agent (ReAct loop, 1/finding)  │ │
│  └────────────────────────────────────────────┬──────────────────┘ │
│                                                │                     │
│   config (env)   logging (structlog)           ▼                     │
│   anthropic client    httpx client      image fetch+store            │
└───────────────┬───────────────────────────────┬────────────────────┘
                │                                 │
                ▼                                 ▼
        ┌──────────────┐                 ┌───────────────────┐
        │  PostgreSQL  │                 │ External services │
        │ (volume)     │                 │ Tavily • Claude   │
        └──────────────┘                 │ • source sites    │
                                         └───────────────────┘
```

Two Compose services + Postgres: `db`, `backend`, `frontend`. Migrations run on
`backend` startup.

---

## 4. Pipeline data flow

One **run** per topic (scheduled or manual):

1. **source_discovery** — build authoritative queries → Tavily (+ targeted
   GitHub Releases / arXiv) → normalized `CandidateSource` list. I/O + normalize
   only; no ranking, no summarizing.
2. **fetch** — for candidates missing body/images, fetch & extract readable text
   + images (concurrent, bounded). A flaky source is logged + skipped, never
   crashes the run.
3. **rank_dedup** — normalize URLs, drop dupes, score by authority + recency.
4. **finding_detection** — cluster ranked candidates into distinct findings;
   decide new vs already-covered against the topic's existing findings.
5. **agent** — for each new (or materially-updated) finding, run the ReAct loop
   → structured digest with citations + images → persist `Finding` + `Digest` +
   `Source`s + `Image`s, marked unread.
6. **Run** row records counts/status/errors for observability and idempotency.

---

## 5. PostgreSQL schema

```
topic
  id            uuid pk
  name          text unique not null        -- free-text tag, normalized lower
  created_at    timestamptz default now()
  schedule_cron text                         -- nullable; null = global default
  active        boolean default true

run                                          -- one per topic execution
  id            uuid pk
  topic_id      uuid fk topic on delete cascade
  started_at    timestamptz
  finished_at   timestamptz
  status        text  -- running|ok|partial|failed
  stats         jsonb -- {candidates, kept, findings_new, findings_updated, errors[]}

finding                                      -- a distinct development under a topic
  id            uuid pk
  topic_id      uuid fk topic on delete cascade
  title         text not null                -- the finding name ("DataFusion Comet")
  slug          text                         -- normalized key for cross-run identity
  status        text default 'new'           -- new|updated|stable
  first_seen_run uuid fk run
  last_seen_run  uuid fk run
  created_at    timestamptz default now()
  updated_at    timestamptz
  unique (topic_id, slug)                    -- cross-run dedup anchor

digest                                        -- LLM output for a finding (VERSIONED)
  id            uuid pk
  finding_id    uuid fk finding on delete cascade
  run_id        uuid fk run
  what_changed      text                      -- the 4 required sections, stored
  why_it_matters    text                      -- discretely so the frontend renders
  technical_details text                      -- them and a schema change is
  sources_md        text                      -- localized
  body_md       text                          -- full assembled markdown (render cache)
  model         text                          -- which Claude model produced it
  created_at    timestamptz default now()
  is_current    boolean default true          -- newest digest per finding

source
  id            uuid pk
  finding_id    uuid fk finding on delete cascade
  url           text not null
  normalized_url text not null                -- for dedup
  title         text
  authority_score numeric                     -- ranking inputs kept for audit
  published_at  timestamptz
  fetched_at    timestamptz
  raw_text      text                          -- extracted body (Postgres TEXT)
  raw_meta      jsonb                          -- headers, byline, etc.
  unique (finding_id, normalized_url)

image
  id            uuid pk
  finding_id    uuid fk finding on delete cascade
  source_id     uuid fk source                -- attribution back to origin
  origin_url    text not null                  -- where it came from
  stored_path   text                           -- backend-served path (proxy/cache)
  mime          text
  width int     height int
  attribution   text                           -- caption/credit
  created_at    timestamptz default now()

read_state                                     -- per-finding read/unread
  finding_id    uuid pk fk finding on delete cascade
  is_read       boolean default false
  read_at       timestamptz
```

**Schema notes / decisions:**
- **Read-state is per-finding** (single-user app; no user table). If multi-user
  later, `read_state` gains `user_id` and a composite PK.
- **Digest sections stored discretely** (`what_changed`, `why_it_matters`,
  `technical_details`, `sources_md`). This is the coupling `CLAUDE.md` §6 calls
  out: the parse/store layer and the React renderer both key off these four
  fields. `body_md` is a convenience render cache.
- **Images stored + served by the backend** (proxy/cache), never hotlinked
  (`CLAUDE.md` §7). `stored_path` is a backend route; `origin_url` +
  `attribution` preserve provenance.
- **`finding.slug`** is the cross-run identity anchor for new-vs-covered
  detection.
- **Digest is versioned** (see §7 decision) — `is_current` flag, history
  preserved.

---

## 6. Module breakdown

Maps 1:1 to `CLAUDE.md` §8. Each independently testable; single responsibility.

| Module | Responsibility | Interface (illustrative) |
|---|---|---|
| `config` | env-driven settings (Pydantic Settings); model ids, keys, cron default, concurrency caps | `Settings` singleton |
| `source_discovery` | authoritative query construction + Tavily/GitHub/arXiv calls → normalized candidates | `async discover(topic) -> list[CandidateSource]` |
| `fetch` | retrieve + extract readable text & images from a URL (bounded concurrency, per-source error isolation) | `async fetch_extract(url) -> Extracted` |
| `rank_dedup` | normalize URLs, dedup, score authority+recency | `rank(cands) -> list[Ranked]` — pure, unit-tested |
| `finding_detection` | cluster into findings; new-vs-covered decision | `detect(ranked, existing) -> list[FindingPlan]` — unit-tested |
| `agent` | ReAct loop + Claude tool use + system prompt + max-iter guard | `async write_digest(plan) -> DigestResult` — control logic unit-tested |
| `scheduler` | per-topic cron registration + manual trigger | `register(topic)`, `run_topic(topic_id)` |
| `api` | HTTP layer | FastAPI routers |
| `images` | download/cache/serve + attribution | `async store(image_ref) -> ImageRow` |
| `db` | engine, `async_sessionmaker`, models, repositories | — |

**Unit-test targets** (`CLAUDE.md` §10): `rank_dedup`, `finding_detection`, and
the agent loop's control/stopping logic.

---

## 7. Source discovery + authority/recency ranking + dedup

**Discovery (authoritative-first).** For each topic, fan out a small query set
rather than one generic search:
- Tavily search: `"{topic} release notes"`, `"{topic} changelog"`,
  `"{topic}" arxiv`, `"{topic}" announcement`, with a recency filter.
- Direct **GitHub Releases** API for repos mapped to the topic (highest
  authority, structured, dated).
- **arXiv** API for papers.
- Tavily `include_domains` biased toward official docs / maintainer blogs when
  known.

**Authority score** — deterministic, tunable weights (in `rank_dedup`, pure,
unit-tested):
```
authority = base_by_domain_class + signals
  domain class:  official_docs/release =1.0, github_release=0.95, arxiv=0.9,
                 maintainer_blog=0.8, reputable_eng_blog=0.6,
                 aggregator/news=0.4, unknown=0.2
  signals:       +https, +has byline, +on official allowlist for topic
```
A curated, editable `domain_authority.yaml` maps domains→class; unknown domains
fall to a low default so random blogs are never over-trusted.

**Recency score** — exponential decay on `published_at` (half-life
configurable, default ~14 days). Missing date ⇒ neutral-low.

**Final rank** = `w_a*authority + w_r*recency` (weights in config). Recency
cannot fully override low authority — keeps a fresh aggregator from outranking
week-old official release notes.

**Dedup** — normalize URL (strip scheme/`www`/UTM/fragment, lowercase host,
trim trailing slash) → drop exact dupes; near-dupe titles handled in
finding-detection. Intentionally **not** semantic (no Qdrant) — cheap,
deterministic, testable.

---

## 8. Finding-detection approach

Three stages, escalating cost only as needed:

1. **Cheap pre-cluster** — group ranked candidates by normalized title tokens +
   shared entities/URLs (deterministic, unit-tested). Catches the obvious "5
   articles about Comet" case for free.
2. **Claude judge (Haiku)** — pass pre-clusters' titles+snippets; Claude
   merges/splits into distinct findings and names each (the finding title).
   This decides "Spark → [Comet, Gluten, …]" — the model is better at "are these
   the same development?" than any rule.
3. **New-vs-covered** — compute `slug` per detected finding, match against
   existing `finding.slug` for the topic:
   - no match ⇒ **new** → generate digest.
   - match + materially new sources/info ⇒ **updated** → regenerate (see §9).
   - match + nothing new ⇒ **skip** (`CLAUDE.md` §7: don't regenerate).

"Materially new" = new source URLs not already attached to the finding, above a
small threshold.

---

## 9. Update policy (DECISION)

**Decision: version the digest.** When a re-run finds an existing finding has
materially new info:
- generate a new `digest` row;
- set the prior digest `is_current = false` (history preserved — audit trail of
  how a finding evolved);
- set `finding.status = 'updated'` and reset its read-state to **unread** so it
  re-surfaces in the UI.

Brand-new findings create the first `digest` (`is_current = true`, status
`new`). Findings with no new material are **skipped** — no regeneration, no
token spend.

This satisfies `CLAUDE.md` §7's "optionally update an existing one if there's
materially new info — decide and document which": we **do** update on material
change, and we keep history.

---

## 10. ReAct agent — tool set, loop, guard, model

**Model:** `claude-sonnet-4-6` (env `DIGEST_MODEL`), adaptive thinking on,
structured output for the final digest. `DIGEST_MODEL=claude-opus-4-8` is a
one-env-var upgrade for the hardest topics. Justification: long, multi-source,
citation-heavy summarization is squarely Sonnet 4.6's strength at meaningfully
lower cost than Opus.

**Tools** (`CLAUDE.md` §6):
- `web_search(query, days?)` → ranked results (Tavily) — fill gaps.
- `fetch_page(url)` → extracted readable text + image refs — verify before
  writing.
- *(`vector_lookup` — only if Qdrant is ever added; omitted now.)*

**Manual tool-use loop** (not the SDK tool-runner) — required because
`CLAUDE.md` §6 mandates an explicit max-iteration guard, graceful degradation,
and per-call logging, all of which need an owned loop:

```
seed messages from the finding plan (its ranked sources)
for i in range(MAX_ITERS):              # guard, default 6, env-configurable
    resp = client.messages.create(model=DIGEST_MODEL, tools=TOOLS,
                                   thinking=adaptive, max_tokens=…, messages=…)
    if resp.stop_reason != "tool_use":
        break                            # natural stop → ready to write
    execute tool_use blocks (bounded; errors → tool_result is_error=true)
    append assistant turn + tool_result user turn
else:
    log.warning("max_iterations hit")    # graceful degrade — never crash
# Final structured digest enforced via output_config.format (4-section schema)
```

**Stopping conditions:**
- (a) `stop_reason == end_turn` with a valid structured digest;
- (b) max-iterations guard hit → write best-effort digest from gathered material
  and log it (never crash);
- (c) a "sufficiency" instruction in the system prompt stops searching once every
  intended claim is backed by a fetched source.

**Long inputs / retries / rate limits:**
- SDK auto-retries 429/5xx with backoff (`max_retries`, default 2; raised to ~5
  via `with_options`); `anthropic.RateLimitError` honored via `retry-after`.
- Stream + `get_final_message()` for large digests to avoid the ~10-min
  non-stream timeout.
- Source bodies truncated **per-source** with a budget — never the whole prompt
  silently dropped; oversized single sources get a fetch-time summary sub-step.

**Final output:** structured (`output_config.format`) into the four sections →
stored discretely in `digest`.

---

## 11. Agent system prompt (editable constant)

Lives as ONE labeled constant `DIGEST_SYSTEM_PROMPT` (`CLAUDE.md` §6 — one
place, never scattered):

```
You are a technical research analyst writing a study-ready digest for an
experienced software/data/DevOps engineer. Assume deep background knowledge;
be technical, dense, and concise — no hand-holding, no filler.

You have tools: web_search and fetch_page. Use them to VERIFY before you write.
Do not rely on memory for facts, versions, dates, or APIs — confirm them from a
fetched source. If you intend to make a claim you cannot back with a source you
have fetched this session, either fetch one or drop the claim.

HARD RULES:
- Cite EVERY factual claim inline with its source, as [n] referencing the
  Sources list. Never write a claim without a citation.
- NEVER fabricate sources, URLs, quotes, versions, or facts. If a source does
  not say something, do not write it.
- Flag uncertainty explicitly ("unconfirmed", "as of <date>", "the docs do not
  state X"). Prefer omission over speculation.
- Stop searching once every claim is sourced; do not pad.

OUTPUT exactly these four sections, in this order:
## What changed
## Why it matters
## Technical details
## Sources
(Sources is a numbered list of title + URL for each [n] you cited.)
```

**Prompt-design rationale:**
- verify-before-write + "drop the claim" is the main anti-hallucination lever
  and the reason the ReAct loop exists;
- the explicit four-section contract is machine-parseable into the `digest`
  columns and the frontend sections;
- uncertainty-flagging + "omission over speculation" target the failure mode
  that matters most to an engineer audience;
- "stop once sourced" prevents runaway tool-loop token burn.

---

## 12. React ↔ Python API contract

REST/JSON. List endpoints support `?order=desc` by date.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/topics` | list topics (+ unread counts) |
| `POST` | `/api/topics` | `{name, schedule_cron?}` add topic |
| `DELETE` | `/api/topics/{id}` | remove topic |
| `POST` | `/api/topics/{id}/run` | trigger a run now → `{run_id}` |
| `GET` | `/api/topics/{id}/findings` | findings for topic, newest first (title, status, is_read, latest digest date) |
| `GET` | `/api/findings/{id}` | full current digest: 4 sections + sources[] + images[] + read-state |
| `PATCH` | `/api/findings/{id}/read` | `{is_read: bool}` toggle |
| `GET` | `/api/runs/{id}` | run status/stats (for "running…" UI) |
| `GET` | `/api/images/{id}` | **backend-served** image bytes (proxy/cache) |
| `GET` | `/api/health` | liveness |

`GET /api/findings/{id}` response shape:
```json
{ "id","title","status","is_read",
  "digest": { "what_changed","why_it_matters","technical_details","sources_md","model","created_at" },
  "sources": [{ "n","title","url","published_at" }],
  "images":  [{ "url":"/api/images/<id>", "attribution","origin_url","width","height" }] }
```

---

## 13. Frontend

- **Build:** Vite + React + TypeScript — fast dev server, simple prod build,
  trivial Compose static-serve (nginx).
- **Server state:** TanStack Query (caching, refetch, the "run in progress →
  poll `/runs/{id}`" flow). Minimal local UI state via React hooks — no Redux
  for an app this size.
- **API access:** typed `fetch` wrapper, base URL from env (`VITE_API_BASE`);
  React Router for the three views.
- **Three views** (`CLAUDE.md` §9): topic list → topic detail (findings by
  date) → digest view (four sections, images from `/api/images/...`, citations
  as links, read/unread toggle — optimistic via TanStack mutation).

---

## 14. Images — discover / store / render

- **Discover:** during `fetch`, extract `<img>` / `og:image` from each source;
  the agent may also surface a key image per finding.
- **Store:** `images` module downloads bytes to a backend-served path (default:
  filesystem volume, path in `image.stored_path`), records `origin_url` +
  `attribution`. **No hotlinking** (`CLAUDE.md` §7 — avoids breakage, referrer
  leakage, hostile blocking).
- **Render:** frontend hits `/api/images/{id}`; caption shows `attribution` and
  links to `origin_url`.

---

## 15. Deployment

- `docker-compose.yml`: `db` (postgres + named volume), `backend`
  (FastAPI/uvicorn — **single worker**, see constraint below; runs
  `alembic upgrade head` on startup via entrypoint), `frontend` (Vite build
  served by nginx).
- Keys via `.env` (documented `.env.example`): `ANTHROPIC_API_KEY`,
  `DIGEST_MODEL`, `CLUSTER_MODEL`, `TAVILY_API_KEY`, `DATABASE_URL`,
  `DEFAULT_SCHEDULE_CRON`, concurrency/iteration caps. No real keys committed;
  keys never logged (`CLAUDE.md` §10).
- Migrations run on startup; `docker compose up` brings up the full stack.

**APScheduler single-worker constraint:** an in-process `AsyncIOScheduler` runs
inside each process. Scaling `backend` to multiple uvicorn workers would fire
every job N times. Mitigation: run the API single-worker, or gate scheduler
startup behind a leader-election env flag. Documented so it is not a surprise.

---

## 16. To verify before / during coding

1. **Search API ⚠ (highest priority):** the live-research pass for
   Tavily/Brave/Exa did not complete. Before writing `source_discovery`,
   re-run `library-researcher` to confirm Tavily's current pricing, rate limits,
   and response shape, and the best fetch-extract library (trafilatura vs
   readability-lxml). Both are isolated behind module interfaces so the choice
   is swappable.
2. **anthropic SDK tool-use shape** — re-verify on the pinned SDK version before
   coding the agent loop (fast-moving; `CLAUDE.md` §14).
3. **APScheduler multi-worker** — keep `backend` single-worker unless leader
   election is added.

---

## 17. Confirmed library versions (mid-2026, verified)

| Library | Version | Note |
|---|---|---|
| FastAPI | 0.115.x | use `lifespan`, not deprecated `on_event` |
| SQLAlchemy | 2.0.x | async engine + `async_sessionmaker`; pin 2.0 (2.1 pre-release) |
| asyncpg | latest | recommended async Postgres driver; `postgresql+asyncpg://` |
| Alembic | 1.18.x | async template (`alembic init -t async`); `upgrade head` on startup |
| APScheduler | 3.11.x | `AsyncIOScheduler`; 4.0 still alpha — do not use |
| anthropic | 0.109.x | `AsyncAnthropic`; manual tool-use loop; auto-retries 429/5xx |
