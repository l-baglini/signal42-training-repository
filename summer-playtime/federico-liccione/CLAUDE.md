# Blind Spot — *to see is to be seen*

Notes for whoever picks this up.

You lean to see. A webcam tracks head position; that one signal drives both an
off-axis projection (the screen behaves like a window, not a picture) and the
core verb: an enemy is only visible from a position you have to move your head to
reach, and that is also the only position it can shoot you from.

README.md is the front door. Then, in this order:

- **SPEC §0** — the eight things the specification got wrong. Read it before the
  rest of SPEC, which directed the build and has deliberately *not* been edited to
  look right afterwards.
- **SPEC §15** — the game as shipped: the fuse derivation, the standing lineup, the
  selection step, the play envelope, difficulty, the levels, the tracker's recovery,
  the look. §1–§14 describe the game as *planned*, and the two differ. §15 exists so
  that this file plus SPEC is enough to **rebuild** the project rather than merely
  to recognise it; §15.12 is the build order that produces what ships.
- **PRIOR-ART.md** — what was already taken. §6 narrows the claim after
  implementation, because the pivot to a shooter moved this *closer* to the prior
  art on the verb.
- **DEVLOG.md** — what the build discovered the spec had wrong, and the process
  failures. The recurring ones are worth reading before writing any code here.

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
npm run setup   copies the MediaPipe WASM out of the pinned package and downloads
                the face model, the segmenter and 77 MB of depth weights into
                public/. Run once; `npm run dev` does it too. Nothing the app
                needs at runtime comes from a CDN.
npm run dev     the app, on localhost. The webcam starts itself after the first
                frame; `c` toggles it against the keyboard, `k` calibrates, `h`
                shows the engine's numbers.
npm run build   tsc then vite. The bundle is ~70 kB; keep an eye on it.
npm test        the invariants and the guards. No network, no clock, no RNG.
npm run levels  what the engine makes of every level, per body, with threat
                coverage in centimetres of lean. Read this before touching a layout.
npm run author  regenerates the levels: layouts by hand, anchors by sweep.
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
- **`import.meta.env.X` must be written as that literal expression.** It is a
  textual substitution, not a runtime value: aliasing `import.meta` to satisfy
  TypeScript makes the bundler substitute nothing and leaves a fallback that looks
  fine and is wrong — and it still works under `npm run dev`, because the dev server
  serves a real `import.meta.env`. It cost a deploy. Types for the two flags this
  project uses are in `src/env.d.ts`; asset paths deliberately use
  `document.baseURI` instead, so they depend on no substitution at all.

- **A leaf with no caller may not stay; a switch on a live path may.** Three
  separate features have been silently deleted here by having their call site
  removed while their tests stayed green — the typing guard, a whole `designLevel`
  block, and both legibility cues. Verify a feature by grepping the source *and*
  the built bundle for the **call**, never the definition.

### The look

Flat, bright, hard-edged, and that is deliberate. Two earlier looks were rejected
in playtesting — procedural materials, then a backlit silhouette look with haze,
shafts and grain. The reference the playtester gave is Minecraft and Geometry
Dash, and the rule that follows is: a face is one flat colour, the shading is
*which* face you are looking at, every edge is hard, and **nothing carries a depth
cue by removing contrast**. Five palettes in `src/render/mood.ts`, chosen by the
level's own words; `tests/mood.test.ts` asserts the ordering that keeps a block
reading as a block. Before adding any atmospheric effect, read the two relevant
DEVLOG sections — this has been got wrong twice.

**Cover may look like a block but must never be extruded.** The screen-parallel
constraint forbids the extrusion, not the block: a box with depth has a silhouette
wider than its own front face, which would promise cover the solver does not
grant. `coverMesh` bevels *inwards*, and a test asserts every vertex is inside the
rectangle and at exactly its depth.

- **Switching tracker must re-derive the level.** Every fuse is
  `reaction + latency + retreat/speed + margin`, and a webcam's latency is tens of
  milliseconds where a keyboard's is none. A lineup built against one and played
  through the other hands out fuses the body cannot beat — the one direction this
  project's fairness may never cut. `afterTrackerChange` and the 20 ms drift check
  in the frame loop exist for that, and both skip mid-round because a rebuild
  restarts the round.

- **Losing the head is not the same as having no information.** A snap that takes
  one eye out of frame used to freeze the viewpoint until both came back.
  `src/perceive/reacquire.ts` holds the answers, pure and tested: one eye out means
  keep tracking laterally with the depth held; both out means dead reckon along the
  last measured velocity, bounded to 10 cm and 0.30 s, then hold. Do not replace
  that with a jump to an extreme — exposure here is symmetric, so guessing further
  out is as likely to walk into a sightline as out of one. And `status()` must keep
  distinguishing the four states: three of them are the tracker reporting something
  it did not measure.

