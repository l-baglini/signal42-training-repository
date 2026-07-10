# Step 13 — Per-player mouse sensitivity

**Status:** done
**Date:** 2026-06-18

## What I did
- `web/js/settings.js` (new): persisted per-browser preferences (sensitivity + colour)
  cached in memory, backed by `localStorage`, clamped to `CONFIG.sensMin/sensMax`.
- `web/js/player.js`: mouse-look now reads `settings.sensitivity` live instead of the
  fixed `CONFIG.mouseSensitivity`.
- `web/js/lobby.js`: a sensitivity slider in the main menu, wired to `settings`.
- `web/js/options.js` (new) + `game.js`: an in-game pause/options overlay carrying the
  same slider, shown whenever the mouse is released after the first lock, hidden on re-lock.
- `web/js/config.js`, `web/css/style.css`: slider bounds + overlay/slider styles.

## Why
- Requested: every player sets their own sensitivity, in the menu and during a game.
  One persisted value shared by both UIs avoids divergence. Pointer lock can only be
  re-acquired by a click, so "released mouse = paused" is the natural in-game entry point.

## How (approach)
- Single source of truth: `settings.sensitivity`; both sliders call `setSensitivity`,
  `player.js` reads it each `mousemove` (cheap, in-memory).
- The overlay tracks a `hasLocked` flag so it only appears as a *pause* menu, not on the
  initial pre-lock screen, preserving the existing click-to-play flow.

## How I verified
- `node --check` clean on all JS; `go build/vet/test ./...` clean (no Go change here).
- Lobby + overlay sliders both mutate the same persisted value; the live read path is the
  same one the game already uses for look. Feel is best confirmed by the reviewer in-game.

## Deviations / TODO / risks
- Sensitivity range (0.0004–0.006) is a guess for "feels reasonable"; tune in `config.js`
  if needed. The overlay doubles as a pause menu — intended, not a side effect.
