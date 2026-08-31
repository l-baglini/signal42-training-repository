# Office Chaos — Technical Documentation

How the system is built and, in detail, **how clients and the server talk to each other**.
For repo orientation and commands, see [CLAUDE.md](CLAUDE.md).

---

## 1. High-level architecture

```
                         ┌────────────────────────────────────────────┐
                         │                Browser (client)             │
                         │                                             │
   React + Tailwind UI ──┤  Hub / Auth / GamePage (HUD, toasts)        │
                         │        │                    ▲               │
   Three.js renderer ────┤   ThreeGame ── Scene.js ────┘ (render-only) │
                         │        │  ▲                                  │
                         └────────┼──┼──────────────────────────────────┘
                                  │  │
                  REST (JWT)      │  │   WebSocket (Socket.io, JWT at handshake)
              fetch /api/*        │  │   /socket.io/
                                  ▼  │
                         ┌───────────┴──────────────────────────────────┐
                         │                 nginx (client container)      │
                         │   proxies /api/  and  /socket.io/  → server    │
                         └───────────┬──────────────────────────────────┘
                                     ▼
        ┌──────────────────────────────────────────────────────────────┐
        │                     Node server (:4000)                       │
        │                                                                │
        │  Express REST  ── routes/auth.js, routes/workspaces.js         │
        │                                                                │
        │  Socket.io     ── game/socket.js  (handshake auth, action API) │
        │                      │                                         │
        │            ┌─────────▼──────────┐                              │
        │            │  GameRoom (memory)  │  one per workspace          │
        │            │  authoritative state│  game/rooms.js              │
        │            └─────────┬──────────┘                              │
        │   score deltas       │           cron (Mon 00:00 UTC)          │
        └──────────────────────┼─────────────────┬──────────────────────┘
                               ▼                  ▼
                        PostgreSQL (Prisma)   weeklyReset snapshot
```

**The contract in one sentence:** the client renders state and sends *intents*; the server owns
*all* state and truth, validates every intent, mutates in-memory room state, and broadcasts the
results. There is no client-side authority — no client hit registration, no client destruction,
no trusting client-reported positions beyond a movement *request*.

There are **two communication channels**, used for different things:

| Channel | Transport | Used for | Auth |
|---|---|---|---|
| **REST** | HTTPS `fetch` → `/api/*` | Anything not in the live game loop: register/login, workspace & invite management, avatar save, map fetch, leaderboard & hall-of-shame reads, victim notifications, admin moderation | `Authorization: Bearer <JWT>` header |
| **WebSocket** | Socket.io → `/socket.io/` | The live game loop: joining a room, movement, combat, destruction, fire, stress/rage, presence, score-dirty pings | JWT verified once at connection handshake |

---

## 2. Authentication & session

1. `POST /api/auth/register` or `/login` → server verifies (bcrypt) and returns
   `{ token, user }`. The token is a JWT signed HS256 with `JWT_SECRET`, `sub = userId`,
   7-day expiry (`server/src/lib/auth.js`).
2. Client stores `token` + `user` in `localStorage` (`client/src/api.js`) and attaches
   `Authorization: Bearer <token>` to every REST call. A `401` clears the session and bounces
   to `/login`.
3. For the WebSocket, the client passes the same token in the Socket.io handshake:
   ```js
   io('/', { auth: { token }, transports: ['websocket', 'polling'] })
   ```
   The server validates it in `io.use(...)` middleware **before** the connection is accepted
   (`game/socket.js`); failure rejects with `Unauthorized` and the client redirects to login.
   This satisfies NFR-5 (WS connections authenticated at handshake).

The JWT only proves *identity*. Authorization to act in a workspace (membership, admin role) is
re-checked server-side on every relevant REST route and on socket `join`.

---

## 3. REST API reference

Base path `/api`. All routes except `auth/*` and `invites/:token/accept`'s sibling require a
valid JWT; workspace routes additionally require membership (and some require `admin`).

