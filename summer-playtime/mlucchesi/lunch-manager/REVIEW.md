# Review pass

The AI-built code above went through a `/code-review` pass (medium effort,
correctness + simplification) plus manual checks before being called done.

## Findings from the automated review — both fixed

1. **`POST /manager/venues` accepted invalid cutoff times.** The venue-creation
   route validated `cutoffTime` with a looser `\d{2}:\d{2}` regex than the
   `TIME_RE` that `cutoffInstant()` actually requires (`00`–`23`, `00`–`59`).
   A value like `99:99` — from anything that skips the browser's
   `<input type="time">`, not just a malicious client — would be persisted,
   then blow up `cutoffInstant()` on every subsequent `GET /order` for *every*
   venue, since there's no error-handling middleware to contain it.
   **Fix:** exported `TIME_RE`/`isValidCutoffTime()` from `cutoff.ts` and made
   the route use the same check `cutoffInstant()` relies on, so there's one
   definition of "valid cutoff time," not two. Added regression tests for
   `99:99`, `24:00`, `10:60`.

2. **"Mark sent" had no way back.** The manager dashboard's button relabels
   itself to "Segna come da inviare" (mark as to-send) once a venue is
   marked sent, but the handler only ever called `markSent` — clicking it
   again did nothing, so the badge could never be undone from the UI.
   **Fix:** added `unmarkSent()` and made the route toggle based on the
   current `isSent()` state. Added a repo test for the round trip.

## Manually checked

- Full flow exercised by hand over HTTP (`npm run dev` + `curl`): create an
  order, view/edit/cancel it via its edit link, manager dashboard grouping
  and headcount, message generation (fallback path — no API key set),
  toggling the sent flag.
- `docker compose up --build` — image builds (native `better-sqlite3`
  compiles cleanly on `node:20-alpine`), container serves `/health` and
  `/order`.
- `npm audit`: found 8 vulnerabilities in the initial dependency versions
  (outdated `express`→`qs` chain, outdated `vitest`/`esbuild`, a very stale
  `@anthropic-ai/sdk` pin that also lacked types for `output_config`) —
  bumped all three; `npm audit` is now clean.
- Read every route for the cutoff check specifically (the one property the
  SPEC calls out as load-bearing): `employee.ts` checks `isPastCutoff()` on
  every create/edit path, not just on the initial page render.

## Round 2 — the "menu items" feature (free-text order → fixed menu + note)

A second `/code-review` pass after replacing the free-text order field with
a per-venue multiple-choice menu (+ optional note) found two more issues,
both fixed:

3. **Schema change wouldn't reach an existing database file.** `db.ts`'s
   `CREATE TABLE IF NOT EXISTS requests (...)` was updated to the new
   `dish`/`note` columns, but `IF NOT EXISTS` is a no-op against any database
   file that already had the old `order_text` column — a real risk given the
   Docker Compose setup persists SQLite in a named volume across restarts.
   Reproduced: built the old schema in a file, ran the new `createDb()`
   against it, got `table requests has no column named dish` on the next
   `createRequest()`. **Fix:** added a small one-off `migrateRequestsTable()`
   repair (checked via `PRAGMA table_info`, not a general migrations
   framework — SPEC's non-goal is about not building versioned up/down
   migration tooling, not about ignoring a reproduced data-loss bug) that
   adds the new columns and backfills `dish` from `order_text` when it finds
   the old shape. Covered by `test/db.test.ts` against a real on-disk SQLite
   file (in-memory DBs can't exercise "reopen an existing file").
4. **Menu items could be duplicated.** `addMenuItem()` had no uniqueness
   check, so double-submitting "Aggiungi piatto" created two identical,
   indistinguishable radio options for the same dish. **Fix:** `addMenuItem`
   now returns the existing active item instead of inserting a duplicate
   when the name already exists for that venue (still allowed across
   different venues). Covered by two repo tests.

## Not chased further (accepted for this risk tier)

- No rate limiting / abuse protection on request creation — an internal
  tool with no auth, per SPEC non-goals.
- `edit_token` is a bearer secret in a URL (logs, browser history) rather
  than something more robust (e.g. hashed, short-lived) — acceptable for a
  low-stakes internal tool per SPEC's risk tier; would be the first thing to
  revisit if this ever left the office network.
