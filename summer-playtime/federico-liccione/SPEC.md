# Blind Spot — Specification

> A game in which the only controller is where your head is, and the level is
> the room you are sitting in.
>
> Status: specification. Written before the code, to direct it. The engine
> invariants in §6.7 were written first, on purpose: they are what decides
> whether this is a game or a toy.

---

## 0. Where this document is now wrong

Added at the end of the build, and deliberately not folded into the text below.

This specification was written **before** the code, to direct it, and its value as
evidence depends on it still reading as what was written then. Six things the
build and the playtesting overturned. Each one is argued in DEVLOG.md; this is
the index.

1. **Dodge is cut.** §1 gives two verbs and §6.5 specifies a dodge guarantee. Only
   peek ships. The dodge solver, its invariant I7 and its tests are all still
   present and green; nothing calls them from the game. §14's own cut order
   predicted this, and Kulshreshth & LaViola (PRIOR-ART §2) predicted it before
   that.
2. **The game is a cover shooter, not a hunt.** "Find the hidden target" became
   "lean out to shoot an enemy that can shoot you from the same position", which is
   the same geometry read as a threat instead of as a search. `src/game/round.ts`
   is the hunt and is no longer wired up.
3. **The level is not the player's room.** §7 makes the room scan the game. A
   playtester made the decisive objection — it makes the quality of the experience
   hostage to the player's furniture — and the levels are now authored and swept.
   The scan is still there, still one keypress, and is now a capability rather than
   the premise.
4. **The level is laid out inside a fraction of the measured envelope**, capped at
   14 cm. Nothing here anticipated that calibration measures a maximum while play
   happens nowhere near it. See `playEnvelope`.
5. **Which positions stand is a decision, and it is the engine's.** This document
   assumes that judging each candidate for fairness is enough. It is not: a set of
   individually fair enemies can be a bad round or an unfair lineup. Hence
   `src/engine/lineup.ts` and **I11**, which is in §6.7 below and was written after
   the fact.
6. **The room texture is gone**, along with the drawing of the scanned frame onto
   the cover. Rejected in playtesting as unreadable.
7. **Smoothing is a One Euro filter, not an exponential average with forward
   prediction.** §7.1 specifies the latter and it is the worst possible pair in
   poor light: the average is too slow to hide the jitter and the prediction
   *multiplies* what is left. Do not implement §7.1's sentence.
8. **The game's own rules were never in this document.** §1 describes finding a
   hidden target; what ships is a cover shooter with a derived fuse, a standing
   lineup and a selection step. That was the largest gap between this spec and the
   build, and **§15 closes it** — it specifies the game as shipped, with the
   formulas and the constants, so that this document plus CLAUDE.md is enough to
   rebuild the project rather than merely to recognise it.

Everything else below still describes the build, and §6.7's invariants are all
tested. Where this document and the code disagree about anything not on this list,
the code is probably right and the disagreement is a bug in the documentation.

---

## 1. The mechanic

**You lean to see.**

A target sits behind an occluder. From where you are sitting it is invisible.
To reveal it you must physically move your head — sideways, up, forward — until
your eye reaches a position from which the sightline is clear. The screen is not
a picture that you look at; it is a **window** that you look *through*, and
moving relative to a window changes what the window shows.

Two verbs come out of that one idea:

- **Peek** — the target is hidden; find the viewpoint that reveals it.
- **Dodge** — something is coming at the window; move your head out of its path.

Both are impossible with a gamepad. Not *harder* — impossible. A thumbstick can
move an avatar, but it cannot move *the observer*, and the observer is the only
thing this game lets you move.

### What is actually being claimed

An earlier draft of this section claimed that head tracking is used either as
input or as display but never both, and that using one signal for both was the
novelty. **A prior-art survey refuted that** (PRIOR-ART.md). Sko and Gardner
built head-coupled perspective *and* lean-to-peek into the same webcam-driven
Source engine build in 2009. Wang et al. had webcam head offset driving both
peeking and dodging on a flat screen in 2006. Amazon shipped head-peek as an
information verb on the Fire Phone in 2014. The technique is nineteen years old
and the claim was wrong.

Sko and Gardner's own taxonomy is the useful frame: they split head-tracked
techniques into **ambient** (head-coupled perspective — changes what you see,
never the world state) and **control** (peering, leaning — changes game state).
Blind Spot is a bet that one signal should serve both categories *and that the
content should be built around the resulting verb* — which is, verbatim, the
opportunity their paper closes by naming: *"of all the techniques, it was felt
that peering could benefit the most from focusing the game content around its
use."* Nobody appears to have taken it.

So the contribution is **design synthesis and zero-install delivery, not a new
interaction technique**:

- content designed *around* the peek verb rather than offering it as a garnish
  on conventional gameplay — the solver in §6 exists for exactly this;
- the ambient and control roles collapsed into one signal and then actually
  *tested*, which Sko and Gardner set up but never evaluated together;
- in a browser, with no hardware and no install. Every head-coupled-perspective
  project on the web is a viewer or a demo; every notable browser face-controlled
  game is 2D with a conventional projection.

The first-person framing is what makes the collapse coherent: **you are the
viewport**, so leaning to look and leaning to dodge are one physical act and the
two readings of head motion cannot fight. Third person would break it — the
avatar would stay glued to your face while the world sheared underneath.

**Peek leads, dodge follows, and that ordering is evidence-driven.**
Kulshreshth and LaViola measured head tracking *hurting* player performance in
fast-paced games. Peeking is slow, deliberate and information-seeking, and sits
on much firmer ground than dodging does. Threats are therefore few, slow and
heavily telegraphed, and §6.5's fairness margin already subtracts human reaction
time and measured tracker latency before a threat is allowed to spawn.

---

## 2. The user

One person, at a laptop, with a webcam and ninety seconds.

No headset, no depth sensor, no phone rig, no install. If they have a browser
and a camera they can play, and the game will have adapted itself to their body
before the first target appears.

Session length is a **design constraint, not an accident**: comfortable head
excursion is roughly ±20 cm, and a neck complains after two or three minutes.
Blind Spot is therefore an arcade score attack in ninety-second rounds. The
brief asks for a two-minute demo; the game is shorter than the demo.

---

## 3. Non-goals

- **Not stereo, and never described as 3D.** Both eyes still see one flat panel.
  The illusion is motion parallax and nothing else. When the player stops
  moving, the scene reads as flat, and that is expected.
- **Not a hologram.** No claim of a floating image, no pyramid, no beam
  splitter.
- **Not head-as-look.** The view is never rotated by head orientation. Position
  only. Rotating would make it a camera, and a camera is not a window.
- **Not a 3D reconstruction of the room.** The scan produces a 2.5D
  approximation (§7.2) and the spec is honest about what that cannot represent.
