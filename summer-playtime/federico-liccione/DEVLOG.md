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

## A marker that outlived its round

A screenshot of an orange square hanging in the void: no body inside it, not
shooting, unshootable. It was the "shot came from here" marker from a *previous*
round. Its deadline was stored on `combat.tS`, the round clock, which restarts —
so a marker stamped at 45 seconds sat through the whole of the next round, and the
scoreboard honestly read "0 hit" because the hit had happened in a round that was
over.

A different class from the three below, and one no unit test in this suite could
have caught: the pure modules are all deterministic functions of their inputs, and
this was state in the app leaking across a lifecycle boundary. The deadline is now
on the wall clock, which a reset cannot resurrect, and `rebuildLineup` clears it
regardless.

The generalisable bit: **a timestamp is only as trustworthy as the clock it is
compared against.** Round-relative time is fine for anything inside a round and
wrong for anything that can survive one.

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

## The look was wrong twice, in opposite directions

The first pass at making this stop looking like an engine was procedural
materials — noise-driven rock and metal on the cover. The playtester rejected them
as ugly and, more usefully, as harmful: they made the levels harder to read. So
they came out.

The second pass was a **backlit** look: bright hazy sky, near-black cover, a thin
rim of light on each top edge, a skyline in the far opening, light shafts, film
grain, and every surface graded from near-black at the near end to bright at the
far end. It photographs well. The verdict was *"non mi piace per niente l'effetto
ottenuto, confonde e basta"*, with a reference: Minecraft, Geometry Dash.

That reference is the actual finding, and it took two failures to hear it. Both of
those games are legible at a glance, and the reason is not the art budget: **a
face is one flat colour, the shading is which face you are looking at, and every
edge is hard.** Everything I had added was soft, and every soft thing was carrying
a depth cue by *removing contrast* — aerial perspective at 0.72, a haze band at
the horizon, a vignette at 0.42, a gradient from black to bright on every
surface. All of it concentrated in the far half of the corridor, which is exactly
where deciding whether an enemy is exposed is hardest. The picture was spending
its contrast budget on atmosphere and leaving none for the rules.

What replaced it costs less and states more: a checkered floor, whose tiles get
smaller with distance and touch nobody's contrast; walls that take the same
courses so both surfaces agree where one step of depth is; no ceiling, so a block
always has bright sky behind its top edge; clouds as flat rectangles instead of
noise.

And one thing I had simply been wrong about for weeks. I had read the solver's
screen-parallel constraint as forbidding cover from looking like a block. It does
not — it forbids the **extrusion**. A box with real depth has a silhouette wider
than its own front face from any off-axis eye, so drawing one would promise the
player cover that the sightline test does not grant. Bevel *inwards* and the block
is free: a bright outline on the rectangle itself, four bevel faces lit from the
upper left, a flat front face, every vertex inside the rectangle and at exactly its
depth. The constraint did not cost the look. Misreading the constraint did.

`tests/geometry.test.ts` now asserts the room does **not** grade brightness with
distance. That test previously asserted the opposite, and inverting a test I had
written on purpose is the clearest record of the mistake I can leave.

## A timer where a situation belonged

The same playtest that rejected the look also said the game had got worse:
*"è diventato uno spostati e spara, mentre prima quando ti affacciavi vedevi già
presenti i nemici ed era tutto più dinamico e divertente"*.

This one is a design error I can name precisely. The combat loop inherited its
spawn model from the earlier hunt mode: enemies arrive on a timer, two at a time,
and leave after eleven seconds. Under that model the *most likely thing to happen
when you lean out is nothing*, because most of the round is spent between
arrivals. So the player learns to lean, look, retreat, wait — and the verb the
whole project is built on becomes a polling loop.

The fix was to delete the timer, not to tune it. Five enemies stand in the room
from the first tick and never leave. Leaning out now finds a situation.

Worth recording that this needed no change to the fairness theorem, and the reason
is a property I had not noticed I already had: an enemy is only shipped if a lean
is *required* to see it (I2), so at the rest position none of them can see the
player, however many are standing there. The safe pocket behind cover survives
the entire lineup. A full room is loud, not unfair — and I only knew that for
certain because the invariant had been written down years-of-decisions ago in
SPEC §6.7 rather than being an intuition about the current code.