| Method & path | Purpose | Notes |
|---|---|---|
| `GET /api/health` | liveness | `{ ok: true }` |
| `POST /api/auth/register` | create account | `{email,password,displayName,jobTitle?}` → `{token,user}` |
| `POST /api/auth/login` | log in | → `{token,user}` |
| `GET /api/auth/me` | current user + memberships | |
| `PUT /api/auth/me/avatar` | save avatar JSON + name/title | `{avatar:{skin,hair,hairColor,outfit}, displayName?, jobTitle?}` |
| `POST /api/workspaces` | create workspace | creator becomes `admin`, desk 0 |
| `GET /api/workspaces/:id` | workspace + members + your role/desk | membership required |
| `GET /api/workspaces/:id/map` | the compiled office to render | per-workspace custom layout, or the default |
| `PUT /api/workspaces/:id/layout` | save the office built in the 3D editor | **admin only**, creation-time only (409 once set); validated |
| `GET /api/default-layout` | the classic office as an editor starting point | |
| `POST /api/workspaces/:id/invites` | mint a shareable invite | token, `expiresAt` = +48 h (FR-1.3) |
| `POST /api/invites/:token/accept` | join via link | assigns next free desk; 409 if full (20) |
| `DELETE /api/workspaces/:id/members/:userId` | remove a member | **admin only** (FR-1.5); also kicks their live socket |
| `GET /api/workspaces/:id/leaderboard` | current week's dual boards | destruction + PvP, computed live |
| `GET /api/workspaces/:id/hall-of-shame` | past weekly snapshots | FR-7.7 |
| `GET /api/workspaces/:id/notifications` | unread victim notifications | shown on next login (FR-5.4) |
| `POST /api/workspaces/:id/notifications/read` | mark notifications read | `{ ids: [...] }` |

REST is **request/response only**. It never pushes; anything that needs to reach the client
live goes over the WebSocket. The one bridge between them: REST writes score rows to Postgres,
and the socket emits a lightweight `leaderboard:dirty` ping telling clients to re-`GET` the
leaderboard.

---

## 3a. Maps are data (custom offices)

Offices are no longer hardcoded. A workspace stores a `layout` JSON
(`{ width, height, tiles, objects }`) built in the 3D editor; `null` falls back to
`DEFAULT_LAYOUT` (the classic office) for back-compat. `compileMap(layout)`
(`server/src/game/map.js`) turns a layout into the runtime map: a collision grid (walls +
solid objects), the ordered `desks`, `weaponSpawns`, decorative `decor`, room-label regions,
and helpers (`isWalkable`, `isRoom`, `spawnFor`, `circleClear`, …). Each `GameRoom` compiles
its workspace's layout once on first join (`ensureMap()`) and the authoritative engine runs
against it; `clientMap()` projects a render-friendly view for `GET /map`.

The editor (`client/src/pages/BuildPage.jsx` + `game/three/BuildScene.js`) is a 3D
drag-and-build scene sharing the furniture catalog (`game/three/catalog.js`) with the in-game
renderer, so a placed object looks identical in build mode and in play. Object roles: `desk`
(destructible player desk + spawn anchor), `weapon` (pickup spawn), `decor` (furniture, some
solid). Editing is **creation-time only** (admin, before the layout is set), which is why the
server never has to hot-swap a live room's map.

## 4. The authoritative game room

`server/src/game/rooms.js` defines `GameRoom`, of which there is **exactly one per workspace**,
created lazily on first join and destroyed when the last player leaves. It holds all live state
in memory:

- `players: Map<userId, playerState>` — position `(x,y)`, facing `dir`, `stress`, `hp`,
  `state` (`alive`/`ko`), `rageUntil`, `afk`, combo timestamps, session KO counters,
  `wanted`, `activeSlot`, `stamina` (+ `sprintWanted` / `sprintLocked`), and the current `socketId`.
- `deskOwners: Map<deskIndex, {userId,name}>` — refreshed from Postgres memberships.
- `deskStates: Map<deskIndex, {hp, stage, by, byName, destroyed}>` — desk damage (empty =
  pristine).
- `fires: Map<"x,y", {x,y,ignitedAt}>` — burning tiles.
- `weapons: Map<spawnId, {type, x, y, available, respawnAt}>` — office-object weapon pickups.

