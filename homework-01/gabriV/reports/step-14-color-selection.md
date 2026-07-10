# Step 14 — Per-player colour selection (unique per room)

**Status:** done
**Date:** 2026-06-18

## What I did
- Server:
  - `internal/game/state.go`: `ValidColor` + `PickColor(requested, taken)` — honour a
    free, valid request, else first free palette colour. `state_test.go`: `TestPickColor`.
  - `internal/room/client.go`: read optional `color` query param into `Client.color`.
  - `internal/room/room.go`: resolve colour via `PickColor` on join (dropped the old
    `joinSeq` palette cycling); publish an atomic `colors` mirror on join/leave;
    `TakenColors()` for the lobby.
  - `internal/lobby/lobby.go`: REST `Info.Colors` lists each room's taken colours.
- Client:
  - `web/js/config.js`: `palette` (mirrors `game.Palette`).
  - `web/js/lobby.js`: swatch picker (persisted via `settings`); per-room taken-colour
    dots; a room's Join is blocked ("Colour in use") when your colour is taken there.
  - `web/js/net.js` + `main.js`: pass the chosen colour on connect.
  - `web/css/style.css`: swatches + dots.

## Why
- Requested: pick your colour before entering, choosing only colours not already taken.
  Colours are unique *per room*, so availability is enforced per room (Join gating) with
  the server as authority — the picker stays simple, the rooms gate. Palette size (8) ==
  max players, so a non-full room always has a free colour.

## How (approach)
- Server is authoritative: client requests a colour, the room goroutine assigns it if free
  else falls back — guarantees in-room uniqueness even under a simultaneous-pick race.
- Lobby `colors[]` rides the existing 2s room poll; no new endpoint.

## How I verified
- `go build/vet/test ./...` + `gofmt` clean; `node --check` clean on all JS.
- Live 3-client WS test: alice requested `#4363d8` → got it; bob requested the **same** →
  reassigned `#e6194b`; carol sent an invalid colour → `#3cb44b`. REST showed
  `"colors":["#4363d8","#e6194b","#3cb44b"]` while connected and the room tore down to
  empty after they left. Zero panics.

## Deviations / TODO / risks
- The picker is global; per-room enforcement happens on the Join buttons (disabled +
  "Colour in use") rather than greying swatches, since availability differs per room.
  If you'd prefer the swatches themselves to grey out against a specific room, that's a
  small follow-up.
