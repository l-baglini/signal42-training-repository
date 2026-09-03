# CLAUDE.md

Guidance for a fresh model (or a fresh you) picking this project back up.

## What this is

Onetag A7 Summer Build. Centralizes office lunch requests across multiple
venues (mensa, restaurants, takeaway) so the office manager can generate a
ready-to-send message per venue instead of retyping everyone's order by
hand. Full intent, data model, and acceptance criteria: [SPEC.md](SPEC.md).

## Stack

Node.js + TypeScript, Express, EJS server-rendered views, SQLite via
`better-sqlite3` (no external DB service to run). Claude (`@anthropic-ai/sdk`)
drafts the manager's per-venue message, with a deterministic fallback
template — see "The AI feature" below.

## Layout

```
src/
  server.ts        entrypoint: opens the DB, seeds it, starts Express
  app.ts            Express app factory (views, static assets, routers, /health)
  db.ts             schema + seed data
  repo.ts           all SQL lives here — routes never touch the DB directly
  types.ts          Venue / LunchRequest / SentMark shapes
  services/
    cutoff.ts       the one piece of logic with real teeth — see below
    messageDraft.ts AI draft + deterministic fallback for the manager's message
  routes/
    employee.ts     /order* — browse venues, place/edit/cancel a request
    manager.ts       /manager* — dashboard, add venue, generate message, mark sent
views/               EJS templates (no layout engine — partials/nav.ejs is included per page)
public/              plain CSS + a small manager.js for the "generate message" fetch call
test/                vitest — mirrors src/ one-to-one for the services/repo layer
```

## Running it

```bash
npm install
cp .env.example .env      # optional — see below
npm run dev                # http://localhost:8900
npm test
npm run build && npm start
```

```bash
docker compose up --build  # http://localhost:8900, no .env required
docker compose down -v     # wipe the sqlite volume
```

## The one thing that must stay correct: cutoffs

Everything else in this app is low-stakes (see SPEC's risk tier). The single
property that actually matters is: **a request can never be created or
edited for a venue/date once that venue's cutoff for that date has passed**,
and that check happens server-side in every route that writes a request
(`employee.ts`), not just in the UI. `services/cutoff.ts` is the only source
of truth for this — if you change the cutoff semantics, change it there and
extend `test/cutoff.test.ts`, don't reimplement the comparison inline in a
route.

Cutoffs are evaluated against the **server's local clock**. Docker Compose
pins `TZ=Europe/Rome`; if you deploy this elsewhere, keep that pin or the
cutoff times will silently shift.

## The AI feature

`services/messageDraft.ts` → `draftMessage()` is the only place Claude gets
called. It:

- Skips the API entirely (no network call) when `ANTHROPIC_API_KEY` is unset
  or the order list is empty, and returns the deterministic
  `buildFallbackMessage()` template instead.
- Wraps the API call in try/catch — any failure (timeout, bad key, model
  error) falls back to the same template rather than surfacing an error to
  the office manager.
- Reads the model from `ANTHROPIC_MODEL`, defaulting to `claude-opus-5`, so
  swapping to a cheaper/faster model for this simple drafting task is a
  one-line env change, not a code change.
- Uses `output_config: { effort: "low" }` — this is a short text-formatting
  task, not a reasoning task, so low effort is the deliberate default.

If you touch this file, keep `buildFallbackMessage()` pure and exported —
`test/messageDraft.test.ts` tests it directly and tests `draftMessage()`'s
fallback path by unsetting `ANTHROPIC_API_KEY`, not by mocking the SDK.
Nothing in the test suite makes a real API call.

## Identity model (read before "fixing" this)

There is no login. An employee is identified by a free-text name plus a
random `edit_token` handed back after creating a request and embedded in the
URL they're told to save. This is intentional for this tool's risk tier
(SPEC non-goals) — don't add auth "for security" without first re-reading
why it was left out.

## Conventions

- Routes stay thin: validate input, call `repo.ts` / `services/`, render or
  redirect. SQL only lives in `repo.ts`.
- UI copy is Italian (real users). Docs (this file, SPEC.md, README.md) are
  English, matching the rest of this training repo.
- No test hits the real Anthropic API or spins up the Express server over
  HTTP — `test/` covers `services/` and `repo.ts` directly against an
  in-memory SQLite DB (`createDb(":memory:")`).
