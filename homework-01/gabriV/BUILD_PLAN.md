# BUILD_PLAN.md — Quake-Lite

Build in **thin vertical slices**, each one runnable and verifiable before the next.
Read `CLAUDE.md` and `SPEC.md` first.

**The loop for every step:**
1. Build the slice.
2. Run `go run ./cmd/server`, open the browser (two tabs once multiplayer exists), confirm
   the step's **check**, and confirm **no browser console errors and no server panics**.
3. Write a **step report** to `reports/step-NN-<slug>.md` using the template in CLAUDE.md
   (what / why / how / how-verified / deviations — ~15–30 lines).
4. **Stop and wait for the human to review before starting the next step.**

Don't skip ahead. Don't start stretch goals (SPEC §9) until Step 9's acceptance test fully
passes.

---

## Step 0 — Skeleton that serves a page
- `go mod init quakelite`; add `gorilla/websocket`.
- `cmd/server/main.go`: `net/http` server on `--addr :8080`, serving `web/` as static
  files. Stub `web/index.html` with the Three.js **import map** and an empty `<div>`.
- Create the empty file layout from CLAUDE.md (empty modules with their `export`s).
- **Check:** `go run ./cmd/server`, open `localhost:8080`, the page loads, no 404s, no
  console errors.

## Step 1 — Render the arena (single player, no server gameplay)
- `web/map.json` per SPEC §7. `web/js/map.js` fetches it and builds floor, bounding walls,
  and box meshes; also returns the list of AABB colliders.
- `game.js`: Three.js scene, renderer, camera, a light, render loop. Add the map.
- **Check:** you see a 3D arena from a fixed camera. No errors.

## Step 2 — First-person controller (local only)
- `player.js`: pointer-lock mouse-look (addons `PointerLockControls` or manual yaw/pitch),
  WASD relative to look, gravity + Space jump, AABB collision vs map colliders + bounds.
  Eye height and tuning from `config.js` (SPEC §5).
- `hud.js`: draw a crosshair.
- **Check:** click to lock, walk/look/jump around the arena, can't pass walls/boxes or
  leave bounds, `Esc` releases the mouse.

## Step 3 — Lobby UI talking to a real REST API (no game yet)
- Server: `internal/lobby/lobby.go` (mutex-guarded room registry) + REST handlers in
  `main.go`: `GET /api/rooms`, `POST /api/rooms` (SPEC §6.1). Rooms can be empty shells
  for now.
- Client: `lobby.js` renders the **mandatory username** input, room list (polls every 2s),
  create form, join buttons. `main.js` state machine shows lobby vs game containers.
  Enforce username validation (SPEC §4.1): block Create/Join until a valid name is entered,
  show inline errors, optionally pre-fill from `localStorage`.
- Server: validate the `name` on the REST/WS path too (the WS rejection lands in Step 4).
- **Check:** empty/invalid username blocks Create/Join with a message; a valid one unblocks.
  Create a room in one tab, see it appear in another tab's list within ~2s via `curl` and UI.

## Step 4 — WebSocket connect + welcome handshake
- `internal/protocol/protocol.go`: all message structs + type constants (SPEC §6).
- `room/client.go`: WS upgrade at `/ws?room=&name=`, **reject the connection if `name` is
  missing or fails validation** (SPEC §4.1), read/write pumps, register with room.
- `room/room.go`: room goroutine with inbound/register/unregister channels (no ticker yet);
  assigns id + colour + spawn, sends `welcome`, broadcasts `joined`/`left`.
- `net.js`: WS wrapper (connect, typed `send`, `onMessage` dispatch). On "Join", connect and
  switch to the game view.
- **Check:** joining logs a `welcome` with your id/spawn; a second tab joining triggers a
  `joined` in the first; closing a tab triggers `left`. Room appears/disappears in lobby.

## Step 5 — State sync: see other players move
- Client sends `state` (pose) ~30Hz from `player.js` via `net.js`.
- Room stores latest pose per player; ticker at 20Hz builds + broadcasts `snapshot`.
- `remote.js`: spawn/update/remove capsule meshes + name tags from snapshots; ignore own id.
- **Check (two tabs):** drive each player; the other tab shows it moving in real time.
  Leaving removes the mesh.

## Step 6 — Shooting + tracers (visual only)
- `weapons.js`: left-click with fire cooldown; raycast from camera; emit `fire` (origin+dir).
- Server rebroadcasts as `fired`; all clients draw a short tracer/flash.
- **Check:** firing in one tab shows a tracer in both tabs. Cooldown is enforced.

## Step 7 — Damage, death, respawn, scoring
- `weapons.js`: raycast vs remote player colliders; on hit send `hit{target}`.
- `internal/game/state.go`: HP, `ApplyHit` (34 dmg), death at 0 → increment killer kills +
  victim deaths, schedule respawn after 2s at random spawn; server emits `killed` +
  `respawned`. Apply the trivial range sanity check from SPEC §6.3.
- Client reflects HP/deaths/respawn (move local player to respawn pos on your own respawn).
- **Check (two tabs):** 3 hits kills the target, killer's kills increments, victim respawns
  full HP after ~2s.

## Step 8 — HUD + scoreboard
- `hud.js`: live HP + your kills; hold **Tab** for a scoreboard (name/kills/deaths, sorted).
- **Check:** HUD updates on damage/kills; Tab shows everyone correctly.

## Step 9 — Acceptance pass + cleanup
- Walk the **entire SPEC §4.6** acceptance test end to end in two tabs.
- `go build ./... && go vet ./...` clean; remove dead code; confirm no goroutine leaks when
  repeatedly joining/leaving; confirm zero console errors.
- Write `README.md`: one-paragraph what-it-is + `go run ./cmd/server` + "open two tabs".
- **This is the MVP. Stop here unless §4.6 fully passes.**

## Step 10+ — Stretch (only now, in SPEC §9 order)
Interpolation → kill feed + sounds → rocket launcher → second map → spawn protection →
**deploy to Railway** (embed `web/`, bind `$PORT`, WS URL from `window.location`).

---

### Reminder
Each step ends with: run it, verify the check in two tabs where relevant, zero console
errors, zero panics, **write the step report, then pause for human review.** Naive and
working beats clever and broken — that's the whole point of this build.
