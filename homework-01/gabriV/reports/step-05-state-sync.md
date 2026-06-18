# Step 05 — State sync: see other players move

**Status:** done
**Date:** 2026-06-12

## What I did
- `internal/room/room.go`: 20Hz `time.Ticker` in the run loop; each tick broadcasts a
  `snapshot` of every player (clients ignore their own entry). Inbound messages now
  decode `protocol.ClientMessage`; `state` updates the sender's pos/yaw/pitch —
  client-authoritative, relayed untransformed (commented per SPEC §2).
- `web/js/player.js`: streams `state` at a fixed 30Hz via `net.send`.
- `web/js/remote.js`: capsule mesh (same dimensions as the local AABB) + canvas-sprite
  name tag per remote player; `applySnapshot` replaces pose wholesale (no lerp — that's
  stretch §9.1), creates newcomers, removes anyone absent; `left` also removes directly.
- `web/js/game.js`: wires snapshot/joined/left to the remotes registry; seeds remotes
  from `welcome.players`; debug `stats.snapshots` counter.

## Why
- BUILD_PLAN Step 5 / SPEC §4.3 + §6.2. Removal works both ways (absent-from-snapshot
  and explicit `left`) so a missed message can't leave a ghost mesh.

## How I verified
- Two headless-Firefox tabs (alice + bob in room "sync2"):
  - Snapshot rate measured at **exactly 20/s** in alice's tab.
  - Alice's remotes contain **only bob's id** — her own snapshot entry is ignored.
  - Bob teleported to a clear lane and held W for 1s: his z went 4 → −3 (7 u/s ✓);
    alice's page recorded a **30-snapshot sweep 4 → −3 in real time** (recorded inside
    her page, since a backgrounded tab pauses rendering but still applies snapshots).
  - Screenshot: bob's green capsule + "bob" name tag in alice's view.
  - Closing bob's tab removes his mesh (`remotes.ids() == []`); room empties and
    vanishes from the lobby. Zero non-200, zero console errors, zero panics.

## Deviations / TODO / risks
- Remote pose snapping is intentionally raw — interpolation is stretch §9.1.
- Test note: driving a *backgrounded* tab is impossible (rAF pauses), so one tab drove
  while the other recorded; the human two-window check will look smoother than tests
  can show.
