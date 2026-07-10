# Quake-Lite — Specification

A stripped-down, browser-based, multiplayer arena FPS in the spirit of old-school Quake.
Three.js on the front end, a Go backend, room-based ("server browser") multiplayer.
Built for a "build it entirely through AI, no hand-coding" challenge — so favour the
simplest thing that works and is fun to demo over correctness/robustness.

---

## 1. Goal (the one-liner)

Two to eight players join a named room from a lobby, spawn into a small 3D arena,
run around with mouse-look + WASD, shoot each other with a hitscan weapon, and see a
live kill scoreboard. No accounts, no matchmaking — just pick a room and play.

---

## 2. Non-goals (read this twice — these are deliberate)

These are **out of scope on purpose**. Do not add them. They are where this kind of
project dies.

- ❌ **No client-side prediction / lag compensation / rollback netcode.** Movement is
  client-authoritative and naively relayed. A little jitter on other players is fine.
- ❌ **No anti-cheat / server-side authority over movement.** The shooter claims its own
  hits; the server trusts it (with a trivial sanity check only). Cheating doesn't matter
  for a fun demo.
- ❌ **No matchmaking, skill rating, party system, or persistence.** Rooms are in-memory
  and vanish when empty.
- ❌ **No accounts, login, or database.** Players type a nickname, nothing is stored.
- ❌ **No build step / bundler / npm on the front end.** Three.js is loaded from a CDN via
  an ES-module import map. Files are served as-is.
- ❌ **No deployment/TLS/scaling work _for the MVP_.** Build and run on `localhost` over
  plain HTTP/WS only. Deploy is explicitly deferred — see the note below and stretch §9.6.
- ❌ **No assets pipeline.** Geometry is primitives (boxes, capsules). No imported models,
  textures optional and procedural/solid-colour.

If a feature isn't listed in §4 (MVP), it belongs in §9 (Stretch) or nowhere.

---

## 3. Tech stack (fixed — do not substitute)

- **Frontend:** Three.js (latest 0.16x) via CDN + ES-module import map. Plain ES modules,
  no bundler. `PointerLockControls` from three addons for mouse-look.
- **Backend:** Go (1.22+). `net/http` for HTTP + static files, `gorilla/websocket` for the
  socket. Standard library elsewhere. One module, no framework.
- **Transport:** JSON messages over a single WebSocket per player. (See §6.)
- **Hosting:** `localhost:8080` only for now. Server serves both the static front end and
  the WS. **Forward-looking (do not build yet):** if the localhost version works well we
  may later deploy to Railway (or similar). So keep deployment *easy* without doing it —
  read the listen address + port from env (`PORT`/`ADDR`) with localhost defaults, don't
  hard-code `localhost` into client URLs (derive the WS URL from `window.location`), and
  keep the server a single process serving both static files and the WS. That's all the
  deploy-readiness the MVP needs; actual deployment is stretch §9.6.

---

## 4. MVP — what "done" means

### 4.1 Lobby (the "rooms" screen)
- A landing screen (no pointer lock) with: a **username** input, a **list of open rooms**
  (name + current player count, e.g. `dm-tower — 3/8`), a **Create room** form (room name),
  and a **Join** button per room.
- **A username is mandatory before entering any game.** This is a hard requirement:
  - The username field is the first thing the player sees; **Create** and **Join** are
    disabled (or refused with a visible message) until a valid username is entered.
  - Validation: non-empty after trimming, length 2–16, allowed characters
    `[A-Za-z0-9_-]` (reject the rest with an inline message). Names need **not** be unique.
  - The username is carried into the game: the client must not open the WebSocket without
    it, and the server **rejects a WS connection whose `name` query param is missing or
    fails the same validation** (close the socket with a clear reason). Re-validate
    server-side — never trust the client alone.
  - The chosen username is what shows on the in-game name tag and the scoreboard, and may
    be remembered in `localStorage` to pre-fill next time (nice-to-have).
- Room list is fetched over REST and **auto-refreshes** every ~2s.
- Creating a room then joining it puts you into the game. Joining a full room (8) is
  refused with a visible message.

