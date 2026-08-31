# Step 15 — Match lifecycle (5-min timer, 20-kill target, end scoreboard)

**Status:** done
**Date:** 2026-06-18

## What I did
- Server:
  - `internal/game/config.go`: `MinPlayers=2`, `MatchDuration=5m`, `KillTarget=20`,
    `PostMatchDelay=8s`.
  - `internal/game/match.go` (new): pure `ShouldStart` + `MatchOver` rules. Tested in
    `match_test.go`.
  - `internal/protocol/protocol.go`: `Match` block (phase/timeLeft/target) on
    `welcome`+`snapshot`; new `gameover` message (reason + final standings).
  - `internal/room/room.go`: a `waiting → active → finished` phase machine. `tick()`
    starts the match at 2 players, ends it on time/frags, freezes snapshots when
    finished, and signals shutdown after the post-match delay. `finish()` broadcasts
    `gameover` and delists the room; `shutdown()` closes all sockets. Fire/hit are
    ignored outside `active`. White-box `match_test.go` covers finish + teardown.
- Client:
  - `web/js/hud.js`: top-centre countdown + status ("Waiting for players (n/2)" /
    "First to 20 kills"); `gameover` overlay with final standings, reused board render.
  - `web/js/game.js`: feeds `match` to the HUD; on `gameover` frees the mouse, disables
    the pause overlay, freezes the player, shows the scoreboard.
  - `web/js/options.js`: `disable()` so the pause overlay yields to the game-over screen.
  - `web/css/style.css`: timer + game-over overlay styles.

## Why
- Requested: timed deathmatch starting at 2 players, ending at 5 min or 20 kills, then a
  scoreboard and back to the lobby with the room closed. The server stays authoritative;
  the existing "server closes socket → client reloads to lobby" path handles the return.

## How (approach)
- Match state lives in the room goroutine (lock-free, like all room state); the 20Hz
  ticker drives every transition.
- Returning to the lobby reuses `main.js`'s reload-on-close — the server holds the socket
  open for `PostMatchDelay` so the scoreboard stays visible, then closes it.
- Delisting at `finish()` keeps new players out of the post-match screen.

## How I verified
- `gofmt`/`go build`/`go vet`/`go test ./...` clean. New tests: `TestShouldStart`,
  `TestMatchOver`, `TestMatchTimeEndAndTeardown`, `TestFragsEnd` (gameover broadcast +
  reason, single lobby delist, sockets closed on shutdown).
- Live 2-client WS harness: 1 player → `phase:waiting, timeLeft:300, target:20`; 2nd
  player → `phase:active` immediately. Server logged "match started (2 players, first to
  20 kills or 5m0s)". Zero panics.

## Deviations / TODO / risks
- The full 5-min/20-kill *real-time* termination wasn't played out live (slow); it's
  covered by the white-box finish/teardown tests + the live start transition.
- If players drop to 1 mid-match the match keeps running (ends on time); not specified,
  chose the simplest behaviour. "Waiting for players (n/2)" hardcodes 2 (= MinPlayers).
