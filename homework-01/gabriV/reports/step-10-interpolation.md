# Step 10 — Snapshot interpolation (stretch §9.1)

**Status:** done
**Date:** 2026-06-16

## What I did
- `web/js/remote.js`: each remote now keeps a small timestamped pose buffer instead of
  snapping. New `update(now)` lerps position + (shortest-path) yaw between the two
  buffered samples bracketing `now - interpDelayMs`. State (alive/color/protected) is
  still replaced wholesale per snapshot; only pose is interpolated.
- `web/js/game.js`: render loop calls `remotes.update(performance.now())` each frame.
- `web/js/config.js`: added `interpDelayMs: 100`.

## Why
- SPEC §9.1, the first stretch goal: kill the visible snapping of other players. 100ms
  (= 2 server ticks at 20Hz) guarantees two snapshots almost always bracket the render
  instant, so we interpolate rather than guess.

## How (approach)
- Buffer capped at 6 samples (~300ms history). Below the oldest sample or past the newest
  we clamp to that sample — **no extrapolation/prediction** (keeps the SPEC §2 non-goal).
- Yaw uses a shortest-path angle lerp so wrapping past ±π doesn't spin the long way.
- `add()` seeds the group position from the first pose to avoid a one-frame flash at origin.

## How I verified
- `node --check` clean on all JS modules; `go build/vet/test ./...` clean (no Go change here).
- Smoke: ran the server, dialed clients, snapshots flow at 20Hz; render loop consumes them.
- Two-tab visual confirmation of smoothness is best done interactively by the reviewer.

## Deviations / TODO / risks
- Visual smoothness wasn't machine-verified (no browser driver in this run) — worth a
  quick two-tab look. Logic, wiring, and syntax are verified.