It did need one addition: with several sightlines opening at once, a single moment
of over-exposure would bill the player once per enemy per frame. A hit now resets
every fuse.

## A feature deleted by being disconnected

The playtester reported a round with eight enemies standing in it as *emptier*
than one with two arriving on a timer. Three causes, and the first is the one
worth keeping.

Commit 7df4ee5 had added `blockingOccluders` so the app could outline the cover a
hidden target was standing behind — the complaint then was that the hunt had no
visible subject. When the hunt became combat, the wiring for both of that
commit's cues was dropped, and **nothing failed**. The engine function still had
its tests, and they still passed, because they test what it returns and not
whether anybody asks. The same class of failure as the `stopPropagation` guard
that vanished, and as the `designLevel` block whose scripted edit silently matched
nothing: behaviour that lives only in a call site cannot be defended by testing
the callee. This is the third time, and the only reliable countermeasure I have
found is to grep the source *and* the built bundle for the call, not the
definition.

The second cause was selection. Fair positions were sorted by lean and a rotating
slice taken, so a round could stand five enemies that all needed a long lean the
same way — every one fair, and peeking the other way found nothing. Replaced with
greedy maximum coverage over the masks the fairness solver already builds.

The third cause is the interesting one, and it was my objective function.
Maximum coverage counts cells, and cells favour the *widest* footprints, which
belong to the long-lean enemies whose exposure region is a swathe at the edge of
the envelope. A seven-line probe binning coverage by distance from rest showed
what that produced: a full commit found a threat 93-100% of the time, a
half-committed lean a third of the time. The algorithm was systematically
preferring the enemies that make a modest peek pointless. Weighting coverage by
where the body actually spends its time fixed it.

And the aggregate number had been hiding all of it. "57% of the range is under
threat" is dominated by the middle of the envelope, because a lattice has far more
cells there than at its edge. The same data in bands — 0% / 40% / 71% / 99% — says
something a designer can act on. That is the second time in this project a mean
over a lattice has told me nothing (the first was anchor centroids), and both
times the fix was to bin rather than average.

## The room with four positions in it

*"Ci sono alcuni livelli però (ad es. The Desk) in cui il bersaglio continua a
presentarsi in un solo punto specifico."* Measured: The Desk had **4 fair
positions out of 21**, all of them between x = -30 and x = -42, and the game
cheerfully stood eight enemies on them. Sixteen of its anchors were
`not-shootable` — no reachable position both sees them and has them on screen.

It is the oldest fixture in the project, hand-authored before any of these
instruments existed, and it was not in `npm run levels`'s list — so nothing was
watching it. Two lessons, and the second is the one I keep relearning: an
instrument only measures what you remember to point it at, and *a hand-authored
fixture is a guess*. The project already knew that — `npm run sweep` exists
because authoring one by hand got it wrong the first time — and The Desk was the
guess that predated the lesson. Regenerated by sweeping 1518 candidate positions
through the engine and keeping the ones fair for two different bodies: 4 fair
became 210.

"Too thin to play" is now a refusal with its counts, rather than a round that
technically starts. Refusal was already a first-class outcome for a room with
*nothing* fair; a room with four is the same failure with a nicer number on it.

## Two ideas from the playtester, and why I took one of them straight

Both were good and they needed different answers.

**Enemies visible from the rest position** was the stronger idea in this project
so far, and it needed no new mechanic at all — only permission. Exposure has no
direction, which is the symmetry the whole design rests on, so an enemy that can
shoot you where you sit is one you can shoot where you sit: *take it now or get
out of the way*. And it was the largest class the solver was throwing away, 75 to
176 candidates per level rejected as `exposed-at-rest`. That rejection was right
for the hunt this began as, where an already-visible target left nothing to find,
and it survived the pivot to a cover shooter without anybody re-examining it. It
is now `verb: 'duck'`, opt-in, capped at a quarter of the lineup.

