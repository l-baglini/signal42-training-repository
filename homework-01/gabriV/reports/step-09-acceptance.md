# Step 09 — Acceptance pass + cleanup

**Status:** done
**Date:** 2026-06-12

## What I did
- **Cleanup:** removed dead `Client.player` field (written, never read — player state
  lives in the room's map); client now honors `welcome.mapUrl` instead of hard-coding
  the map path (was the one unused wire field).
- **`internal/room/room_test.go`:** two goroutine-leak tests using real WS dials
  against an `httptest` server — 25 join/leave cycles × 2 clients (rooms torn down
  each cycle) and 75 rejected connects across all three refusal paths; both settle
  back to baseline goroutine counts.
- **`README.md`:** what-it-is, `go run ./cmd/server`, two-tabs instructions,
  controls, test command.

## How I verified — full SPEC §4.6 walk (two headless-Firefox tabs)
All eight items pass:
0. Empty/too-short/bad-char usernames block Create/Join with inline messages; valid
   unblocks. Hand-crafted WS with no/invalid `name` → close 1008 "invalid or missing
   username".
1. Tab 1 created "test" via the UI; tab 2's list showed it in **1.2s**.
2. Both tabs joined as alice/bob, distinct ids, both at corner spawn points.
3. Each tab watched the other drive in real time (~21 snapshot samples sweeping z 9→3.6
   in both directions).
4. Both tabs: stopped by the central platform at exactly x=−3.4 and by the arena bound
   at exactly z=−24.6.
5. 3 shots: victim HP 66→32→0, death, killer's kills → 1, respawn ~2s at 100 HP.
6. Tab scoreboard: alice 1/0 above bob 0/1.
7. Closing tab 2 removed bob from tab 1's view; the room vanished from the lobby
   once empty (server log: "empty, shutting down").
8. Zero page errors (error/unhandledrejection traps in both tabs stayed empty);
   zero server panics. `go build/vet/gofmt/test ./...` all clean.

Note: two assertion mismatches during the run were caused by a *live human game*
running in the lobby at the same time (room "room", 2 players) — the test expected a
pristine lobby. Filtered to the test's own room, both items pass; the live room was
left untouched and the server was not restarted.

## Deviations / TODO / risks
- None outstanding for the MVP. **§4.6 passes end to end — this is the MVP; stopping
  here per BUILD_PLAN.** Stretch goals (SPEC §9, starting with snapshot interpolation)
  await an explicit go-ahead.
