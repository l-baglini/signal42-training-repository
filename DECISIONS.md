# Decisions & Assumptions

Records (a) assumptions made where the PRD was silent, and (b) any dependency
choice worth justifying. The PRD wins on _what_; the build prompt wins on _how_.

## Dependencies

All versions are **pinned exactly** in `package.json`.

| Package                        | Why                                                                 |
| ------------------------------ | ------------------------------------------------------------------- |
| `react` / `react-dom` 18.3.1   | Stack pin (React 18 + Vite). React 19 exists but the spec says 18.  |
| `vite` 5.4.21 + `@vitejs/plugin-react` 4.7.0 | Stable, well-tested with vitest 2. (Vite 6/8 exist but bleeding-edge.) |
| `typescript` 5.9.3             | Latest 5.x; fully supported by typescript-eslint 8 and Vite 5. (TS 6 is too new for the lint toolchain.) |
| `zustand` 4.5.7                | State store per spec. v5 exists; 4.x is the stable line.            |
| `ml-matrix` 6.13.0             | Linear solve for the 4-point homography (no OpenCV).                |
| `tonal` 6.4.3                  | See note below — this is the maintained package for `@tonaljs/tonal`. |
| `vitest` 2.1.9                 | Tests. v3 exists; 2.x pairs cleanly with Vite 5.                    |
| `eslint` 9 + `typescript-eslint` 8 + `eslint-plugin-react-hooks` 5 | Lint (flat config). |
| `prettier` 3                   | Formatting.                                                         |

**No** OpenCV.js, js-aruco2, MediaPipe, Electron/Tauri, backend, or extra state
library was added (per the build prompt's "do not add" list).

### `tonal` vs `@tonaljs/tonal`

The PRD/build prompt name `@tonaljs/tonal`. That scope is the **old** publish of
the library; the current, actively maintained umbrella package is plain
**`tonal`** (same project, same `Note`/`Chord`/`Scale`/`Interval` API). We use
`tonal@6.4.3`. This is a packaging detail only — the imports and behavior are the
tonal API the spec intends.

### `eslint-plugin-react-refresh` removed

The standard Vite-React template ships this lint rule, which warns when a file
exports more than just components. Our prescribed structure intentionally groups
a hook + components in `Camera.tsx`, so the rule produced only-noise warnings.
Removed it to keep `npm run lint` truly clean. React Fast Refresh still works in
dev — the plugin only adds a lint check, not the refresh behavior itself.

### npm audit advisories (dev-only)

`npm audit` reports the well-known **esbuild dev-server** advisory
(GHSA-67mh-4wv8-2f99) transitively via `vite`/`vitest`. The only published "fix"
forces Vite 8, which breaks the pinned stack. It affects the **dev server only**,
which we bind to `127.0.0.1`, and the app is local-only with no runtime network
egress. Accepted for M1; revisit if/when the stack moves to Vite 6+.

## Geometry / coordinates

- **Homography & taps live in NORMALIZED display space** `[0,1]×[0,1]`
  (0,0 = top-left of the displayed video, 1,1 = bottom-right), not raw pixels.
  The PRD says H maps fretboard-space → "image pixels"; we use a normalized image
  space so a stored calibration reproduces exactly across **window resizes** and
  **reloads** (PRD A2, B2, §7 determinism). At draw time we multiply by the
  current canvas CSS size. The math (`getPerspectiveTransform`/`applyHomography`)
  is identical; only the units of the "image" side are normalized.
- **Video/canvas alignment via matched aspect-ratio.** The stage container's CSS
  `aspect-ratio` is set from the video's intrinsic ratio, the `<video>` uses
  `object-fit: fill`, and the canvas overlays it 1:1. This avoids letterbox math
  entirely while staying undistorted (PRD A2).
- **Open/muted marker position.** The PRD says markers sit "just behind the nut
  (`u` slightly < 0)". Chosen value: `OPEN_MARKER_U = -0.045`.
- **Far-fret choices.** The PRD makes the far fret user-selectable (default 12).
  Offered set: 5, 7, 9, 12, 15. Changing it clears in-progress taps (the targets
  move).

## Content modeling (Appendix A)

- **Open-string roots.** Three chords have their root on an open string
  (Am→5:0, D→4:0, Em→6:0). To carry the root flag for emphasis, those are listed
  in `positions` as `fret: 0, isRoot: true` entries; the `open`/`muted` arrays
  still drive the O/X markers. Fretted roots are flagged directly on their
  positions. The renderer emphasizes an open-string root's "O" marker.
- **Bm barre.** Modeled with `baseFret: 2`; the two finger-1 positions (strings 5
  and 1) represent the single barred index. It is the only chord with `baseFret`.
- **F#dim.** Encoded exactly as the chosen `x x 4 2 1 2` voicing (F#–A–C–F#); not
  substituted.
- **Chord `quality` field.** Added to `ChordVoicing` (major/minor/diminished) to
  make the Appendix A quality column explicit and unit-testable. Not in the PRD's
  literal type, but a faithful, additive encoding of stated data.

## Scope

Built **only** Milestone 1 (PRD §8). Deferred features (markers, audio, hand
tracking, song mode, metronome, alternate tunings, left-handed, gamification,
Tauri, the general tonal-driven neck-wide engine) were **not** implemented.
