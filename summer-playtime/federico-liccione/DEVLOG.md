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

## A guard that vanished

Worth recording because it is a failure of process rather than of reasoning, and
because it is the second time the same shape of mistake got through.

Typing in the level-description box moved the player's head and space started the
round. The fix had been written: a loop over every input installing
`stopPropagation`. A later edit to the same region of `main.ts` replaced the block
that contained it, the loop went with it, and **typecheck and 393 tests stayed
green** — because nothing in a test suite can see an `addEventListener` that is no
longer there.

Two things came out of it. The guard now asks the document who has focus, which
depends on nothing: not on propagation, not on registration order, not on a field
existing at load. And the *decision* is a pure function, `isTypingIn`, separate
from the wiring that calls it — which is the only reason there is now a test file
for it. The lesson generalises: a behaviour that lives entirely in event wiring is
a behaviour no test can defend.

The related process failure, twice in one session: committing while a check was
red, because `npm test 2>&1 | grep -E 'Tests'` succeeds on a *failing* run too —
grep found its pattern. Both commits were amended, and the habit changed to
running the checks and reading their exit codes before staging anything.

## An edit that never happened, and a commit that said it had

The level composer took four fixes, and the fourth one exposed why: **the wiring
was never in the file at all.** Clicking "Build this level" refreshed the page,
which is a form doing what forms do when nothing has called `preventDefault` —
and nothing had, because the whole `designLevel` section had never been inserted.

The mechanism was a scripted `str.replace` against a section marker that had been
renamed in an earlier rewrite. No match, no error, no output: the edit silently
did nothing. Typecheck and 393 tests stayed green, because the modules it should
have called were complete, correct and tested — they were simply never called by
anything. And the commit message asserted the feature was wired.

That last part is the real failure. The code was fine; the *claim* was false, and
it was false in a permanent artifact. Two habits changed as a result: scripted
edits now assert that their target matched, and a feature is verified by looking
for its wiring in the file and in the built bundle rather than by trusting that
an edit command reported nothing.

It rhymes with the vanished keyboard guard above. Both were edits that appeared
to succeed, both left the test suite green, and in both cases the thing that was
missing was a single line of wiring that no test can reach. Three of the four
composer fixes were also the same mistake in different clothes — treating
something said in conversation as though the interface had said it: a field hidden
by a CSS rule, a keypress that only worked from one of two fields, and a button
that did not exist.

## A model that thinks whether or not you asked it to

`max_tokens: 2048` returned `stop_reason: "max_tokens"` for a reply whose entire
JSON payload is a few hundred tokens. My first instinct was right in shape and
wrong in remedy: I raised the ceiling to 8192 and added a retry, on the reasoning
that the budget must cover whatever the model spends before the JSON.

Checking the reference instead of stopping there produced the actual mechanism.
`claude-sonnet-5` runs **adaptive thinking by default** when `thinking` is
omitted, at effort `high` — "Claude almost always thinks" — and those tokens
count against `max_tokens` *and are billed*, while the default display setting
returns them empty. So the symptom is a truncation with apparently nothing in the
response to account for it, which is exactly what it looked like.

The documented remedy is two levers and the ceiling is the lesser one:
`max_tokens` is a cap rather than a reservation, so raising it is free when
unused — but a larger ceiling also gives adaptive thinking more room to spend.
The cost lever is `output_config.effort`, and the reference prefers lowering it to
disabling thinking outright. Both calls now run at `effort: "low"` with a 16000
ceiling, and the retry stops at 20000 because above 21,333 the SDK requires
streaming.

Two smaller corrections came with it. Thinking blocks arrive *before* the text
block, so reading the first `type === "text"` block is right — but one must not
assume a thinking block is present, because adaptive thinking sometimes skips
entirely. And the cost panel has been under-reporting: thinking tokens are billed
even when invisible, which `effort: "low"` minimises rather than removes.

Worth recording as a pattern rather than a fact: this is the fourth time in this
project that checking the documentation instead of reasoning from the symptom
produced a different and better answer — after the metric-scale plan, the mask
orientation, and the depth model's normalisation. The plausible diagnosis and the
correct one keep being adjacent.

## The shooter that left before its own bullet

"I keep getting hit by enemies that are not visible." They were not there, and the
reason is a two-line reading of the control flow rather than anything subtle:
`step` removes an enemy from `active` in the *same tick* it fires, and only active
enemies are drawn. So the thing that hits you vanishes in the very frame it hits
you. The fix marks the spot it fired from for a second.

Worth pairing with the report just before it — an enemy that looked visible but
could not be shot. Both were the same class of fault: the *rules* were consistent
and the *picture* did not match them. A point-sized engagement test drawn as a
rectangle, and a shooter drawn only while it still existed.

## One mistake, three times

A playtester worked out the third instance themselves: "the enemy was below the
bottom edge of the screen." It was — just above it, with nine tenths of its body
below the glass. `onScreen` tested the enemy's **centre**, and the enemy is
eighteen centimetres across, so it counted as in frame, charged its fuse, fired,
and could not be seen.

That is the same fault three times in this project, and the repetition is the
interesting part:

1. An occluder's centre deciding whether a sightline was blocked — which is
   *correct*, and stays, because the solver's exactness depends on it.
2. An enemy's centre deciding whether it was drawn, so one half behind cover
   showed the edge of a socket while being unshootable.
3. An enemy's centre deciding whether it was in frame.

Each time the rules were self-consistent and the picture disagreed with them, and
each time I fixed the instance rather than looking for the class. The third one
now pads the screen rectangle by the object's own projected radius, so the whole
of it has to be in frame — and the padding scales with depth, because the same
enemy looms larger up close.

Counter-intuitively this produced *more* playable enemies, not fewer: the
`exposed-at-rest` rejection uses the same test, so an enemy that cannot fully see
you from your resting position is no longer disqualified for being able to. Fair
enemies went from 37/28/18/32 to 75/50/45/50 on the designed levels and from
69/72/65 to 69/88/65 on the authored ones.

## Aliasing, and two wrong fixes before the right one

"Far fewer enemies than before" was true and was my doing: the on-screen rule
correctly removed enemies off the edge of the glass, but the candidate grid was
still spreading a fixed distance either side of the furniture, so most of what it
proposed lived where nothing can be engaged. Fitting the grid to the visible cone
was the fix, and it took three attempts to get the sampling right.

Truncating in scan order biases the sample into a corner — already recorded above.
Striding through the flattened grid **aliases**: a probe showed one depth whose row
was 26 columns wide against a stride of exactly 13, so the sample used columns 0
and 13 and nothing else, and its centroid sat 38 cm left of the room's. Coarsening
the grid instead cannot alias, because the sample *is* a grid — but with few
samples it piles against the start of each range, and the deepest layer came out
27 cm low. Centring the remainder fixed that, and now every centroid lands exactly
on the middle of its range.

The lesson is about method rather than geometry: each of the three attempts was
plausible, and the only reason the second and third happened is that a
seven-line probe printed centroids instead of me reasoning about them. Two of the
three wrong versions would have passed a less specific test.

## Open

- WebGPU is absent from Firefox on Linux, which is the development machine. The
  WASM path is a supported path, not a courtesy.
- Vision accuracy is unverified by construction: no test touches a network. The
  suite proves containment — a wrong model answer stays harmless — and not
  correctness.
- Nothing has been playtested, so the design bet that peeking is a good verb and
  the literature's caution that dodging is a bad one are both still theory.
