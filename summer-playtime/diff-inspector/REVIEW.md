# Review pass — JSON/CSV Diff & Inspector

The implementation was built by Claude from `SPEC.md`, manually smoke-tested
in a real browser (JSON diff, CSV positional diff, CSV key-column diff,
filtering, malformed-input errors, both export formats), then run through
`/code-review` at `high` effort against the staged diff. Six findings came
back; all were checked against the actual code (not just the report) before
deciding what to fix.

## Fixed

1. **Leading whitespace/blank lines corrupted CSV header detection.**
   `parseInput` trimmed the text before detecting JSON vs. CSV, but then
   passed the *untrimmed* raw text into `parseCsv` for the CSV branch. A
   leading blank line (common from copy/paste) turned the real header row
   into a data row and produced a single empty-string header, silently
   corrupting the whole diff. Fix: `parseCsv` now receives the already
   BOM-stripped, trimmed text.

2. **UTF-8 BOM not stripped.** A CSV exported from Excel (BOM-prefixed)
   would get a mangled first header (`"﻿id"` instead of `"id"`), making
   an identical column look like it was both added and removed. Fix: strip
   a leading `U+FEFF` in `parseInput` before format detection/parsing.

3. **Duplicate CSV header names silently dropped a column's data.**
   `diffCsv` matched shared columns by name and resolved each one's position
   with `indexOf`, which always returns the *first* match — so a CSV with
   two columns both named `notes` would never diff the second one, and could
   double-report the first. Fix: replaced the by-name `indexOf` lookups with
   a precomputed header→index-list map, pairing duplicate-named columns by
   occurrence order so each one is compared against its actual counterpart.
   This also removed the O(rows × cols²) of repeated linear scans the old
   approach did (now a Map lookup once per column, up front).

4. **Duplicate-key warning text inserted unescaped.** Every other render
   path in `app.js` routes text through `escapeHtml` before it goes into
   `innerHTML`; the CSV duplicate-key warning banner didn't, which is both
   an inconsistency and, if a key column contains HTML/script-like text, an
   XSS gap in this local tool. Fixed by routing the warning strings through
   `escapeHtml` too.

5. **Unterminated quoted CSV field parsed silently instead of erroring.**
   A pasted CSV with a stray/missing closing quote produced a truncated or
   merged field with no error, contradicting the "CSV parse error" surfaced
   for other malformed input. Fixed: `parseCsv` now throws
   `Unterminated quoted field` if the input ends while still inside a quote.

All five fixes were re-verified directly (not just re-read) against a
standalone extraction of the diff/parsing logic: leading-blank-line CSV,
BOM-prefixed CSV, an unterminated-quote CSV, and a duplicate-header CSV each
now behave as described above.

## Not changed

- **JSON arrays diff positionally, not with reorder detection.** Flagged in
  the spec as a deliberate v1 non-goal, not a defect — left as-is.
- **No debounced/live diffing.** Also deliberate (see `SPEC.md` and
  `CLAUDE.md`) — left as-is.

## Manual verification performed

- JSON example: added/removed/changed/type-changed all rendered correctly
  against a hand-checked expected diff.
- CSV example, positional mode: confirmed the expected row-shift noise when
  a middle row is deleted (this is the documented limitation of positional
  alignment, not a bug).
- CSV example, key-column mode (`id`): confirmed it collapses the same
  change down to the true added/removed/changed set (1/1/1), correctly
  isolating the deleted and inserted rows instead of cascading a shift.
- Filter box narrows the list correctly by substring match.
- Malformed JSON shows the native parse error message and the previous
  (stale) results are left in place, as intended.
- Both "Export Markdown" and "Export JSON" produce a correct, matching
  downloadable report for the current diff.
