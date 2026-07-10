# Step 08 — HUD + scoreboard

**Status:** done
**Date:** 2026-06-12

## What I did
- `web/js/hud.js`: HP + kills readout (bottom-left; HP turns red at ≤34 — one shot
  from death) and a hold-**Tab** scoreboard (name/kills/deaths, sorted by kills, own
  row highlighted). Tab's default focus-move is suppressed; the board re-renders per
  snapshot only while open.
- `web/js/game.js`: snapshot handler feeds `hud.update(players)`; HUD seeded from
  `welcome.players` so it reads correctly before the first snapshot.
- CSS for the stats block and the scoreboard panel.

## Why
- BUILD_PLAN Step 8 / SPEC §4.5. HUD reads the same snapshot stream everything else
  uses — no separate score messages, nothing to drift.

## How I verified
- Two-tab suite: alice starts at "HP 100 / Kills 0". After her 3-shot kill the HUD
  shows **Kills 1**; bob's HUD shows **HP 0** (red) while dead and **HP 100** after
  respawn. Two hits on alice step her HUD 100 → 66 → 32, the red low-HP style
  appearing exactly at 32. Holding Tab shows alice (1/0, highlighted) sorted above
  bob (0/1); releasing Tab hides it. Screenshot confirms the full layout. Zero
  non-200, zero console errors, zero panics.

## Deviations / TODO / risks
- None. (Kill feed remains stretch §9.2.)
