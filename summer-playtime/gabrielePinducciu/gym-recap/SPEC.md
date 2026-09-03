# SetLog — Spec

*(working title — a lightweight "Hevy"-style workout log & recap)*

## 1. Pitch

A phone-friendly web app to log gym sessions (exercise / sets / reps /
weight) and see, at a glance, whether you're actually progressing. No
accounts, no cloud, no social feed — just you, your lifts, and a chart that
tells you if last week's weight went up or not.

**Clear user**: someone at the gym, on their phone, who wants to log a set in
under 10 seconds and glance at their last session's numbers before deciding
what weight to load next. This is meant to be genuinely used, session after
session — not just demoed once.

**Two-minute demo**: open the app → start a workout → add "Bench Press" →
log 3 sets → finish workout → flip to History and see it listed → flip to
Progress, pick Bench Press, see a chart with this session as the newest
point.

## 2. Screens (mobile-first, bottom tab bar)

1. **Today** — start/continue a workout: add exercises, log sets.
2. **History** — past sessions: view, edit, delete.
3. **Progress** — pick an exercise, see it charted over time.
4. **Settings** — export/import backup, clear data.

Four tabs. Bottom bar, large tap targets, no hover-dependent UI — this is
used one-handed, mid-set, at a gym.

## 3. Data model

```js
Exercise        { id, name, muscleGroup }        // built-in list + user-added
SetEntry        { reps, weightKg }
ExerciseEntry   { exerciseId, sets: SetEntry[] }  // one exercise within a session
WorkoutSession  { id, dateISO, exercises: ExerciseEntry[] }
```

Persistence: `localStorage`, keys:
- `setlog.sessions` — array of `WorkoutSession`
- `setlog.customExercises` — array of user-added `Exercise`
- `setlog.draft` — the in-progress session, if any (see §4)

Built-in exercises (≈15–20 common lifts, each with a `muscleGroup` tag) are
hardcoded in JS, always available alongside custom ones.

No backend, no account — everything lives in this browser's `localStorage`.
That's a deliberate architecture choice for a weekend/summer build (see
§8 for why, and how the app protects against losing that data anyway).

## 4. Today screen — logging a workout

- "Start Workout" (if none in progress) → creates a session dated today.
- The in-progress session is written to `setlog.draft` after every change
  (set added, exercise added, etc.) — **not just on Finish**. Reloading or
  closing the tab mid-workout does not lose it; the app reopens straight
  into the draft.
- "Add Exercise" → search/filter the combined built-in + custom list by
  name; pick one, or "+ New exercise" (name + muscle group) to add a custom
  one on the fly. Custom exercises are saved immediately, independent of
  whether the current workout is finished.
- For each added exercise: a growing list of sets — two number inputs
  (**reps**, **weight kg**) plus "+ Add set". Sets and whole exercises can
  be removed from the draft before finishing.
- "Finish Workout" → requires ≥1 exercise with ≥1 set; the session moves
  from `setlog.draft` into `setlog.sessions`, draft is cleared, Today
  resets to the empty "Start Workout" state.
- A quick stats banner at the top: workouts logged this week (Mon–Sun), and
  current streak (consecutive weeks with ≥1 workout).

## 5. History screen

- List of past sessions, newest first: date, one-line-per-exercise set
  summary (e.g. `Bench Press: 60kg×8, 60kg×8, 65kg×6`), and session total
  volume (`Σ reps × weightKg`).
- Tap a session → detail/edit view: adjust reps/weight on any set, delete a
  set or a whole exercise from that session, or delete the entire session.
  Edits save immediately back to `setlog.sessions`.

## 6. Progress screen

- Select an exercise (only ones with ≥1 logged set are listed).
- Canvas line chart: x-axis = session dates that included this exercise,
  y-axis = value per session, toggle between:
  - **Best weight** — max `weightKg` among that exercise's sets that session.
  - **Total volume** — `Σ reps × weightKg` for that exercise that session.
- Empty state ("Log a few sessions with this exercise to see a chart") if
  fewer than 2 data points.
- Below the chart: a small all-time summary line (total sessions logged,
  all-time best weight, all-time total volume across everything).

## 7. Settings screen

Exists specifically because "no backend" (§8) means the browser's storage
*is* the only copy of the data — this screen is what makes that safe to
rely on:

- **Export** — downloads `setlog-backup-YYYY-MM-DD.json` containing
  sessions + custom exercises.
- **Import** — pick a previously exported file, merges or replaces (ask via
  a confirm dialog: "Replace all data" vs "Merge, keeping both").
- **Clear all data** — wipes `localStorage`, behind a confirmation prompt.

## 8. Tech stack

- Plain **HTML + CSS + vanilla JS**, single page, no build step, no
  framework. This keeps "how do I run it" to "open `index.html`" — good for
  something meant to actually get used, not just demoed once from a repo.
- `localStorage` for persistence, single device. No login, nothing to set
  up, works offline by construction. The trade-off (no multi-device sync)
  is covered by the Export/Import in §7, which is the deliberate mitigation
  — not a gap being silently ignored.
- Canvas for the Progress chart, hand-rolled — no charting library needed
  for one line/dot chart.
- Mobile-first CSS: bottom tab bar, large tap targets, works well one-handed
  on a phone screen, the primary intended context.

## 9. Out of scope (genuinely later, not a hidden MVP cut)

- Accounts, cloud sync, multi-device — Export/Import is the answer for now.
- Rest timers, supersets, RPE/notes per set, bodyweight tracking, photos.
- Any social feature.
- **AI/agentic hook (optional Head Start bonus)**: a "weekly recap" feature
  where an LLM turns the week's sessions into a short natural-language
  summary ("New bench PR this week, but squat volume dropped 15% vs last
  week"). Clean, self-contained add-on once the core app is solid and
  actually being used — not required for this to count as complete.

## 10. File structure (target)

```
gym-recap/
├── SPEC.md
├── CLAUDE.md        # written after build + review
├── README.md
├── index.html
├── style.css
└── app.js            # split into modules (storage.js, chart.js, ui.js) if it grows past ~500 lines
```

## 11. Craft requirements (per the Summer Playtime challenge)

- This file is the spec that directs the build.
- Review pass: read the generated code before calling it done, don't just
  click through the UI.
- `CLAUDE.md` added after the build + review, documenting the data model,
  the four screens, how to run it, and what's next if picked up cold.
