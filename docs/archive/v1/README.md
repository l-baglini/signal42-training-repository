# FretGuide v1 — archived

**Frozen. Not built, not tested, not maintained.** Nothing in the live project
imports from here. It is kept because the rebuild is only legible next to the
thing it replaced.

v1 was a browser app: React + TypeScript, a 4-tap manual calibration, and
printed **ArUco markers** stuck to the guitar so the overlay could follow it.
It worked in the sense that all its tests passed and the dots landed correctly
the instant after you calibrated. It failed in the sense that nobody could use
it.

## Why it was abandoned

The overlay slid off the fretboard as soon as the guitar moved, and the last
commits here ([`v1: last attempt at rescuing marker
tracking`](../../../)) are instrumentation trying to see why. Panel telemetry
was the wrong tool; the failure was in the approach.

[`docs/research/00-diagnosis.md`](../../research/00-diagnosis.md) reproduced it
in simulation and named the cause: **four coplanar marker corners are the worst
available pose reference.** They force the fret law `u(n) = 1 − 2^(−n/12)` to be
extrapolated from the extremes, so corner error is amplified along the neck —
and a tight cluster of inliers produces a *confident-looking* homography that is
badly wrong. Measured: **1.37 fret-widths** of error when only frets 9–12 were
visible, against a budget of 0.25.

Two conclusions carried into v2:

1. **Per-fret keypoints, not board corners.** 26 points (both ends of frets
   0–12) over-determine an 8-DOF homography, so independent per-point error
   averages down instead of landing on the drawn dots. An occluded fret drops
   out of the fit rather than corrupting it.
2. **A pose can be confident and wrong.** v2 gates on inlier *spread*, not just
   inlier count, and refuses to draw when the gate fails. See
   [`fretguide/geometry.py`](../../../fretguide/geometry.py) →
   `solve_is_trustworthy`.

## What was salvaged

The music theory, chord voicings and fret geometry (~340 tested lines) were
ported to Python — `src/core/{geometry,theory,content}.ts` became
[`fretguide/{geometry,theory,content}.py`](../../../fretguide/). The marker
tracking, the calibration flow and the Canvas2D renderer were discarded.

## Contents

| Path | What |
|---|---|
| `web/` | The full Vite/React app as it last stood. `npm install && npm run dev` still works if you want to see it fail. |
| `markers/` | The printable ArUco sheet v1 required you to stick to your guitar. |
| `PRD.md` | The v1 product definition, superseded by [`docs/PRD-v2.md`](../../PRD-v2.md). |
| `DECISIONS.md` | v1's dependency and geometry rationale. The normalized-coordinate argument in it still holds and is why v2 also works in `[0,1]²`. |
| `README-v1.md` | v1's original README, including its manual acceptance checklist. |
