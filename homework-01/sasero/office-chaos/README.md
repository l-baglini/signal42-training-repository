# ■ Office Chaos

The workplace stress-relief multiplayer game. When a coworker is driving you mad, log in and
virtually annihilate their desk, set the meeting room on fire, or slap them across the
open-plan floor. 100% fictional. 0% HR incidents.

Built from `OfficeChaos_PRD_AgilePlan.pdf` (v1.0). Covers all P0 requirements plus most P1s.
**Deliberately skipped for now:** FR-1.4 (Google OAuth login) and FR-3.4 (Google Calendar
integration) — both need OAuth scopes.

## Run it (everything is containerized)

```bash
docker compose up --build
```

Then open **http://localhost:8080** — register, create a workspace, copy the invite link and
open it in a second browser/incognito window to see real-time multiplayer.

| Service | Tech | Port |
|---|---|---|
| `client` | React + Vite + Tailwind + Three.js (low-poly 3D), served by nginx (proxies `/api` & `/socket.io`) | 8080 |
| `server` | Node 22 + Express + Socket.io + Prisma | 4000 |
| `db` | PostgreSQL 16 | internal |

Set `JWT_SECRET` in the environment for anything beyond local play.

## Build your office (custom maps)

When you **create** a workspace you land in a **3D build editor** (admin only, one-time at
creation): an orbit-camera, Sims-style build mode where you

- paint **floor / room zones** (open, meeting, kitchen, server) and **walls**,
- drop **furniture** from a ~20-object catalog — player **desks** (where people spawn and that
  get destroyed), **weapon spawns** (keyboard/stapler/chair/monitor), and decor (couch, plant,
  water cooler, printer, whiteboard, fridge, server rack, bookshelf, coffee, TV, arcade,
  vending, extinguisher, rug, boxes),
- place with **left-click**, **R** to rotate, the **Move** tool to drag, **Delete** to remove;
  **right-drag** orbit, **middle-drag** pan, **scroll** zoom.

You need at least one desk; then **Open the office** saves the layout and everyone plays on it.
The layout is locked after creation. Workspaces created without building use the classic office.

## How to play

- **WASD / arrow keys** — move freely (camera-relative, with collision). **Drag** to orbit,
  **scroll** to zoom.
- **Hold Left Shift to sprint** — 1.6× speed, limited by a stamina bar (≈4 s of running). It
  recharges (~6 s) when you stop; drain it fully and you're locked out until it recovers a bit.
- **Tool slots — keys `1` / `2` / `3`** (or click the slots, bottom-left): **1** = hands/weapon,
  **2** = extinguisher, **3** = lighter. Whatever slot is active is what a **click** uses — no
  mode toggles, use it as often as you like.
- **📅 Log a meeting** — +10 stress. Stress also rises +1/min passively.
- **100 stress → 😡 RAGE MODE** — 30 s of +50% speed, doubled weapon damage, bigger knockback.
- **Slot 1 — combat.** Walk over a keyboard, stapler, chair, or monitor to arm it (each has its
  own reach/speed/damage/knockback; they respawn ~15 s after pickup). Click a colleague to swing
  at them — the swing is animated and **knocks them physically backwards**; 3 HP → comical KO,
  respawn after 5 s. Or click an offline/AFK colleague's desk to smash it stage-by-stage into
  rubble (4 hits, 2 in Rage). AFK/offline players can't be hit.
- **Slot 3 — lighter.** Hold click and sweep to set the floor ablaze (fire spreads inside
  rooms). Always available.
- **Slot 2 — extinguisher.** Hold click to spray foam/smoke and put fires out. Unlimited — no
  charge, no refill.
- **Combos** — 3+ destruction actions within 10 s = x2 score multiplier.
- **Weekly leaderboards** — Destruction & PvP boards reset Monday 00:00 UTC; top 3 earn
  titles (Destroyer of Desks… / Office Brawler…). Past weeks live in the Hall of Shame.

## Architecture

- One authoritative in-memory game room per workspace on the Socket.io server; all combat,
  destruction and stress logic is validated server-side (FR-6.2, FR-8.3). Score deltas are
  persisted to Postgres after each significant event.
- Positions broadcast at 20 ticks/s with client-side interpolation (FR-8.2).
- REST (JWT) for auth, workspaces, invites (48 h expiry), avatars, leaderboards,
  notifications; WebSocket handshake is JWT-authenticated (NFR-5).
- `node-cron` snapshots both boards every Monday 00:00 UTC into the Hall of Shame.
- Avatars are JSON configs rendered as SVG in menus and rebuilt as blocky low-poly box
  meshes in the Three.js world (Krunker-style placeholder art per the PRD's Sprint 1–3
  art strategy).
- The renderer is a third-person Three.js scene: the tile grid is extruded into a 3D
  office, players are voxel humanoids, and desks degrade through damage stages mesh-by-mesh.

## Development

```bash
# server unit tests (map integrity, week-reset math)
cd server && npm install && npm test

# hot-reload dev loop (outside Docker, optional):
docker compose up db -d
cd server && DATABASE_URL=postgresql://officechaos:officechaos@localhost:5432/officechaos npx prisma db push && npm start
cd client && npm install && npm run dev   # Vite on :5173, proxies to :4000
```

CI (GitHub Actions): server tests + client build + `docker compose build` on every push/PR,
with a staging deploy hook stub on `main`.

## Project structure

```
server/
  prisma/schema.prisma     # User, Workspace, Membership, Invite, WeeklyScore,
                           # Notification, LeaderboardSnapshot
  src/routes/              # auth, workspaces/invites/leaderboard/notifications
  src/game/                # map, constants, room engine (authoritative), scoring, sockets
  src/jobs/weeklyReset.js  # Monday 00:00 UTC snapshot
client/
  src/pages/               # Login, Register, Hub, InvitePage, GamePage
  src/avatar/              # palettes, SVG renderer, creator UI
  src/game/three/          # Three.js low-poly scene, blocky avatars, world, effects
  src/hud/                 # stress meter, HP, dual leaderboard, members, actions, toasts
```
