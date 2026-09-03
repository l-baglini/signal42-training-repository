# CLAUDE.md

Directives for whichever model (fresh or not) picks up work on this
project. **Read `SPEC.md` first** — that's the source of truth for what
this app is and why. This file is the "how to work on it", not a second
design doc; don't let the two drift out of sync — if a build decision
contradicts `SPEC.md`, update `SPEC.md`, don't leave it stale.

## What this is

**SetLog** (working title) — a mobile-first workout log & recap app, no
accounts, no backend, `localStorage` only. Full design in `SPEC.md`.

## Why this project has this exact structure

This is being built for Onetag's **Summer Playtime** challenge (Coders
Track, Session 7, Friday 24 July 2026 — the "Summer Build"). That challenge
imposes real constraints on how this repo has to look, not just on the app:

- **Deadline: Aug 31, 2026.**
- **Output repo**: a fork of `l-baglini/signal42-training-repository`,
  submitted via PR into `summer-playtime/gpinducciu/` in that repo (fork +
  PR workflow, per that repo's root `README.md`). This working copy
  currently lives locally; it still needs to be moved into that structure
  before submission — don't assume that's already done.
- **The three required artifacts** ("the craft", not optional extras):
  1. `SPEC.md` — the spec that directed the build. Exists, keep it current.
  2. **A human-owned review pass on the AI's work.** This is the important
     one to respect: don't self-certify. When you finish a chunk of work,
     say plainly what you built and what still needs the user's eyes on
     it — don't say "done" for anything the user hasn't actually reviewed.
     A previous attempt at this challenge (`../debt-city/`) skipped a real
     code review in favor of just playtesting; don't repeat that.
  3. `CLAUDE.md` — this file.
- **Two-minute demo, clear user** — the challenge explicitly rewards builds
  with both. Keep that in mind before adding anything not in `SPEC.md`:
  every extra screen or option is something to explain in that demo.
- The optional "Head Start" bonus (an LLM feature — see `SPEC.md` §9) is a
  stretch goal, not required. Don't build it before the core app in §2–§7
  of the spec is working and reviewed.

## Non-negotiable technical constraints

- Plain **HTML + CSS + vanilla JS**. No build step, no framework, no
  backend. "How do I run it" must stay "open `index.html`".
- `localStorage` persistence, exact keys as defined in `SPEC.md` §3
  (`setlog.sessions`, `setlog.customExercises`, `setlog.draft`).
- Mobile-first CSS: bottom tab bar, large tap targets, no hover-dependent
  interactions — this is meant to be used one-handed, mid-set, at a gym.
- Canvas for the Progress chart, hand-rolled. No charting library.
- Split `app.js` into modules (e.g. `storage.js`, `chart.js`, `ui.js`) only
  if it grows past ~500 lines — don't pre-emptively over-structure a
  single-page vanilla app.

## Build order

Follow `SPEC.md`'s screen order — each depends on data the previous one
writes, so building out of order means testing against nothing:

1. Data layer (`localStorage` read/write helpers, built-in exercise list).
2. **Today** — the only screen that writes sessions; everything else reads.
3. **History** — read + edit/delete sessions.
4. **Progress** — read sessions, chart them.
5. **Settings** — export/import/clear; needs real data to be testable
   against, build it last.

## Working process

- Scope is `SPEC.md`, nothing more. It was already negotiated once (a
  first pass over-scoped, got cut back, then explicitly re-expanded to
  "genuinely complete and usable" — the current version is the deliberate
  result, not a draft). If a feature idea comes up that isn't in there,
  flag it to the user rather than silently adding it.
- After implementing a chunk, sanity-check syntax (`node --check app.js`)
  before handing back for review — catch typos yourself, don't make the
  human's review pass do that job.
- Keep `README.md` accurate on how to run the app and current status.

## Current status

- [x] Data layer, Today, History, Progress, Settings all implemented per
      `SPEC.md`. Syntax-checked (`node --check app.js`) after every change.
- [ ] **Not yet reviewed by the user.** Nothing above should be treated as
      "done" for the challenge's craft requirements until that happens —
      see the review-pass rule above. Two known deviations from a literal
      reading of `SPEC.md` were flagged to the user for their review: a
      "Discard workout" button (not in the spec, added because starting a
      workout by mistake had no way out), and the Progress all-time summary
      being scoped per-exercise rather than app-wide (the spec wording was
      ambiguous between the two).

## Related, not part of this project

`../debt-city/` is a first attempt at this same challenge (a city-builder
game), set aside by the user in favor of this idea. Don't touch it unless
asked — it's kept around, not abandoned-and-fair-game.