- **Not multiplayer, not social, not a fitness product.**
- **No secrets in the repo.** The brief is explicit. Every API key is supplied
  by the player at runtime and never persisted to disk or to the repo.

---

## 4. Architectural commitment: the AI perceives, the engine judges

This is the load-bearing decision of the project and every other choice is
downstream of it.

**Models are allowed to say what is in the room. Models are never allowed to
decide what the player can reach.**

- A depth model says the chair back is 80 cm away.
- A vision-language model says that thing is a chair back, and that it would
  make good cover.
- **Whether a target behind it is reachable, fair, or dodgeable is computed by
  the engine, from geometry, deterministically.**

No number the player sees comes from a model. Not the score, not the difficulty,
not the count of available targets, not the verdict when the game refuses to
generate a level. The models produce a typed `RoomScan` (§7.4) and stop; the
engine consumes `RoomScan` and nothing else.

This is not a promise in prose. §6.7-I6 makes it a test that fails if an engine
module ever imports something from outside the engine, or touches the network,
the clock, storage, or a random number generator.

The reason to hold this line is not purity. It is that **the game makes
guarantees to the player** — every target is reachable, every threat is
dodgeable, the level is solvable — and a guarantee that depends on a model's
output is not a guarantee.

---

## 5. Domain model

All lengths in **centimetres**, all times in **seconds**. The screen plane is
`z = 0`, `x` right, `y` up, the player at `z > 0`, the scene at `z < 0`. There
is exactly one unit system in this codebase and no pixels below the renderer.

```
Point3     = { x, y, z }            // cm, world frame as above

Envelope   = {                      // what THIS player's body can do (§6.1)
  dirs:    Point3[]                 // fixed unit directions (support basis)
  support: number[]                 // max extent along each dir, cm
  rest:    Point3                   // median eye position while still
  vmax:    number                   // cm/s, 95th percentile measured speed
  jitter:  number                   // cm, tracker noise radius, measured
  latency: number                   // s, measured perception latency
}

Billboard  = {                      // an occluder: a rect parallel to screen
  z: number                         // cm behind the window (negative)
  x0, x1, y0, y1: number            // cm, x0 < x1, y0 < y1
  label: string                     // provenance only, never a game rule
}

Target     = { at: Point3, radius: number }
Threat     = { from: Point3, to: Point3, tSpawn, tImpact, radius }

RoomScan   = {                      // the ONLY thing perception hands over
  source: 'fixture' | 'depth' | 'depth+vlm'
  occluders: Billboard[]
  anchors: Point3[]                 // candidate target positions
  noSpawn: Billboard[]              // e.g. a backlit window: unusable region
  provenance: { model: string, atISO: string, costCents: number }
}
```

`Billboard` — a rectangle parallel to the screen plane — is a deliberate
restriction, not a shortcut waiting to be lifted. It is exactly what a one-shot
monocular depth scan can honestly support, segment-vs-billboard intersection is
exact and five lines long, and the resulting solver is provable rather than
approximate. Accepted consequences are listed in §11.

---

## 6. The engine

### 6.1 The reachable envelope

Ten seconds of onboarding: *"lean as far as is comfortable — left, right, up,
towards me."* The tracker records eye positions; the engine fits:

- `support` — the polytope `{ p : dot(dirs[i], p) <= support[i] }`, where each
  `support[i]` is the max of `dot(dirs[i], sample)` over samples, on a **fixed**
  basis of 38 directions (the six axes plus a 32-point Fibonacci sphere). This
  is the support-function representation of the sample set, chosen over an
  explicit convex hull for two reasons that matter more than fidelity: it is
  convex *by construction*, and `support` is **monotone in the samples**, so I3
  holds structurally instead of by luck. It is an outer approximation of the
  true hull — accepted weakness 1;
- `rest` — the median position over the stillest 2-second window;
- `vmax` — the **95th percentile** of measured speed, not the maximum, so one
  jerk does not define the player's capability for the rest of the session;
- `jitter` — the standard deviation of position while still, which becomes the
  fairness floor in §6.3;
- `latency` — measured end-to-end (frame capture to render), which becomes part
  of the dodge guarantee in §6.5.

This is not an onboarding chore to be skipped. It is the input to every
guarantee the game makes, and it is what makes the game adapt to a body with
limited range instead of assuming a body like the developer's.

The solver works on `E`, the set of points of a **2 cm lattice** contained in
the hull. A typical envelope (40 × 25 × 20 cm) yields ~2 500 lattice points.
The lattice pitch is a knob with a stated consequence: it bounds the narrowest
peek window the engine can distinguish, and it must stay coarser than `jitter`
would make meaningful.

### 6.2 Sightlines

`visible(e, t)` is true when the segment from eye `e` to target `t` reaches `t`
without crossing any occluder that lies **in front of** `t`:

```
for each occluder o with  t.z < o.z < 0:
    p = intersection of segment(e, t) with plane z = o.z
    if p is inside rect(o):  return false
return true
```

Exact, branch-free, no epsilon tuning beyond a single boundary convention
(points exactly on a rect edge count as occluded — stated here so the tests can
assert it rather than discover it).

### 6.3 The visibility footprint

For a target `t`:

```
V(t) = { e in E : visible(e, t) }
```

Brute force. |E| × |occluders| segment tests — about 25 000 trivial operations
per target, a few million for a whole candidate set. Milliseconds. **No
cleverness is required, and that is a feature**: the footprint is computed
exactly, so every predicate below is a fact about the level rather than an
estimate.

`V(t)` is the central object of this game. Everything the player experiences is
a property of it.

One consequence must be stated because it constrains what "cover" can mean. The
sightline crosses an occluder at `p = e·(1-s) + t·s` with
`s = (z_o - z_e) / (z_t - z_e)`, so the player's leverage over that crossing
point is exactly `(1 - s)`. An occluder close to the target has `s → 1` and the
player has **almost no leverage**: no amount of leaning clears it, and the
target is simply unreachable. Leverage lives in occluders close to the
*window*. The solver discovers this unaided — such targets fail `reachable` —
but level design must not fight it, and the room scan should prefer near cover.

### 6.4 Predicates over the footprint

```
reachable(t)     <=>  |V(t)| > 0
requiresLean(t)  <=>  rest not in V(t)
leanEnough(t)    <=>  dist(rest, V(t)) >= f * reach(E)
fair(t)          <=>  reachable(t) and leanEnough(t)
                      and inradius(V(t)) > k * jitter
```

`leanEnough` was **not** in the first draft of this spec, and the sweep is what
put it here. With only `requiresLean`, a grid of 369 candidate positions produced
179 "fair" targets, and almost all of them were revealed by a two-centimetre
movement — hidden at rest, yes, but revealed by a twitch rather than a lean. A
target has to ask something of the body.

