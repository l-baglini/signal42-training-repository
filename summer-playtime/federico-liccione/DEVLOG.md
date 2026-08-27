# Devlog

What the build found that the spec had wrong. Kept because the corrections are
the interesting part — a spec that survived contact with the code unchanged
would mean nothing was checked.

## Before the code: three verification passes

The spec named a model id, an npm package and a novelty claim. All three were
checked before anything was implemented, and all three moved.

**The novelty claim was false.** The first draft of §1 said head tracking is used
either as input or as display but never both, and that using one signal for both
was the contribution. Sko and Gardner built head-coupled perspective *and*
lean-to-peek into the same webcam-driven Source engine build in 2009. Wang et al.
had webcam head offset driving both peeking and dodging on a flat screen in 2006.
Amazon shipped head-peek as an information verb in 2014. The claim was narrowed
to design synthesis and zero-install delivery — see PRIOR-ART.md, which also
lists the six sources that could not be verified.

The survey also produced a design change rather than just a citation:
Kulshreshth and LaViola measured head tracking *degrading* performance in
fast-paced games, so peek leads and dodge follows, with few slow telegraphed
threats. And it caught a wrong citation of my own — Nintendo's *Face Raiders*
uses the gyroscope, not head tracking.

**Monocular depth has no metric scale**, and every guarantee in §6 is in
centimetres. Depth Anything emits affine-invariant inverse depth: `1/Z ≈ aD + b`
with `a` and `b` unknown. The fix is that the player's own head supplies them —
the tracker already knows its metric distance from the inter-pupillary estimate,
and the calibration already asks the player to lean *towards the camera*, which
gives a second correspondence at a different distance. Two correspondences, a 2×2
system, and the room has a scale. The calibration measures the body and scales
the room; neither half was designed for the other.

**The spec told the implementation to do the wrong thing.** It said to mask the
player out of the frame *before* running depth estimation. The backbone is a ViT
with global attention, so a punched-out region is out of distribution and
perturbs the depth field outside the hole as well. Correct order: depth on the
unmodified frame, then use the mask to exclude those pixels when fitting
geometry. Also: never read the library's normalised depth image, which is min-max
scaled per frame across the whole frame — a face 40 cm from the lens owns the top
of the range and compresses a five-metre room into a sliver.

**A cost question changed the architecture.** Asked what a single trial costs, the
answer turned out to be that cost is not a constraint at all: a scan is $0.0064,
a thousand scans is six dollars. But working it out exposed that the spec said
"one scan per level" when the furniture does not move between rounds. One scan
per *room*, and the seed generates the levels. A play session is one call.

## Building the solver

**Authoring a fixture by hand got it wrong.** The first six anchor positions were
calculated by working out, for each occluder, the eye positions that clear it.
Four of the six came out unreachable, because two occluders *together* wall off a
side in a way neither does alone — clearing the monitor bezel requires leaning
right past 12 cm, and clearing the chair back requires staying left of 12 cm.
`tools/sweep.test.ts` exists because of this: it sweeps a grid of candidate
positions and reports what the solver actually thinks. Fixtures are now authored
from measurements. Measure, do not calculate.

**I2 was too weak, and the sweep proved it.** With fairness requiring only that a
target be hidden from the rest position, a 369-position grid produced 179 fair
candidates — and nearly all of them had `lean = 2.0 cm`, one lattice cell.
Technically hidden at rest; revealed by a twitch. A fifth reject reason,
`lean-too-small`, now requires the lean to clear a fraction of the envelope's
*measured reach*, so the demand is effort rather than distance: 1.5 cm for a body
with 5 cm of range, 7.5 cm for one with 25. Fair candidates dropped from 179 to
114 and their leans now run 6–11 cm, which is a mechanic.

**I3 was wrong as stated, and the fix is a scoping.** The invariant claimed
`E ⊆ E' ⇒ fairTargets(E) ⊆ fairTargets(E')`. It cannot hold, because the
minimum-lean floor scales with reach, so a wider body raises its own bar. What
*is* structurally monotone is `V(t)` and hence reachability, and that is what I3
now asserts. The non-monotonicity of fairness is deliberate and has its own test,
present so that nobody later "fixes" it by making the floor absolute.

**The purity test was right in principle and wrong in code.** I6 scans engine
source for `window.`, `document.`, `fetch(` and friends. It failed on the phrase
"occluders close to the window" in a doc comment. Comments are prose and prose may
say "window"; the scan now strips comments first. Worth recording because the
instinct on a failing invariant is to suspect the code — here the check was the
bug.

**A rename came out of it.** `Assessment.lean` and `.window` became `leanCm` and
`windowCm`. The unit belongs in the name in a codebase whose whole discipline is
that there is exactly one unit system.

## The dodge solver

Two of my own test expectations were wrong, and both taught me something about
the model rather than about the code.

**A threat aimed at you hits you where you stand, whatever its radius.** `to` is
the impact centre, so if `to` is the rest position then the player at rest is
inside the impact for any radius at all, including zero. A test asserting "a tiny
threat needs no dodging" was wrong on its own terms.

**The offline check is not always stricter than the check from rest.** I assumed
quantifying over the whole envelope would find harder positions than the middle.
It does not, when the threat is aimed at the middle: `needCm` is the distance to
the nearest *safe* cell, and a player near the edge of their envelope is often
already outside the impact and has nothing to do. The hardest place to be is the
centre of the impact. The offline check is only stricter for off-centre threats,
and there is now a test for each half of that.

## The projection

**I10 came out stronger than the spec claimed.** The invariant said the four
screen corners map to the four viewport corners. Deriving it showed that the
corners are a special case of something better: for a point at `z = 0`,
`x_ndc` works out independent of the eye position entirely, so the **whole screen
plane is invariant** under head motion. That is the precise sense in which the
screen is a hole in the wall rather than a camera, and it is what the test
asserts — over every eye position in the envelope, not a sample.

The parallax sign is asserted alongside it, because it is the one fact here that
is easy to get backwards: relative to the frame, a distant point slides *more*
than a near one, in the *same* direction as the head, and a point on the glass
does not slide at all. Working out `x_ndc = 2·ex·d / (W·(d + ez))` makes all
three obvious and none of them are obvious without it.

## The renderer prototype

The off-axis projection and the head tracking were prototyped and validated on
real hardware before the spec was written, and the prototype is checked in at
`prototype/` rather than left in a scratch directory. MediaPipe iris landmarks to
a metric eye position via the inter-pupillary estimate, and a Kooima generalised
perspective frustum over a depth-displaced relief, with the debug toggle that
swaps the off-axis frustum for a symmetric one at the same camera position. The
toggle is the fastest way to show someone what the mechanic is — the window
becomes a dolly and the illusion dies on the spot. It ships (SPEC §8) and its
behaviour is now asserted.

Not yet measured, and deliberately absent from the spec: the wall-clock of the
depth model in the browser, WebGPU versus WASM. Every published figure found
during verification traced back to a content farm, one of which also carried a
false release date. It gets measured on the target machine and recorded here.

## Open

- WebGPU is absent from Firefox on Linux, which is the development machine. The
  WASM path is a supported path, not a courtesy.
- Vision accuracy is unverified by construction: no test touches a network. The
  suite proves containment — a wrong model answer stays harmless — and not
  correctness.
- Nothing has been playtested, so the design bet that peeking is a good verb and
  the literature's caution that dodging is a bad one are both still theory.
