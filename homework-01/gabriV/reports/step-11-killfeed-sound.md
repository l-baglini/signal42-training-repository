# Step 11 — Kill feed + sound effects (stretch §9.2)

**Status:** done
**Date:** 2026-06-16

## What I did
- `web/js/sound.js` (new): `createSound()` — procedural WebAudio one-shot beeps,
  `fire()` (short square blip) and `kill()` (lower sawtooth thud). Lazy AudioContext,
  `resume()` on first gesture.
- `web/js/hud.js`: kill-feed overlay. New `addKill(killerId, victimId)` resolves names
  from the existing player list and appends a fading "X fragged Y" line (self-involved
  lines highlighted). Also added the `#killfeed` element.
- `web/js/weapons.js`: takes `sound`; plays `fire()` on every `fired` rebroadcast and
  calls `sound.resume()` on the fire mousedown (the unlock gesture).
- `web/js/game.js`: creates the sound, passes it to the weapon, and on `killed` triggers
  `hud.addKill(...)` + `sound.kill()`.
- `web/css/style.css`: top-right kill-feed stack with a 4s fade keyframe.

## Why
- SPEC §9.2. The `killed` message already carries victim+killer, and the HUD already held
  the player list — so name resolution needed no protocol or wiring change.

## How (approach)
- Sounds are oscillator+gain envelopes, no asset files (keeps the §2 "no assets" non-goal).
- Tracer and fire blip share the one `fired` code path, so everyone hears every shot once.
- Kill-feed lines self-remove via `setTimeout` after the CSS fade.

## How I verified
- `node --check` clean on all JS modules including `sound.js`.
- `go build/vet/test ./...` clean (no Go change here).
- Audio + feed rendering are inherently interactive; logic and syntax verified, a two-tab
  pass is the final visual/audible check.

## Deviations / TODO / risks
- Fire blip plays for every player's shot — fine for a small arena demo; could get busy
  with 8 players. Volume kept low (gain 0.07) to compensate.
