# Step 06 — Shooting + tracers (visual only)

**Status:** done
**Date:** 2026-06-12

## What I did
- `web/js/weapons.js`: left-click fire gated on pointer lock (the locking click never
  fires) with the 150ms cooldown; `fire` sends origin + camera direction; `fired`
  handler draws a 90ms yellow tracer whose endpoint comes from a ray vs map meshes +
  remote capsules (max `weaponRange` 60, new in config.js).
- `internal/room/room.go`: `fire` → rebroadcast as `fired` (with shooter id) to
  everyone **including the shooter** — one tracer code path for all clients; dead
  players' shots are dropped (no-op until Step 7 introduces death).
- `web/js/game.js`: weapon wired into the module graph and the debug handle.

## Why
- BUILD_PLAN Step 6 / SPEC §4.4 + §6.2/§6.3. Drawing the shooter's own tracer from the
  rebroadcast (not locally) keeps a single code path; localhost latency hides it.
  Tracer start is nudged forward/down from the camera so your own shot is visible.

## How I verified
- Headless two-tab suite: burst of 10 `fire()` calls in 40ms → **exactly 1 sent**
  (cooldown), refire after 150ms succeeds. Alice fired 4 shots: **exactly 4 tracers
  entered her scene and exactly 4 entered bob's** (counted via a scene.add hook in
  each tab), and a tracer was present in-scene 30ms after firing. Screenshot shows
  the yellow tracer in first-person view. Zero non-200, zero panics, clean teardown.
- First test run reported zero tracers — both counts were my harness's fault (counted
  after the 90ms lifetime; patched a function the closure doesn't call through).
  Re-tested with in-window counting; code was correct throughout.

## Deviations / TODO / risks
- `weaponRange: 60` exists client-side only until Step 7 adds the matching Go const
  for the hit-claim range check — flagged so the constants tables don't look skewed.
- Tracers are plain 1px `THREE.Line`s — visible but subtle; easy to thicken/brighten
  later if the demo wants more pop.
