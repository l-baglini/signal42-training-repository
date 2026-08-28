# Blind Spot — notes for whoever picks this up

You lean to see. A webcam tracks head position; that one signal drives both an
off-axis projection (the screen behaves like a window, not a picture) and the
core verb: an enemy is only visible from a position you have to move your head to
reach, and that is also the only position it can shoot you from.

README.md is the front door. Read **SPEC §0 before SPEC** — it lists the six
things the specification got wrong, because SPEC directed the build and has
deliberately not been edited to look right afterwards. PRIOR-ART.md records what
was already taken (§6 narrows the claim after implementation), and DEVLOG.md
records what the build discovered the spec had wrong, plus the process failures.

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

`npm test` is green at **529 tests**, `npx tsc --noEmit` is clean, `npm run build`
is clean and the bundle is ~70 kB. Every commit leaves the suite green, so
`git log --oneline` is a reliable account of what exists — and each commit message
quotes the playtest complaint it answers, which makes it a better design history
than any summary.

**What ships.** Cover combat, ninety seconds, four authored levels. Lean out to
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

**Read SPEC §0 before SPEC.** It lists the six things the specification got wrong,
with pointers into DEVLOG. The rest of the document still describes the build.

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

**Still to do:**

- **REVIEW.md.** It has to be written by the author, not by a model — the brief
  says so explicitly, and a model-written review of a model-written codebase is
  worth nothing. DEVLOG's list of what the tests cannot check is the raw material.
- A GitHub Pages deploy, for a clickable link. The keyboard path and the authored
  levels need no models, so a static build is enough.
- Open the PR. The branch is local only; `origin` is the upstream repo and `fork`
  is the author's.

**Playtesting has been happening**, and it has produced most of the recent
commits: the One Euro filter, the lateral threat model, the landing marker, the
axis mix, the warmth gradient, and hold-to-score all came from someone playing
this and saying what was wrong. Read those commit messages before changing any of
them — each one records the complaint it answers.

The tuning knobs, in the order they are worth turning: `PLAY_FRACTION` and
`COMFORT_CM` in `src/main.ts`, `waveSize` and `repositionAfterS` in
`src/game/combat.ts`, the layouts in `tools/author.test.ts`, and `leanFraction` /
`jitterK` in `src/engine/level.ts`. Change those, not the invariants.


