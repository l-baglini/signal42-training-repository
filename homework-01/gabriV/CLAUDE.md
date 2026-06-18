# CLAUDE.md — Quake-Lite

Read this **before writing any code**, then read `SPEC.md` for the what and `BUILD_PLAN.md`
for the order. This file is the how: architecture, conventions, and the run/test loop.
It is written for an AI agent, not a human.

## What we're building
A stripped-down multiplayer arena FPS: Three.js front end, Go backend, room-based
multiplayer, localhost only. See `SPEC.md`. The guiding rule: **simplest thing that works
and is fun to demo.** When in doubt, choose the boring, naive option and add a one-line
comment saying you did it on purpose.

## Hard rules (do not violate)
- **Stick to the stack in SPEC §3.** Three.js via CDN import map (no bundler/npm), Go +
  `gorilla/websocket`, JSON over one WS per player. No other dependencies without a reason.
- **Respect the non-goals in SPEC §2.** No prediction, no server-authoritative movement,
  no DB, no matchmaking, no build step, no deploy/TLS. Movement is client-authoritative;
  the shooter claims hits and the server trusts it (with a trivial range check).
- **One source of truth for constants** (SPEC §5): `web/js/config.js` on the client, a Go
  `const` block in `internal/game` on the server. No scattered magic numbers.
- **Don't gold-plate.** If it isn't in SPEC §4 (MVP) it doesn't get built until §4.6
  passes. Stretch work is SPEC §9, in order.

## Architecture
Two halves talking JSON over one WebSocket per player.

**Server** = an HTTP server that serves the static `web/` directory + a REST lobby API +
a WS endpoint. Concurrency uses the classic **hub-per-room goroutine** pattern (like the
gorilla chat example) so game state is owned by a single goroutine and needs no locks:

- A global **Lobby** owns a map of rooms (guarded by a mutex; only touched by REST handlers
  and room create/teardown).
- Each **Room** runs **one goroutine** that `select`s over: an inbound message channel,
  a register channel, an unregister channel, and a 20Hz `time.Ticker`. It owns all player
  state for that room. On each tick it builds and broadcasts a `snapshot`.
- Each **Client** has two goroutines: a **read pump** (reads WS frames, decodes, forwards
  to the room's inbound channel) and a **write pump** (drains the client's buffered `send`
  channel to the socket). The room never writes to a socket directly — it pushes bytes onto
  each client's `send` channel.
- Game logic (damage, death, respawn, scoring) lives in `internal/game` as plain functions
  on plain structs, called only from the room goroutine — so it's lock-free and unit-testable.

**Client** = plain ES modules. A small state machine flips between **lobby** (DOM UI, REST
polling) and **game** (Three.js scene + pointer lock + WS). The local player is simulated
and rendered locally every animation frame; remote players are driven by `snapshot`
messages. The local player ignores its own entry in snapshots.

## File layout (create exactly this; keep files small and single-purpose)
```
quake-lite/
  SPEC.md  CLAUDE.md  BUILD_PLAN.md  README.md
  reports/                      # one step-NN-<slug>.md report per BUILD_PLAN step (see below)
  go.mod
  cmd/server/main.go            # flags (--addr :8080), routes, static serving, startup
  internal/
    protocol/protocol.go        # message structs + type constants (the wire contract, §6)
    game/
      config.go                 # Go const block — SPEC §5 constants
      state.go                  # Player struct; ApplyHit/Kill/Respawn/pickSpawn logic
      map.go                    # load map.json at startup, expose spawn points
    lobby/lobby.go              # Lobby: Create/List/Get rooms, mutex-guarded
    room/
      room.go                   # Room: run loop, ticker, snapshot build + broadcast
      client.go                 # Client: readPump/writePump, ws upgrade, join handshake
  web/
    index.html                  # import map for three; lobby + game DOM containers
    map.json                    # SPEC §7
    css/style.css
    js/
      config.js                 # client constants — SPEC §5
      main.js                   # entry; lobby<->game state machine
      lobby.js                  # room list UI, create/join, REST calls, polling
      net.js                    # WebSocket wrapper: connect, send(typed), onMessage dispatch
      game.js                   # three.js scene/renderer/render loop; wires modules together
      map.js                    # fetch map.json -> meshes + AABB collider list
      player.js                 # local controller: input, movement, gravity, AABB collision, camera
      remote.js                 # remote player meshes + name tags, updated from snapshots
      weapons.js                # fire cooldown, camera raycast vs remote colliders, tracers
      hud.js                    # crosshair, HP, kills, Tab scoreboard
```

## Conventions
- **Go:** `gofmt` clean; package names match folders; exported identifiers documented with
  a short comment; errors wrapped with context (`fmt.Errorf("...: %w", err)`); no global
  mutable state except the single `Lobby`. Channels for cross-goroutine comms, mutex only
  in `lobby`. Run `go vet ./...` before declaring a slice done.