The cap took two attempts and the instrument caught both. Uncapped, they take
every slot — coverage is weighted towards where the body spends its time and
these cover exactly that. Capped per covering block, eight still got through,
because the first eight positions of the order span three or four blocks. It has
to be a share of the whole order.

And they cost a guarantee I had not noticed I was relying on. I2 says every
shipped target needs a lean; what it was *also* silently providing is that the
rest position is safe from all of them at once. The per-enemy theorem never said
that — it says each enemy's own cover is reachable inside its own fuse, and never
that the covers intersect. That gap was harmless while I2 held and became load-
bearing the moment it did not. It is now earned rather than inherited (I11), and
my first version of the earning was too weak in a way that only measurement
showed: requiring *some* safe cell let through a lineup that threatened 100% of
the body's range at every distance. A refuge has to be held against the same
jitter a peek window is held against.

**Moving targets** I did not take as asked, and the reason is worth stating rather
than quietly substituting. Every mask in this solver is precomputed on static
screen-parallel rectangles, and fairness is a claim about a position. A freely
moving enemy makes it a claim about a trajectory, which I cannot prove at the
price of the rest of the solver — and it would also move the information channel
from *your own movement reveals the room* to *watch the moving thing*, which is
the premise of the project. What it becomes instead is an enemy that **steps
between positions the solver has already judged**, while unobserved and with a
cold fuse. Every place it can be was proved fair, escapable and on screen before
the round started. The room stops being static; nothing has to be re-proved.

That one also reproduced the respawn bug one tick later — a vacated position goes
back to the front of the coverage order, so the body that just left it was handed
straight back. Third time this exact shape has appeared.

## Both verbs tried, one kept, and then the levels rebuilt

The playtester played the two-verb version and came back with *"forse hai ragione
ed era meglio prima, dove i nemici li vedevi solo affacciandosi... allora però ti
direi di rivedere i livelli per far sì che il gioco abbia senso"*. Which is the
right call and the right diagnosis in the same sentence: a second verb dilutes
the first, and the reason the first one felt thin was never the verb. It was the
levels.

So `inTheOpenShare` ships at 0. The machinery stays in the engine, tested, with
its guarantee (I11) intact, because it was a real iteration and because I11 is a
*stronger* statement than what it replaced — it just has nothing to do at 0. That
is a deliberate exception to this log's own rule about code nothing calls; the
difference is that this is an engine capability with a switch and a test, not
behaviour living in a call site.

And then the levels, which is where the actual finding is. Two things, both
measured against threat coverage in centimetres of lean:

**Cover belongs near the window, and by a lot more than I expected.** SPEC §6.3
already says why — leverage over a sightline is `(1 - s)`, so cover close to the
eye is the only cover a lean can beat — but I had never turned that into a number.
Moving Doorway's jambs from z = -46 to z = -22 took the fraction of positions
with a threat visible at six centimetres of lean from **18% to 54%**, and the
fair-position count from 38 to 108. The same layout, twenty-four centimetres
nearer.

**Edges matter more than area.** Two big slabs give two edges. Seven narrow
uprights crossed by three horizontal shelves give thirty, and it went to 67% at
six centimetres and 93% at nine — and it is the only layout that ever produced
vertical peeking, 58 of its 200 positions against 0 for the two-slab version. The
"sempre da sinistra a destra" complaint from weeks ago turns out to have been a
level-geometry complaint too.

Where the levels came out, seated, eight standing:

| level    | 3 cm | 6 cm | 9 cm | 12 cm | axes      |
|----------|------|------|------|-------|-----------|
| Doorway  |   0% |  54% |  81% |   98% | x95/y13   |
| Shelves  |   0% |  67% |  93% |   98% | x142/y58  |
| Parapet  |   0% |  61% |  86% |  100% | x149/y51  |
| The desk |   0% |  58% |  81% |  100% | x135/y29  |

The 3 cm column is zero on purpose and must stay: that is the cover.

## Two mistakes inside the authoring tool, both familiar shapes

`npm run author` now writes the levels: layouts by hand, anchors by sweep. Both
bugs in it were repeats.

