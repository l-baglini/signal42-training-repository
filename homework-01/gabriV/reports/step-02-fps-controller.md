# Step 02 — First-person controller

**Status:** done
**Date:** 2026-06-12

## What I did
- `web/js/config.js`: full SPEC §5 constant table client-side (move 7 u/s, jump 6,
  gravity 18, eye 1.7, etc.) plus mouse sensitivity and the player AABB (r 0.4, h 1.8).
- `web/js/player.js`: manual yaw/pitch mouse-look under pointer lock, WASD relative to
  yaw, Space jump + gravity, axis-separated AABB collision vs map colliders, bounds clamp
  for walls/floor/ceiling. Camera follows feet pos + eye height.
- `web/js/hud.js` + CSS: centered crosshair overlay (`pointer-events: none`).
- `web/js/game.js`: wires player + HUD into the render loop with a clamped-dt clock.

## Why
- BUILD_PLAN Step 2 / SPEC §4.2. Decisions: **manual yaw/pitch** over PointerLockControls
  (fewer addon-API moving parts, trivial to feed yaw into movement); **instant
  accel/stop** for brisk Quake-ish feel (simplest, comment marks it deliberate); keys not
  gated on pointer lock (game view only exists while playing; keeps controller testable).

## How (approach)
- Move per axis then push out of overlapping AABBs — axis separation gives wall-sliding
  for free. Landing on box tops / floor sets `onGround`; bounds are clamped directly
  (same planes the wall meshes sit on). No protocol messages yet.

## How I verified
- Scripted headless Firefox (geckodriver + synthetic key events), all checks green:
  spawn falls and lands at y=0; W for 0.5s moves −3.61 z (≈7 u/s) with zero x drift;
  driving into the central platform stops at exactly x=−3.4 (face − radius); bounds
  clamp at exactly z=−24.6; jump peaks 0.94 (analytic 1.0) and lands; dropping onto a
  low platform rests on its top (y=1). **A trusted WebDriver click engaged real pointer
  lock on the canvas.** Crosshair present, zero non-200 fetches, no server panics.
- Screenshot confirms first-person view at eye height with crosshair.

## Deviations / TODO / risks
- Mouse-look *feel* (sensitivity 0.002, pitch clamp) can't be exercised synthetically —
  Firefox ignores constructed `movementX`. Worth a human lap around the arena; Esc
  release is browser-native so it needs no code.
- Map cover update done in the same pass — see the dated update in step-01's report.
