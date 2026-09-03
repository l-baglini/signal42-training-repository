# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A two-part hobby project that surfaces claude.ai usage on a physical desk gadget:

- **`server.js`** — a Node.js/Express proxy on the user's PC. Reads the local Chrome/Chromium `claude.ai` session cookie, calls the private claude.ai usage API via `curl`, and re-exposes a small JSON summary at `GET /usage` over LAN HTTP.
- **ESP32-C3 firmware** (`claude_usage_roboeyes/claude_usage_roboeyes.ino`) — polls the proxy and renders usage as an animated face on a 128×64 SSD1306 OLED, plus a stats screen and snarky phrases.

There is no build step, no test suite, and no framework beyond Express. It is a single-file server plus one standalone Arduino sketch.

The electronics are housed in a 3D-printed "Compagnon #309" robot (MakerWorld model, credited in the README). Photos and the wiring diagram live in `images/` and are referenced by `README.md` — keep filenames stable, or update the README links if you rename them.

## Commands

```bash
npm install        # installs express + better-sqlite3 (native — needs a compiler)
npm start          # node server.js     — runs the proxy on :3456
npm run dev        # node --watch server.js
curl http://localhost:3456/usage        # smoke-test the endpoint
```

There is no linter, formatter, or test runner configured. Don't invent one unless asked.

**Mock mode** (test firmware faces without hitting claude.ai): `npm run happy|neutral|sad|angry|tired`, or `MOCK=<keyword|number> node server.js`. Driven by the `MOCK` env var, which short-circuits `getCachedUsage()` before the cookie/curl path. Keywords map via `MOCK_TIERS`; `tired`/`error` makes `/usage` return 500 (firmware TIRED face). Mocked payloads carry `"mock": true`. If you add a new face tier, update `MOCK_TIERS`, add an npm script, and keep it consistent with `moodFromPct` and the firmware thresholds.

## Architecture & data flow

```
Chrome cookie DB ──► getCookies() ──► fetchUsageViaCurl() ──► claude.ai/api/.../usage
                                              │
                                       fetchUsage() (parse + derive worst_pct, mood)
                                              │
                                    getCachedUsage() (60s TTL)
                                              │
                                         GET /usage  ──►  ESP32
```

Key functions in [server.js](server.js):

- `readChromeCookies()` / `getCookies()` — locate + read the Chrome SQLite cookie store; `decryptChromeValue()` does AES-128-CBC decryption of `v10`/`v11` values. Cookies cached for `COOKIE_TTL_MS` (4 min). Env vars `SESSION_KEY` / `CF_CLEARANCE` override.
- `fetchUsageViaCurl()` — **deliberately shells out to `curl`**, not Node `https`. This is load-bearing: curl's TLS fingerprint clears Cloudflare; Node's does not. Do not "modernize" this to `fetch`/`axios` — it will start returning 403s.
- `fetchUsage()` — maps the upstream `five_hour` / `seven_day` utilization fields to the flat response shape; computes `worst_pct = max(session, weekly)` and `mood`.
- `getCachedUsage()` — 60s response cache (`CACHE_TTL_MS`).

The ESP32 sketch mirrors the same usage tiers as `moodFromPct`, but with its own thresholds (faces flip at 40 % and 70 %, while the server's `mood` string flips at 40/70/90). Keep that in mind — server `mood` and firmware face are computed independently.

## Conventions specific to this repo

- **Single-file modules.** `server.js` is intentionally one file with section-banner comments (`// ──────`). Match that style; don't split into modules unless asked.
- **The sketch and `server.js` must stay in sync.** If you change the JSON field names, poll interval, or any other shared contract, update both to keep them consistent.
- **JSON field names are a contract** between `server.js` and the firmware (`session_pct`, `weekly_pct`, `worst_pct`, `session_reset_minutes`, etc.). Renaming one requires touching the corresponding `doc["..."]` reads in the sketch.
- **RoboEyes display ownership:** in `claude_usage_roboeyes.ino`, never call the manual draw functions (`drawStats`, `drawPhrase`, `drawSplash`) while `currentView == VIEW_FACE`. `eyes.update()` owns the framebuffer during the face view. The `loop()` state machine enforces this — preserve it.
- ArduinoJson **v7** API (`JsonDocument doc;`, no capacity arg). Don't downgrade to v6 idioms.

## Gotchas

- `better-sqlite3` is a **native** dependency; `npm install` needs build tools. If it fails to load, the server still starts but cookie auto-reading is disabled (falls back to env vars).
- Cookie reading paths in `CHROME_DB_PATHS` are **Linux-only** (snap Chromium + native paths). macOS/Windows aren't handled — use the `SESSION_KEY` env-var fallback there.
- `ORG_ID` in `server.js` is hard-coded to one account. It must match the logged-in user's org or the API returns the wrong/empty data.
- The proxy serves **unauthenticated** usage data over plain HTTP — intended for trusted LAN only. Don't add internet exposure features without flagging the risk.

## Sensitive data

The committed sketch contains a real-looking Wi-Fi SSID/password and the server contains a real `ORG_ID`. Treat these as secrets — don't echo them into new files, logs, commit messages, or anything that leaves the machine. If asked to share or publish the repo, flag that these should be scrubbed first.