**I thinned the swept anchors by taking every nth.** 700 candidates, 256 allowed,
so something has to choose — and a regular stride through a grid lands on a
regular sublattice. It cost twenty-five points of coverage. This is the *fourth*
time aliasing has bitten in this project, after three attempts at
`proposeAnchors`. The fix is the same one that worked there and it is not
"choose more carefully": it is to let the objective choose. Running the coverage
order and keeping its prefix has no stride in it.

**And I filtered to anchors fair for *both* reference bodies**, with the comment
"so a level is not tuned to one neck". It deleted the easy enemies. "Requires a
lean" is `leanCm >= leanFraction * reach`, reach scales with the body, so a larger
body's threshold rejects precisely the *shortest-lean* candidates — the ones that
make a modest peek find anything. An intersection over bodies keeps the hard
positions and throws away the easy ones, which is exactly backwards. The union is
also the honest structure: what a level stores is a set of **candidates**, and
`assessEnemies` re-judges every one against the body actually playing. A wider
proposal cannot make a level unfair; it can only give the judge more to work with.

## A test that passed for the wrong reason, three times running

I11's guard — no lineup may leave the body without a holdable refuge — needed a
test showing the guard is *needed*, not just that it is satisfied. Three versions
passed without showing anything:

1. Compared against a cost-sorted ordering, which in that room happened to select
   the enemies that break it. Would have gone quiet the moment scoring changed.
2. Asserted it of eight enemies, where eight was not enough in that room. A claim
   about a number rather than about the property.
3. Ran on a fixture where the property genuinely did not hold: all twenty-seven
   in-the-open candidates together still left a 1.8 cm refuge.

The version that works is two enemies in an empty room, far out to either side.
Each is fair alone — the far edge of the envelope puts it off the glass, and off
the glass is cover by the same rule the game plays by — and their two refuges are
on opposite sides, so together there is nowhere to be. Finding that case was the
work; asserting it was one line. Which is the general lesson: **a guard's test has
to be written against a case where the guard bites**, and if that case is hard to
construct, that is information about the guard and not an excuse to assert the
easy half.

## Deleting a cue, and being consistent about why

*"Ci sono dei riquadri rossastri in movimento... che cosa sono?"* They were
`nearestBreak`'s indicator: three squares on the screen plane pointing at the
nearest position that breaks the sightline of whatever was shooting, warming from
blue to red as the fuse charged.

They were built for the in-the-open verb, where they were not decoration but a
requirement — if an enemy can see you sitting still, "get out of the way" has no
direction in it and the mechanic is unplayable without one. That verb now ships at
0, and for the verb that remains the arrow says nothing the player does not know:
cover is where you came from. On top of which the fuse bar and the rising warning
tone already carry the same fact, and this carried it across the middle of the
screen at the moment the player is aiming.

Worth recording the *asymmetry* in what I kept, because it looks inconsistent and
is not. The in-the-open path stays: it is a parameter on a function the game
calls every round, exercised by tests, with a guarantee (I11) attached and a
documented switch. `nearestBreak` went: it was a helper whose only caller I was
deleting, and keeping it would be exactly the failure this log describes three
entries above — a function nothing calls, with passing tests, waiting to be
mistaken for a working feature. Its tests went with it.

The rule I want to hold myself to, stated so the next session can apply it: **a
switch on a live path may stay; a leaf with no caller may not.**

## The documentation, and one thing I will not write

Written at the end, with the parts that had gone stale fixed rather than hidden.

**SPEC.md gets a §0 instead of an edit.** Six things it got wrong — dodge, the
hunt, the room as the level, the play envelope, lineup selection, the texture —
listed at the top with pointers into this log. Editing the body would have been
easier and would have destroyed the document's only real value: it was written
before the code, and it has to still read as what was written then. A
specification quietly reconciled with its implementation is a summary pretending
to be a plan.

