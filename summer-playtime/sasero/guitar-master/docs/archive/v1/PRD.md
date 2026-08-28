# FretGuide — Product Requirements Document

| | |
|---|---|
| **Working title** | FretGuide (placeholder, rename freely) |
| **Document version** | 1.1 |
| **Status** | Approved for build — Phase 1 (MVP) |
| **Owner / sole user** | Zu |
| **Audience** | The implementing coding agent |
| **Deployment target** | Single personal laptop, runs 100% locally, no accounts, no backend, no network egress |

---

## 1. Overview

### 1.1 Problem
Learning guitar from static chord/scale diagrams forces the player to mentally translate a 2D chart onto the physical neck while also looking at their own hand. FretGuide removes that translation step: the player points a fixed camera at the guitar, selects a chord or scale in the UI, and finger-placement dots are drawn directly onto the live video of their own fretboard.

### 1.2 Core feature (the one thing v1 must nail)
> User selects a target (e.g., the **G major scale** box, or a **G major chord**) → correct finger-placement dots appear, correctly aligned, on the live video of the user's actual fretboard.

Everything else is secondary to this overlay being **accurate** and **stable**.

### 1.3 Goals
- Show accurate, readable finger-placement overlays for **scales/modes** and **chords**.
- Work with a **fixed phone-camera-on-tripod** rig pointed at the fretboard.
- Establish the video↔fretboard mapping via a **manual "recalibrate-tap"** flow (Phase 1), with a clean upgrade path to **fiducial markers** (Phase 2).
- Run entirely on the local machine. The camera feed never leaves the device.

### 1.4 Non-goals (explicitly out of scope for now)
- ❌ Multi-user, accounts, cloud sync, or distribution to other people.
- ❌ Automatic markerless fretboard detection in v1 (deferred; see §11).
- ❌ Audio analysis / "did I play the right note" detection (future, §12).
- ❌ Hand/finger tracking to verify placement (future, §12).
- ❌ Left-handed and alternate tunings in v1 (future, §12).
- ❌ Mobile/tablet builds. Desktop browser only.

---

## 2. User & Context

Single technical user, personal practice tool. The physical setup is a **decided constraint**, not a variable to support generically:

- **Camera:** a phone exposed to the OS as a standard webcam (via Continuity Camera / Iriun / Camo / DroidCam — any UVC-style bridge). Once it's a system camera device, the app reads it like any webcam.
- **Mount:** tripod, **fixed** for the session. The camera does not move.
- **View:** as head-on to the **fretboard face** as practical, framing roughly frets 0–12, neck running diagonally across the frame.
- **Drift assumption:** the rig is fixed, but the *guitar* will drift slightly over a session (leaning, sliding the fretting hand up the neck). v1 handles this with on-demand recalibration; Phase 2 handles it automatically.

---

## 3. Success Criteria

Because this is a personal tool, success is measured by usability and accuracy, not adoption.

| Metric | Target |
|---|---|
| Overlay alignment accuracy | Each dot visually sits on the correct fret space and string; center within ~±1/4 fret-width of the true finger position after calibration |
| Time to calibrate | < 30 seconds (4 taps + confirm) |
| Calibration durability | A single calibration remains usable for a full practice session of normal playing without re-tapping more than occasionally |
| Overlay frame rate | Renders smoothly at the camera's native FPS (≥ 30 FPS), no perceptible lag between video and dots |
| Selection-to-overlay latency | < 100 ms from picking a chord/scale to dots updating |
| "Does it help me practice" | Subjective: Zu can sit down, calibrate once, and practice a scale/chord without consulting an external diagram |

---

## 4. Methodology

**Chosen approach: lightweight incremental / iterative delivery — not full Scrum.**

Rationale (the technical-PM call you asked for): full Scrum ceremonies (sprint planning, daily standups, velocity tracking, story-point poker, retros) are theatrical overhead for a solo project executed by a coding agent. They exist to coordinate teams and forecast capacity — neither applies here. What *does* carry its weight:

