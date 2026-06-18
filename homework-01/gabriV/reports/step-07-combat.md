# Step 07 — Damage, death, respawn, scoring

**Status:** done
**Date:** 2026-06-12

## What I did
- `internal/game/state.go`: `ApplyHit` (34 dmg, kill at 0), `RecordKill` (self-kill =
  death only), `Respawn` (full HP at spawn), `WithinRange` (the entire anti-cheat,
  SPEC §6.3); `RespawnAt` field on Player. `MaxWeaponRange = 60.0` in config.go.
- `internal/game/state_test.go`: 5 unit tests (3-hits-kill, corpse-hit noop, kill/
  self-kill recording, respawn restore, range edge cases).
- `internal/room/room.go`: `hit` claims validated (victim exists / not self / alive /
  in range) then applied; on death broadcasts `killed`, schedules `RespawnAt`; the
  20Hz tick sweeps due respawns and broadcasts `respawned` — all timing stays inside
  the room goroutine, no per-player timers.
- `web/js/weapons.js`: fire raycasts map meshes + **alive** remote capsules (raycaster
  ignores visibility, so dead players are excluded explicitly); closest hit wins so
  walls block; a capsule hit sends `hit{target}` via `userData.playerId`. Dead players
  can't fire (both client guard and the server drop).
- `web/js/player.js` + `game.js`: on `killed` (victim = me) the local player freezes;
  on `respawned` it teleports to the server's spawn and unfreezes. Snapshots now feed
  `game.you` (own HP/score — the Step 8 HUD source). Remote corpses hide via `alive`.

## Why
- BUILD_PLAN Step 7 / SPEC §4.4 + §6.3. Respawn-on-tick keeps the room single-threaded
  (50ms granularity on a 2000ms delay is noise). Death = frozen camera, no death screen
  — simplest thing that reads clearly in a demo.

## How I verified
- `go test ./internal/game/...` — 5/5 pass; build/vet/gofmt clean.
- Two-tab suite: forged `hit` claim at 68u rejected (bob stayed 100 HP; server logged
  "hit claim out of range"). Three real shots: bob's HP stepped **66 → 32 → 0**,
  `killed{victim:bob, killer:alice}` reached both tabs, alice's kills hit 1, bob's
  deaths hit 1, his mesh vanished from alice's view and his controller froze. ~2s
  later he respawned at a corner spawn with 100 HP, alive and visible to alice; his
  local player teleported there. Zero non-200, zero console errors, zero panics.
  Server log reads: "alice fragged bob (1 kills)" → "p_a771 respawned".

## Deviations / TODO / risks
- Death UX is a frozen camera (no overlay/announcement) — kill feed is stretch §9.2;
  Step 8's HUD will at least show HP 0.
- In-arena distances rarely exceed 60u (only far corner-to-corner), so the range check
  mostly guards forged claims — which is exactly its SPEC §6.3 job.
