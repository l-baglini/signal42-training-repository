# CLAUDE.md

Project context for Claude Code. Loaded automatically every session. This
file is the single source of truth for durable project facts. Procedures
live in `.claude/skills/`; isolated research/review tasks in
`.claude/agents/`. Per-session *process* instructions (plan first, etc.)
come from the kickoff prompt, NOT this file.

If anything below conflicts with a request, surface the conflict before
proceeding — do not silently override these decisions.

---

## 1. What this project is

A personal tech-radar web app. For each **topic** I follow (e.g. "Spark",
"Kubernetes", "Go"), the backend periodically searches the web for the
latest news, releases, and papers, groups what it finds into distinct
**findings**, and produces one cited, study-ready **digest** per finding
using Claude.

I'm a data/software/DevOps engineer. The pain point this solves: missing
important updates and falling behind on trends. The audience for every
digest is an experienced engineer — technical, concise, no hand-holding.

---

## 2. Core data model (non-negotiable shape)

Exactly two levels:

- **Topic** — a thing I follow. Free-text tag. e.g. "Spark".
- **Finding / Digest** — a specific development under a topic. Each finding
  is its OWN LLM-generated digest with its OWN sources, citations, images,
  and read/unread state.

```
Topic "Spark" ──┬── Finding "DataFusion Comet"  → digest + sources + images
                ├── Finding "Apache Gluten"      → digest + sources + images
                └── ...
```

Hard rules:
- The pipeline MUST detect distinct findings within a topic and emit ONE
  digest PER finding. Never collapse a topic into a single blob summary.
- The Postgres schema and every module boundary follow this Topic → Finding
  relationship. Entities: **Topic, Finding/Digest, Source, Image,
  read-state.**

---

## 3. Stack (fixed — do not substitute without asking)

- **Frontend:** React (the UI framework).
- **Backend:** Python.
- **LLM:** Anthropic Claude API via the official `anthropic` Python SDK,
  using tool use. Model id and key come from env (`ANTHROPIC_API_KEY`).
  Never hardcode either.
- **Primary DB:** PostgreSQL. Relational data + the Topic/Finding model.
- **Local deploy:** Docker Compose. A single `docker compose up` brings up
  the full stack (Postgres + backend + frontend + any justified optional
  store), runs migrations on startup, and reads keys from a documented
  `.env`.

---

## 4. Decisions still OPEN (recommend + justify before writing code)

Pick one for each, give a one-line justification, then proceed:

- **Python web framework** — default lean: FastAPI (async I/O for many
  concurrent fetches + clean tool-use orchestration).
- **ORM + migration tool.**
- **Runtime web-search / retrieval API** — the API the backend calls during
  its scheduled runs. Call out cost / rate limits here AND for Claude usage.
- **Scheduler** — in-process (APScheduler, simplest, no extra Compose
  service) vs. separate worker (Celery + broker, more production-like, more
  services). State the `docker-compose.yml` impact of the choice.

---

## 5. Optional stores — add ONLY if justified, NEVER by default

Make complexity justify itself. A 2-database Compose file beats a 4-database
one for an app this size unless there's a concrete win.

- **Document store (MongoDB):** only if raw scraped blobs are genuinely
  better off outside Postgres. Default to Postgres `TEXT` / `JSONB`.
- **Vector store (Qdrant):** only if semantic dedup or finding-detection
  truly beats simpler approaches (URL/title dedup, keyword clustering, or
  letting Claude judge). If added, state the embedding model and wire it
  into Compose.

If you add either, justify it in the architecture proposal and explain how
it fits the data flow.

---

## 6. The digest agent (ReAct loop)

"ReAct" = the reason/act agent pattern (Thought → Action → Observation,
repeat → write digest). NOT the React frontend.

Loop behavior:
- The agent reasons about what it has, calls a TOOL, observes the result,
  and decides the next action — so it can fill gaps (fetch a source, notice
  something missing, search again) instead of summarizing in one shot.
- **Tools:** web/search query; fetch-and-extract page text; vector lookup
  (ONLY if Qdrant exists).
- **Max-iteration guard is mandatory.** An unbounded loop silently burns
  Claude tokens. Hitting the guard must degrade gracefully — write the best
  digest so far and log it, never crash.
- Define explicit stopping conditions alongside the guard.
- Choose the Claude model and justify it (cost vs. quality for long,
  multi-source summaries). Handle long inputs, retries, and rate limits.