The floor is a fraction `f` of `reach(E)`, the measured radius of the envelope,
not a constant: someone with five centimetres of range is asked for one and a
half, someone with twenty-five for seven and a half. **The demand is effort, not
distance** — the same principle as everything else here, where thresholds come
from measurements of this player rather than from constants tuned on the
developer.

`fair` is the important one, and note what it consumes: **the fairness of a
target is defined in terms of the measured noise of the perception system.** A
peek window narrower than the tracker's jitter is not a challenge, it is a
lottery. The game refuses to ship one. `k` is a single tuned constant (start at
2) and is the only tuned constant in the solver.

Difficulty is a **pair**, not a scalar, because these are different experiences:

```
difficulty(t) = ( lean, tightness )
  lean      = min over e in V(t) of |e - rest|      // how far you must go
  tightness = 1 / inradius(V(t))                    // how precisely you must
                                                    // hold it once there
```

A scalar may be derived for wave pacing, but the pair is what gets stored and
what gets shown in the debug overlay, because collapsing it early is how a
difficulty curve becomes a mystery.

### 6.5 Dodgeability

A threat is fair when the player can get out of its way *in the time they have,
at the speed they actually move, accounting for how late the game tells them*.

```
dodgeable(threat, from) <=>
  exists e in E  with  e not in hit(threat, tImpact)
  and  |e - from| <= vmax * (tImpact - tSpawn - reaction - latency)
```

with `reaction` a stated human constant (0.25 s) and `latency` **measured at
runtime**, not assumed. Two evaluations, both needed:

- **offline** — quantified over all `from` in `E`: used to validate a wave
  before it ships. "Could a player anywhere in their envelope have dodged this?"
- **online** — at spawn time, against the player's live position: the spawn gate.
  "Can *this* player, from *here*, right now?"

A threat that fails the online check is not spawned. This is the one place the
game silently protects the player, and §6.7-I7 tests that the guard actually
bites instead of passing everything.

### 6.6 Level solvability

A wave is a sequence of targets with time windows. Shipped case is sequential
(no reordering), which makes feasibility a chain check:

```
solvable(wave) <=>  for each consecutive pair (i, i+1):
                      dist( V(t_i), V(t_i+1) ) <= vmax * (tau_i+1 - tau_i)
```

`dist` between two lattice sets is the minimum pairwise distance. For the
general reorderable case the exact answer is a time-windowed path feasibility
problem, solvable by DP over subsets in O(2^n · n²) and tractable at the n ≤ 8
targets a wave will ever hold; it is specified here but not shipped in v1.

### 6.7 Invariants — the test spine

These were written before the implementation. Each is a property that must hold
over generated levels, checked across every room fixture crossed with a spread
of synthetic envelopes (including degenerate ones).

- **I1 — no unfair target ships.** Every target in every generated level
  satisfies `fair`. Zero tolerance.
- **I2 — every target requires a real lean.** `rest ∉ V(t)` for all shipped
  targets, *and* the required lean clears the `leanEnough` floor of §6.4. The
  weaker form of this invariant — merely hidden at rest — passed while the game
  was full of targets revealed by a twitch.
- **I3 — envelope monotonicity, scoped to what is actually monotone.** If
  `E ⊆ E'` then `V_E(t) ⊆ V_E'(t)`, and consequently `reachable` is monotone: a
  wider range of motion can only ever *add* viewpoints. This is the invariant
  most likely to catch a sign error or a bad normalisation, and it is the
  analogue of the leave-one-out check that found a 50 % error in the previous
  project's headline number.

  **Fairness is deliberately not monotone**, and the first draft of this
  invariant was wrong to claim it was. Because `leanEnough` scales with
  `reach(E)`, a wider body raises its own bar, and a target that was a real lean
  for a 20 cm range is a twitch for a 40 cm one. Difficulty tracking the body is
  the intended behaviour, so there is a test asserting the non-monotonicity —
  present so that nobody later "fixes" it by making the floor absolute.
- **I4 — occlusion monotonicity.** Adding an occluder never grows any `V(t)`;
  removing one never shrinks it.
- **I5 — determinism.** Same (fixture, envelope, seed) ⇒ byte-identical level.
- **I6 — engine purity.** Static test over the source: no engine module imports
  from outside the engine directory, and no engine module references `fetch`,
  `Date`, `Math.random`, `performance`, `localStorage`, or `window`.
- **I7 — the latency guard bites.** Injecting +100 ms of synthetic latency must
  cause the online dodge gate to *reject* threats it previously accepted. A
  guard that never fires is not a guard.
- **I8 — refusal is a first-class outcome.** A room with no usable occluders
  yields zero fair targets and the generator returns a **typed refusal** with
  the reason and the counts, never an empty-but-valid level.
- **I9 — degenerate body.** An envelope the size of a 2 cm ball yields a refusal
  or an explicitly reduced mode. Never an unfair level.
- **I11 — a lineup is escapable, not just each enemy in it.** Added after the
  fact, and it is the price of a change I did not foresee when I wrote I2. The
  combat path now ships a minority of enemies that can already see the rest
  position — `verb: 'duck'`, at most a quarter of what stands — because exposure
  is symmetric and one that can shoot you sitting still is one you can shoot
  sitting still. That is the other half of the verb, and refusing it threw away
  the largest class of candidate in every room.

  I2 still holds where it was written (the hunt path, `generate`), and the enemy
  path's exception is opt-in and named. But I2 was also doing a *second* job
  nobody had written down: while every enemy needed a lean, the rest position was
  safe from all of them at once, so the player always had somewhere to be. The
  per-enemy theorem never said that — it says each enemy has cover and that its
  own cover is reachable inside its own fuse, and never that the covers
  intersect. So the guarantee has to be earned instead, and `chooseLineup`
  earns it: **no lineup may leave the body without a refuge safe from everything
  standing, wide enough to hold against its own tracker jitter, and reachable
  inside the tightest fuse in the lineup.** The middle clause is not decoration —
  requiring only that *some* cell be safe let a lineup through that threatened
  the whole envelope at every distance, which the instrument caught and which is a
  firing range rather than a game. A refuge is held against the same jitter a peek
  window is held against, so it gets the same criterion. Tested in
  `tests/lineup.test.ts`, including a test that the ordering the guard refuses
  really does leave nowhere safe — the guard costs raw threat coverage, and that
  trade is the point.

- **I10 — the window is a window.** For any eye position in `E`, the **entire
  screen plane is invariant** under eye motion: a point at `z = 0` projects to
  the same place whatever the player does, and the four corners land on the four
  viewport corners as a special case. The first draft of this invariant claimed
  only the corners; deriving it gave the stronger statement, which is what the
  test asserts. It catches precisely the class of bug that makes the illusion
  fail without looking broken. The parallax sign and ordering are asserted
  alongside it — relative to the frame, distant points slide *more* than near
  ones and in the *same* direction as the head — because that is the fact
  easiest to get backwards in code.

---

