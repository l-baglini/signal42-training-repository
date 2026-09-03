# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev          # start Next.js dev server
npm run build        # production build
npm run lint         # ESLint
npm test             # vitest run (all tests)
npx vitest run src/lib/__tests__/geocoder.test.ts   # single test file

# Run the scraping pipeline locally (requires env vars)
npx tsx --tsconfig scripts/tsconfig.json scripts/run-pipeline.ts
```

## Architecture

The codebase has two distinct concerns: a **Next.js frontend/API** and a **scraping pipeline** that runs separately (via GitHub Actions or `POST /api/scrape`).

### Supabase — three client patterns

Using the wrong client is a common mistake. Choose based on context:

| Import | Client | Use when |
|---|---|---|
| `getSupabase()` from `@/lib/supabase` | anon, no cookie | server components, public API routes |
| `getAdminClient()` from `@/lib/supabase` | service role | scrapers, admin API routes, bypasses RLS |
| `createClient()` from `@/lib/supabase-server` | cookie-based SSR | auth-aware server components that need the session |

### Scraping pipeline

`src/lib/pipeline.ts` orchestrates: **scrape → filter → extract → deduplicate → geocode → upsert**

1. **Scrape** — four scrapers run in parallel: `cgsse`, `mit`, `telegram`, `centrisociali`. Each returns `RawEvent[]`.
2. **filterSeenUrls** — queries DB for known `source_url` values; drops already-seen events before sending to Claude (saves tokens).
3. **extractBatch** — calls Claude Haiku (`claude-haiku-4-5`) with Tool Use forced (`tool_choice: any`). System prompt and tool schema are marked `cache_control: ephemeral` for Anthropic prompt caching (~90% input token reduction on repeat calls). 5 concurrent requests, 6 s inter-batch delay (Tier 1 rate limit).
4. **deduplicateMit** — MIT publishes one notice per operator per strike. Groups by `(start_date, event_type, transport_sector, city)` and merges duplicates before DB insertion.
5. **Geocode** — Nominatim (OSM). Pre-loads up to 2000 known `(location_text, city) → (lat, lng)` pairs from DB to minimise API calls.
6. **Upsert** — `content_hash = sha256(title|start_date|city)` unique constraint in DB; `ignoreDuplicates: true` on conflict.

Digest posts (e.g. Telegram channels listing multiple events) can produce >1 `ExtractedEvent` per `RawEvent` — `pairs` expands these before dedup.

### Frontend (`src/app/page.tsx`)

The main page is `'use client'` — all map state lives in a single component. Key state:
- `mobileView: 'map' | 'list'` — switches between full-screen views on mobile; tab bar at bottom
- `filters` — synced to URL via `window.history.replaceState` (no router push; no re-render)
- `selectedGroup` + `selectedGroupIndex` — handles multiple events at the same lat/lng (paginated popup)

Leaflet is loaded with `dynamic(..., { ssr: false })` to avoid window-is-undefined errors.

`SidebarPanel` is extracted as a shared component used by both the mobile list view and the desktop sidebar — avoids defining components inside components.

### Auth & roles

`src/middleware.ts` protects `/profilo`, `/associazioni/eventi`, `/admin` — redirects to `/login` if no session. Roles are stored in `profiles.role`: `anonymous → user → association → admin`. Role checks use a `SECURITY DEFINER` function (see `supabase/002_fix_rls_recursion.sql`) to avoid RLS recursion.

### PWA

- Manifest: `src/app/manifest.ts` (Next.js `MetadataRoute.Manifest`)
- Icons: `src/app/icon.tsx` (512×512) and `src/app/apple-icon.tsx` (180×180) — generated at request time via `ImageResponse` from `next/og`, no image files needed
- Service worker: `public/sw.js` — cache-first for `/_next/static/*`, network-first for `/api/events`, navigate fallback for offline
- iOS safe areas: `viewportFit: 'cover'` in `layout.tsx` Viewport export; all edge elements use `calc(env(safe-area-inset-top/bottom) + N)` — header top, tab bar bottom, event page top

### Admin scripts

One-off and maintenance scripts under `scripts/` — run with `npx tsx --tsconfig scripts/tsconfig.json scripts/<name>.ts`:
- `run-pipeline.ts` — full pipeline run (used by GitHub Actions)
- `regeocode.ts` — backfill `lat/lng` for events with null coordinates
- `dedup-mit.ts` — one-off MIT deduplication utility
