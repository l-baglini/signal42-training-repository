# ProtestApp ✊

A public map of strikes, demonstrations, marches, and sit-ins across Italy — aggregated automatically from institutional sources and community feeds, enriched by AI, and open to contributions from verified organizations.

**Live:** [protestapp.vercel.app](https://protestapp.vercel.app)

---

## What it does

ProtestApp scrapes Italian civil action events from multiple sources (government registers, union websites, Telegram channels), extracts structured data using Claude AI, geocodes locations via OpenStreetMap, and presents everything on an interactive map with filtering by type, region, date, and topic.

- **Interactive map** — events grouped by location with paginated popups (‹ 1/2 ›) when multiple events share the same area; clickable legend to filter by event type
- **Individual event pages** at `/eventi/[id]` with full details, tags, and calendar export
- **Shareable filters** — active filters are synced to the URL so any view can be bookmarked or shared
- **PWA** — installable on mobile and desktop, works offline with a cached app shell
- **Mobile-first layout** — full-screen map with a bottom tab bar (Mappa / Lista), collapsible filter panel
- **RSS feed** at `/api/feed` and **iCal export** at `/api/events/ical` (supports the same filters as the main UI, plus `?id=` for a single event)
- **Territory-based notifications** — registered users receive daily email digests filtered by region, event type, and topic
- **Organization submissions** — verified organizations can submit events directly through a moderation workflow

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind CSS v4 |
| Map | Leaflet + OpenStreetMap tiles |
| Database | Supabase (PostgreSQL) + Row Level Security |
| Auth | Supabase Auth — magic link + Google OAuth |
| AI | Claude (Anthropic) — structured extraction + multi-label tagging via Tool Use + Prompt Caching |
| Geocoding | Nominatim (OSM) — free, no API key |
| Email | Resend (SMTP) — auth magic links + event digest notifications |
| Hosting | Vercel + GitHub Actions (scraping cron) |

---

## AI pipeline

```
Scrapers (cgsse.it / MIT / Telegram channels)
  → RawEvent { title, raw_text, source_url }
  → Claude — Tool Use + Prompt Caching
  → ExtractedEvent { title, type, tags[], city, region, dates }
  → Nominatim → lat/lng
  → Supabase upsert (dedup via content_hash)
```

The system prompt is cached by Anthropic after the first call, cutting input token cost by ~90% on subsequent batch extractions.

---

## User roles

| Role | Access |
|---|---|
| Anonymous | Browse map, filter events |
| User | + Email notifications by territory, event type, and topic |
| Association | + Submit events for moderation, propose new feed sources |
| Admin | + Approve association requests, moderate submitted events |

---

## Local setup

### 1. Clone and install

```bash
git clone https://github.com/federico-liccione/protestapp.git
cd protestapp
npm install
```

### 2. Environment variables

```bash
cp .env.example .env.local
```

| Variable | Where to find it |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API (secret) |
| `CRON_SECRET` | Any random secure string |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` for local dev |
| `RESEND_API_KEY` | [resend.com](https://resend.com) → API Keys |
| `NOTIFY_FROM_EMAIL` | e.g. `ProtestApp <noreply@yourdomain.com>` |

### 3. Database setup

Run the following SQL files in order in your **Supabase SQL Editor**:

```
supabase/001_auth_schema.sql            — profiles, notifications, association_requests, submitted_events
supabase/002_fix_rls_recursion.sql      — RLS fix: SECURITY DEFINER function for role checks
supabase/003_profiles_insert_policy.sql — allow upsert on first login
supabase/004_notification_last_notified.sql — last_notified_at column for dedup
```

To set yourself as admin after first login:
```sql
UPDATE public.profiles SET role = 'admin' WHERE email = 'your@email.com';
```

### 4. Email setup (Resend)

All transactional email — both **magic link login** and **event digest notifications** — goes through [Resend](https://resend.com) (free tier: 3,000 emails/month).

**Auth emails (magic link)**

In **Supabase → Project Settings → Authentication → SMTP Settings**:
- Enable custom SMTP: **on**
- Host: `smtp.resend.com`
- Port: `465`
- Username: `resend`
- Password: your Resend API key
- Sender email: your verified sender (e.g. `noreply@yourdomain.com`)

This replaces Supabase's built-in mailer (which is rate-limited to ~3 emails/hour).

**Notification emails**

Set `RESEND_API_KEY` and `NOTIFY_FROM_EMAIL` in your environment. Without a verified domain, use `onboarding@resend.dev` as sender — this works only for emails to your own Resend account address. To send to all users, [verify a domain](https://resend.com/domains) and update `NOTIFY_FROM_EMAIL`.

### 5. Supabase Auth configuration

In **Supabase → Authentication → URL Configuration**, add:
- Site URL: `http://localhost:3000`
- Redirect URLs: `http://localhost:3000/auth/callback`

### 6. Run

```bash
npm run dev
```

### 7. Trigger scraping manually

```bash
curl -X POST "http://localhost:3000/api/scrape?secret=YOUR_CRON_SECRET"
```

---

## Deployment

Push to `main` — Vercel deploys automatically.

Set all environment variables in the Vercel dashboard and update `NEXT_PUBLIC_SITE_URL` to your production URL. Add the production callback to Supabase Auth redirect URLs:
```
https://your-app.vercel.app/auth/callback
```

### Scraping + notifications cron (GitHub Actions)

The Vercel free tier has a 60s timeout on API routes, which is not enough for the full scraping pipeline. GitHub Actions runs it instead, and calls `/api/notify` automatically after each run:

1. Go to **Settings → Secrets → Actions** and add:
   - `CRON_SECRET` — same value as in `.env.local`
   - `APP_URL` — your Vercel deployment URL (e.g. `https://protestapp.vercel.app`)
2. The workflow in `.github/workflows/scrape.yml` runs automatically once a day (19:00 UTC)
3. Can also be triggered manually from **Actions → Scraping pipeline → Run workflow**

---

## Public API endpoints

| Endpoint | Description |
|---|---|
| `GET /api/events` | JSON list of upcoming events. Filters: `query`, `event_type`, `region`, `from_date`, `to_date`. Cached 60 s with stale-while-revalidate. |
| `GET /api/feed` | RSS 2.0 feed of upcoming events. Same filters as `/api/events`. |
| `GET /api/events/ical` | iCal (`.ics`) export. Pass `?id=<uuid>` for a single event, or the same filters as `/api/events` for a filtered set. |
| `GET /eventi/[id]` | Individual event page with full details and iCal download. |

---

## Adding sources

**Telegram channels** — edit the `TELEGRAM_CHANNELS` array in [src/lib/scrapers/telegram.ts](src/lib/scrapers/telegram.ts). Public channels only.

**RSS / web scrapers** — add a new scraper in [src/lib/scrapers/](src/lib/scrapers/) following the existing pattern, then register it in [src/lib/pipeline.ts](src/lib/pipeline.ts).