### 4.2 Arena + movement
- One small arena map: a flat floor, bounding walls, and a handful of box obstacles/ramps
  for cover. Defined in `web/map.json` (see §7).
- First-person camera at eye height (~1.7 units). **WASD** to move relative to look
  direction, **mouse** to look (pointer lock on click), **Space** to jump, gravity pulls
  you back down. Movement feels brisk (Quake-ish), not floaty.
- Client-side collision: you cannot pass through walls or the box obstacles, and you
  cannot leave the arena bounds. Simple AABB resolution is fine.
- A crosshair is drawn in the centre.

### 4.3 Other players
- Every other player in the room is rendered as a simple capsule/box with a floating
  **name tag** and a colour. They move/turn as their state updates arrive (raw
  interpolation between snapshots is a nice-to-have, snapping is acceptable).

### 4.4 Shooting + combat
- One **hitscan** weapon. Left-click fires (with a fire-rate cooldown, e.g. 150ms).
- On fire, the client raycasts from the camera against other players' colliders. If it
  hits, it sends a `hit` claim naming the victim. A short visual tracer/flash is drawn for
  everyone (server rebroadcasts the shot).
- Players have **100 HP**; a hit does **34 damage** (3 shots to kill). At 0 HP the player
  **dies**, the killer's score increments, and the victim **respawns** after ~2s at a
  random spawn point with full HP.

### 4.5 HUD + scoreboard
- HUD shows your **HP** and your **kills**. Hold **Tab** to show a scoreboard of everyone
  in the room (name, kills, deaths), sorted by kills.
- A small kill-feed line ("A fragged B") is a nice-to-have, not required.

### 4.6 Definition of Done (acceptance test — must all pass)
Run the server, open **two browser tabs** at `http://localhost:8080`:
0. With the username field empty, Create/Join are blocked; entering an invalid name
   (too short, or with disallowed characters) shows a message and still blocks; a valid
   name unblocks them. (Also confirm a hand-crafted WS connect with no/invalid `name` is
   rejected by the server.)
1. Tab 1 creates room "test"; it appears in Tab 2's room list within ~2s.
2. Both tabs join "test" with different usernames and spawn into the arena.
3. Each tab sees the other player moving in real time as it's driven around.
4. Neither player can walk through walls or obstacles or leave the arena.
5. One player shoots the other 3 times → victim's HP hits 0, dies, killer's kill count
   goes up, victim respawns within a few seconds at full HP.
6. Tab shows a scoreboard reflecting the kill.
7. Closing a tab removes that player from the other tab's view, and the room disappears
   from the lobby once empty.

---

## 5. Game constants (single source of truth)
Put these in one place each side (`web/js/config.js` and a Go `const` block) and reference
them — do not scatter magic numbers.

| Constant            | Value      | Notes                                  |
|---------------------|------------|----------------------------------------|
| Max players / room  | 8          |                                        |
| Tick rate (server)  | 20 Hz      | snapshot broadcast interval = 50ms     |
| Client send rate    | ~30 Hz     | send local state on a fixed interval   |
| Player HP           | 100        |                                        |
| Hit damage          | 34         | 3 shots to kill                        |
| Fire cooldown       | 150 ms     | client-enforced                        |
| Respawn delay       | 2000 ms    | server-enforced                        |
| Eye height          | 1.7        | world units                            |
| Move speed          | ~7 u/s     | tune for feel                          |
| Jump velocity       | ~6 u/s     | tune for feel                          |
| Gravity             | ~18 u/s²   | tune for feel                          |
| Room-list refresh   | 2000 ms    | lobby polling                          |

---

## 6. Wire protocol

One WebSocket per player at `ws://localhost:8080/ws?room=<id>&name=<nick>`.
All messages are JSON objects with a `"t"` (type) field. Coordinates are Three.js
convention: **Y is up**, units are metres-ish. `pos = {x,y,z}`, angles in radians.

### 6.1 REST (lobby, before the socket)
- `GET /api/rooms` → `200` `{"rooms":[{"id":"...","name":"dm-tower","players":3,"max":8}]}`
- `POST /api/rooms` body `{"name":"my room"}` → `200` `{"id":"...","name":"my room"}`.
  IDs are server-generated (short random string). Names need not be unique.