- **Thin vertical slices** — each milestone delivers something runnable end-to-end, never a half-built layer.
- **User stories with explicit Gherkin-style acceptance criteria** — gives the agent unambiguous "done" conditions.
- **MoSCoW prioritization** (Must / Should / Could / Won't) — keeps the agent from gold-plating before the core overlay works.
- **A single Definition of Done** applied to every story.
- **Milestone-based phasing** instead of fixed-length sprints.

### 4.1 Definition of Done (applies to every story)
1. Acceptance criteria pass.
2. Pure/logic code (math, theory, data transforms) has unit tests; tests pass.
3. No TypeScript errors; linter clean.
4. Runs locally via a single documented command.
5. README updated if the run/calibration procedure changed.

---

## 5. Technical Architecture

### 5.1 Stack decision

**Recommendation: a pure-TypeScript local web app.** It plays to your existing front-end experience, runs entirely in the browser with zero backend, and the v1 computer-vision workload is light enough that no heavy CV runtime is needed.

| Layer | Choice | Why this | Alternative considered |
|---|---|---|---|
| Language | **TypeScript** | Type safety on the math (homography, fret coords) where bugs are silent and visual | Plain JS (rejected: too error-prone for the geometry) |
| UI framework | **React 18** | You know it; component model fits panel + canvas | Vue (also fine; pick React for ecosystem) |
| Build tool | **Vite** | Fast dev loop, simple static build | CRA (dead), Webpack (heavier) |
| State | **Zustand** | Minimal global store for calibration + selection; no boilerplate | Redux (overkill) |
| Camera | **`getUserMedia` / MediaDevices** | Reads the phone-as-webcam like any device; device picker for selecting it | — |
| Overlay render | **HTML Canvas 2D**, layered over the `<video>` | Cheap, precise, no GPU complexity needed for dots/lines | WebGL (unnecessary for v1) |
| Geometry (homography) | **Hand-rolled 4-point perspective transform** using **`ml-matrix`** for the linear solve | v1 needs only `getPerspectiveTransform` from 4 corner taps — an 8×8 linear system. Avoids shipping an 8 MB OpenCV.js wasm bundle | OpenCV.js (rejected for v1: heavy; reconsider only if CV grows) |
| Music theory | **`@tonaljs/tonal`** | Robust note/scale/interval math; gives scale pitch-class sets and chord notes | Hand-rolled theory (rejected: reinventing) |
| Chord voicings | **Curated JSON dataset** + CAGED movable-shape generation | tonal gives chord *notes*, not playable *fingerings*; voicings need curated data | — |
| Persistence | **`localStorage`** (or IndexedDB if it grows) | Save calibration + last selection; this is a real local app, browser storage is fine here | — |
| Markers (Phase 2) | **`js-aruco2`** (pure JS) | Detects ArUco corners per frame with no native build; feeds the same homography routine | Custom OpenCV.js w/ contrib aruco (rejected: build pain) |
| Optional native shell | **Tauri** (later) | If you want a real app icon/window instead of a browser tab; tiny footprint | Electron (rejected: bloated) |

**Alternative full stack, only if CV later expands a lot:** Python + `opencv-contrib-python` + a PySide6 or pywebview UI. Stronger CV (ArUco, solvePnP, future markerless detection are first-class), at the cost of a heavier/uglier UI and packaging. Not recommended for v1, but noted because it's the natural escape hatch if the vision work outgrows the browser.

### 5.2 Component / data flow

```
┌─────────────────────────────────────────────────────────────┐
│  Local Web App (browser, no backend)                          │
│                                                               │
│  [Phone-as-webcam] ──► <video> ──► Canvas overlay (per frame) │
│                                          ▲                    │
│  Selection Panel ──► Theory Engine ──► Fretboard Model ───────┘
│   (chord/scale)        (tonal +         (positions in          │
│                         voicings)        fretboard-space)      │
│                                          │                     │
│  Calibration (4 taps) ──► Homography H ──┘                     │
│                            (fretboard-space → pixels)          │
│                                                               │
│  localStorage: { calibration H, last selection }              │
└─────────────────────────────────────────────────────────────┘
```

Per-frame work in v1 is trivial: the homography and the selected positions are cached, so the render loop just re-applies a fixed transform and redraws dots over the current video frame. No per-frame CV. (Phase 2 adds per-frame marker detection to recompute H live.)

### 5.3 Data models

```ts
// Fretboard space: a normalized flat rectangle that the homography maps to pixels.
//   u ∈ [0,1] along the neck: u=0 at the NUT, increasing toward the bridge.
//   v ∈ [0,1] across the neck: v=0 at LOW E (string 6), v=1 at HIGH E (string 1).
// String numbering: 1 = high E (thinnest) ... 6 = low E (thickest).  ← keep consistent everywhere

type StringNumber = 1 | 2 | 3 | 4 | 5 | 6;

interface FretPosition {
  string: StringNumber;
  fret: number;        // 0 = open/nut
  finger?: 1 | 2 | 3 | 4; // 1=index..4=pinky; absent for scale notes
  isRoot?: boolean;       // emphasize root note differently
}

interface ChordVoicing {
  name: string;            // "A", "Am", "G", "F barre", ...
  positions: FretPosition[];
  open: StringNumber[];    // strings played open (draw "O" at nut)
  muted: StringNumber[];   // strings not played (draw "X" at nut)
  baseFret?: number;       // for movable/barre shapes
}

interface ScaleSelection {
  root: string;            // "A"
  scaleName: string;       // "dorian", "major", "minor pentatonic", ...
  positionWindow?: { minFret: number; maxFret: number }; // optional box
}

interface Calibration {
  // 3x3 homography mapping fretboard-space (u,v,1) -> image pixels (x,y,w)
  H: number[][];
  // the 4 image points the user tapped, stored so they can be visualized/edited
  taps: { x: number; y: number }[];
  farFret: number;         // which fret was tapped as the "far" reference (default 12)
  createdAt: number;
}
```

### 5.4 The geometry spec (de-risking the hardest part)

This is the part most likely to be implemented wrong, so it's specified exactly.

**Fret spacing (equal temperament, "12th-root-of-2"):** the distance from the nut to fret *n*, as a fraction of scale length, is

```
u(n) = 1 - 2^(-n/12)
```

So `u(0)=0` (nut) and `u(12)=0.5` (fret 12 sits at exactly half the scale length — this is why fret 12 is a convenient calibration target). The formula extends past 12 (`u(24)=0.75`).

**Finger dot location** for a fretted note (string `s`, fret `f`, `f ≥ 1`): centered in the fret *space* between fret `f-1` and fret `f`:

```
u_dot = (u(f-1) + u(f)) / 2
v_dot = (6 - s) / 5          // string 6 (low E) -> 0, string 1 (high E) -> 1
```

Open (`f = 0`) and muted strings are drawn as "O"/"X" markers just behind the nut (`u` slightly < 0).

**Calibration (recalibrate-tap):** the user taps **4 image points in a fixed prompted order**, each corresponding to a known fretboard-space point:

| Tap order | Prompt | Fretboard-space (u, v) |
|---|---|---|
| 1 | Nut × Low E | (0, 0) |
| 2 | Nut × High E | (0, 1) |
| 3 | Fret 12 × High E | (0.5, 1) |
| 4 | Fret 12 × Low E | (0.5, 0) |

(The "far fret" defaults to 12 but is user-selectable in case fret 12 isn't comfortably in frame; the fretboard-space u for the chosen fret is computed from `u(n)`.)

From these four (fretboard-space → image) correspondences, solve the 3×3 homography **H** (standard `getPerspectiveTransform`: an 8-unknown linear system, solve with `ml-matrix`). To draw any position: compute `(u_dot, v_dot)`, apply **H**, get pixel `(x, y)`, draw the dot there.

**Why a homography and not linear interpolation:** the fretboard is a perspective-projected plane *and* fret spacing is non-linear. The homography handles the perspective; `u(n)` handles the spacing. Doing only one of the two is the classic failure mode — flag it in code comments.

---

## 6. Functional Requirements — Epics, Stories, Acceptance Criteria

Priority tags: **[M]** Must, **[S]** Should, **[C]** Could.

### EPIC A — Camera & Video
- **A1 [M]** As the user, I can pick my camera device and see a live feed.
  - Given multiple camera devices, when I open the app, then I see a device picker and the chosen feed renders live.
  - Given I picked a device before, when I reopen, then the last device is preselected.
- **A2 [M]** The video fills a stable, fixed-aspect display area suitable for overlay.
  - Given a live feed, then the canvas overlay is pixel-aligned to the displayed video at all window sizes.

### EPIC B — Calibration (recalibrate-tap)
- **B1 [M]** As the user, I can calibrate by tapping 4 guided points.
  - Given I start calibration, then I'm prompted for tap 1..4 in order with a clear on-screen instruction and a visual marker per tap.
  - Given I mis-tap, when I click "undo", then the last tap is removed and re-prompted.
  - Given all 4 taps, then a homography is computed and a confirmation overlay (e.g., a faint full fret grid) is drawn so I can sanity-check alignment before accepting.
- **B2 [M]** Calibration persists across reloads until I redo it.
  - Given an accepted calibration, when I reload, then the overlay still aligns (until the rig/guitar moves).
- **B3 [M]** I can re-calibrate at any time with one action (button + hotkey).
  - Given drift, when I press the recalibrate hotkey, then the 4-tap flow restarts.
- **B4 [S]** I can choose which "far fret" I tap (default 12).

### EPIC C — Content Engine
> v1 ships **curated `FretPosition[]` datasets** (see **Appendix A**), not a general theory engine. The general, tonal-driven computation of arbitrary scales/chords across the whole neck is deferred (C4).
- **C1 [M]** The app ships the locked v1 content from Appendix A: the G major scale box and the seven diatonic chord voicings, each as a `FretPosition[]` with finger numbers, root flags, and open/muted strings.
- **C2 [M]** Given the current selection, the content engine returns the matching curated `FretPosition[]` (plus open/muted strings) for rendering.
- **C3 [M]** `tonal` is used to *validate* curated data (e.g., assert every position's note belongs to the selected chord/scale) and for the `(string,fret)→note` math.
- **C4 [Future]** General mode: compute arbitrary scales/chords across the neck from root+name via `tonal` + CAGED, instead of curated data. Deferred to a later milestone.
- Unit tests: G major box contains exactly the Appendix A positions with correct root flags; each chord's notes match its quality via tonal (e.g., C → {C,E,G}); note at (string 6 = low E, fret 3) = G; note at (string 5 = A, fret 3) = C.

### EPIC D — Overlay Rendering
- **D1 [M]** Given a selection + calibration, dots render at the correct positions on the live video.
  - Root notes are visually distinct (color/ring).
  - Chord finger numbers are labeled on each dot.
  - Open/muted strings show O/X near the nut.
- **D2 [M]** Dots redraw every frame, staying aligned to the (fixed) calibration as the video plays.
- **D3 [S]** Dots are rendered as semi-transparent rings so partially hand-occluded dots remain readable (occlusion is a known limitation, see §11).
- **D4 [C]** A toggle to show the full faint fret grid for orientation.

### EPIC E — Selection UI
- **E1 [M]** I can select a mode: **Scale** or **Chord**.
- **E1a [M]** Scale mode: v1 ships exactly one scale — **G major (Ionian), Option A box, frets 2–5** (Appendix A.1). The selector is present but single-entry, structured so more scales drop in as data later.
- **E1b [M]** Chord mode: v1 ships the **seven diatonic chords of G major** — G, Am, Bm, C, D, Em, F#dim (qualities: major, minor, diminished) (Appendix A.2).
- **E2 [M]** The current selection is shown and persists across reloads.
- **E3 [C]** A small reference diagram (static chart) shown alongside the live overlay.

### EPIC F — Shell & Persistence
- **F1 [M]** App runs locally via one documented command; no network calls leave the machine.
- **F2 [M]** localStorage holds `{ calibration, lastSelection, lastDeviceId }`.
- **F3 [C]** "Reset all" clears stored state.

---

## 7. Non-Functional Requirements
- **Privacy:** camera frames are processed in-memory only; nothing is uploaded, recorded, or persisted. No analytics, no telemetry.
- **Performance:** overlay at ≥30 FPS; selection→overlay < 100 ms; calibration solve < 50 ms.
- **Reliability:** a stored calibration must deterministically reproduce the same overlay on reload.
- **Maintainability:** geometry and theory are pure, framework-free, unit-tested modules with no React/DOM dependencies.
- **Browser:** target current Chromium (best `getUserMedia` + device handling). Document this.
- **Offline:** fully functional with no internet after install.

---

## 8. Phased Roadmap

### Milestone 1 — MVP (the core feature, end-to-end)
A1, A2, B1, B2, C1, C2, C4, D1, D2, E1/E1a/E1b, E2, F1, F2.
**Exit criteria:** Zu can open the app, pick the phone camera, tap 4 corners, select the G major scale box *or* one of the seven diatonic chords, and see correctly aligned dots on the live feed.

### Milestone 2 — Usability hardening
B3, B4, C3, C5, D3, D4, E3, F3 — recalibration ergonomics, occlusion-friendly rendering, barre shapes, scale boxes, reference diagrams.

### Milestone 3 — Phase 2 markers (drift auto-correction)
Replace/augment manual calibration with `js-aruco2`: detect 1–2 ArUco stickers per frame, recompute H live, eliminate manual re-tapping. Keep recalibrate-tap as fallback.
**Exit criteria:** overlay stays aligned through normal playing/drift with no manual re-tap.

### Milestone 4+ — Feature expansion
See §12.

---

## 9. Testing & QA Strategy

The challenge: CV alignment can't be verified in CI without a guitar. Split accordingly.

- **Automated (CI-able), pure logic:**
  - Theory: scale pitch-classes, chord voicings, `(string,fret)→note` math.
  - Geometry: generate a *known* synthetic homography, project the 4 corner points, feed them as "taps", solve, and assert the recovered H reproduces a set of test positions within epsilon. This fully tests the math with no camera.
- **Manual / visual acceptance (live):**
  - Calibrate, then visually confirm dots land on the right fret spaces; spot-check open/muted markers and root emphasis.
  - Drift test: play for several minutes, confirm when re-tap becomes necessary (informs Phase 2 priority).
- **Edge cases to cover:** far fret not 12; very oblique camera angle (document the angle beyond which accuracy degrades); window resize keeping canvas aligned to video.

---

## 10. Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Wrong geometry model (linear interp instead of homography + fret formula) | High | Spec in §5.4 + synthetic-homography unit tests |
| Camera angle too oblique → poor precision at far frets | Med | Guidance in README; user-selectable far fret; recommend head-on framing |
| Guitar drift invalidates calibration mid-session | Med | One-key recalibrate (v1) → markers (Phase 2) |
| Hand occludes the dots that matter most | Med | Can't be fixed optically in v1; semi-transparent rings + draw full target set; truly solved later via markers/prediction |
| Chord *fingerings* (not just notes) are real data, not derivable from tonal | Med | Curated voicing JSON + CAGED generation; don't assume tonal gives playable shapes |
| OpenCV.js bundle bloat if pulled in prematurely | Low | Hand-rolled 4-point transform for v1; only revisit if CV grows |
| Phone-as-webcam latency/quality | Low | Tolerable — overlay is computed from the same frame it's drawn on, so video+dots never desync; latency just delays the whole picture uniformly |

---

## 11. Deferred: Automatic Markerless Detection
Auto-detecting the fretboard from raw video (no taps, no markers) is the "frictionless universal" version discussed during scoping. It's a genuine research-grade CV problem (varied woods, lighting, occlusion, sub-fret precision) and is **explicitly deferred**. The chosen path — manual calibration → markers — sidesteps it entirely while delivering an accurate tool for a single user. Revisit only if FretGuide ever needs to work for other people on arbitrary setups.

---

## 12. Future Feature Candidates (backlog — the "what else could go in" analysis)
Not in scope now; recorded so the architecture leaves room for them.

1. **Audio note verification** — mic-based pitch/onset detection to confirm the played note matches the target (turns passive overlay into active feedback). Highest-value next feature.
2. **Hand-landmark feedback** — MediaPipe Hands to detect where fingers actually are vs. where the dots say, flagging misplacements.
3. **Chord-progression / song mode** — sequence chords with timing; advance through a song.
4. **Scale practice with metronome** — ascend/descend patterns, BPM control, highlight the next note.
5. **Rhythm/timing trainer** — strum-pattern guidance.
6. **Multiple tunings & capo** — recompute `(string,fret)→note` for drop-D, open tunings, capo offset.
7. **Left-handed support** — mirror the fretboard-space mapping.
8. **Lesson plans / progress tracking** — local-only practice history and streaks.
9. **Recording/playback** — capture a practice clip with overlay burned in for self-review.
10. **Gamification** — scoring on accuracy/timing once audio + hand feedback exist.

---

## 13. Open Questions / Decisions Log
- **[Decided]** Personal use only; no distribution.
- **[Decided]** Phone-on-tripod, fixed camera.
- **[Decided]** Recalibrate-tap first, markers second.
- **[Decided]** Pure-TS web app stack (§5.1).
- **[Decided]** v1 scale: **G major (Ionian), Option A box, frets 2–5** (Appendix A.1).
- **[Decided]** v1 chords: **seven diatonic chords of G major** — G, Am, Bm, C, D, Em, F#dim (Appendix A.2).
- **[Decided]** Calibration far fret: **12** (confirmed to sit comfortably in frame).

---

## 14. Appendix A — v1 Content Spec (locked)

Conventions: string 1 = high E (thinnest) … string 6 = low E (thickest). Fret 0 = open. Fingers: 1 = index, 2 = middle, 3 = ring, 4 = pinky. Encode these directly as `FretPosition[]` / `ChordVoicing`.

### A.1 — Scale: G major (Ionian), Option A box (frets 2–5)
2-octave box, standard one-finger-per-fret fingering with the index on fret 2. Root note = **G**.

| String | Frets (finger) | Notes |
|---|---|---|
| 6 (low E) | 3 (f2) **·root**, 5 (f4) | G, A |
| 5 (A) | 2 (f1), 3 (f2), 5 (f4) | B, C, D |
| 4 (D) | 2 (f1), 4 (f3), 5 (f4) **·root** | E, F#, G |
| 3 (G) | 2 (f1), 4 (f3), 5 (f4) | A, B, C |
| 2 (B) | 3 (f2), 5 (f4) | D, E |
| 1 (high E) | 2 (f1), 3 (f2) **·root**, 5 (f4) | F#, G, A |

Root positions to emphasize: (string 6, fret 3), (string 4, fret 5), (string 1, fret 3).

### A.2 — Chords: diatonic triads of G major
Notation per string from low E (6) → high E (1): a number = fretted, `0` = open, `x` = muted. Root flagged.

| Chord | Quality | 6 5 4 3 2 1 | Fingering (string:fret:finger) | Root |
|---|---|---|---|---|
| **G** | major | `3 2 0 0 0 3` | 6:3:2, 5:2:1, 1:3:3 | 6:3 (and 1:3) |
| **Am** | minor | `x 0 2 2 1 0` | 4:2:2, 3:2:3, 2:1:1 | 5:0 |
| **Bm** | minor (barre) | `x 2 4 4 3 2` | 5:2:1 (barre), 4:4:3, 3:4:4, 2:3:2, 1:2:1 (barre) | 5:2 |
| **C** | major | `x 3 2 0 1 0` | 5:3:3, 4:2:2, 2:1:1 | 5:3 |
| **D** | major | `x x 0 2 3 2` | 3:2:1, 2:3:3, 1:2:2 | 4:0 |
| **Em** | minor | `0 2 2 0 0 0` | 5:2:2, 4:2:3 | 6:0 |
| **F#dim** | diminished | `x x 4 2 1 2` | 4:4:4, 3:2:2, 2:1:1, 1:2:3 | 4:4 (and 1:2) |

Implementation notes for the agent:
- **Bm** is the only barre chord in the set — model it with `baseFret`/barre handling, and treat the two `f1` positions (strings 5 and 1) as a single barred index.
- **F#dim** is the hardest shape; the voicing above (F#–A–C–F#) is the chosen one — do not substitute.
- Validate every fretted note against the chord's quality via `tonal` in a unit test (e.g., C → {C, E, G}; F#dim → {F#, A, C}).

---

## 15. Glossary
- **Fretboard space** — normalized flat (u,v) rectangle representing the neck, before perspective projection.
- **Homography (H)** — 3×3 matrix mapping the flat fretboard plane to image pixels; accounts for camera perspective.
- **Equal temperament / 12th-root-of-2** — the rule placing fret *n* at `1 − 2^(−n/12)` of scale length.
- **Recalibrate-tap** — manual calibration by tapping 4 known points on the video.
- **ArUco / fiducial marker** — printed square pattern whose corners a CV library detects per frame, giving automatic pose (Phase 2).
- **Voicing** — a specific playable fingering of a chord (string/fret/finger), as opposed to just the chord's notes.
- **CAGED** — system of 5 movable chord shapes used to generate barre/movable voicings by root.
- **Occlusion** — the fretting hand covering the very fret positions the dots mark.
