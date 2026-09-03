# Lunch Manager

Onetag A7 — Summer Build.

Employees pick a venue (mensa, restaurant, takeaway) and place their lunch
order before that venue's own ordering deadline. The office manager opens a
dashboard for the day, sees every request grouped by venue, and clicks
"Generate message" to get a ready-to-send summary for that venue — no more
retyping everyone's order by hand.

The intent, data model and acceptance criteria this was built against live
in [SPEC.md](SPEC.md); how the project is put together (for a human or a
model) is in [CLAUDE.md](CLAUDE.md).

## Quick start

```bash
npm install
npm run dev        # http://localhost:8900
```

Or with Docker (no setup required):

```bash
docker compose up --build   # http://localhost:8900
docker compose down -v      # stop and wipe the data
```

Three example venues are seeded on first run. Add real ones from the
"Aggiungi locale" form at `/manager`.

## Optional: AI-drafted manager messages

Without any configuration, "Generate message" on the manager dashboard
produces a plain, deterministic list. Set `ANTHROPIC_API_KEY` (in `.env` or
in the Compose environment) to have Claude draft a friendlier, ready-to-copy
message instead — it's a genuine convenience, not a requirement, and the app
works fully without it. `ANTHROPIC_MODEL` lets you pick a specific model
(defaults to `claude-opus-5`); see [CLAUDE.md](CLAUDE.md#the-ai-feature) for
the exact behaviour and fallback guardrail.

## Development

```bash
npm run typecheck
npm run build
npm test
```

## Notes

- No login: identity is a name plus a private edit link (see SPEC's
  non-goals for why).
- Cutoff times are evaluated on the server's local clock; Docker Compose
  pins `TZ=Europe/Rome`.
