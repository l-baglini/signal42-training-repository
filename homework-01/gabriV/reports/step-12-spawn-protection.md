# Step 12 — Spawn protection + enemy-avoiding spawns (stretch §9.5)

**Status:** done
**Date:** 2026-06-16

## What I did
- `internal/protocol/protocol.go`: added `Protected bool` to the wire `Player`.
- `internal/game/config.go`: added `SpawnProtect = 1 * time.Second`.
- `internal/game/state.go`: `Player.SpawnProtectedUntil`; set by `NewPlayer` and
  `Respawn`. `Wire(now)` now takes a timestamp and stamps `Protected = now.Before(...)`.
  New `PickSpawnAway(m, enemies)` picks the spawn whose nearest enemy is farthest away.
- `internal/room/room.go`: spawn on join/respawn uses `PickSpawnAway` with living
  enemies; `handleHit` ignores hits on a protected victim; all `Wire()` calls pass one
  consistent `time.Now()` per snapshot. Added `enemyPositions(exclude)` helper.
- Client: `web/js/config.js` `spawnProtectMs: 1000`; `remote.js` renders protected
  players translucent; `hud.js` shows a "SPAWN PROTECTED" indicator for the local player.
- Tests: `state_test.go` adds `TestSpawnProtection` and `TestPickSpawnAway`.

## Why
- SPEC §9.5. Server is the source of truth for invulnerability (the `protected` flag is
  derived per-snapshot so it can't drift); the client only renders it. Spawn protection
  is enforced in the room layer, not `ApplyHit`, so the pure damage unit tests stay valid.

## How (approach)
- `Wire(now)` signature change touches only `room.go` (4 call sites) — tests don't use it.
- `PickSpawnAway` maximizes the min-distance to any living enemy; no enemies → random.

## How I verified
- `gofmt`/`go build`/`go vet`/`go test ./...` all clean (new tests pass).
- Live two-client WS check: both spawned `protected:true`; alice at corner (20,20), bob
  pushed to the opposite corner (-20,-20) — enemy-avoid confirmed. Field serializes on
  `welcome` and `snapshot`. Clean join/leave/teardown in the server log, zero panics.

## Deviations / TODO / risks
- The shooter can still raycast/claim a hit on a protected player; the server silently
  drops it (source of truth). Left as-is — naive and correct per §2/§6.3.