## 7. Perception

Everything in this section is replaceable, throttled, and one-shot. None of it
runs in the game loop.

### 7.1 Head pose — the only per-frame model

MediaPipe Face Landmarker on the webcam stream. Metric eye position from the
inter-pupillary distance: adult IPD ≈ 6.3 cm with small variance, so
`Z = f_px · 6.3 / d_px`, and `X`, `Y` from the pinhole model. Fallback to outer
eye-corner landmarks when iris landmarks are unavailable (spectacles are the
common cause), with the wider assumed separation and the degraded accuracy
recorded in the session, not hidden.

Smoothing is exponential with forward velocity prediction. The measured
end-to-end latency feeds §6.5 — the game's fairness guarantee consumes its own
perception quality, which is the point.

This metric estimate is load-bearing twice: it positions the camera for §8, and
it is the anchor that gives the room scan a scale in §7.2.

A working prototype of §7.1 plus §8 exists and is referenced in DEVLOG.md; the
projection maths and the tracking maths are already validated on real hardware.

### 7.2 Room geometry — one shot, at level build

Run monocular depth estimation on the webcam frame, then reduce the depth field
to at most 12 `Billboard` occluders by quantising into depth bands and fitting
rectangles to the connected components of each band.

Client-side, and **once per room, never per frame.** Not once per level: the
furniture does not move between rounds, so one `RoomScan` feeds an unbounded
number of levels, which the engine generates by varying target selection under
a seed (§6.6). A play session therefore costs one perception pass, not one per
round — and a model that takes seconds is free when it runs while the player is
reading the calibration prompt.

Three things here are non-obvious, were verified rather than assumed, and each
one changed the design.

**Monocular depth has no metric scale.** Depth Anything emits affine-invariant
*inverse* depth: `1/Z ≈ a·D + b` for unknown `a` and `b`. There is not a
centimetre in it. Every guarantee in §6 is metric, so the scan is worthless
until `a` and `b` are pinned.

One is pinned **by the player's own head.** §7.1 already knows the head's metric
distance from the inter-pupillary estimate, and the segmenter says which pixels
the head occupies, so the frame yields one correspondence `(D_head, Z_head)`.

An earlier draft of this section claimed the second came free: the calibration in
§6.1 asks the player to lean *towards the camera*, so a second frame at a
different distance would give a second correspondence. **That is wrong, and it
was found while implementing.** The model's affine transform is unknown *per
image*, so two frames produce two different unknown transforms rather than two
constraints on one. Both correspondences must come from the same frame.

The second is therefore a **stated prior** about the distance of the furthest
surface, exposed to the player as a control. What that costs is worth being
precise about: **it moves difficulty, not fairness.** A wrong prior makes the room
come out shallower or deeper than it is, so peek windows are wider or narrower
than intended — but the engine computes fairness on whatever geometry it is
handed, so every target it ships is still reachable and still requires a real
lean. This is the weakest link in the pipeline and it is recorded as such in
§11.

Residual error of the affine fit is recorded, shown in the debug overlay, and
added to the margins in §6.4 and §6.5. A badly-fitting scan makes the game more
conservative, never more unfair — the same failure direction as everywhere else
in this design.

**The room's depth range is compressed into the playable band, not used at true
scale.** A decision forced by a real scan rather than chosen: mapping centimetres
one-to-one, an actual room refused with 129 of 180 candidates unreachable. The
cause is the leverage identity of §6.3 — control over where a sightline crosses
an occluder is `(1 - s)` — so cover two and a half metres away cannot be leaned
around by anybody, and a real room puts its nearest surface metres behind the
player's head rather than at arm's length like the hand-authored fixture did.

The compression is **monotone**, so every occlusion relationship the scan
observed survives exactly: what is in front of what, and therefore what hides
what, is untouched. What is lost is absolute distance. The scanned room is a
faithful account of its structure and a deliberate fiction about its size, and
fairness is unaffected because the engine computes it on whatever geometry it is
handed.

**Never read the library's normalised depth image.** The convenience output is
min-max normalised per frame across the whole frame, so a face 40 cm from the
lens owns the top of the range and compresses a five-metre room into a sliver.
The pipeline reads raw `predicted_depth` and applies the fit above instead. That
removes the artifact as a class rather than compensating for it downstream.

**Do not mask the person out before inference.** An earlier draft of this spec
said to do exactly that, and it was wrong: the backbone is a ViT with global
attention over patches, so a punched-out region is out of distribution and
perturbs the depth field *outside* the hole as well. Correct order is depth on
the unmodified frame, then use the person mask to **exclude** those pixels when
fitting room geometry — while still reading the head's own depth value for the
metric anchor above.

> Exact identifiers, versions and the availability constraint: §7.6.

### 7.3 Room semantics — one shot, one call

Depth cannot tell you that the bright rectangle is a window and therefore a bad
place to put anything, or that the chair back is cover while the wall behind it
is not. That is a judgement about what things *are*.

One vision call per room — see §7.2 on why this is not per level — returns a
typed inventory: for each region, a
label, a class, a depth band, and a suitability rating as cover / target /
hazard. That inventory becomes `RoomScan.occluders`, `.anchors` and `.noSpawn`.

Then the model is done. It never sees the score, never sets difficulty, never
places anything the solver has not validated.

> Model id, request shape, token cost: pinned in §7.6 after verification.

### 7.4 The boundary

`RoomScan` is validated and clamped at the boundary before the engine sees it,
and the validator assumes the input is hostile:

- depths clamped to a plausible range, non-finite values rejected;
- rectangles clipped, degenerate and inverted rects dropped;
- occluder and anchor counts capped;
- a wrong-typed field (a string where a number belongs, a class name that is
  not in the enum) falls back to a default and increments a counter that is
  visible in the debug overlay.

Guard tests feed the validator deliberately malicious scans — NaN depths, ten
thousand occluders, negative rectangles, a suitability rating where a number
belongs — and assert that no such scan can produce an unfair level. Those tests
prove that a *wrong* model answer cannot corrupt the game. They do not prove the
model is right; §7.5 says so plainly.

### 7.5 Visible cost, and what is not verified

The brief asks for runtime AI "with citations, guardrails and a visible cost".
So the scan panel shows, per scan: the model used, the tokens in and out, the
cost in cents, and the wall-clock. A session total sits in the corner — and
because the scan is per room, that total normally reads *one* call, which is a
more honest advertisement for the architecture than a ticking meter would be.

Stated openly, in the README and in REVIEW.md: **the accuracy of the perception
layer is not verified by the test suite.** No test touches the network. The
tests prove containment — that a wrong answer stays harmless — not correctness.
Checking whether the room scan actually finds the chair requires a human, a
room, and a real key, and it goes in REVIEW.md as work for the author.

### 7.6 Pinned identifiers