### 6.2 Server → Client
- `welcome` — sent once on connect:
  `{"t":"welcome","id":"p_ab12","mapUrl":"/map.json","you":{...player...},"players":[...players...]}`
- `snapshot` — broadcast every tick (20Hz):
  `{"t":"snapshot","players":[{ "id","name","color","pos":{x,y,z},"yaw","pitch","hp","kills","deaths","alive" }]}`
  (Omitting the local player from its own snapshot is fine; including it is also fine — the
  client ignores its own position from snapshots and renders locally.)
- `joined` — `{"t":"joined","player":{...}}`
- `left` — `{"t":"left","id":"p_ab12"}`
- `fired` — visual only, for tracers: `{"t":"fired","id":"p_ab12","origin":{x,y,z},"dir":{x,y,z}}`
- `killed` — `{"t":"killed","victim":"p_x","killer":"p_y"}`
- `respawned` — `{"t":"respawned","id":"p_x","pos":{x,y,z}}`

### 6.3 Client → Server
- `state` — local player pose, sent ~30Hz:
  `{"t":"state","pos":{x,y,z},"yaw":1.2,"pitch":-0.1}`
- `fire` — `{"t":"fire","origin":{x,y,z},"dir":{x,y,z}}` (server rebroadcasts as `fired`)
- `hit` — shooter-claimed: `{"t":"hit","target":"p_victim"}`
  Server applies damage **only if**: target exists, is in the same room, is `alive`, and
  the claim passes a trivial sanity check (e.g. the two players are within max weapon
  range). That's the entire "anti-cheat".

The `color` is assigned by the server on join (cycle through a small palette).

---

## 7. Map format (`web/map.json`)
Loaded by the client for rendering + collision; read by the server at startup for spawn
points only.

```json
{
  "name": "dm-tower",
  "bounds": { "min": {"x":-25,"y":0,"z":-25}, "max": {"x":25,"y":20,"z":25} },
  "boxes": [
    { "pos": {"x":0,"y":1,"z":0}, "size": {"x":6,"y":2,"z":6}, "color": "#8899aa" },
    { "pos": {"x":-10,"y":0.5,"z":8}, "size": {"x":4,"y":1,"z":4}, "color": "#8899aa" }
  ],
  "spawns": [
    {"x":-20,"y":1.7,"z":-20},
    {"x":20,"y":1.7,"z":20},
    {"x":-20,"y":1.7,"z":20},
    {"x":20,"y":1.7,"z":-20}
  ]
}
```
`boxes` are AABBs centred at `pos` with full extents `size` — use them for both the mesh
and the collision volumes so render and collision never disagree. `bounds` is the outer
arena (floor at `y.min`, invisible/visible walls at the edges). The server picks a random
`spawns` entry on join/respawn.

---

## 8. Quality bar (how it'll be judged)
- It **runs with one command** and the acceptance test in §4.6 passes.
- Code is **organised into the files in CLAUDE.md**, not one giant file. Clear names,
  small functions, no dead code.
- The naive-netcode and trust-the-client decisions are **intentional and documented**,
  not accidental — a one-line comment where they matter is enough.
- No console errors in the browser; no panics/leaked goroutines on the server when players
  join/leave repeatedly.

---

## 9. Stretch goals (only after §4.6 passes, in this order)
1. **Snapshot interpolation** for remote players (buffer 2 snapshots, lerp between them).
2. **Kill feed** overlay + simple hit/fire **sound effects** (WebAudio, procedural beeps ok).
3. **Rocket launcher**: a travelling projectile with splash damage (server-tracked).
4. **Second map** + a map picker in the create-room form.
5. **Spawn protection** (1s invulnerability) and spawn-point selection that avoids enemies.
6. **Deploy to Railway (or similar).** Only once the localhost MVP works well. Bundle
   `web/` into the binary via `embed.FS` for a single-artifact deploy, add a minimal
   `Dockerfile` (or rely on Railway's Go buildpack), bind to `$PORT`, and confirm the
   client derives its WS URL from `window.location` so it works behind the deployed host
   over `ws`/`wss`. No TLS work of our own — let the platform terminate it.
