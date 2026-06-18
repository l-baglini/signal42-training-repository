# CLAUDE.md

Guidance for working in this repo. Read this first, then [TECHNICAL.md](TECHNICAL.md) for
the client↔server protocol and game-loop internals.

## What this is

**Office Chaos** — a browser-based, real-time multiplayer "stress-relief" game for coworkers.
Players share an isometric-rendered-in-3D office, build blocky avatars, log meetings to fill a
stress meter (which triggers Rage Mode), destroy each other's desks, set rooms on fire, punch
each other, and compete on weekly leaderboards. Built from `OfficeChaos_PRD_AgilePlan.pdf`.

Two PRD features are intentionally **not implemented**: FR-1.4 (Google OAuth login) and FR-3.4
(Google Calendar integration). Both need OAuth scopes and were explicitly deferred.

## Stack

| Layer | Tech |
|---|---|
| Client rendering | **Three.js** (low-poly 3D, Krunker-style), third-person camera |
| Client app/UI | React 18 + Vite + Tailwind, React Router |
| Realtime | Socket.io (client + server) |
| Server | Node 22 + Express (REST) + Socket.io |
| DB / ORM | PostgreSQL 16 + Prisma |
| Auth | JWT (HS256) + bcrypt |
| Delivery | Docker Compose (db + server + nginx-served client); GitHub Actions CI |

The client was **migrated from Phaser 2D isometric to Three.js 3D**. There is no Phaser code
left — if you find references to Phaser/isometric in comments or docs, they are stale.

## Run & develop — everything is containerized

```bash
docker compose up --build           # full stack -> http://localhost:8080
docker compose up -d --build client # rebuild just the client after frontend changes
docker compose up -d --build server # rebuild just the server after backend changes
docker compose logs -f server       # tail server logs
```

- Client: **http://localhost:8080** (nginx; proxies `/api` and `/socket.io` to the server).
- Server REST + WS: **http://localhost:4000** (also published directly, handy for tests).
- Postgres: internal to the compose network; not published.

Server tests (pure logic — map integrity, week math):
```bash
docker run --rm -v "$PWD/server":/app:ro -w /app node:22-slim node --test
```
> Note: `npm test` is `node --test` (recursive discovery). Run it where `node_modules`
> isn't needed — these tests import only `src/game/map.js`, `constants.js`, `lib/week.js`.

There is **no git repo** here yet. Don't assume git history exists.

## Layout

```
docker-compose.yml          db + server + client, JWT_SECRET via env
server/
  Dockerfile                runs `prisma db push` on boot, then starts (MVP; not migrate deploy)
  prisma/schema.prisma      User, Workspace, Membership, Invite, WeeklyScore,
                            Notification, LeaderboardSnapshot
  src/index.js              Express app + Socket.io server + cron bootstrap
  src/lib/                  prisma client, auth (JWT/bcrypt), week.js (week-start math)
  src/routes/               auth.js, workspaces.js (workspaces/invites/leaderboard/notifications)
  src/game/
    constants.js            ALL tunable game numbers live here (C.*)
    map.js                  authoritative office floor plan + tile/walkability helpers
    rooms.js                GameRoom — the authoritative in-memory engine (the heart)
    socket.js               Socket.io wiring: auth handshake, join, action handlers
    scoring.js              weekly score upserts + leaderboard building
  src/jobs/weeklyReset.js   node-cron Monday 00:00 UTC snapshot
  tests/                    map.test.js, week.test.js
client/
  Dockerfile, nginx.conf    build with Vite, serve static + proxy api/ws
  src/api.js                fetch wrapper + token/session storage (localStorage)
  src/main.jsx              router + RequireAuth guard
  src/pages/                Login, Register, Hub, InvitePage, GamePage, BuildPage (3D editor)
  src/avatar/               parts.js (palettes), AvatarSVG (UI), AvatarCreator
  src/game/socket.js        creates the authed Socket.io client
  src/game/ThreeGame.jsx    React wrapper that owns the Three.js scene lifecycle
  src/game/three/           Scene.js (game controller), BuildScene.js (3D editor), world.js,
                            catalog.js (floors + furniture meshes), avatar.js, weapons.js, effects.js, sprites.js
  src/hud/                  StressMeter, HpHearts, LeaderboardPanel, MembersPanel,
                            ActionBar, Toasts, OnboardingModal
```

## Architecture in one paragraph

One **authoritative `GameRoom` per workspace** lives in server memory (`game/rooms.js`). All
game state — player positions, stress, HP, desk damage, fire — is held there and mutated only
by validated socket actions. The server broadcasts state changes to everyone in the room over
Socket.io; clients are **render-only** and never authoritative (no client-side hit registration,
no client-side destruction). Score deltas are persisted to Postgres after each significant
event. REST handles everything outside the live loop (auth, workspace/invite management,
avatar, leaderboard reads, notifications). See [TECHNICAL.md](TECHNICAL.md) for the full
event protocol and sequence flows.

