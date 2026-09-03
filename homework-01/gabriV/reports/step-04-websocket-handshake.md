# Step 04 — WebSocket connect + welcome handshake

**Status:** done
**Date:** 2026-06-12

## What I did
- `internal/protocol/protocol.go`: every SPEC §6 message struct + type constant
  (welcome/snapshot/joined/left/fired/killed/respawned + ClientMessage for
  state/fire/hit), plus Vec3 and the wire Player shape.
- `internal/game`: `state.go` Player struct + `NewPlayer`/`Wire`/`PickSpawn`;
  `map.go` loads map.json spawns at startup; color `Palette` in config.go.
- `internal/room/room.go`: room goroutine (register/unregister/inbound channels,
  no ticker yet) — assigns id/color/spawn, sends `welcome` (all players incl. you),
  broadcasts `joined`/`left`, tears down + removes itself from the lobby when the
  last client leaves. A `done` channel prevents register-after-teardown leaks.
- `internal/room/client.go`: `/ws?room=&name=` upgrade, **server-side username
  re-validation** with 1008 close + reason; read pump → room channel; write pump is
  the sole socket writer; non-blocking `trySend` drops frames to slow clients.
- `internal/lobby`: now creates/starts live rooms, lists real `PlayerCount()`.
- `web/js/net.js`: WS wrapper (URL from `window.location`, typed send, per-type
  dispatch). `main.js`: Join → connect → on `welcome` flip to game; close-before-
  welcome shows the reason in the lobby; disconnect after = full page reload (naive
  on purpose). `game.js` logs + records joined/left; player spawns at `welcome.you.pos`.

## Why
- BUILD_PLAN Step 4 / SPEC §4.1+§6. Decisions: fullness checked pre-register via the
  atomic count (tiny race accepted, commented); refusals upgrade-then-close so the
  browser gets a readable reason; welcome includes self in `players` (client ignores
  own id, same rule as snapshots).

## How I verified
- `go build/vet/gofmt` + `node --check` clean. Headless-Firefox suite, all green:
  hand-crafted WS with no/short/invalid name → close 1008 "invalid or missing
  username"; bad room → "room not found". UI join (alice): welcome with id/spawn/
  color, lobby hides, game starts. Second window (bob): alice records `joined`;
  closing bob's window records `left`; REST counts 2→1. Filled to 8 with raw
  sockets → 9th refused "room full" → counts back down. Closing everything: room
  logs "empty, shutting down" and the lobby lists []. Zero console errors, zero
  panics — log shows clean join/leave for all 9 players.

## Deviations / TODO / risks
- Disconnect-while-playing reloads the page rather than tearing the game down in
  place — simplest correct reset; revisit only if it bothers you in demos.
- No WS ping/pong keepalive (localhost MVP, commented). A hard-killed client would
  linger until TCP gives up — fine for two-tab demos.
