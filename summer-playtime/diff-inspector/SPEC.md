# Spec — JSON/CSV Diff & Inspector

## Problem

Developers routinely need to compare two JSON or CSV payloads — an API
response before/after a change, two config files, an export from staging vs.
production — and answer "what actually changed, and where?" Generic text
diff tools show line noise (reordered keys, reformatted whitespace) instead
of the structural difference that matters.

## User

A developer with two blobs of JSON or CSV text who wants to know exactly
which fields/rows/cells differ, without spinning up a project or installing
a package. Single user, one session, no accounts.

## Goals

- Paste (or load from file) two JSON or CSV inputs and get a structural diff,
  not a line diff.
- For JSON: report added/removed/changed keys by full path (e.g.
  `$.items[2].name`), including type changes (e.g. string → number).
- For CSV: report added/removed rows and changed cells by column, optionally
  aligned by a chosen key column instead of row position.
- Summarize the diff (counts of added/removed/changed) before the detail.
- Filter the diff list by path/column substring.
- Export the diff as a Markdown report or a JSON report.
- Runs entirely client-side: open `index.html`, no server, no build step,
  no network calls, no data leaves the browser.

## Non-goals (v1)

- No line-level / character-level diff (that's what `diff`/`git diff` are
  for).
- No smart array-element matching for JSON arrays (e.g. LCS-based reordering
  detection) — JSON arrays are diffed positionally by index. Documented as a
  known limitation, not a bug.
- No XML/YAML/TOML support.
- No persistence, accounts, history, or multi-file batch comparison.
- No collaborative/real-time features.

## Functional behaviour

### Input & format detection

- Two independent inputs, labelled "Original" (left) and "Modified" (right).
- Each can be pasted directly or loaded from a local file via a file picker.
- Format is auto-detected per input: attempt `JSON.parse` first; if that
  fails, treat the text as CSV. A manual override (Auto / JSON / CSV) is
  available per input in case auto-detection guesses wrong (e.g. a CSV file
  whose first cell happens to parse as JSON).
- Empty input on either side blocks comparison with an inline error message
  ("Original input is empty").
- Malformed JSON surfaces the native `JSON.parse` error message plus the
  character position, so the user can jump to the problem.

### JSON diff algorithm

- Recursive structural walk from the root, keyed by JSON path
  (`$`, `$.key`, `$.arr[0]`).
- For two objects: union of keys. Key only in left → `removed`. Key only in
  right → `added`. Key in both → recurse.
- For two arrays: compared positionally by index. Extra trailing elements on
  either side are reported as `added`/`removed` at that index.
- For two primitives: equal → no entry. Different value, same type →
  `changed`. Different type → `type-changed` (value shown for both, with
  their types labelled).
- Mixing an object/array with a primitive at the same path is treated as
  `type-changed`.

### CSV diff algorithm

- First row is the header row. Column set is compared: columns only in left
  → `column removed`, only in right → `column added`. These are reported
  separately from row/cell diffs and don't block them.
- Row alignment has two modes:
  - **Positional (default)**: row *i* on the left is compared against row
    *i* on the right. If one side has more rows, the extras are reported as
    whole rows `added`/`removed`.
  - **Key column (optional)**: the user picks a column present on both
    sides. Rows are matched by the value in that column instead of position,
    so insertions/deletions in the middle of the data don't cascade into
    false positives for every row after them. Duplicate key values: first
    occurrence wins, and a warning is shown.
- For two matched rows, each shared column is compared cell by cell; a
  difference is reported as `changed` with the row's key (or index) and
  column name.
- Ragged rows (fewer cells than headers) are padded with an empty string
  and treated as a normal value for diffing purposes — not a parse error.

### Output

- Summary chips: counts of added / removed / changed (+ columns
  added/removed for CSV).
- A flat, filterable list of diff entries, each showing path/location, old
  value, new value. Text filter matches against the path/location string.
- "No differences found" state when inputs are structurally identical.
- Two export actions, both downloading a file client-side:
  - **Markdown report**: human-readable, grouped by kind, suitable for
    pasting into a PR description.
  - **JSON report**: the raw diff entries as JSON, for feeding into another
    tool.
- A "Load example" action fills in a small sample JSON pair and a sample CSV
  pair, for a fast demo without hunting for test data.

## Success criteria

- Two developers can paste real JSON API responses (or CSV exports) and get
  a correct, readable diff in under a minute, with no setup.
- Opening `index.html` directly from the filesystem (no server) works fully.