- **Three estimators means three seams, and they share one rule.** Both irises, one
  iris plus the last separation, and dead reckoning all estimate the same quantity
  differently, so every switch steps the reported position. `publish()` in
  `camera.ts` is the only writer of the reported position for that reason: it takes
  a `handoffBias` on every switch and decays it. Do not add a fourth estimator
  without routing it through there, and do not smooth a seam locally — that is what
  turned a rubber band into a jump and produced a second complaint.

- **Aiming has two regimes and the split is on purpose.** Outside a round the
  crosshair *is* the OS cursor, one to one, because the panel has sliders and a
  text box in it. Inside a round the pointer is **locked** and the crosshair moves
  by accumulated deltas — which is the only thing a sensitivity setting can act
  on, since an absolute cursor already has the OS's acceleration baked in. Refusal
  to lock is not an error: absolute aiming keeps working and the slider marks
  itself inert.

- **The keyboard's head must be able to stop.** A key sets a velocity and releasing
  stops it; `shift` is the fast retreat. Do not reintroduce a spring back to rest on
  release — that version could only hold rest and the extremes, while the levels ask
  for 4 to 12 cm held inside a 1 to 3.5 cm window, and it made the no-webcam path
  unwinnable without failing a single test. The speed is set against the narrowest
  window the solver ships, not by feel: `tests/keyboard.test.ts` pins that.

### The round

**The room stands full.** Eight enemies from the first tick, they never leave, and
a kill is replaced after a beat. There is no spawn timer and reintroducing one is
how the game got boring: with a timer, the likeliest thing to happen when you lean
out is nothing.

***Which* eight is the engine's decision**, `chooseLineup` in
`src/engine/lineup.ts`: greedy maximum coverage, weighted by where the body spends
its time, so a modest lean is worth making and not only a full commit. Judge any
change with `npm run levels`, which prints threat coverage **in bands by distance
from rest** — the aggregate average hides everything that matters.

**Enemies reposition rather than move.** `repositionAfterS` steps an unobserved
enemy with a cold fuse to another position **the solver has already judged**. Do
not make them move freely: fairness here is a claim about a position, and a
trajectory would need a different theorem.

### Difficulty

**A difficulty may only move what is not fairness.** That is the rule, and it is
load-bearing: reaching into the lean floor, the jitter multiplier or the fuse
*derivation* would make "every enemy can be escaped" conditional on a radio button.
`src/game/difficulty.ts` moves how many stand, what a hit costs, how long an enemy
holds a position, which end of the cost range opens the round, and the fuse
**margin** — legitimate because the margin is slack over a derived floor rather
than a number in place of one. Not the round length (a constraint about necks) and
not the score (`pointsFor` already pays for lean and precision; a multiplier would
pretend the modes are comparable). `tests/difficulty.test.ts` asserts that no
setting makes a shipped enemy unfair, and that advanced is *genuinely* tighter
rather than merely labelled so. `DIFF=advanced npm run levels` measures it.

**One verb ships.** The engine can also ship enemies that already see the rest
position (`verb: 'duck'`, `allowInTheOpen`, `inTheOpenShare`) — tested,
documented, and shipping at 0, because the playtester played both and preferred
the single verb. Do not switch it on without asking them. What it needs if you do
is I11, enforced by `escapable`: never weaken it to "some cell is safe", that
version let through a lineup threatening 100% of the body's range.

### The levels

**They are generated: `npm run author`.** Layouts are hand-designed in
`tools/author.test.ts` — that part is taste — and the anchors are swept and
measured, because the one level whose anchors were placed by hand had four usable
positions out of twenty-one. Two rules came out of iterating them, both with
numbers in DEVLOG: **cover belongs near the window** (z = -46 to z = -22 tripled
the threat coverage at six centimetres of lean) and **edges matter more than
area** (a lattice of narrow uprights beat two big slabs, and is the only thing that
produced vertical peeking at all). The 3 cm column of `npm run levels` must stay
at 0%: that is the cover.

## State — resume here

`npm test` is green at **572 tests**, `npx tsc --noEmit` is clean, `npm run build`
is clean and the bundle is ~84 kB. Every commit leaves the suite green, so
`git log --oneline` is a reliable account of what exists — and each commit message
quotes the playtest complaint it answers, which makes it a better design history
than any summary.

**What ships.** Cover combat, ninety seconds, four authored levels, three
difficulties. Lean out to
see an enemy — which is also the only way for it to see you — aim and shoot with
the mouse, be back behind cover before its fuse completes. Eight enemies stand in
the room from the first tick. The webcam tracker, a real calibration, the off-axis
projection, the depth scan of the player's own room, a vision call that names the
furniture, a language call that writes a level from a sentence, the cost panel, the
palettes, the sound. All of it runs with no network except the two optional API
calls.

