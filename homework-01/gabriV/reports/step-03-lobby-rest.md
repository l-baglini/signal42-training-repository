# Step 03 — Lobby UI + REST API

**Status:** done
**Date:** 2026-06-12

## What I did
- `internal/game/config.go`: SPEC §5 Go const block (MaxPlayers, TickInterval, HP,
  damage, RespawnDelay) — added now because the lobby listing needs `MaxPlayers`.
- `internal/protocol/protocol.go`: `ValidUsername` (SPEC §4.1 regex) — the shared rule
  the WS upgrade will enforce in Step 4; mirrored in `lobby.js`.
- `internal/lobby/lobby.go`: mutex-guarded registry — Create (1–32 char name, random
  `r_xxxxxx` id), List (sorted, `players:0` until live rooms attach), Get, Remove.
- `cmd/server/main.go`: `GET/POST /api/rooms` handlers (Go 1.22 method routing) + a
  `writeJSON` helper; 400s with `{"error":...}` for bad input.
- `web/js/lobby.js`: username input with inline validation gating Create/Join,
  localStorage pre-fill, 2s room polling, create form, join buttons (Full disables).
- `web/js/main.js`: lobby↔game state machine; Join hides lobby, stops polling, starts
  the (still local-only) game. CSS for the lobby panel.

## Why
- BUILD_PLAN Step 3 / SPEC §4.1 + §6.1. Decision: on Join the client flips straight to
  the local game view — the WS handshake replaces that seam in Step 4.

## How (approach)
- Client validates `[A-Za-z0-9_-]{2,16}` on every input event and on click (belt and
  braces); server holds the same rule in `protocol` for the Step 4 WS rejection.
- Rooms list is re-rendered per poll; button disabled state derives from username
  validity + room fullness each render.

## How I verified
- `go build/vet/gofmt` clean. curl: empty list `{"rooms":[]}`, create → id/name, blank
  name → 400, malformed JSON → 400, list shows `players:0,max:8`.
- Two headless-Firefox windows: empty/too-short/bad-char usernames disable Create+Join
  with the right inline message; "alice" unblocks. Window 1 creates "dm-tower";
  **window 2's poll shows it after 1.0s**. Window 2 joins as "bob": lobby hides, canvas
  + crosshair up, zero non-200, zero server panics. Lobby screenshot looks right.

## Deviations / TODO / risks
- `DELETE /api/rooms` yields 404 (not 405) — the `/` file-server pattern catches
  non-GET/POST methods. Out-of-spec surface; left as is.
- Room `players` is hardcoded 0 until rooms hold live clients (Step 5 wires counts).