Verified against the Claude API reference during specification, not written from
memory. Nothing in §7.2 or §7.3 may be implemented against a remembered model id
or API shape.

**Semantic scan (§7.3)** — one `POST /v1/messages`:

- Model: `claude-sonnet-5` ($2 / $10 per MTok). Chosen on **quality alone**,
  because at this volume there is nothing to save: a scan is $0.0064 on Sonnet 5
  against $0.0032 on Haiku 4.5 and $0.016 on Opus 5, so a thousand scans is six
  dollars and a heavy day of perception tuning is one. An earlier draft framed
  Haiku as "the cheap path", which was a bad argument — the money is not the
  constraint here, and the real first-run cost is the 49.6 MB depth model in
  §7.2, not the API. Configurable regardless. Exact id strings only, never
  date-suffixed.
- Structured output via `output_config.format` with `type: "json_schema"` —
  **not** tool use, and **not** assistant prefill, which returns 400 on current
  models. Every object in the schema requires `additionalProperties: false`;
  `enum` is supported and carries class / depth band / suitability. The schema
  language has no numeric bounds and no recursion, so all range checking stays
  in the boundary validator of §7.4, which is where it belongs anyway.
- The image content block goes **before** the text block. `source.data` is raw
  base64 with no `data:` URI prefix and no newlines — the output of
  `canvas.toDataURL()` must be stripped before it is sent.
- `max_tokens: 16000`, with `output_config.effort: "low"` alongside the format.
  **This one was learned the hard way.** `claude-sonnet-5` runs *adaptive
  thinking* by default when `thinking` is omitted, at effort `high`, and those
  tokens count against `max_tokens` and are billed even though the default
  display setting returns them empty — so a budget of 2048 was consumed by
  reasoning before a few hundred tokens of JSON could be written, and the reply
  came back truncated. The documented remedy is two-part and effort is the half
  that matters: `max_tokens` is a cap rather than a reservation, so raising it
  costs nothing unused, but a larger ceiling also gives adaptive thinking more
  room to spend. Above 21,333 the SDK requires streaming, which bounds the
  retry. `stop_reason` is checked for both `max_tokens` and `refusal` before any
  `JSON.parse`, and the structured output is read from the first `text` block
  because thinking blocks arrive before it — while never assuming one is there,
  since adaptive thinking sometimes skips.
- Cost, for the panel in §7.5: a 640×480 JPEG costs ceil(640/28) × ceil(480/28)
  = 414 visual tokens. With ~300 tokens of prompt and schema and ~500 out, a
  scan is about $0.0065 on Sonnet 5 and $0.0032 on Haiku 4.5. Prompt caching
  does not apply — the prefix is far below the minimum cacheable length. The
  panel reports measured tokens from the response, and the figures above are
  verified with `POST /v1/messages/count_tokens` rather than trusted.

**Key handling.** The documented recommendation is a thin backend proxy holding
the key. This project has no backend by design, so it takes the one
acknowledged bring-your-own-key path: the player pastes their own key, the
request carries `anthropic-dangerous-direct-browser-access: true`, and the SDK
requires `dangerouslyAllowBrowser: true`. The names of both flags are the
warning, and the trade-off is recorded rather than hidden — the key sits in page
memory, reachable by any browser extension or XSS, with no spend cap and no
revocation path. What ships as mitigation: the key is never persisted, never
logged, and never sent anywhere but the Claude API endpoint, and the UI tells
the player to mint a workspace-scoped key with an expiry. The repository
contains no key, which is the rule the brief actually sets.

**Geometric scan (§7.2)** — client-side, no network traffic after first load:

- `@huggingface/transformers` 4.2.0. The package is **no longer**
  `@xenova/transformers`. Model `onnx-community/depth-anything-v2-small`, which
  is also the library's registered default for the `depth-estimation` task.
- `pipeline('depth-estimation', model, { device: 'webgpu', dtype: 'fp16' })`.
  The browser default device is `wasm`, so `device` must be set explicitly.
  `dtype: 'fp16'` requires the adapter to report the `shader-f16` feature —
  gate it at runtime and fall back to `fp32`.
- Read `predicted_depth` (float32, at the dims of the input image), never the
  `depth` image. See §7.2 for why this is not a preference.
- The model does **not** run at capture resolution. The DPT processor resizes to
  a multiple of 14 near 518, and the official real-time example runs 504×504.
  Compute tracks processor size, not capture size; wherever this spec says
  "frame", the cost is on the processor grid.
- Weight download dominates, not inference: 49.6 MB at fp16, 19.1 MB at q4f16.
  Whether q4f16 degrades a depth *regression* head is **unmeasured** and must be
  checked before it is chosen for the size win.
- **No latency figure appears anywhere in this spec, because none was
  verifiable.** WebGPU-versus-WASM wall clock for one frame is to be measured on
  the target machine and recorded in DEVLOG.md. Every published number found
  during verification traced back to content farms, one of which also carried a
  false release date.

**Perception packages** — `@mediapipe/tasks-vision` 1.0.1, pinned, with the WASM
fileset URL pinned to the *same* version; a mismatched fileset is a classic
silent failure.

- Person mask: `ImageSegmenter` with `selfie_segmenter` float16 (250 kB) and
  `outputConfidenceMasks: true`, read via
  `confidenceMasks[0].getAsFloat32Array()`. Mask dimensions are **not**
  documented as matching the input, so they are asserted at runtime and
  resampled onto the depth grid rather than assumed to align.
- Head pose: `FaceLandmarker`, float16 `.task`. 478 landmarks confirmed; the
  iris centres are indices **468** and **473**.
- Model asset paths pin `/1/` rather than `/latest/` for reproducibility, in the
  knowledge that the documentation now publishes `latest` and will drift.

**WebGPU availability is a constraint, not a footnote.** Default in Chrome/Edge
and Safari 26+; in Firefox only on Windows and Apple Silicon — **not on Linux,
which is the development machine here**. The WASM path is therefore a supported
path rather than a token fallback, and the fixtures of §9 are what guarantee the
demo runs at the showcase whatever the machine turns out to be.

---

## 8. Rendering

Off-axis (head-coupled) perspective. The four physical screen corners are fixed
in world space; the camera sits at the measured eye position; the frustum is the
pyramid from eye to corners and is therefore asymmetric. Kooima's generalised
perspective formulation, simplified because the screen is axis-aligned.

The physical screen width in centimetres is a calibrated value with an in-app
ruler, because if it is wrong the parallax has the wrong magnitude and the
illusion does not lock.

A visible debug toggle switches the off-axis frustum for a symmetric one at the
same camera position — a dolly instead of a window. Keeping that toggle in the
shipped build is deliberate: it is the fastest way to show a spectator what the
game is doing, and it is the demo beat in §10.

Vanilla WebGL2. No 3D framework: the scene is billboards and the projection is
sixteen floats, and a framework would hide exactly the part that has to be
right.

