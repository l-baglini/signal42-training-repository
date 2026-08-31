# CLAUDE.md — JSON/CSV Diff & Inspector

## What this is

A zero-dependency, client-side web app: paste two JSON or CSV blobs, get a
structural diff (added/removed/changed, by path — not a line diff). Built
for Onetag's "Summer Playtime" challenge as a one-shot build from a written
spec. See `SPEC.md` for the full functional spec that directed this build,
and `REVIEW.md` for the review pass done on the AI-generated implementation.

## Running it

No build step, no server required in principle — `index.html` can be opened
directly from the filesystem. For local development, serving it avoids any
browser quirks around `file://` origins:

```
python3 -m http.server 8934
# then open http://localhost:8934/index.html
```

There is no test suite, no package.json, no bundler. This is intentional —
see "Non-goals" in `SPEC.md`.

## Files

- `index.html` — markup and element IDs the JS binds to.
- `style.css` — all styling (dark theme, CSS custom properties at the top).
- `app.js` — everything else: CSV parsing, JSON diff, CSV diff, DOM
  rendering, export. Organized top-to-bottom as: CSV parsing → format
  detection → JSON diff algorithm → CSV diff algorithm → UI wiring.
- `SPEC.md` — the spec that directed the build. Read this first to
  understand *why* something works the way it does (e.g. why JSON arrays
  diff positionally, why CSV has a key-column mode).
- `REVIEW.md` — findings from the review pass and what was fixed.

## Key design decisions (don't relitigate without reason)

- **JSON arrays diff positionally by index**, not with a smart
  reorder-aware algorithm (no LCS/Myers diff on array elements). This is a
  documented v1 limitation, not a bug — see `SPEC.md` non-goals.
- **CSV row alignment defaults to positional**, with an opt-in "key column"
  mode (`diffCsv` in `app.js`) that matches rows by a chosen column's value
  instead of index, so an insert/delete in the middle of data doesn't
  cascade into false diffs for every row after it.
- **No live/debounced diffing** — comparison only runs on explicit
  "Compare" click (or when the key-column selector changes). This is
  deliberate: large pastes shouldn't trigger a diff on every keystroke.
- **Format detection** tries `JSON.parse` first, falls back to CSV, with a
  manual per-side override (`Auto`/`JSON`/`CSV`) for the rare case a CSV's
  first cell happens to look like valid JSON.
- **Everything is client-side.** No `fetch`, no backend, no analytics. Keep
  it that way — it's a stated goal ("nothing is sent anywhere," shown in the
  footer) and part of what makes it a true zero-setup tool.

## Extending this

- Adding a new diff "kind" (beyond added/removed/changed/type-changed/
  column-added/column-removed): update `renderSummary`, `renderDiffList`,
  and `toMarkdownReport` in `app.js` — they all switch on `entry.kind` and
  will silently omit an unhandled kind rather than error, so check all
  three.
- CSV parsing (`parseCsv`) is a hand-rolled RFC-4180-ish parser (quoted
  fields, doubled-quote escaping, embedded commas/newlines). If you need
  more CSV edge cases (different delimiters, BOM handling), extend it there
  rather than pulling in a library — the zero-dependency constraint is
  deliberate.
- If you add a build step or a framework, update this file and `SPEC.md`'s
  "Runs entirely client-side... no build step" goal, since that's currently
  a stated requirement, not an accident.
