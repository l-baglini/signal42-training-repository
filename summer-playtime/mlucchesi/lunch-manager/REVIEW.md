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

## Not chased further (accepted for this risk tier)

- No rate limiting / abuse protection on request creation — an internal
  tool with no auth, per SPEC non-goals.
- `edit_token` is a bearer secret in a URL (logs, browser history) rather
  than something more robust (e.g. hashed, short-lived) — acceptable for a
  low-stakes internal tool per SPEC's risk tier; would be the first thing to
  revisit if this ever left the office network.
