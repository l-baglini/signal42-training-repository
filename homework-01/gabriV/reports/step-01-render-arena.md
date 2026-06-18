# Step 01 — Render the arena

**Status:** done
**Date:** 2026-06-12

## What I did
- `web/map.json`: real "dm-tower" map per SPEC §7 — bounds ±25 (y 0–20), 7 obstacle
  boxes (central 6×2×6 platform, two 4×1×4 low platforms, two 2×2×2 cubes, two 8×3×1
  cover walls), 4 corner spawns at y 1.7.
- `web/js/map.js`: fetches map.json; builds floor (+grid for motion readability),
  four bounding-wall meshes, and one mesh **plus one AABB collider per box from the
  same numbers**. Returns `{name, bounds, spawns, group, colliders}`.
- `web/js/game.js`: scene, perspective camera (fixed, inside the arena), antialiased
  renderer sized to the window with a resize handler, hemisphere + directional light,
  render loop via `setAnimationLoop`. Exposes `window.game` as the debug handle.
- `web/js/main.js`: boots straight into `startGame` (state machine comes at Step 3).
- `css/style.css`: full-viewport `#game`, block-level canvas, `overflow: hidden`.

## Why
- BUILD_PLAN Step 1 / SPEC §4.2 arena + §7 map format. Decisions: bounding walls are
  render-only (the player will clamp to `bounds` in Step 2 — same planes, can't drift);
  wall meshes sit just outside bounds so their inner faces lie exactly on the bound planes.

## How (approach)
- Meshes and colliders both derive from each box's `pos`/`size` (centred AABB, full
  extents) so render and collision never disagree. No protocol messages touched.

## How I verified
- Headless Firefox via geckodriver: `window.game` up, scene populated, `map.name`
  "dm-tower", 7 colliders, 4 spawns, canvas rendering at 1280×714, **zero non-200
  fetches**. Screenshot confirms the arena visually (floor grid, walls, all 7 boxes).
- `node --check` clean on changed modules; map.json parses; server log still panic-free.
- One iteration: the first fixed camera sat outside the 20-unit walls and saw only
  their back faces — caught via screenshot, moved the camera inside the arena.

## Deviations / TODO / risks
- Added a `GridHelper` on the floor (not in spec) — a featureless dark floor made
  motion unreadable; one line, render-only.
- Walls render at full bounds height (20u), so the arena reads as a box canyon from
  inside. Fine for gameplay; flagging in case you want shorter visual walls.

## Update — 2026-06-12 (reviewer request: more cover)
- Grew `map.json` from 7 to 15 boxes: a 2×2×2 cover crate near each corner spawn,
  two 1×2.5×6 cover walls on the east/west lanes (x ±18), and two 1.5×4×1.5 pillars
  flanking the central platform diagonals. Colliders update automatically since they
  derive from the same box data. Verified in-browser alongside Step 2.