**PRIOR-ART.md gets a §6 that narrows the claim rather than widening it.** The
pivot to a cover shooter moved this project *closer* to Wang et al. 2006 — webcam,
flat screen, dodging-and-peeking, twenty years ago — and pretending otherwise
would be the exact failure the survey was written to prevent. What §6 argues is
unclaimed is no longer the interaction: it is the referee. A solver that decides
before a level ships whether each position is reachable by *this* body, whether the
window it demands exceeds *this* tracker's jitter, whether the retreat fits a fuse
derived from *this* body's speed — and that returns a typed refusal when it cannot.
Sko and Gardner's peering does collision checks so you cannot peer through walls;
that is correctness. This is a fairness argument about a player, and the survey
found nothing attempting it.

**CLAUDE.md's state section was stale in six places** — 345 tests, a next-steps
list of things already built, a texture key that no longer exists. Rewritten. And
in rewriting it I deleted four guidance paragraphs I had added an hour earlier,
because my replacement spanned a region wider than I had checked. Caught by
grepping for the phrases I expected to find. That is the same class of mistake as
the vanished `stopPropagation` guard and the `designLevel` edit that matched
nothing: **an edit whose blast radius I did not verify.** Third distinct instance,
first one in a document rather than in code, and the countermeasure is the same —
assert what the edit is supposed to have touched, then check what it actually did.

**REVIEW.md I am not writing.** The brief asks for a review pass owned by the
author and explicitly not self-graded by a model, and a model-written review of a
model-written codebase is worth nothing to anybody. What is here for it instead:
this log's list of what the tests cannot check, the "What is not verified" section
of README.md, and the fact that every commit message quotes the complaint it
answers — so the honest question a reviewer can ask of this project is *how many
of these findings needed a human to notice?* The answer is most of them, and that
is the interesting result rather than an embarrassing one.

## The frozen head

*"Se nel tentativo di coprirsi da un colpo nemico lo scatto con la testa verso un
lato è molto rapido, ed un occhio finisce fuori dalla webcam, si ottiene una sorta
di blocco fintantoché gli occhi non ritornano entrambi visibili dalla cam."*

Exactly right, and the mechanism was one line: on losing the landmarks the tracker
set `state = 'no-face'` and *held* `smoothed`. The comment above it even defended
the choice — "snapping the viewpoint to nothing is worse than a stale frame" —
which is true, and was the wrong pair of options to be choosing between. The
viewpoint freezes at the moment the player is moving fastest and cares most.

The principle that fixes it points the opposite way to the obvious fix: **an eye
leaving the frame is information, not the absence of it.** It says the head went
that way. Two situations, and the first one turned out to be recoverable in a way
I had not considered:

**One eye out of frame is still a measurement.** The separation between the eyes is
what gives this pipeline its metric scale, so losing one loses the *depth* — but
not the lateral position, which is what the game is played with. Carrying the last
known separation forward keeps the head tracked at a held depth. That covers most
of the reported case outright: a sideways snap loses one eye well before it loses
the face.

**Both gone is dead reckoning, bounded twice, and then a stop.** The suggestion was
to jump to the furthest point from centre, and I did not take it, for a reason
worth writing down: exposure in this game is *symmetric*, so guessing further out
is as likely to walk into a sightline as out of one, and which one depends on level
geometry a tracker cannot see. Continuing the measured velocity is the only claim a
tracker is entitled to make — and when the snap was fast, which is the case that
prompted this, it arrives at almost the same place. Two bounds because one is not
enough: 10 cm because a head at 200 cm/s that vanishes for a third of a second has
plausibly travelled 60 cm and reporting that is a guess, and 0.30 s to catch the
slow drift out of frame that would otherwise creep forever without hitting the
distance bound. The distance bound scales the vector rather than clamping each
axis, because clamping separately would bend a diagonal snap into an axis-aligned
one — a lie about the one thing the function actually knows.

Two things fell out of building it that were not in the complaint.

The filter has to be **reset** when coming back from a gap. Its whole job is to lag
a noisy signal, so after a gap its state describes where the head *was*, and
feeding it the truth would rubber-band the viewpoint into place — a second
complaint waiting to be made.

And `status()` now distinguishes four states rather than two: tracking, one eye
with the depth held, carrying, and holding. That is not polish. The project's rule
is that it never lies about perception, and three of those four are the tracker
reporting something it did not measure.

