# Blind Spot — notes for whoever picks this up

You lean to see. A webcam tracks head position; that one signal drives both an
off-axis projection (the screen behaves like a window, not a picture) and the
core verb (a target is hidden behind an occluder, and you must physically move to
a viewpoint that reveals it). The level geometry comes from the player's real
room.

Read SPEC.md first. It is not a summary written afterwards — it directed the
build, and it records the decisions and their reasons. PRIOR-ART.md records what
was already taken, and DEVLOG.md records what the build discovered that the spec
had wrong.

## The one line that must not be crossed

**The AI perceives. The engine judges.**

A depth model may say the chair is 80 cm away. A vision model may say it is a
chair and would make good cover. Neither may decide whether a target behind it is
reachable, fair, or dodgeable — that is geometry, computed deterministically, in
`src/engine/`.

No number the player sees comes from a model. If you find yourself about to let a
model output reach a game rule, you are about to break the thing that makes this
project worth showing.

## Layout

```
src/engine/     the solver. Imports NOTHING — not even from src/.
src/boundary/   validates and clamps untrusted scans before the engine sees them.
tests/          the invariants of SPEC §6.7 and the boundary guards.
tools/          instruments, not tests. They print measurements.
fixtures/       hand-authored rooms and synthetic bodies. No network in any test.
```

The dependency arrow points **inward**, which is why the shared types live at
`src/engine/types.ts` rather than in a top-level `types.ts`. `tests/purity.test.ts`
fails if an engine module grows an import from outside the directory, or reaches
for `fetch`, `Date`, `Math.random`, `performance`, `localStorage`, `window`,
`document`, `process`, `globalThis` or `navigator`.

Determinism is allowed to be random — `mulberry32` in `level.ts` is seeded, and
`Math.random` is not the same thing.

## Commands

```
npm test        the invariants and the guards. No network, no clock, no RNG.
npm run probe   what the solver thinks of each fixture room, per envelope.
npm run sweep   which candidate positions are fair. Use this to author fixtures.
npm run typecheck
```

`npm run sweep` exists because authoring a fixture by hand got it wrong the first
time: two occluders together wall off a side in a way the arithmetic for each one
separately does not show. Measure, do not calculate.

## Units

Centimetres and seconds, everywhere, with no exceptions. The screen plane is
`z = 0`, `x` right, `y` up; the player sits at `z > 0`, the scene at `z < 0`.
There are no pixels below the renderer. Fields carry their unit in the name
(`leanCm`, `windowCm`) because an earlier draft did not and it was ambiguous.

## Things that will bite you

- **A target behind an occluder that sits close to it is unreachable, always.**
  The player's leverage over the sightline is `(1 - s)` where `s` is how far along
  the eye-to-target segment the occluder plane falls. Cover close to the *window*
  is the only cover a lean can beat. See `leverage()` in `sightline.ts`.
- **Fairness thresholds are scaled to the measured body, not fixed.** The minimum
  lean is a fraction of the envelope's reach; the minimum peek window is a
  multiple of the tracker's measured jitter. Making either one a constant will
  pass the tests you expect and break the two that matter (I3's
  non-monotonicity characterisation, and I9).
- **Refusal is a first-class outcome**, not an error path. A room with nothing to
  hide behind, or a body that cannot move far, returns a typed refusal with the
  counts that explain it. Never make it return an empty level.
- **The guard tests prove containment, not correctness.** Nothing in the suite
  touches a network. They prove a wrong model answer stays harmless. Whether the
  room scan actually finds the chair is unverified and belongs to a human with a
  real room and a real key.

## State — resume here

`npm test` is green at 212 tests and `npx tsc --noEmit` is clean. Commits are
small and each one leaves the suite green, so `git log --oneline` is a reliable
account of what exists.

**Done, under test:** types; the boundary validator; the visibility solver
(`V(t)`, footprints, five reject reasons, level generation with typed refusal);
the dodge solver and its spawn gate; the off-axis projection; the calibration
that turns a stream of tracked positions into an `Envelope`. **All ten
invariants of SPEC §6.7 have tests** — I1–I6, I8, I9 in `tests/invariants.test.ts`
and `tests/purity.test.ts`, I7 in `tests/dodge.test.ts`, I10 in
`tests/projection.test.ts`.

**Next, in order — this is SPEC §14 and the cut order is bottom-up:**

1. **The WebGL renderer.** `src/render/projection.ts` is done and tested; what is
   missing is the GL layer that draws billboards through it. Port it from
   `prototype/headtracked-parallax.html`, which already does exactly this in
   plain WebGL2 — the shaders, the relief mesh and the debug toggle are all
   there and validated on real hardware. Keep the toggle.
2. **Head tracking** (`src/perceive/`). `calibrate.ts` is done and tested — it
   takes timestamped positions and returns an `Envelope` plus a quality report,
   and it is pure, so it needs no camera. What is missing is only the *tracker*
   that feeds it: MediaPipe iris landmarks, the inter-pupillary metric estimate,
   EMA plus forward prediction, and the latency measurement. All of that exists
   in the prototype. Pin `@mediapipe/tasks-vision` to 1.0.1 and pin the WASM
   fileset to the same version (SPEC §7.6).
3. **The playable loop** — waves, score, ninety seconds, the refusal screen. The
   engine already returns everything this needs.
   *Everything above this line is the minimum defensible build.*
4. **The live depth scan** (SPEC §7.2 and §7.6). Read §7.2 before writing a line
   of it: there are three non-obvious constraints there, and two of them are
   corrections to an earlier draft that told the implementation to do the wrong
   thing.
5. **The semantic scan** — one vision call per room, plus the cost panel.
6. *(optional, first to cut)* the director.

**Not started:** REVIEW.md. It has to be written by the author, not by a model —
the brief says so explicitly. DEVLOG.md lists what the tests cannot check, and
that list is the raw material for it.
