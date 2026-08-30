# Blind Spot

**An enemy is only visible from a position you have to move your head to reach.
That is also the only position it can shoot you from.**

A webcam measures where your head is. That one signal does two jobs: it drives an
off-axis projection, so the screen behaves like a window rather than a picture,
and it *is* the controller — you lean out of cover to see an enemy, shoot with the
mouse, and lean back before its shot lands. Ninety seconds. Being hit costs six of
them.

No install, no headset, no plugin. A browser tab and a webcam, or the keyboard if
you would rather not be on camera.

```
npm install
npm run dev      # allow the camera, then press space
```

The browser asks for the webcam once the level is drawn — the camera is the
controller, not an option. Refuse it, or have no camera, and `WASD` stands in for
your head with a line in the panel saying so; `C` toggles between the two. Press
`K` to spend ten seconds measuring your range, which is what every number in the
level is scaled to.

The mouse aims. During a round the pointer is captured, so the crosshair cannot
leave the window and the sensitivity slider has deltas to act on; between rounds
it is the ordinary cursor, because the panel has controls in it.

`npm run dev` runs `npm run setup` first, which copies the MediaPipe WASM out of
the pinned package and downloads the face model into `public/`. Nothing this app
needs at runtime comes from a CDN — it is meant to be shown in a room whose wifi
is unknown. The keyboard path (`WASD`) and the four shipped levels need no
downloads and no API key at all.

---

## The one line that the whole project is arranged around

**The AI perceives. The engine judges.**

Three different models can propose a level here — a depth model from your webcam,
a vision model naming what it sees, a language model writing a layout from a
sentence. None of them may decide anything. Every proposal is clamped by
`src/boundary/validate.ts` as if it were hostile, and then handed to a solver in
`src/engine/` that decides, position by position:

- Is there anywhere **you** can stand that sees this enemy and has it on screen?
- Is the peek window it demands wider than **your tracker's measured jitter**?
- Does the retreat fit inside a fuse derived from **your measured speed and
  latency**?
- With everything else that is standing, is there still somewhere safe, wide
  enough to hold, and reachable in time?

If a room cannot answer, the game does not shrug and ship an easier level. It
**refuses**, with the counts that explain why. `tests/purity.test.ts` fails if any
engine module grows an import from outside `src/engine/`, or reaches for `fetch`,
`Date`, `Math.random`, `window` or `document`. No number the player sees comes
from a model.

That is the claim worth judging. The interaction technique is nineteen years old
and PRIOR-ART.md says so with citations.

---

## Where the AI is, and what it costs

Three optional, opt-in calls. The cost of every one is shown on screen as it is
spent, in cents, next to what it produced.

| | Model | When | Cost |
|---|---|---|---|
| **Your room becomes the level** | Depth Anything V2 Small, in the browser via transformers.js | `P` | free, ~77 MB of weights, WebGPU or WASM |
| **The furniture gets named** | Claude Sonnet, one vision call | with `P`, if you supply a key | fractions of a cent |
| **A level from a sentence** | Claude Sonnet, one JSON call | type a description and press Build | fractions of a cent |

Describe the setting as well as the shape — *clear afternoon, dusk, rainy night,
neon, forest, industrial* — because the palette and the weather are read from the
words rather than chosen from a menu. And a designed level is **swept and measured
like a shipped one**: same validator, same solver, same invariants, and the panel
reports the threat profile afterwards so the claim is a number rather than a
promise. See SPEC §15.11.

The key is typed into the page, used, and never stored. There are no secrets in
this repository — check `git log -p` for one if you like.

The scan is the honest weak point and it is labelled as such: monocular depth is
affine-invariant per image, so the only metric correspondence available is your
own face, and the far-wall distance is a slider. It moves difficulty, not
fairness — whatever it produces still has to survive the solver.

---

## What to look at, in order

**Play it first.** Press space. Easy, Standard and Advanced are in the panel, and
what a difficulty is *allowed* to change is itself a design constraint here — it
may move pressure, never fairness. Then press `H` and play again: the panel expands
into the instrument, and every enemy shows the lean it demands in centimetres, the
window you must hold it in, and the fuse it has derived for your body.

Then:

| File | Why |
|---|---|
| **SPEC.md** | Directed the build. **§0** lists the eight things it got wrong and **§15** specifies the game as it actually shipped — the fuse derivation, the standing lineup, the selection step, the play envelope. §6.7 is the invariants; §6.3 is the leverage identity, which decides where cover may sit. |
| **DEVLOG.md** | Every finding that contradicted the spec, and every process failure — including the two commits that shipped with a red test and how the habit changed. |
| **PRIOR-ART.md** | Written before implementation. It refuted the original novelty claim, which is why it exists. §6 was added afterwards and narrows the claim further. |
| **REVIEW.md** | The author's own review pass. Not written by a model — the brief asks for the author's, and it would be worth nothing otherwise. |
| **CLAUDE.md** | Working notes. The things that will bite you, and what not to change. |

```
src/engine/     the solver. Imports NOTHING, not even from src/.
src/boundary/   validates and clamps untrusted proposals before the engine sees them.
src/perceive/   trackers, calibration, the depth pipeline, the model calls.
src/render/     projection, geometry, WebGL2, palettes, sound. No 3D framework.
src/game/       the round, as a pure state machine.
tests/          the invariants of SPEC §6.7, and the boundary guards.
tools/          instruments, not tests. They print measurements.
fixtures/       hand-designed layouts, engine-swept anchors, synthetic bodies.
```

```
npm test         572 tests. No network, no clock, no RNG.
npm run levels   what the engine makes of every level, per body. Read this before
                 changing a layout.
npm run author   regenerates the levels: layouts by hand, anchors by sweep.
npm run probe    what the solver thinks of a fixture room.
npm run sweep    which candidate positions are fair.
npm run build    tsc, then vite. ~84 kB.
```

---

## Two things worth knowing before you judge the game

**The levels are half generated, and the half matters.** What a room looks like is
taste and is written by hand. Where an enemy may stand is swept through the solver
and measured, because the one level whose positions were placed by hand turned out
to have four usable ones out of twenty-one — and a playtester found that before any
test did. `npm run levels` prints the number the levels were iterated against:
what fraction of the positions three, six, nine and twelve centimetres from rest
have a threat visible from them. The 3 cm column is 0% on every level and must
stay that way. That is your cover.

**Almost everything good here came from someone playing it and saying what was
wrong.** The One Euro filter, the mouse taking over aiming, the enemy drawn as an
eye that opens, the flat bright palette, the standing lineup, the play envelope,
the reworked levels — each answers a specific complaint, and each complaint is
quoted in the commit that answers it. `git log --oneline` is a readable account of
the whole thing.

## What is not verified

Stated plainly, because the tests prove less than a green suite suggests.

- **Whether the picture is *right*.** The geometry and the projection are tested;
  the WebGL wrapper and the tracker's real accuracy need eyes and a face.
- **Whether the vision model is any good at your room.** No test touches a
  network. The suite proves *containment* — that a wrong model answer stays
  harmless — and says nothing about correctness.
- **The 14 cm comfort ceiling in `playEnvelope`** is a bet about necks, not a
  measurement of one. It is the only such bet in the solver, and it moves
  difficulty rather than fairness.
- **WebGPU is absent from Firefox on Linux**, which is the development machine.
  The WASM depth path is a supported path, not a courtesy.