Players move **freely** (float `x,y` + facing angle), not tile-by-tile. Each player also
carries `vx,vy` (current input vector), `kbx,kby` (decaying knockback impulse), the equipped
`weapon`, and the `activeSlot` (1 weapon · 2 extinguisher · 3 lighter — which tool a click
uses; the extinguisher and lighter are unlimited), plus sprint `stamina` (0–100). A 20 Hz
simulation tick integrates input × speed with circle-vs-tile collision (axis-separated so
players slide along walls), applies the 1.6× sprint multiplier while sprinting and drains/
regenerates stamina, decays knockback, auto-grabs nearby weapon pickups, and broadcasts the
float positions. Stamina is server-authoritative; the client mirrors the same numbers locally
for a smooth HUD bar and movement prediction (no extra network traffic).

It runs four timers (`setInterval`):

| Timer | Period | Job |
|---|---|---|
| sim tick | 50 ms (≈20 Hz) | integrate movement + knockback w/ collision, apply sprint + drain/regen stamina, grab weapon pickups, broadcast moved players as `positions` (FR-8.2) |
| stress tick | 60 s | `+1` passive stress to everyone, broadcast `stress:batch` (FR-3.2) |
| fire tick | 2.5 s | spread/burn-out fires, broadcast `fires` (FR-5.2) |
| AFK check | 10 s | flip idle players to AFK; clear expired rage (FR-8.5) |

**Why in-memory:** the live loop needs sub-100 ms reads/writes (NFR target) and broadcasts at
20 Hz; a DB round-trip per move would be far too slow. Postgres is the *durable* store for
identity, membership, scores, and notifications — written on significant events, not per frame.
Trade-off: room state is ephemeral (a server restart resets positions/desk damage/fires, but
not accounts or weekly scores). Acceptable for the MVP's single-server model.

---

## 5. WebSocket protocol

### 5.1 Client → server (intents)

Every action is an emit with an **acknowledgement callback** `(data, ack)`; the server replies
`{ ok: true }` or `{ error: "human-readable reason" }`. The client surfaces errors as toasts.
All handlers go through a `withPlayer` wrapper (`game/socket.js`) that confirms the socket owns
a live player in the room before running, then through validation inside the `GameRoom` method.

| Event | Payload | Server method | Key validation |
|---|---|---|---|
| `join` | `{ workspaceId }` | `addPlayer` | membership check; room cap 20 (FR-8.4); returns full snapshot |
| `move` | `{ dx, dy }` | `setInput` | desired input vector (tile space); sim integrates it with collision + rage/sprint speed |
| `sprint` | `{ on }` | `setSprint` | hold-to-run intent (Left Shift); 1.6× speed while moving, drains stamina, server-enforced |
| `slot` | `{ slot }` | `setSlot` | active tool slot 1 weapon/hands · 2 extinguisher · 3 lighter; cosmetic (drives held item), validity still checked per-action |
| `meeting:log` | `{}` | `logMeeting` | alive only; `+10` stress (FR-3.3) |
| `desk:destroy` | `{ deskIndex }` | `destroyDesk` | range (euclidean), not own desk (FR-5.7), owner offline/AFK (FR-5.3), one whack |
| `fire:ignite` | `{ x, y }` | `igniteFire` | must be inside a room, in range (FR-5.2) |
| `fire:extinguish` | `{ x, y }` | `extinguishFire` | unlimited (slot 2); hold to keep spraying — emits `spray` + re-broadcasts `fires` |
| `attack` | `{ tx, ty }` | `attack` | faces (tx,ty); equipped-weapon cooldown; hits all alive non-AFK players in the swing arc+range; damage + knockback (FR-6.2) |
| `emoji` | `{ emoji }` | `emoji` | whitelist of 6 emojis (FR-8.6) |

Weapons are picked up automatically by walking over a spawn (handled in the sim tick, not an
intent). The extinguisher and lighter are unlimited tools selected via `slot` — no pickup,
no charge.

The client **never** sends results ("I dealt 1 damage", "the desk is destroyed"). It sends only
intent; the server computes the outcome.