**All eleven invariants of SPEC §6.7 have tests** — I1–I6, I8, I9 in
`tests/invariants.test.ts` and `tests/purity.test.ts`, I7 in `tests/dodge.test.ts`,
I10 in `tests/projection.test.ts`, I11 in `tests/lineup.test.ts`.

**SPEC §0 lists what the spec got wrong; SPEC §15 says what the game actually is.**
Together with this file they are meant to be sufficient to rebuild the project from
nothing — if you find something you needed and could not find, that is a bug in
these two documents and worth fixing while you still remember what was missing.

**Present but not wired, on purpose, and not dead weight:**

- `src/game/round.ts` — the hunt mode. A real design iteration whose findings are
  in DEVLOG. Do not delete it and do not treat it as live.
- The dodge solver and I7. Same: cut on the playtester's evidence, which agrees
  with the literature.
- `allowInTheOpen` / `inTheOpenShare` — enemies that can already see the rest
  position. Built, measured, preferred against, and switched off. It is a
  parameter on a live path with a guarantee attached, which is why it stays where
  `nearestBreak` did not.

**The GL layer is not unit tested** and cannot be, headlessly. That is why all the
arithmetic lives in `render/geometry.ts` and `render/projection.ts`, which are. If
the picture looks wrong, suspect the GL wrapper last.

**Perception assets are local, never a CDN.** `tools/setup-assets.mjs` copies the
WASM out of the pinned npm package — so it cannot drift from the JS that loads it —
and downloads the models into `public/`, which is gitignored. MediaPipe is behind a
dynamic import, so the keyboard-only path stays a small bundle.

**Deployed**, from the `gh-pages` branch of the author's fork:
<https://fliccione.github.io/signal42-training-repository/>. Rebuild it with
`VITE_NO_SCAN=1 npm run build` — that flag is what removes the depth pipeline, and
Rollup then drops the whole `scanRoom` chunk, the transformers.js it pulls in and
the 23 MB ONNX runtime with it. Copy `index.html`, `assets/`, `mediapipe/` and
`models/face_landmarker.task` to the branch root with a `.nojekyll`; that is 38 MB.
Do **not** publish `models/transformers` — and note that shipping it once tripped
GitHub's push protection on a public Gist id inside a Whisper warning string, which
is a false positive and was fixed by not shipping code the hosted build cannot use.

**Still to do:**

- **REVIEW.md's final section.** The document exists and states its own provenance;
  the verdict at the end is the author's to write and is the part the brief is
  actually asking for.
- Open the PR. The branch is local only; `origin` is the upstream repo and `fork`
  is the author's.

**Playtesting has been happening**, and it has produced most of the recent
commits: the One Euro filter, the lateral threat model, the landing marker, the
axis mix, the warmth gradient, and hold-to-score all came from someone playing
this and saying what was wrong. Read those commit messages before changing any of
them — each one records the complaint it answers.

The tuning knobs, in the order they are worth turning: the three settings in
`src/game/difficulty.ts`, `PLAY_FRACTION` and `COMFORT_CM` in `src/main.ts`, the
layouts in `tools/author.test.ts`, `BIAS_TAU_S` and `DEFAULT_LIMITS` in
`src/perceive/reacquire.ts`, and `minCutoff` / `beta` in `src/perceive/oneEuro.ts`.
Change those, not the invariants — and not `leanFraction` or `jitterK`, which look
like tuning knobs and are fairness thresholds.

## If you are rebuilding this from scratch

SPEC §15.12 is the build order. Four things are worth knowing before you start,
because each cost this build real time:

1. **Write §6.7's invariants as tests before the solver.** They are what decides
   whether this is a game or a toy, and two of them (I3's *non*-monotonicity, I11)
   are statements you will not arrive at by writing the obvious code first.
2. **Everything metric comes from measurement, and every failure direction is the
   same one.** A slower body, a noisier tracker, a slower machine: fewer enemies or
   more time, never a harder game. If you find yourself writing a constant where a
   measurement belongs, that is the mistake this project is organised to avoid.
3. **Build the pure parts first and instrument them.** `tools/` prints numbers, and
   more than half the findings in DEVLOG came from a seven-line probe rather than
   from reasoning. Anything you cannot measure you will get wrong in a way tests do
   not catch — the anchor-sampling aliasing took three attempts, and each wrong
   version was plausible.
4. **Extract the decision from the wiring.** `isTypingIn`, `reacquire.ts`,
   `combat.ts`, `lineup.ts` are all pure because the alternative is behaviour that
   only exists in an event handler — and this project has silently deleted three
   features that way, with the tests staying green throughout.