Digest agent **system prompt** — keep it as ONE clearly labeled, editable
constant (never scattered in prose). It must instruct Claude to:
- write for an experienced engineer; be technical and concise;
- use its tools to VERIFY before writing;
- cite EVERY claim with its source;
- NEVER fabricate sources or facts;
- flag uncertainty explicitly;
- output exactly this structure:
  **What changed / Why it matters / Technical details / Sources.**

If you change the output structure, update whatever parses/stores the digest
AND the frontend that renders these sections — they are coupled.

---

## 7. Functional requirements

- Add/remove topics (free-text tags like "spark", "kubernetes").
- A scheduled job runs per topic — **configurable, default daily.**
- **Source discovery** prioritizes authoritative sources: official docs,
  release notes, GitHub releases, arXiv/papers, maintainers' blogs,
  reputable engineering blogs. De-duplicate and rank by **authority +
  recency.**
- Within a topic, group ranked material into distinct findings and produce
  one digest per finding, each with: a title (the finding name), a
  structured study-ready summary, inline source citations with links, and
  relevant images where available (with attribution).
- **Detect what's new across runs.** Do NOT regenerate digests for findings
  already covered in a previous run. A re-run of a topic should only produce
  digests for genuinely new findings (and optionally update an existing one
  if there's materially new info — decide and document which).
- **Images:** decide and document discovery, storage, and rendering. Default
  recommendation: download + serve through the backend (a proxy/cache)
  rather than hotlinking source URLs — hotlinks break when sources change
  or block them and leak referrer info. Store an Image row linked to its
  Finding, with attribution back to the source.

---

## 8. Backend module layout

Keep these boundaries clean; each is independently testable. Single
responsibility — a module does its job and hands off, nothing more.

- `source_discovery` — find candidate sources for a topic (authoritative
  first). I/O + normalize only; no ranking, no summarizing.
- `fetch` — retrieve + extract readable text and images from a URL.
- `rank_dedup` — score by authority + recency; de-duplicate (normalized
  URLs).
- `finding_detection` — group ranked material into distinct findings; decide
  what's new vs. already-covered across runs.
- `agent` — the ReAct loop + Claude tool use + the digest system prompt.
- `scheduler` — periodic per-topic runs (default daily, configurable).
- `api` — the HTTP layer the React app talks to.

---

## 9. Frontend

React app, three views:
1. **Topic list** — my topics; add/remove.
2. **Topic detail** — that topic's digests (findings) ordered by date.
3. **Digest view** — full summary, images, sources/citations, and a
   read/unread toggle.

Decide and document: build tooling, state management, how it talks to the
backend API.

---

## 10. Conventions (apply everywhere)

- **Secrets:** all keys via env vars, documented in `.env.example`. Never
  commit real keys. Never print keys in logs. (Hard fail if violated.)
- **Python:** type hints everywhere; centralized env-driven config (no
  hardcoded values); structured logging; explicit error handling — a flaky
  source must NOT crash a whole topic's run.
- **Tests:** unit-test the logic that's easy to get subtly wrong —
  `rank_dedup`, `finding_detection`, and the agent loop's control/stopping
  logic. Don't chase coverage on glue code.

---

## 11. Deployment

- `docker-compose.yml` with services for Postgres (persistent volume), the
  backend, the frontend, and any justified optional store — wired via env
  vars.
- Migrations run on startup.
- README: clone → running via `docker compose up` plus a documented `.env`.

---

## 12. Acceptance criteria (definition of done)

- `docker compose up` brings up the full stack locally per the README.
- Adding a topic and triggering a run produces, under that topic, one or
  more named digests — each with a summary, working source links, and images
  where available.
- The code is modular; `rank_dedup`, `finding_detection`, and the
  agent-loop control logic are unit-tested.

---

## 13. Commands

> Fill these in as the codebase materializes; keep them current — this is
> the first place Claude looks.

- Run full stack: `docker compose up`
- Backend tests: _TBD_
- Frontend dev server: _TBD_
- Run migrations: _TBD_
- Trigger a one-off topic run (manual retrieval): _TBD_

---

## 14. Working style for this repo

- For a new feature, prefer **plan mode** (research → plan → approve →
  build). The breadth of this app punishes one-shot attempts.
- When touching fast-moving libraries (anthropic SDK tool use, FastAPI
  async, the chosen ORM, Qdrant client, the search API), verify the CURRENT
  API before coding against it — delegate to the `library-researcher`
  subagent rather than coding from memory.
- After a meaningful change lands, run it past the `code-reviewer` subagent.