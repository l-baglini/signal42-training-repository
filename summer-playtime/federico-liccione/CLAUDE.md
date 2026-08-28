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
npm run setup   copies the MediaPipe WASM out of the pinned package and downloads
                the face model, the segmenter and 77 MB of depth weights into
                public/. Run once; `npm run dev` does it too. Nothing the app
                needs at runtime comes from a CDN.
npm run dev     the app, on localhost. Move the cursor as if moving your head,
                or press `c` for the real webcam and `k` to calibrate.
npm run build   tsc then vite. The bundle is ~18 kB; keep it that way.
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

`npm test` is green at 345 tests and `npx tsc --noEmit` is clean. Commits are
small and each one leaves the suite green, so `git log --oneline` is a reliable
account of what exists.

**Done, under test:** types; the boundary validator; the visibility solver
(`V(t)`, footprints, five reject reasons, level generation with typed refusal);
the dodge solver and its spawn gate; the off-axis projection; the calibration
that turns a stream of tracked positions into an `Envelope`; the scene geometry;
the scene geometry, the WebGL2 renderer, the webcam tracker, the round — a pure
state machine, tested like one — the depth scan that turns the player's actual
room into the level, and a runnable app that calibrates a real body and plays
ninety seconds against it. **All ten invariants of SPEC
§6.7 have tests** — I1–I6, I8, I9 in `tests/invariants.test.ts`
and `tests/purity.test.ts`, I7 in `tests/dodge.test.ts`, I10 in
`tests/projection.test.ts`.

**The app runs.** `npm run dev` gives the fixture room drawn through the
off-axis projection, driven by the mouse standing in for a head. Targets light up
the moment the sightline clears, the HUD shows the engine's verdict for every
candidate, `o` swaps the window for a dolly and `w` blanks the wall to trigger the
refusal screen. **The GL layer itself is not unit tested** — it cannot be,
headlessly — which is why all the arithmetic lives in `render/geometry.ts` and
`render/projection.ts`, which are. If the picture looks wrong, suspect the GL
wrapper last.

**Perception assets are local, never a CDN.** `tools/setup-assets.mjs` copies the
WASM out of the pinned npm package — so it cannot drift from the JS that loads
it — and downloads the 3.8 MB face model into `public/`, which is gitignored. The
app therefore runs with no network at all, which matters because the demo will be
shown in a room whose wifi is unknown. MediaPipe itself is behind a dynamic
import, so the mouse-only path stays a 23 kB bundle.

**Not verified by anything automatic:** whether the picture is *right*. The
geometry and the projection are tested; the GL wrapper and the tracker's real
accuracy need eyes and a face. Nothing headless can check them.

**The minimum defensible build is complete.** Everything below is upside.

**Next, in order — this is SPEC §14 and the cut order is bottom-up:**
2. **The live depth scan** (SPEC §7.2 and §7.6). Read §7.2 before writing a line
   of it: there are three non-obvious constraints there, and two of them are
   corrections to an earlier draft that told the implementation to do the wrong
   thing.
3. **The semantic scan** — one vision call per room, plus the cost panel.
4. *(optional, first to cut)* the director.

**The game is cover combat.** Lean out to see an enemy — which is also the only
way for it to see you — aim with the mouse, shoot, and get back behind cover
before its fuse completes. `src/game/combat.ts` is the round; `src/engine/
exposure.ts` is the fairness theorem. The head does slow positional work and the
mouse does fast precision, which is the answer to the one piece of published
evidence against this whole design (PRIOR-ART.md, Kulshreshth & LaViola).

The enemy's fuse is **derived from the measured body**, not tuned: reaction time
plus measured latency plus the time to cross from the firing position back into
cover at the measured speed, plus a margin. So no enemy is ever given a fuse this
player cannot beat, and the margin is the only number anyone gets to turn.

`src/game/round.ts` is the earlier "hunt" mode. It is fully tested and no longer
wired up. It stays because it was a real design iteration whose findings are in
DEVLOG.md — do not treat it as dead weight to delete, and do not treat it as live
code either.

**Press `p` to scan the room.** Needs the webcam on (`c`) and a face in frame —
the head is the only metric correspondence available, so without it the room has
no scale. The far-wall prior is a slider, and it is the honest weak point: it
moves difficulty, not fairness.

Two things about the scan that are not obvious and are both load-bearing. The
room's depth is **compressed into the playable band** rather than used at true
scale — without it a real room refuses, because leverage over a sightline is
`(1 - s)` and cover metres away cannot be leaned around. And anchor depths are
derived from that same identity for a wanted leverage, not picked by taste. If
scanned rooms start refusing again, look at `nearestCm`/`furthestCm` in
`fitBillboards` and at `forLeverage` in `proposeAnchors` before anything else.

**The look is flat, bright and hard-edged, and that is deliberate.** Two earlier
looks were rejected by the playtester — procedural materials, then a backlit
silhouette look with haze, shafts and grain. The reference they gave is Minecraft
and Geometry Dash, and the rule that follows from it is: a face is one flat
colour, the shading is *which* face you are looking at, every edge is hard, and
nothing carries a depth cue by removing contrast. `src/render/mood.ts` holds five
palettes and `tests/mood.test.ts` asserts the ordering that keeps a block reading
as a block. Before adding any atmospheric effect, read the two new sections in
DEVLOG.md — this has now been got wrong twice.

**Cover may look like a block but must never be extruded.** The screen-parallel
constraint forbids the extrusion, not the block: a box with depth has a silhouette
wider than its own front face, which would promise cover the solver does not
grant. `coverMesh` bevels *inwards* and a test asserts every vertex is inside the
rectangle and at exactly its depth.

**The room stands full.** Five enemies from the first tick, they never leave, and
a kill is replaced after a beat. There is no spawn timer any more and reintroducing
one is how the game got boring: with a timer, the likeliest thing to happen when
you lean out is nothing. This needed no change to the fairness theorem, because
I2 already guarantees no shipped enemy can see the player at the rest position —
so the safe pocket behind cover survives the whole lineup.

**Playtesting has been happening**, and it has produced most of the recent
commits: the One Euro filter, the lateral threat model, the landing marker, the
axis mix, the warmth gradient, and hold-to-score all came from someone playing
this and saying what was wrong. Read those commit messages before changing any
of them — each one records the complaint it answers., and it is now the highest-value thing anyone
can do to this project. The literature says peeking is the strong verb and
dodging is the weak one (PRIOR-ART.md); the tuning knobs are all in
`DEFAULT_CONFIG` in `src/game/round.ts` and `leanFraction` / `jitterK` in
`src/engine/level.ts`. Change those, not the invariants.

**Still mine to write:** README.md for the folder (a judge opens it and finds
four documents and no front door) and PRIOR-ART.md needs updating for the shooter
pivot, which moved this *closer* to Wang et al. 2006 rather than further away.

**Not started:** REVIEW.md. It has to be written by the author, not by a model —
the brief says so explicitly. DEVLOG.md lists what the tests cannot check, and
that list is the raw material for it.