---

## 9. Fixtures and the no-camera path

Four levels ship as checked-in `RoomScan` JSON — Doorway, Shelves, Parapet and The
desk — plus a spread of synthetic envelopes including the degenerate ones. Their
cover layouts are hand-designed and their enemy positions are **swept**: see §15.7,
which is also the story of what happened to the one level whose positions were
placed by hand.

Consequences, all of them deliberate:

- the full game is playable with **no camera and no API key**, driven by mouse
  as a stand-in for head position (as the prototype already does);
- the test suite runs against real scan data without a network;
- **the showcase demo never depends on the lighting in the room** — the live
  scan is shown because it is impressive, not because the demo needs it.

---

## 10. The two-minute demo

1. **0:00** — Camera on. "This is my room." Scan. The room becomes geometry on
   screen, and the cost panel shows the cents it just spent.
2. **0:25** — Calibration. Lean around. It is measuring *this* body: range,
   speed, jitter, latency, shown as numbers.
3. **0:45** — Play. The target is behind the chair. Lean to find it. Something
   comes at the window. Lean out of the way.
4. **1:15** — Press the toggle: off-axis off. The window becomes a dolly and the
   illusion dies on the spot. Press it again. *That* is the mechanic.
5. **1:30** — **The beat.** Point the camera at a blank wall and try to start.
   The game refuses: *"this room yields 0 fair targets"*, and shows what it
   excluded and why. Then load the 2 cm envelope — a body that can barely move —
   and it refuses again rather than shipping an impossible level.
6. **1:50** — The line: nothing you saw a number for came from a model. The
   models said where the chair is and what it is. The engine decided what your
   body can reach. Ten invariants fail if that stops being true.

The refusal is the memorable half. A game that declines to generate an unfair
level, and shows its work, says more about the engine underneath than a working
level does.

---

## 11. Accepted weaknesses

Listed because they are choices, not oversights.

1. **The envelope is assumed convex.** Real reachable sets are not quite. The
   hull may over-estimate reachability at the corners; `fair`'s jitter margin
   absorbs some of it, and the rest is a known over-estimate.
2. **2.5D only.** A curved sofa becomes a rectangle, and nothing behind the
   first depth layer of the room exists. Occluders are parallel to the screen
   even when the real object is not.
3. **Stereopsis still says flat.** Unfixable without hardware, and stated rather
   than glossed. Parallax dominates while the player moves, and only then.
4. **One player.** A bystander sees a sheared image that is wrong for them. The
   room-derived level is what a spectator can appreciate instead.
5. **Neck fatigue is real.** Ninety-second rounds are a mitigation, not a cure.
6. **There is published evidence against the dodge verb.** Kulshreshth and
   LaViola found head tracking can *degrade* performance in fast-paced games.
   The mitigations are structural — few threats, slow and telegraphed, and a
   fairness margin that consumes reaction time and measured latency — but the
   verb is on weaker empirical ground than peeking and is the first mechanic to
   drop if playtesting agrees with the literature.
7. **Spectacles degrade tracking.** The fallback path has worse metric accuracy,
   and worse accuracy widens `jitter`, which makes `fair` stricter — the game
   gets easier rather than unfair. That is the intended failure direction.
8. **The vision model's suitability judgements are unvalidated taste.** The
   engine's fairness checks are what stop bad taste from producing a broken
   level. That containment is tested; the taste is not.
9. **Perception hands over geometry it has not judged, on purpose** — and this
   caught out my own intuition. A wall of finite extent has edges, and an edge is
   cover; the engine builds a playable level from a bare wall. Had the scan
   pre-filtered "rooms that look like cover", it would have thrown that away.

---

## 12. Stack

TypeScript, Vite, Vitest. Vanilla WebGL2 for the renderer.
`@mediapipe/tasks-vision` 1.0.1 for head pose and person mask,
`@huggingface/transformers` 4.2.0 for depth, `@anthropic-ai/sdk` for the one
semantic call. All pinned, all listed with their identifiers in §7.6. No 3D framework, no UI framework — the surface is a
canvas, an overlay and a cost panel.

Engine in `src/engine/`, with no dependency on anything outside it (I6) — which
is why the shared types live *inside* the engine, at `src/engine/types.ts`, and
everything else imports them from there. The dependency arrow points inward and
never outward. Perception in `src/perceive/`, renderer in `src/render/`, the
boundary validator in `src/boundary/`.

---

## 13. Acceptance criteria

The build is done when:

1. All eleven invariants in §6.7 hold, under test, across every level crossed
   with every synthetic envelope.
2. The game is playable start to finish with no camera and no API key.
3. A live scan produces a playable level from a real room, with the cost shown.
4. A blank wall produces a typed refusal, and so does a 2 cm envelope.
5. `npm test` is green and touches no network, clock or RNG.
6. The off-axis toggle demonstrably kills the illusion, and I10 passes for every
   eye position in the envelope.
7. REVIEW.md exists, written by the author, and says what the tests cannot check.

---

## 14. Build order

Cuts happen from the bottom up. Everything above the line survives.

1. **Types and the boundary validator** — `RoomScan`, `Envelope`, guards.
2. **The engine**: sightlines, footprints, predicates, dodgeability,
   solvability. With the invariants of §6.7 written as tests *first*.
3. **One room fixture, one synthetic envelope.** The game is now provably fair
   and completely unplayable.
4. **The renderer** — off-axis projection, billboards, the toggle. Prototype
   exists; port it.
5. **Head tracking** — the real envelope calibration, jitter and latency
   measurement.
6. **Playable loop** — waves, score, ninety seconds, the refusal screen.
   ────────── minimum defensible build ends here ──────────
7. **Live depth scan** — client-side, one shot.
8. **Live semantic scan** — one vision call, the cost panel.
9. *(optional)* **Director** — between waves, a model picks the most interesting
   option **from the set the solver has already validated as fair**. The engine
   guarantees correctness; the model only adds taste, and never the reverse.
   First thing to cut.

---

## 15. The game as shipped

Written at the end, and kept apart from §1–§14 for the same reason §0 is: this
document's value as evidence is that it reads as what was written *before* the
code. What follows is what the code turned out to be, specified to the same
standard, because §0's list tells a reader that the game changed without telling
them what it changed *into* — and that was the difference between a document you
can recognise the project from and one you can rebuild it from.

### 15.1 The verb, and the symmetry it rests on

An enemy stands at a position in the room. From the rest position it is hidden.
To see it the player must move their head to a position from which the sightline
clears the cover — and **that is also the only position from which it can shoot
them**, because a sightline has no direction. One boolean per enemy per frame is
therefore simultaneously *I can shoot it* and *it can shoot me*, and the game
never computes two.

That symmetry is the whole design and it must not be softened. It is why the enemy
is drawn as an eye that opens, why a covered enemy draws **nothing at all**, and
why there is no separate "enemy line of fire" anywhere in the code.