## Conventions & gotchas

- **Tile grid for the map, free floats for players.** The map is a 2D tile grid
  (`map.grid[y][x]`); the 3D client maps tile `(x, y)` → world `(x, 0, y)` (grid Y is world Z;
  world Y is up). Players move **freely** (float positions): the client sends a camera-relative
  input vector via `move {dx, dy}` and predicts locally; the server's 20 Hz sim tick integrates
  it with circle-vs-tile collision (`circleClear` in `map.js`) and broadcasts float `positions`.
- **Combat is weapon-based + knockback.** Office objects (`WEAPONS` in `constants.js`) spawn on
  the map (`map.weaponSpawns`), are auto-equipped on walk-over, and define damage/range/cooldown/
  knockback. `attack {tx,ty}` is a directional swing resolved server-side (arc + range); hits
  apply a decaying knockback impulse, so the shove is authoritative movement everyone sees. The
  extinguisher and lighter are unlimited tools (slots 2 and 3) — no charge, no pickup.
- **Sprint** (hold Left Shift) is server-authoritative: the `sprint {on}` intent sets a flag,
  the sim tick applies a 1.6× speed multiplier and drains/regenerates `stamina` (constants in
  `constants.js`, mirrored in `Scene.js` `SPRINT`). The client runs the same stamina math
  locally for the HUD bar (`hud/SprintMeter.jsx`) and prediction — no per-tick stamina is sent.
- **Tool slots, not modes.** Each player has an `activeSlot` (1 weapon/hands · 2 extinguisher ·
  3 lighter), selected by number keys or clicking the inventory (`hud/Inventory.jsx`). A world
  click dispatches on the active slot in `Scene._handleClick` (attack/desk, extinguish, or
  ignite). The slot is broadcast (`slot` event) so the held in-hand mesh swaps for everyone; the
  lighter is always available, igniting is server-validated to rooms. There is no "fire mode"
  toggle anymore.
- **All game tunables go in `server/src/game/constants.js`** (`C.*`). Don't scatter magic
  numbers; the client mirrors a few (move intervals, debris recipes) in `three/Scene.js`.
- **Maps are per-workspace data.** A workspace's `layout` JSON (`{width,height,tiles,objects}`)
  is built in the 3D editor (`pages/BuildPage.jsx` + `game/three/BuildScene.js`) and compiled by
  `compileMap(layout)` in `server/src/game/map.js` into the runtime map (collision grid, desks,
  weapon spawns, decor, room labels). `null` layout → `DEFAULT_LAYOUT`. The `GameRoom` compiles
  its layout once via `ensureMap()`; the client renders `clientMap()` from `GET /map`. Furniture
  meshes + object metadata live in the shared `game/three/catalog.js` (used by editor and world).
  Editing is **creation-time only** (admin, before `layout` is set; `PUT /layout` 409s after).
  Don't hardcode a map on the client — render whatever `GET /map` sends.
- **Avatars are JSON configs** (`{ skin, hair, hairColor, outfit }` — indexes into
  `avatar/parts.js`). Rendered two ways from the same config: SVG in menus (`AvatarSVG`),
  blocky boxes in-world (`three/avatar.js`). Keep `parts.js` the single source of palettes.
- **Auth:** REST uses `Authorization: Bearer <jwt>`; the socket authenticates at handshake via
  `socket.handshake.auth.token` (see `game/socket.js`). A 401 from REST clears the session.
- **Destruction is multi-hit** (FR-5.1): each `desk:destroy` is ONE whack. Desks have HP/stages
  (`C.DESK_MAX_HP`); only the final hit destroys + notifies the victim. Don't "fix" it back to
  one-shot.
- **Rebuild the right image.** Frontend change → rebuild `client`; backend change → rebuild
  `server`. `prisma db push` runs on server boot, so schema edits apply on `--build server`.
- **StrictMode double-mount:** `ThreeGame` and `InvitePage` guard against React 18 double
  effects (scene ref / accepted ref). Preserve those guards.

## When extending

- New realtime action: add a handler method on `GameRoom`, wire it in `game/socket.js`
  (use the `withPlayer` helper for auth/validation), emit a broadcast event, and handle that
  event in `three/Scene.js` `_wireSocket()`. Mirror any user-facing feedback in `GamePage.jsx`.
- New persisted data: edit `prisma/schema.prisma`; the next `--build server` syncs it.
- Keep the server authoritative: clients send *intents* (`move` input vector, `attack`,
  `desk:destroy`), never results.
