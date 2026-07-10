# Quake-Lite

A stripped-down browser arena FPS in the spirit of old-school Quake: Three.js front
end loaded from a CDN import map (no build step, no npm), Go + `gorilla/websocket`
backend, room-based multiplayer over one JSON WebSocket per player. Movement is
client-authoritative and the server trusts shooter hit claims (with only a range
sanity check) — naive netcode **on purpose**; see `SPEC.md` §2. Localhost only.

## Run

```bash
go run ./cmd/server        # http://localhost:8080  (ADDR / PORT env override)
```

Open **two browser tabs** at <http://localhost:8080>, enter different usernames,
create a room in one tab and join it from both.

## Controls

- **Click** the arena to capture the mouse, **Esc** releases it
- **WASD** move, **mouse** look, **Space** jump
- **Left-click** fire (34 damage, 3 shots to kill, 2s respawn)
- Hold **Tab** for the scoreboard

## Tests

```bash
go test ./...              # game rules + join/leave goroutine-leak tests
```

Docs: `SPEC.md` (what), `CLAUDE.md` (how), `BUILD_PLAN.md` (order), `reports/`
(one build log per step).