The mask the game uses is **not** the visibility footprint of §6.3. It is

```
engageable(t) = { e in E : visible(e, t) and onScreen(e, t, viewport, radius) }
```

A viewpoint with a clear sightline to something off the edge of the glass is not a
firing position, and by the symmetry it is not a position the enemy may fire from
either. Both halves of that were found by playtesting rather than derived: a
player was being shot by enemies off the bottom of the screen, and the `radius`
term was added after a second report, because an enemy whose *centre* has cleared
the edge while nine tenths of its body is still off the glass is not something
anybody can answer. **Point-versus-extent is the single most repeated bug class in
this project** — three separate instances — and the rule that came out of it is:
if the drawing has extent, the test must have extent.

### 15.2 The fuse, derived

Each enemy has a fuse: the seconds of continuous exposure it tolerates before it
fires. It is **derived from the measured body**, never authored:

```
fuse(enemy) = REACTION + latency + retreat / vmax + margin
  REACTION = 0.25 s              stated human constant
  latency                        measured, per tracker, live
  retreat                        cm from the enemy's exposure region to its cover,
                                 via the distance transform
  vmax                           the body's measured 95th-percentile speed
  margin                         the only tuned number
```

So no enemy is ever given a fuse this player cannot beat, and the direction of
every failure is the same one as everywhere else in this design: a slower body, or
a noisier tracker, or a slower machine is given **more time**, never a worse game.

Two consequences that are easy to get wrong:

- The fuse charges only while the player is exposed to *that* enemy, and drains at
  3× in cover. Reaching the end therefore means they were still out.
- Switching tracker **re-derives every fuse**, because `latency` is a term in the
  formula and a webcam's is tens of milliseconds where a keyboard's is none. A
  lineup built against one and played through the other hands out fuses shorter
  than the derivation allows. The frame loop also re-derives on a 20 ms drift, and
  both skip mid-round because a rebuild restarts it.

### 15.3 The round

Ninety seconds. Being hit costs six of them (four on easy, eight on advanced), and
the clock is the only resource.

**The room stands full from the first tick.** The lineup does not arrive on a
timer, and the reason is a playtest finding worth stating as a rule: with a timer,
*the most likely thing to happen when you lean out is nothing*, so the verb the
whole project is built on degenerates into a polling loop. Enemies never leave.
A kill is permanent and is replaced, after a beat, by the next position in the
engine's order — never by the one just vacated, which is a mistake this
implementation made twice, one tick apart, because the vacated position is at the
front of that order.

An enemy nobody has looked at for `repositionAfterS` **steps to another position
the solver has already judged**, while unobserved and with a cold fuse. This is
the honest form of "moving enemies": fairness here is a claim about a *position*,
and a trajectory would need a different theorem, so nothing moves to anywhere that
was not proved fair, escapable and on screen before the round began.

One hit per tick, and it **resets every fuse**. With eight standing, a lean can
open three sightlines at once, and without this a single moment of over-exposure
bills the player three times in three consecutive frames. Resetting says the
obvious thing instead — you were hit, everyone who had a shot took it, they are
all starting over — and buys exactly one fuse of grace to get back behind cover.

### 15.4 Which enemies stand: the selection step

§6 judges candidates one at a time and this document assumed that was enough. It
is not. A set of individually fair enemies can be a bad round, and it can be an
unfair lineup — see I11 for the second half. `src/engine/lineup.ts` is the answer
to the first.

The quantity to maximise is not the count of enemies. It is **how much of the
space the body can move through has a threat visible from it** — greedy maximum
coverage over the same lattice and the same masks the fairness solver already
builds, run repeatedly so that each successive block of the order is itself a
covering set, which is what makes a replacement the next best choice rather than
whatever was left.

Two corrections that a rebuild will otherwise repeat:

- **Weight the coverage by where the body actually spends its time.** Counting
  cells prefers the *widest* footprints, and those belong to the long-lean enemies
  whose exposure region is a swathe at the edge of the envelope. Measured, the
  unweighted version produced levels where a full commit found a threat 93–100% of
  the time and a half-committed lean found one a third of the time — the algorithm
  was biased against exactly the enemies that make a modest peek worth making. A
  Cauchy kernel on distance from rest, at half weight by a third of the reach.
- **The ordering criterion comes from the game, not the engine.** Coverage is
  geometry and difficulty is taste, so `LineupCandidate.cost` is supplied by the
  caller — the game passes `pointsFor`, which already weighs how far you must lean
  against how precisely you must hold it. A difficulty setting flips its sign.

Ordering is O(candidates × cells) per pick, so it takes a `limit`: the game only
ever stands the front of the list, and ordering past it is quadratic work for
nothing.

### 15.5 The play envelope

Calibration measures what a body **can** do — §6.1 asks the player to reach as far
as they are able — and a level laid out against that maximum is a level nobody
plays, because nobody sits at their own extreme for ninety seconds. Measured in
centimetres of lean, the first six centimetres of movement found a threat 0–2% of
the time.

The level is therefore solved inside `playEnvelope(env)`, and it needs **two**
ceilings:

```
factor = min( 0.68, 14 cm / reach(E) )
```

The fraction handles a small envelope: someone who can only move eight centimetres
should have the level built inside five or six of them. The absolute ceiling
handles a large one, and it is the half that was wrong first — a fraction *scales
with the calibration*, so a player who calibrated at thirty-six centimetres still
had every threat placed past fifteen. The number that should have been bounding it
is a property of necks rather than of calibration.

This is the only bet about bodies in the solver and it is labelled as one. It is
cheap to be wrong about: it moves difficulty, not fairness. Everything shipped
inside the smaller envelope is judged fair inside it, the body's own measurements
are untouched, and leaning past the edge keeps every sightline the edge had.

### 15.6 Difficulty

Three settings, and the rule is more important than the numbers: **a difficulty
may only move what is not fairness.** Reaching into the lean floor, the jitter
multiplier or the fuse *derivation* would not make the game harder, it would make
the guarantees conditional on a radio button.

What it may move: how many stand at once (5 / 8 / 11), what a hit costs, how long
an enemy holds a position, which end of the cost range the round opens with, and
the **fuse margin** (0.95 / 0.55 / 0.32 s) — legitimate precisely because the
margin is slack over a derived floor rather than a number in place of one.

Not the round length, which is a constraint about necks and not a dial. And not
the score: `pointsFor` already pays for lean and precision, and a global
multiplier would pretend three modes are comparable when easy simply gives you
longer to shoot more things. The end screen names the setting instead.

### 15.7 Levels: layouts by hand, positions by sweep

