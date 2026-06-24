# FretGuide

A personal, **local-only** desktop web app that overlays guitar finger-placement
dots onto a live webcam feed of your fretboard. Pick a scale or chord and the
correct dots appear, aligned to your real guitar.

This is **Milestone 1 (MVP)** per [docs/FretGuide-PRD.md](docs/FretGuide-PRD.md):
manual 4-tap calibration, the G major scale box, and the seven diatonic chords of
G major. No markers, no audio, no hand tracking — those are later milestones.

> **Privacy:** the camera feed is processed in memory only. Nothing is recorded,
> uploaded, or persisted. The app makes no network calls at runtime. Only your
> calibration, last selection, and chosen camera id are saved (in `localStorage`).

---

## Prerequisites

- **Node.js ≥ 20.19** (developed on Node 22). Check with `node --version`.
- **A current Chromium browser** (Chrome / Edge / Brave). Chromium has the best
  `getUserMedia` + device-enumeration support; other browsers are untested.
- A **phone exposed to the OS as a webcam**, on a fixed mount (see below).

## Install & run

```bash
npm install
npm run dev
```

Then open the printed URL (default **http://127.0.0.1:5173/**) in Chromium and
grant camera permission when prompted.

That's the single command to run the app: **`npm run dev`**.

### Other scripts

| Command            | What it does                                  |
| ------------------ | --------------------------------------------- |
| `npm run dev`      | Start the local dev server (the app)          |
| `npm test`         | Run the unit tests (geometry, content, theory)|
| `npm run lint`     | ESLint                                         |
| `npm run build`    | Type-check + production build to `dist/`       |
| `npm run preview`  | Serve the production build locally             |
| `npm run format`   | Format with Prettier                          |

---

## Expose your phone as a webcam

The app reads your phone like any other system camera once a UVC-style bridge
makes it one. Any of these work:

- **Continuity Camera** (iPhone + Mac, built-in, wireless).
- **[Iriun Webcam](https://iriun.com/)** (iOS/Android + Win/Mac/Linux).
- **[Camo](https://reincubate.com/camo/)** (iOS/Android + Win/Mac).
- **[DroidCam](https://www.dev47apps.com/)** (Android + Win/Linux).

Install the bridge's desktop client, connect the phone, and the phone shows up in
FretGuide's **Camera** picker.

## Camera placement

- Mount the phone on a **tripod, fixed** for the session — it must not move.
- Aim it **as head-on to the fretboard face as practical**.
- Frame roughly **frets 0–12**, with the neck running diagonally across the view.
- Very oblique angles reduce precision at the far frets — keep it as flat-on as
  you can. The guitar can drift a little during play; just recalibrate (press
  **C**) when the dots stop lining up.

---

## Calibration (the 4-tap flow)

1. Pick your camera in the **Camera** panel; confirm you see the live feed.
2. Press **C** (or click **Calibrate**). Optionally choose a different **far
   fret** (default **12** — fret 12 sits at exactly half the scale length, which
   is why it's a convenient target). Pick the far fret first; choosing it resets
   any taps.
3. Click the **4 points on the video**, in this exact prompted order:
   1. **Nut × Low E** (thickest string)
   2. **Nut × High E** (thinnest string)
   3. **Far fret × High E** (thinnest string)
   4. **Far fret × Low E** (thickest string)
   - Mis-tapped? Click **Undo last tap**.
4. After the 4th tap a **faint green fret grid** is drawn. Check that its lines
   sit on the real frets/strings, then click **Accept**.
5. Choose **Scale** or **Chord** and a target. The dots appear on the live feed.

Calibration is saved and survives reloads. Recalibrate any time with the
**Recalibrate** button or the **C** hotkey. **Reset all** clears everything.

### Hotkeys

| Key | Action               |
| --- | -------------------- |
| `C` | Start (re)calibration|
| `G` | Toggle the fret grid |

---

## How the overlay works (the geometry)

Two stages, **both required** — see [src/core/geometry.ts](src/core/geometry.ts):

1. **Non-linear fret spacing.** Fret _n_ sits at `u(n) = 1 − 2^(−n/12)` of the
   scale length. A dot for fret _f_ is centered in the fret space at
   `u = (u(f−1) + u(f)) / 2`. Frets are **not** evenly spaced — never linearly
   interpolate them.
2. **Perspective.** A 3×3 homography (solved from your 4 taps) maps the flat
   fretboard plane to the camera's perspective-projected pixels.

Doing only one of the two is the classic failure mode. The math is proven in CI
by a synthetic-homography round-trip test (no hardware needed).

**String numbering** is fixed everywhere: **string 1 = high E (thinnest) …
string 6 = low E (thickest)**, fret 0 = open. Standard tuning.

---

## Manual acceptance checklist

CV alignment against a real guitar can't run in CI — verify it by hand:

- [ ] App opens; the phone camera appears in the picker and the live feed renders.
- [ ] Pressing **C** starts calibration; the 4 prompts appear in order.
- [ ] Each tap drops a numbered marker; **Undo** removes the last one.
- [ ] After 4 taps, the green confirmation grid lines up with the real frets.
- [ ] **G major scale box**: dots land in the correct fret spaces on strings 1–6;
      the three **G roots** (string 6 fret 3, string 4 fret 5, string 1 fret 3)
      are visually emphasized (orange).
- [ ] **Each chord** (G, Am, Bm, C, D, Em, F#dim): fretted dots sit correctly,
      finger numbers are legible, and **O / X** markers show at the nut for the
      right open / muted strings.
- [ ] Dots stay aligned while the video plays and when you resize the window.
- [ ] Reload the page: calibration and selection are restored and still aligned.
- [ ] **Reset all** clears saved state.
- [ ] _Drift test:_ play for a few minutes; note when a re-tap becomes necessary
      (informs the Phase-2 marker work).

---

## Project structure

```
src/
  core/            # pure, framework-free, unit-tested
    types.ts       # FretPosition, ChordVoicing, ScaleBox, Calibration, …
    geometry.ts    # u(n), dot coords, getPerspectiveTransform, applyHomography
    content.ts     # PRD Appendix A datasets + selector
    theory.ts      # tonal-backed (string,fret)→note + validation
    __tests__/     # vitest specs (incl. synthetic-homography round-trip)
  app/             # React UI (Camera, OverlayCanvas, Calibration, SelectionPanel)
docs/FretGuide-PRD.md
DECISIONS.md
```

See [DECISIONS.md](DECISIONS.md) for assumptions and dependency justifications.
