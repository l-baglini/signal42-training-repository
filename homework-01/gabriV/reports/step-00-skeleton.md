# Step 00 — Skeleton that serves a page

**Status:** done
**Date:** 2026-06-12

## What I did
- Installed Go 1.26.4 to `~/.local/go` (none was on the machine; no sudo needed).
- `go mod init quakelite` + `go get github.com/gorilla/websocket` (v1.5.3).
- `cmd/server/main.go`: `net/http` static server for `web/`, `--addr` flag whose default
  reads `ADDR`/`PORT` from env, falling back to `:8080` (deploy-readiness per SPEC §3).
- Created the full CLAUDE.md layout: stub packages `internal/{protocol,game,lobby,room}`
  (compile-clean, each with a purpose comment) and stub ES modules `web/js/*.js` with
  their primary exports. `room/client.go` declares the `websocket.Upgrader` so the
  dependency is real.
- `web/index.html`: Three.js 0.169.0 import map (CDN, `three` + `three/addons/`), empty
  `#lobby`/`#game` divs, `data:,` favicon to suppress the automatic /favicon.ico 404.

## Why
- BUILD_PLAN Step 0 exactly; nothing from later steps. Pinned three@0.169.0 = latest
  0.16x per SPEC §3. `web/map.json` exists as an empty-schema placeholder (layout says it
  exists; Step 1 fills it per SPEC §7) — flagged below.

## How (approach)
- One `http.ServeMux` with `http.FileServer(http.Dir("web"))`; REST/WS routes come later.
- `main.js` imports `three` + `config.js` and logs the revision — proves the import map
  and module serving work end to end. No protocol messages yet.

## How I verified
- `go build ./... && go vet ./...` clean, `gofmt -l` empty.
- Ran `go run ./cmd/server`; curled `/`, all 11 js/css assets, `/map.json` → all 200.
- Drove headless Firefox via geckodriver at `http://localhost:8080`: page title renders,
  `readyState: complete`, and the resource timeline shows **zero non-200 fetches**,
  including `three.module.js` 200 from the CDN — i.e. the import map resolved and
  `main.js` evaluated. `node --check` passes on every module. Server log: no panics.

## Deviations / TODO / risks
- Headless Firefox can't expose the console directly; I verified "no console errors" via
  the resource timeline + clean module evaluation. Worth one human eyeball on devtools.
- `map.json` is a placeholder (`name: "placeholder"`, empty boxes/spawns) until Step 1.
- Go lives at `~/.local/go/bin` — add it to PATH (`export PATH=$PATH:$HOME/.local/go/bin`).
