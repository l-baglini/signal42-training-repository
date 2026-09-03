# Lunch Manager — Spec

Summer Build (Onetag A7) — Marco Lucchesi.

## Intent

The office manager currently has to collect everyone's lunch choice by chat/word
of mouth, then manually retype it into a message per restaurant/canteen before
each place's own ordering deadline. That step is error-prone and slow, and
late orders get missed. This tool centralizes the requests and gives the
office manager one button per venue to produce the message to send.

## Users

- **Employee** — picks a venue for a given day, says how they want it (eat-in
  or takeaway) and what they want, before that venue's cutoff time.
- **Office manager** — for a given day, sees every request grouped by venue,
  and gets a ready-to-send message per venue.

## Core flow

1. Manager configures the venues once: name, mode (eat-in / takeaway / both),
   and a daily ordering cutoff time (e.g. "order by 10:30").
2. An employee opens the page, picks a date (today or one of the next two
   weeks), picks an open venue, fills in name + order + mode, and submits.
   A venue whose cutoff for that date has already passed cannot be selected.
3. An employee can cancel or edit their own request until the cutoff, using a
   private edit link saved in their browser (no login).
4. The manager opens the dashboard for a date, sees requests grouped by
   venue, and clicks "Generate message" to get an AI-drafted, ready-to-copy
   summary for that venue. If the AI call is unavailable, a deterministic
   plain-list message is used instead — generation never blocks on the model.
5. The manager marks a venue as "sent" once they've forwarded it, so it's
   obvious what's left to do.

## Data model

- `venues`: id, name, mode (`dine_in` | `takeaway` | `both`), cutoff_time
  (`HH:MM`, server-local), contact (free text, optional), active.
- `requests`: id, venue_id, date (`YYYY-MM-DD`), person_name, mode, order_text,
  edit_token, created_at, cancelled_at.
- `sent_marks`: venue_id + date → sent_at.

## Acceptance criteria

- A request cannot be created or edited for a venue/date once that venue's
  cutoff for that date has passed — enforced server-side, not just hidden in
  the UI.
- The manager dashboard for a date shows every non-cancelled request for that
  date, grouped by venue, with a per-venue headcount.
- "Generate message" always returns a usable message — on any AI failure
  (no key, timeout, error) it falls back to a deterministic template rather
  than erroring out.
- An employee can cancel their own request before the cutoff without needing
  to know anyone else's data.

## Non-goals

- No authentication/login — this is a small internal tool; identity is a
  free-text name plus a private edit link, not a security boundary.
- No payments, no menu/pricing management, no real-time push updates (a page
  reload is enough).
- No multi-timezone support — the server's local time is the source of truth
  for cutoffs (set via `TZ=Europe/Rome` in Docker Compose).
- No dedup/merge of accidental double-orders by the same person — the manager
  eyeballs the list before sending, same as today.

## Risk tier (A1)

This is "make life better" tooling, not airplane code: worst case for a bug
is a wrong lunch order, not a production incident. Rigour is spent where it
actually matters — the cutoff-time boundary logic — and kept light
everywhere else (no auth hardening, no migrations framework, no e2e suite).

## Go further (done)

- **AI inside it**: the manager's per-venue message is drafted by Claude,
  with a deterministic fallback template as the guardrail, and the model is
  configurable via `ANTHROPIC_MODEL` so the cost is a visible, deliberate
  choice (see README).

## Done

- `npm run build && npm test` passes.
- `docker compose up --build` serves the app with no `.env` required for the
  core flow (AI drafting degrades to the fallback template without a key).
- A manager can seed at least one venue, an employee can place and cancel an
  order against it, and the manager can generate a message for it, end to end.