What a room looks like is taste and is written by hand. **Where an enemy may stand
is measured**, by sweeping several hundred candidate positions through the solver
and keeping what it can prove — because the one level whose positions were placed
by hand had four usable ones out of twenty-one, and a playtester found that before
any test did. `npm run author` is that sweep. Two findings from iterating the
layouts against it, both worth more than the layouts themselves:

- **Cover belongs near the window, and by more than §6.3's identity suggests at a
  glance.** Moving one level's jambs from z = −46 to z = −22 took the fraction of
  positions with a threat visible at six centimetres of lean from 18% to 54%, and
  the count of fair positions from 38 to 108. Same layout, twenty-four centimetres
  nearer.
- **Edges matter more than area.** Two large slabs give two edges; seven narrow
  uprights crossed by three horizontal shelves give thirty, and reach 67% at six
  centimetres and 93% at nine. It is also the only layout that ever produced
  vertical peeking — 58 positions of 200, against 0 for two slabs.

And the metric to iterate against: **threat coverage binned by distance from rest,
in centimetres of lean.** The aggregate average is useless, because a lattice has
far more cells in the middle of an envelope than at its edge, so a mean over cells
is dominated by the middle and says nothing about either end. The innermost band
must read 0%: that is the cover, and the game needs it.

Two selection traps, both of which this implementation fell into:

- Thinning a swept candidate list by taking **every nth** lands on a regular
  sublattice. Let the coverage objective choose the prefix instead.
- Filtering to positions fair for **all** reference bodies deletes the *easy*
  enemies, because "requires a lean" scales with reach, so a larger body's
  threshold rejects precisely the shortest-lean candidates. Take the union: a level
  stores *candidates*, and the solver re-judges every one against the body actually
  playing.

### 15.8 The tracker, when it cannot see the head

An eye leaving the frame is **information, not the absence of it** — it says the
head went that way. Three estimators, in order of preference:

1. both irises — position and metric depth;
2. one iris plus the last known separation — lateral position measured, depth
   held;
3. dead reckoning along the last measured velocity, bounded to 10 cm and 0.30 s,
   then a hold.

Never a jump to an extreme, however tempting: exposure is symmetric, so guessing
further out is as likely to walk into a sightline as out of one.

Three estimators means **three seams**, and they need one rule between them rather
than three local smoothings. Each estimates the same quantity differently, so every
switch steps the reported position; on each switch the disagreement is recorded as
a bias — clamped to 6 cm, because absorbing more than that is a plausible untruth
about where the player's head is, and a visible jump is better — and decayed to
nothing over 120 ms, by elapsed time rather than by frames, because a webcam's
frame rate collapses in exactly the poor light that makes the head hard to find.
The One Euro filter is reset when the gap exceeded 120 ms: its state describes
where the head *was*, and feeding it the truth would rubber-band the viewpoint.

The status line distinguishes all four states. That is not polish: three of them
are the tracker reporting something it did not measure, and this project does not
lie about perception.

### 15.9 Aiming

The head does slow positional work; the **mouse** does fast precision. That split
is the answer to the one piece of published evidence against this whole design
(PRIOR-ART §2, Kulshreshth & LaViola on head tracking degrading performance in
fast-paced tasks): do not give the head the fast job.

Two regimes. Between rounds the crosshair is the operating system's cursor, one to
one, because the panel has controls in it. Inside a round the pointer is
**captured** and the crosshair moves by accumulated deltas — which is the only
thing a sensitivity setting can act on, since an absolute cursor already has the
OS's acceleration applied. Refusal to capture is not an error: absolute aiming
keeps working and the slider marks itself inert.

### 15.10 The look

Flat, bright, hard-edged. Two earlier looks were rejected in playtesting —
procedural materials, then a backlit silhouette look with haze, light shafts and
grain — and the reference that finally landed was Minecraft and Geometry Dash. The
rule that follows: **a face is one flat colour, the shading is which face you are
looking at, every edge is hard, and nothing carries a depth cue by removing
contrast.** Distance is carried by a checkered floor in perspective and by nothing
else; aerial perspective sits at 0.14 where it was 0.72, and it was doing its job
in exactly the half of the corridor where reading an enemy is hardest.

One geometric point that took far too long to see. §5's screen-parallel constraint
does **not** forbid cover from looking like a solid block. It forbids the
**extrusion**: a box with depth has a silhouette wider than its own front face
from any off-axis eye, so drawing one promises cover the sightline test does not
grant. Bevel *inwards* and the block is free — a bright outline on the rectangle
itself, four bevel faces lit from the upper left, a flat front face, every vertex
inside the rectangle and at exactly its depth. The constraint cost nothing;
misreading it cost weeks.

Palettes are chosen by the level's **own words**, because all three writers who
produce level text — the fixtures, the vision model naming a room, the language
model laying one out — already write the words that should decide how it looks.

### 15.11 A proposed level is swept, not trusted

Three things can propose a room: a hand-designed layout, a depth scan of the
player's own room, and a language model given a sentence. The architecture's claim
is that it is **indifferent to who proposes** — same validator, same solver, same
invariants — and that claim holds at the boundary.

It does not hold *upstream* of the boundary unless it is made to, and this was
missed once. Fairness was identical across the three paths from the beginning; what
was not identical was how generously each one proposed. The hand-designed levels
had their positions swept — several hundred candidates through the solver, only the
provable ones kept — while a model-designed room got a coarse deterministic grid.
Same walls, same solver, a thinner pool of fair positions, for no reason but the
code path.

So every proposed room is swept, and the banded threat profile of §15.7 is reported
back for it. **"Same guarantees" and "same quality" are different claims**, and only
the first one comes free from having a boundary.

The sweep is a proposal and nothing downstream trusts it: `assessEnemies` re-judges
every anchor against the body actually playing, which is why sweeping against one
body cannot make a level unfair for another — the same reason §15.7's authoring
step stores the union over reference bodies rather than the intersection.

### 15.12 Build order, for a rebuild

§14's order is the hunt's. This is the one that produces what ships, and the
property worth preserving is that the game is provably fair long before it is
playable.

1. Types, units, the boundary validator.
2. The engine: sightlines, footprints, the lattice, the distance transform, the
   predicates — with §6.7's invariants written as tests **first**.
3. Exposure: `engageableMask`, cover, the retreat gap, the derived fuse.
4. One hand-authored layout and one synthetic body. Provably fair, unplayable.
5. `playEnvelope`, then the selection step and I11. Do these before the renderer:
   they are what make a level worth looking at, and they are pure.
6. The off-axis projection and I10. Then the flat renderer.
7. The round as a pure state machine, tested as one.
8. The keyboard tracker, then the webcam one, then the calibration, then the
   recovery of §15.8.
9. `npm run author`, and iterate the layouts against banded threat coverage.
10. Difficulty.
    ────────── everything above ships; everything below is upside ──────────
11. The depth scan of the player's room.
12. The semantic call, the cost panel.
13. The language model as level designer, behind the same boundary.