The decisions live in `src/perceive/reacquire.ts` and are pure, with eleven tests.
Same split as `isTypingIn`: the decision can be tested, the thing holding a video
element cannot — and every one of the interesting cases here (the margin, the
direction-preserving clamp, a negative timestamp gap) is a decision.

## Three estimators, three seams

*"Meglio, però rimane forse ancora un po' scattoso quando entrambi gli occhi
ritornano visibili."*

Fixing the freeze created this, and diagnosing it was more useful than the fix.
The tracker does not have one estimator any more — it has three: both irises, one
iris plus the last known separation, and dead reckoning. They estimate the same
quantity by different means, so they disagree by a centimetre or two, and **every
switch between them steps the reported position**. Coming back from a gap is the
largest of the three steps, because the extrapolation and the truth have had up to
a third of a second to diverge, but it is not a special case. It is the same seam,
and I had reached for the special case first: reset the filter on a long gap. That
turned a rubber band into a jump, which is what the second complaint was about.

One rule instead of three smoothings. On every switch, record the disagreement as
a **bias** so the reported position does not move at the instant of the switch,
then decay the bias to nothing with a 120 ms time constant. Continuous to look at,
and it converges on the measurement.

Two things about it that are not incidental:

The bias is bounded at 6 cm. Absorbing a discontinuity means reporting a position
the tracker knows is wrong, and smoothing a 30 cm disagreement over a third of a
second is a 30 cm lie about where the player's head is — which in this game decides
whether they are behind cover. Past the bound the remainder snaps. **A visible jump
is better than a plausible untruth**, and that is the same trade as everywhere else
here: the status line says which of four states the tracker is in precisely so the
player is never misled about what was measured.

And the decay is driven by elapsed time rather than by frames, which has a specific
reason: a webcam's frame rate collapses in exactly the poor light that makes the
head hard to find, so a per-frame decay would converge slowest at the moment it is
needed most. There is a test that two half-steps land where one whole step does.

The general lesson, and it is one I would not have got to from the first complaint
alone: **when a fix adds a second estimator, it adds a seam.** Adding a third
without noticing that they all need one hand-off rule is how a jitter fix becomes a
jitter report.

## Rain that was a texture, and a question about trust

Three things from one playtest, and the third is the one that mattered.

**The rain was one layer of identical columns.** *"Non è realistica dato che scorre
in colonne tutte uguali a velocità elevata."* Correct, and the diagnosis is more
general than the fix: rain does not look like rain because of the drops, it looks
like rain because the drops **disagree**. The old version had every column the same
width, the same period, nearly the same speed, and every streak the same length and
brightness — so it read as a moving texture, which is what it was. Three layers that
disagree on all five, plus a slant and a per-column phase, and it reads as weather.
Also normalised to CSS pixels: it had been half-size on a high-DPI display, which
nobody had noticed because nobody had compared two screens.

**"Can I ask for a particular setting?"** Yes, and it already worked — the palette
is read from the words in the level's name and blurb — but nothing said so, which
makes a feature that exists indistinguishable from one that does not. Now the
composer's note names the six settings, and the model's system prompt is told that
*it* chooses the palette by what it writes and that there is no separate field for
it. One was also missing: "scenario naturale" landed on `DAY`, which has a cyan sky
and a grass-coloured floor and was therefore the right answer by accident. There is
a `FOREST` palette now, and its first draft failed the palette test with the cover
three hundredths of a luminance from its own floor — pretty and invisible, which is
exactly the failure that test was written for.

**"Is an AI-built level as valid as one you made and tested?"** The honest answer
had two halves and only one of them was yes.

On **fairness**, yes, and it needed no code: a designed room goes through the same
validator and the same solver as a shipped one, so I1, I2 and I11 hold over it
identically, and a room that cannot supply a lineup is refused with its counts.
That was the point of the architecture and it held.

On **quality**, no — and I had not noticed. The shipped levels have their positions
**swept**: several hundred candidates pushed through the solver with only the
provable ones kept. A designed room got a coarse deterministic grid at 9 cm pitch.
Same walls, same solver, thinner pool, for no reason other than which code path
produced them. So `sweepFairAnchors` now runs for designed rooms *and* for scanned
ones, and the scan panel reports the banded threat profile afterwards — the same
number the shipped levels were iterated against.