- **JS:** ES modules with explicit `import`/`export`; `const`/`let`, never `var`; one
  responsibility per module; no global leakage (attach only a tiny `window.game` for
  debugging if needed). Keep Three.js objects (scene, camera, renderer) created once in
  `game.js` and passed in — don't reach for globals.
- **Protocol is the contract:** `internal/protocol/protocol.go` and `web/js/net.js` must
  agree exactly on every `"t"` value and field name in SPEC §6. If you change one, change
  both in the same step and note it.
- **Comments:** sparse, but always mark the deliberate naive choices ("client-authoritative
  — trusting the client on purpose, see SPEC §2").

## Run / test loop (use this constantly — it's how you verify)
From the repo root:
```bash
go run ./cmd/server            # serves http://localhost:8080 (HTTP + WS + static)
```
Then **open two browser tabs** at `http://localhost:8080` and drive both — this is the only
way to test multiplayer. After every meaningful slice, re-run and walk the relevant part of
the SPEC §4.6 acceptance test. Keep the browser devtools console open and the server logs
visible; **zero console errors and zero server panics** is part of done.

Quick checks you can automate:
```bash
go build ./... && go vet ./...        # compiles + static analysis
go test ./internal/game/...           # unit-test the damage/respawn logic if you add tests
curl -s localhost:8080/api/rooms      # lobby REST sanity
curl -s -XPOST localhost:8080/api/rooms -d '{"name":"test"}'
```
There is no front-end test runner — verify the client by playing it in two tabs. Prefer
making a change, running, and observing over guessing.

## Gotchas / decisions already made for you
- **Username is mandatory and validated on both sides** (SPEC §4.1): the client blocks
  Create/Join until a valid name is entered and never opens the WS without it; the server
  re-validates the `name` query param on WS upgrade and rejects the connection if it's
  missing/invalid. Derive deploy-readiness now: read `PORT`/`ADDR` from env with localhost
  defaults, and build the client WS URL from `window.location` (never hard-code localhost).
- **Pointer lock** only engages on a user click inside the canvas, and `Esc` releases it —
  don't try to auto-lock on load (browsers block it). Lobby screen must not be pointer-locked.
- **Three.js is loaded from a CDN via `<script type="importmap">`** in `index.html`. Import
  with the bare specifier `import * as THREE from 'three'` and addons from
  `'three/addons/...'`. No local copy, no npm.
- **Y is up** everywhere (Three.js convention). Keep server and client coordinates identical
  — the server just relays poses, so it never transforms them.
- **Collision is client-side AABB** against the boxes + bounds from `map.json`. Render meshes
  and colliders come from the *same* box data so they can't drift (SPEC §7).
- **Snapshots are lossy and naive** — if a `snapshot` arrives, replace remote state with it.
  Don't build prediction. Light lerp between the last two snapshots is the only smoothing,
  and it's a stretch goal.
- **Room lifecycle:** a room is created via REST (empty, listed in the lobby) and is torn
  down by its own goroutine when the last client unregisters. Don't delete a room from a
  REST handler while its goroutine is running — signal it instead.
- **WS write safety:** only the write pump writes to a given socket. Never write to a
  `*websocket.Conn` from two goroutines.

## When a slice is done
Re-read the matching SPEC §4 item and the relevant line(s) of §4.6, run the loop above,
confirm no console/server errors, then **write a step report** (below) and **stop for the
human to review** before starting the next step. Don't jump ahead to stretch goals until
the whole §4.6 acceptance test passes end to end.

## Step reports (required after every BUILD_PLAN step)
After finishing each step, before moving on, write a short report to
`reports/step-NN-<slug>.md` (e.g. `reports/step-02-fps-controller.md`). Keep it **small —
roughly 15–30 lines**. It is a status update for a human reviewer, not documentation.
**Then pause and wait for the human to say continue.** Use exactly this template:

```markdown
# Step NN — <title>

**Status:** done | done-with-caveats | blocked
**Date:** <yyyy-mm-dd>

## What I did
- <bullet per meaningful change: files added/changed and what each does>

## Why
- <which SPEC §/BUILD_PLAN step this satisfies, and any decision I had to make and why I
  chose it — especially anything where I picked one option over another>

## How (approach)
- <the technical approach in 2–4 bullets: key functions, data flow, the protocol messages
  touched, any library feature used>

## How I verified
- <the exact check from the step + the result. For multiplayer steps: "opened two tabs,
  observed X". Note `go build/vet` result and "zero console errors / zero panics".>

## Deviations / TODO / risks
- <anything I changed from the spec and why, anything left unfinished, anything the human
  should look at. "None" is a valid answer.>
```

Rules for reports:
- One file per step; don't overwrite earlier reports. If you revisit a step, append a
  dated `## Update` section to its existing file.
- Be honest in **Status** and **Deviations** — a caveat surfaced early is worth more than a
  clean-looking report. If you were blocked, say what you tried and what you need.
- The report reflects what you *actually ran and observed*, not what you intended.