### 5.2 Server → client (broadcasts)

Emitted to the workspace room channel `ws:<workspaceId>` (every member's socket is `join`ed to
it). Clients are render-only consumers.

| Event | Payload | Meaning |
|---|---|---|
| `player:joined` | public player | someone joined / re-synced |
| `player:left` | `{ userId }` | someone disconnected |
| `positions` | `[{userId,x,y,facing}]` | 20 Hz batched float positions (free movement) |
| `stress:update` | `{ userId, stress }` | single stress change (action-driven) |
| `stress:batch` | `[{userId,stress}]` | passive stress tick |
| `rage:start` / `rage:end` | `{ userId, until? }` | Rage Mode toggled (FR-3.5) |
| `meeting:logged` | `{ userId }` | meeting button feedback |
| `desk:hit` | `{ deskIndex, hp, stage, maxHp, by, byName, raging, destroyed }` | one whack landed; advance damage stage |
| `desk:destroyed` | `{ deskIndex, by, byName, victim }` | final hit; desk is rubble |
| `desk:repaired` | `{ deskIndex }` | owner came back; desk reset |
| `fires` | `[{x,y,ignitedAt}]` | full current fire set (authoritative) |
| `fire:ignited` | `{x,y,by,byName,room}` | a tile was lit (lighter fx) |
| `spray` | `{x,y,by}` | extinguisher jet at a tile — render smoke (fires removed are sent via `fires`) |
| `attack` | `{ userId, weapon, facing }` | a swing happened — play the animation (even on a whiff) |
| `equip` | `{ userId, weapon }` | player picked up a weapon |
| `slot` | `{ userId, slot }` | player switched active tool slot (swap the held item) |
| `weapon:taken` / `weapon:spawned` | `{ id, type?, x?, y? }` | a floor pickup was grabbed / respawned |
| `player:hit` | `{ attackerId, targetId, weapon, damage, hp, label }` | a swing connected (weapon-specific label) |
| `player:ko` | `{ userId, by, byName }` | knocked out (FR-6.4) |
| `player:respawn` | `{ userId, x, y, hp }` | respawned at own desk after 5 s (FR-6.5) |
| `presence` | `{ userId, status }` | `online` / `afk` (FR-8.5) |
| `wanted` | `{ userId, wanted }` | 3+ session KOs (FR-6.11) |
| `combo` | `{ userId, chain }` | ≥3 destruction actions in 10 s, ×2 score (FR-5.5) |
| `emoji` | `{ userId, emoji }` | floating reaction |
| `leaderboard:dirty` | `{}` | scores changed in DB; clients should re-fetch |
| `members:changed` | `{}` | membership changed (e.g. admin removal); re-fetch workspace |
| `kicked` | `{ workspaceId }` | **direct to one socket** — you were removed; leave |

### 5.3 The `join` snapshot

`join`'s ack returns the entire current room so a late joiner is instantly consistent:

```js
ack({
  ok: true,
  you: <userId>,
  state: {
    players:     [ publicPlayer, ... ],   // x,y,facing, stress, hp, rage, afk, wanted, weapon, activeSlot, ...
    deskOwners:  [ {deskIndex, userId, name}, ... ],
    deskStates:  [ {deskIndex, hp, stage, destroyed}, ... ],
    fires:       [ {x,y,ignitedAt}, ... ],
    weapons:     [ {id, type, x, y}, ... ],   // weapon pickups currently on the floor
    now:         <serverTime>,
  },
})
```

After applying the snapshot, the client only needs the incremental broadcasts above to stay in
sync. No polling.

---

## 6. End-to-end flows

### 6.1 From login to playing

```
Browser                         nginx          Server                     Postgres
  │ POST /api/auth/login ────────►├──────────────► verify bcrypt ───────────► users
  │ ◄──────────── {token,user} ───┤◄────────────── sign JWT
  │ (store in localStorage)
  │ GET /api/workspaces/:id ──────►├──────────────► membership check ───────► memberships
  │ GET /api/workspaces/:id/map ──►├──────────────► return MAP
  │ GET .../notifications ────────►├──────────────► unread victim toasts ───► notifications
  │
  │ io(/socket.io, auth:{token}) ─►├──────────────► io.use: verify JWT  ✓
  │ emit "join" {workspaceId} ─────►├─────────────► GameRoom.addPlayer
  │ ◄──── ack { state snapshot } ──┤◄────────────── refresh deskOwners ─────► memberships
  │ (Scene renders world + players)
  │                                 socket.join("ws:<id>")  ← now receives broadcasts
```