The general lesson is about where the two code paths diverged. The architecture's
whole claim is that it is **indifferent to who proposes**, and it was — at the
boundary, which is where I had been checking. The divergence was upstream of the
boundary, in how generously each path proposed, and a difference in generosity is
invisible to every test that asks whether the output is safe. "Same guarantees" and
"same quality" are different claims, and this project had been quietly conflating
them.

## Auditing the name

*"Pensi che il nome 'Blind Spot' sia sempre buono?"* Worth asking, and the answer
was interesting enough to record: **the name was still describing the previous
game.**

"Blind spot" names what you cannot see. That was exactly right for the hunt this
project started as, where the verb was finding something hidden. What ships is a
cover shooter whose entire thesis is that the sightline has no direction — the
position you can shoot it from is the position it can shoot you from — and the name
says nothing about the half that makes it a game. It is also heavily taken (an NBC
series ran under it for five years), which matters for something meant to be opened
from a link.

The defence is real, though: a piece of cover creates a blind spot **for both of
you**, so the name does carry the symmetry — on a second reading. And a name that
carries its point only on a second reading is doing less work than one that carries
it on the first.

Two candidates were considered seriously. *Sightline* names the exact object the
solver computes and is symmetric by nature. *Exposure* names the central quantity
and has a photographic echo that suits a webcam game. Both are better names for
this game than the one it has.

Kept anyway, and the reasoning is the part worth keeping. Sixty-four commit messages
carry the old name, and in this project those messages are the design history — each
one quotes the complaint it answers — so a rename buys a better label at the cost of
making the record read like a mistake. And the actual defect is fixable without one:
***to see is to be seen*** goes beside the name everywhere it appears, which
converts the weakness into the point. A subtitle was the cheaper and more honest
instrument than a rename, on the day before a deadline with the review still to
write.

The general note: **a name is a claim about what the thing is, and it can go stale
exactly the way a specification does.** This one went stale at the same moment SPEC
§1 did, for the same reason, and nobody noticed for weeks because a name is the one
part of a project nothing tests.

## Publishing it, and a secret that was not one

The deploy found a bug that only a deploy could find, which is the argument for
doing it before the deadline rather than on it.

**Every asset path started with a slash.** `/mediapipe`, `/models/...` — correct
exactly once, when the app is at the root of its origin. GitHub Pages serves a
project site from a subdirectory, so all of them would have resolved to the wrong
root and 404'd, and the webcam — the entire point — would have failed on the one
link anybody is going to click while working perfectly on the machine it was built
on. `src/perceive/assets.ts` now builds every path from `import.meta.env.BASE_URL`
and nothing else may build one by hand.

**And GitHub's push protection blocked the first push**, reporting a Mistral API
key in the built bundle. It was a false positive with a clean explanation: a public
Gist id — 32 hex characters, which is exactly Mistral's key shape — inside a
warning string in `@huggingface/transformers`' Whisper code, minified into the
chunk. Verified rather than assumed: the string appears in `node_modules` and
nowhere in this repository.

The interesting part is what to do about it. There is a one-click "allow this
secret" link, and taking it would have been the fastest correct action. I did not,
because the honest fix was better than the correct one: **that chunk had no business
in the hosted build at all.** The room scan needs 74 MB of ONNX weights that are not
published, so half a megabyte of transformers.js and 23 MB of ONNX runtime were
being shipped to support a feature that cannot run there. A `VITE_NO_SCAN` flag
makes the app say so at compile time instead of discovering it as a 404 — and
because the flag folds to a constant, Rollup then eliminated the dynamic import,
the chunk, the runtime and the false positive together. The published bundle went
from 84 kB to 76 kB and the site from 135 MB to 38 MB.

The lesson generalises past this project: **a security warning is a question about
what you are shipping, not an obstacle in front of shipping it.** The bypass would
have left three problems standing — dead code, a wasted download, and a repository
whose scanner I had taught myself to click past — and the answer to the actual
question removed all three.

