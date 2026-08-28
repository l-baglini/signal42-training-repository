# Why the current build fails — a measured diagnosis

**Date:** 2026-07-31
**Method:** simulation of the shipped pipeline against synthetic ground truth, using the
project's own geometry code path (`ml-matrix`, 8-unknown DLT with `h33 = 1`).
Scripts: [`sim/sim.mjs`](sim/sim.mjs) and [`sim/sim2.mjs`](sim/sim2.mjs) — run with
`node docs/research/sim/sim.mjs` from the repo root (they import `ml-matrix` from
`node_modules`).

This document exists because "the grid doesn't stay attached to the guitar" is a symptom
with several plausible causes, and the rebuild should be aimed at the real one. I measured
each candidate rather than guessing.

## Setup

A virtual pinhole camera (640×480, f = 500 px, no distortion unless stated) views a guitar
at 0.72 m, neck running diagonally across the frame, at a realistic playing-position angle
(yaw 28°, in-plane −18°, tilt 6°). Fretboard: 648 mm scale length, 45 mm string spread,
fret positions from `u(n) = 1 − 2^(−n/12)` — the same formula the app uses.

Three 40 mm ArUco markers sit on the guitar **body**, 18 mm below the fretboard surface
plane (a real body top face is roughly this far under the board). The pipeline is
reproduced exactly as shipped:

1. 4-tap calibration on the fretboard at pose 0 → `H0` (exact, the fretboard *is* planar).
2. Each marker corner is mapped through `H0⁻¹` into fretboard-space → persisted anchors
   (`src/core/markers.ts`).
3. At a new pose, the observed corners + stored anchors → a new `H` by least-squares DLT.
4. Finger dots are projected with that `H` and compared to ground truth.

Error is reported in **fret-widths** (the local fret spacing at that dot), because that is
what the PRD's ±0.25 success criterion is written in.

**Scale check:** at 640×480 and 0.72 m, the fret-5 space is only **19.2 px** wide. The
±0.25-fret spec is therefore a **±4.8 pixel** budget. That is a tight budget, and it is the
number every other decision has to be measured against.

## Result 1 — the geometry model is the primary defect

Markers on the body are **off the fretboard plane**, and — worse — the dots are
**extrapolated** well outside the marker cluster. A homography fitted to a small cluster and
evaluated far outside it amplifies every error, and an off-plane cluster makes the
homography flat-out the wrong model as soon as the guitar rotates.

| Scenario (3 markers, no detector noise) | mean | worst |
|---|---|---|
| no drift (calibration pose) | 0.00 | 0.00 |
| guitar leans 5° | 0.07 | 0.09 |
| guitar leans 10° | 0.14 | 0.17 |
| guitar leans 20° | **0.27** | **0.34** |
| neck swings 10° toward camera | 0.21 | 0.24 |
| neck tilts 10° in-plane | 0.12 | 0.14 |
| slides 30 mm along the neck | 0.04 | 0.05 |
| moves 50 mm closer | 0.01 | 0.02 |

Translation is handled well. **Rotation is not** — and rotation is exactly what a guitar does
when the player leans, breathes, or shifts position. A 20° lean alone blows the spec.

Now add realistic detector noise. `js-aruco2` does no sub-pixel corner refinement, so
±0.5 px is generous and ±1–2 px is normal with motion blur or glare:

| Corner noise (no drift) | mean | worst |
|---|---|---|
| 0 px | 0.00 | 0.00 |
| 0.25 px | 0.04 | 0.18 |
| 0.5 px | 0.08 | 0.36 |
| 1 px | 0.15 | **0.75** |
| 2 px | 0.37 | **1.61** |

At ±1 px of corner noise the worst dot is already **three-quarters of a fret off** — visibly
on the wrong side of a fretwire — with the guitar perfectly still.

## Result 2 — the single-marker fallback is catastrophic

`DECISIONS.md` states "One marker suffices; 2–3 give a wider baseline". The measurement says
otherwise. With 0.5 px corner noise and a 10° lean:

| Markers visible | mean | worst |
|---|---|---|
| 3 | 0.27 | 0.98 |
| 2 | 0.42 | 1.76 |
| 1 | **2.18** | **19.19** |

A single 40 mm marker gives four corners spanning ~40 px, and the pipeline extrapolates a
projective transform from that to a 500 mm neck. The lever arm is enormous. In practice a
strumming arm covers one or two markers constantly — so the app spends much of its time in
the 1–2 marker regime, where the overlay is not merely inaccurate but wild. **This alone
explains the "it flies off the guitar" behaviour.**

## Result 3 — two suspects are exonerated

I expected lens distortion and detection latency to be significant. Measured, they are not:

**Lens distortion** (unmodelled radial `k1`, 3 markers, 10° lean):

| k1 | at calibration pose | after 10° lean |
|---|---|---|
| 0.00 | 0.00 | 0.14 |
| −0.10 | 0.01 | 0.15 |
| −0.25 | 0.02 | 0.17 |
| −0.40 (very wide) | 0.04 | 0.20 |

Calibration absorbs most of it; even an aggressively wide lens adds only ~0.06 fret-widths.
Camera-intrinsics calibration is therefore *not* an urgent requirement.

**Latency** — H solved from a 66 ms-old frame (15 Hz detection) but drawn on the newest one:

| Guitar motion | lag error |
|---|---|
| slow drift, 5°/s | 0.00 |
| repositioning, 30°/s | 0.01 |
| reaching up the neck, 60°/s | 0.02 |

Negligible for *accuracy*. (It can still matter for *perceived* quality — a correctly placed
but visibly jittering overlay feels broken — but it is not why the dots land on the wrong
fret.)

**So the culprit is the geometry, not the plumbing.** Rewriting the same model in OpenCV
would not have fixed it. What is wrong is *what* is being tracked and *where the reference
points are*, not which library does the linear algebra.

## Result 4 — what a markerless detector buys, and the spec it must meet

Now change one thing: instead of markers on the body, detect keypoints **on the fretboard
itself** — fret-line endpoints at both board edges, frets 0–12. These points are genuinely
coplanar with the board (so a homography is the *correct* model) and the finger dots are
**interpolated between them** rather than extrapolated beyond them.

| Keypoint noise σ | mean | worst |
|---|---|---|
| 0.5 px | 0.01 | 0.05 |
| 1 px | 0.02 | 0.09 |
| 2 px | 0.04 | 0.17 |
| 3 px | 0.07 | 0.28 |
| 5 px | 0.11 | 0.54 |
| 8 px | 0.20 | 1.07 |

This is the headline result. **A sloppy neural keypoint detector at σ = 3 px beats a
perfect ArUco detector on the body by roughly 4×**, and stays inside spec out to σ ≈ 5–8 px.
The requirement on the model is far weaker than one might assume — this is a very reachable
target for a small custom model.

Occlusion by the fretting hand is a non-issue *provided the visible frets straddle the
region of interest* (σ = 2 px):

| Visible frets | mean | worst |
|---|---|---|
| hand over frets 3–7 (0–2 and 8–12 seen) | 0.06 | 0.21 |
| hand over frets 1–5 (0 and 6–12 seen) | 0.06 | 0.25 |
| only frets 7–12 (nut off-frame) | 0.40 | 2.64 |
| only frets 9–12 | **1.37** | **5.29** |

The failure mode is not occlusion per se — it is **short baseline**, which returns us to
extrapolation. Practical consequences for the rebuild:

- **Frame the whole neck**, nut included. A cropped view of frets 9–12 cannot be rescued by
  a better model.
- **Fret indexing matters as much as fret detection.** Knowing "there is a fret line here"
  is useless without knowing *which* fret it is. With a partial view this is the genuinely
  hard sub-problem (the `2^(−n/12)` spacing gives a strong projective-invariant prior —
  worth exploiting).

Two cheap multipliers:

| Temporal averaging (σ = 3 px, static) | effective σ | mean |
|---|---|---|
| 1 frame | 3.0 px | 0.07 |
| 3 frames | 1.7 px | 0.04 |
| 5 frames | 1.3 px | 0.03 |
| 10 frames | 0.9 px | 0.02 |

| Capture resolution | fret-5 space | 2 px error = |
|---|---|---|
| 640×480 | 19 px | 0.10 fret-widths |
| 1280×720 | 38 px | 0.05 fret-widths |
| 1920×1080 | 58 px | 0.03 fret-widths |

Running capture at 1080p and filtering the fitted pose over a few frames each buy roughly a
2× accuracy margin, for almost no effort. Both should be in the rebuild from day one.

## Conclusions for the rebuild

1. **Track the fretboard, not objects attached to the guitar.** Reference points must lie on
   the plane you are drawing on, and must bracket the drawing region. This is the whole
   ballgame; everything else is secondary.
2. **Never extrapolate a projective transform.** Any pose fitted from a cluster smaller than
   the region it is applied to will amplify noise without bound. Reject solves whose inlier
   spread is too small rather than drawing a wild overlay — the current code's "hold last H,
   status: lost" is better behaviour than what it does with one marker.
3. **The neural model's precision requirement is modest** (σ ≲ 3–5 px). This makes a custom
   fretboard-keypoint model the highest-value component to build, and it does not need to be
   large or exotic.
4. **Camera intrinsics and sub-33 ms latency are not blockers.** Don't spend early effort
   there.
5. **Capture at 1080p, filter the pose temporally, and require full-neck framing.** Cheap,
   large wins.
6. **A single homography is defensible** once the reference points are on the board — the
   fretboard is planar to within a fraction of a millimetre of relevance here. Full 6-DoF PnP
   on a 3D neck model is a refinement, not a prerequisite. (Whether string height above the
   board matters for dot placement is quantified separately in `01-markerless-tracking.md`.)

## Caveats

- This is a simulation. It models projection geometry and detector noise faithfully, but not
  motion blur, rolling shutter, autofocus hunting, exposure changes, or the actual detection
  rate of `js-aruco2` on a real guitar in real light. Those can only make the real numbers
  worse, not better.
- The marker geometry (three 40 mm markers, 18 mm off-plane, placed past the neck joint) is
  my reconstruction of a plausible setup, not a measurement of the user's actual rig. The
  qualitative conclusions — rotation sensitivity, extrapolation amplification, single-marker
  collapse — hold for any body-mounted arrangement; the exact numbers would shift with the
  real placement.
- Noise is modelled as i.i.d. Gaussian per corner. Real detector error is correlated across a
  marker's corners, which would somewhat reduce the effective noise on the fitted pose.