### 6.2 A movement frame (free movement, 20 Hz)

```
Browser (Scene render loop)                         Server (GameRoom sim tick @50ms)
  WASD → camera-relative world vector (dx,dz)
  send when the vector changes ── emit "move" {dx,dy} ─► setInput(): store normalized input
  predict locally: move self by input·speed·dt          integrate: x += (vx·speed + kbx)·dt
                                                          axis-separated circle-vs-tile collision
  ◄──────────── "positions" [{userId,x,y,facing}] ─────── broadcast players that moved
  self: reconcile predicted pos → server pos
        (gentle when close, snappy when far, e.g. knockback)
  others: interpolate toward server pos; rotate to facing
  camera follows self
```

Unlike the old tile-based scheme, the client **predicts its own movement locally** each frame
(for responsiveness) and continuously reconciles toward the authoritative server position. The
server still owns truth: it runs collision and is the only thing that can move you through a
knockback or block you at a wall, and the reconcile snaps harder the further the prediction has
drifted (so an opponent's shove is felt immediately). Other players are pure interpolation.

### 6.3 Multi-hit desk destruction (the interactive rework)

Each click is one whack; the server tracks HP and stage and only the final hit destroys.

```
Attacker browser            Server (destroyDesk, per call)             All clients in room
  click desk (raycast) ─ emit "desk:destroy" {deskIndex} ─►
                            guards: alive, exists, not own desk,
                                    in range, owner offline/AFK,
                                    not already rubble
                            hp -= (raging ? 2 : 1);  stage = MAX-hp
                            combo check; stress -= 2
                            addScore(deskHit * comboMult) ──► WeeklyScore
                            emit "desk:hit" ───────────────────────────► advance damage stage:
                                                                          papers→monitor→drawers
                                                                          + debris burst + shake
   (repeat clicks...)
                            on final hit (hp 0):
                              emit "desk:destroyed" ────────────────────► collapse to rubble
                              addScore(destruction bonus) ──► WeeklyScore
                              create victim Notification ───► notifications
                            emit "leaderboard:dirty" ──────────────────► clients re-GET board
```

When the victim next opens the workspace, `GET /notifications` returns the comedic "your desk
was annihilated" toast (FR-5.4), and on their `join` the server repairs the desk
(`desk:repaired`) since they've now "seen" the damage.

### 6.4 Server-authoritative weapon combat

Combat uses the equipped office-object weapon (keyboard / stapler / chair / monitor, or bare
fists). You aim a **directional swing** by clicking a player or a point; the server resolves the
arc, applies damage and a **knockback impulse**, and the shove plays out as real movement.

```
Attacker clicks toward (tx,ty) ─ emit "attack" {tx,ty} ─► attack():
  (self swings immediately, locally)                       weapon = WEAPONS[equipped]
                                                           on cooldown? → silent reject
                                                           face (tx,ty)
   ◄──────── "attack" {userId,weapon,facing} ── (everyone) play the swing animation
                                                           for each alive non-AFK player in
                                                           range + within the ±60° arc:
                                                             hp -= weapon.damage (×2 in rage)
                                                             kbVel += dir · weapon.knockback
   ◄──────── "player:hit" {weapon,hp,label} ── (everyone) sparks + floating label (CRASH!/…)
                                                           (knockback then plays out as the
                                                            target slides via "positions")
                                                           if hp ≤ 0: knockOut()
   ◄──────── "player:ko" ─────────────────────  topple; attacker streak++, maybe "wanted"
   ◄──────── "player:respawn" ────────────────  back at own desk after 5 s, full HP
```

Weapon choice, hit detection (range + arc), damage, knockback, KO, and respawn are **all**
decided on the server (FR-6.2, FR-8.3). The attacker animates its own swing immediately for
feel, but only the server's `player:hit` / knockback determine what actually happened. Heavier
weapons (chair, monitor) trade swing speed for damage and a much bigger shove; Rage Mode doubles
damage and widens knockback, making the heavy weapons one-hit KOs.

### 6.5 Weekly leaderboard lifecycle

- Scores are rows in `WeeklyScore` keyed by `(userId, workspaceId, weekStart)` where
  `weekStart` = Monday 00:00 UTC (`lib/week.js`). Writing to the current week's row *is* the
  scoreboard; there's no separate "current totals" to reset.
- `GET /leaderboard` computes the two ranked boards (destruction & PvP) live from those rows
  (`scoring.js`), assigning the top-3 titles.
- A `node-cron` job (`jobs/weeklyReset.js`) at Monday 00:00 UTC snapshots the **finished**
  week's top-3 into `LeaderboardSnapshot` (the Hall of Shame, FR-7.7). Because the new week has
  a new `weekStart` key, the visible board naturally "resets" to empty. The job also runs once
  on boot to catch up if the server was down at the tick.

---

## 7. Rendering model (client)

`client/src/game/three/Scene.js` (`OfficeScene3D`) owns the Three.js renderer, camera, scene
graph, input, and the Socket.io event bindings. `ThreeGame.jsx` is a thin React wrapper that
constructs/disposes it (guarded against React 18 StrictMode double-mount) and shows a friendly
message if WebGL is unavailable.

- **Coordinate mapping:** server tile `(x, y)` → world `(x, 0, y)`. Grid Y is world Z; world Y
  is up. Walls/desks are extruded boxes; floor tiles are flat colored boxes (room-colored).
- **Avatars:** built from boxes in `three/avatar.js` from the same `{skin,hair,hairColor,outfit}`
  config used by the SVG menu renderer. Arms and legs hang from joint pivot groups so the scene
  can animate them. A canvas-texture sprite floats above each one with name, HP hearts, stress
  bar, and status badges, redrawn on change.
- **Avatar animation** (`Scene._animate`, per frame): a walk cycle swings arms and legs from the
  joints, driven by each player's actual frame-to-frame travel (so the stride matches speed and
  doesn't foot-slide), plus a step bob while moving and gentle breathing while idle. The right
  arm's attack swing overrides its walk swing. Remote players animate from their interpolated
  movement; the local player from its predicted movement — no extra network data needed.
- **Camera:** third-person follow with a fixed-orientation orbit (drag to rotate, wheel to zoom).
  WASD is interpreted relative to the camera as a movement vector sent via `move {dx,dy}`.
- **Effects** (`three/effects.js`): debris bursts (boxes with velocity + gravity), flickering
  fire (cones + point light), floating text (camera-facing sprites), and camera shake — all
  driven from broadcast events, purely cosmetic.

The React HUD (`src/hud/*`) lives in normal DOM over the canvas and is fed by the same socket
events in `GamePage.jsx` (stress meter, HP, dual leaderboard panel, members/presence, action
bar, toasts, onboarding).

---

## 8. Security & integrity notes

- **Server authority** is the core integrity property: clients send intents, never results;
  combat, destruction, fire, and stress are all validated and computed server-side (FR-6.2,
  FR-8.3). A malicious client can at most send valid-looking intents, which are still
  range/cooldown/ownership-checked.
- **JWT** gates both REST (per-request header) and WS (handshake). Membership/role is
  re-verified server-side, not trusted from the client.
- **Anti-grief guards** baked into `GameRoom`: can't trash your own desk; can't attack
  offline/AFK players; can't destroy an online player's desk; per-weapon attack cooldown;
  movement bounded by server-side collision; room cap of 20; emoji whitelist.
- **Known MVP limitations:** single authoritative server (no horizontal scaling of rooms yet);
  room state is in-memory (lost on restart); `prisma db push` on boot instead of versioned
  migrations; no per-event WS rate limiting beyond the movement throttle and pair cooldown
  (flagged in the PRD's polish sprint for a hardening pass).