## The review, and who is allowed to write it

The brief asks for a review pass owned by the author and explicitly not self-graded
by a model, and I said so twice before being asked to write it anyway. What went in
was neither refusal nor a ghostwritten verdict: the assembled *facts* — what was
built, what is tested, what is not verified, what the AI was good and bad at, what
it cost — drafted from the build record, with the provenance of that arrangement
stated in the first paragraph, and the final verdict left as the author's with
prompts.

That is the same standard the rest of the project holds itself to. A document
claiming to be a human's honest assessment while being a model's is exactly the
failure this codebase spends five hundred tests avoiding in the other direction, and
a review that hides its own authorship would undermine every other claim in it. §5
is the part worth reading anyway, and it is not flattering: every design correction
in this project came from a person playing it, and the model's failure mode is not
incorrectness but confidently building the wrong thing correctly.

## A type annotation that switched off a build-time feature

The webcam did not work on the deployed link. It worked perfectly on localhost, and
that combination is the whole story.

The first cause was ordinary and I had already found it: every model path started
with a slash, which is correct exactly once — when the app is at the root of its
origin. GitHub Pages serves a project site from a subdirectory, so `/mediapipe/...`
resolved to the wrong root and 404'd. Fixed by routing every path through
`import.meta.env.BASE_URL`.

**That fix did not work, and the reason is invisible.**
`import.meta.env.BASE_URL` is not a runtime value. It is a **textual substitution**
the bundler performs on that exact expression. TypeScript objected — `ImportMeta`
has no `env` without pulling in `vite/client` — so I satisfied it the obvious way:

```ts
const meta = import.meta as ImportMeta & { readonly env?: { BASE_URL?: string } }
const BASE = meta.env?.BASE_URL ?? '/'
```

At which point the literal expression appears nowhere in the source, the bundler
substitutes nothing, `env` is `undefined` in the built chunk, and the `?? '/'`
fallback **quietly restores the exact bug it was written to fix.** The built file
read `const A1 = import.meta; const Vn = A1.env?.BASE_URL ?? "/"`, which is a
perfectly reasonable-looking line that always evaluates to `"/"`.

And it could not fail locally. `npm run dev` serves `import.meta.env` as a real
object at runtime, so the aliased version works — in development, and only in
development. Every local check passed. The tests passed. The type checker passed.
The build succeeded. The one environment where it was wrong was the only one
anybody else would ever use.

Two things came out of it.

**The fix is to remove the dependency, not to repair it.** Paths now come from
`document.baseURI`, an ordinary runtime value that no transform can silently drop,
correct in dev and in production and at any base. The class of bug is gone rather
than patched. Where a genuine build-time flag is still needed — `VITE_NO_SCAN` —
it is written as the bare literal expression with an ambient type in `src/env.d.ts`,
and there is a comment saying why it may not be aliased.

**And I deployed twice because I did not check the artefact.** The first deploy was
verified by fetching every file and getting 200s, which proved the *server* was
right and said nothing about the *bundle*. The second was verified by reading the
built JavaScript before pushing it and confirming the substitution had actually
happened. That is the same lesson as the `grep -E 'Tests'` that let two red commits
through, and as the three features deleted by having their call site removed:
**checking the thing you built is not the same as checking the thing you shipped.**

The general form is worth stating because it will happen again in some other
project: **a build-time substitution is a contract about source text.** Anything
that hides the text — an alias, a wrapper, a helper, a type cast in the wrong place
— turns the feature off without an error, and the fallback you wrote for safety is
what conceals it.

## Open

- WebGPU is absent from Firefox on Linux, which is the development machine. The
  WASM path is a supported path, not a courtesy.
- Vision accuracy is unverified by construction: no test touches a network. The
  suite proves containment — a wrong model answer stays harmless — and not
  correctness.
- Peeking has now been playtested and it holds up; dodging was cut on the
  playtester's evidence, which agrees with the literature's caution about it.
- Difficulty is still flat. Every enemy gets the same 0.89 s fuse because the fuse
  is *derived* from the measured body rather than authored, and nothing yet varies
  it with distance or with how far into the round the player is.
