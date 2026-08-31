# Review

**Provenance, first, because this document is about honesty and would be worth
nothing without it.** The brief asks for a review pass owned by the author and
explicitly not self-graded by a model. I asked Claude to draft this one from the
build record — the commit messages, DEVLOG.md, and the test suite — because it has
the whole history and I do not have the hours. So: everything below the line marked
**"What I actually think"** is mine and was written by me. Everything above it is
assembled fact, drafted by the model, and checked by me. If that arrangement
disqualifies the review, it should — but I would rather say so than let it be
assumed either way.

Play it: **https://fliccione.github.io/signal42-training-repository/**

---

## 1. What this is, in one paragraph

A cover shooter whose only positional controller is where your head is. A webcam
measures head position; that one signal drives an off-axis projection — the screen
behaves like a window rather than a picture — and it is also the controller. An
enemy is visible only from a position you must lean to reach, and by the symmetry
of a sightline that is the only position from which it can shoot you. Ninety
seconds, four levels, three difficulties. No headset, no install, no plugin.

65 commits, 70 TypeScript files, ~8 600 lines of source, ~5 300 lines of tests and
instruments, ~2 700 lines of documentation, 572 tests.

## 2. Against the brief

| Asked for | Where |
|---|---|
| A spec that directed the build | `SPEC.md`, written before the code. §0 lists the eight things it got wrong; §15 specifies the game that actually shipped, because §1–§14 specify a different one. |
| A review owned by the author | This file, with the provenance note above. |
| `CLAUDE.md` | Present, and used — the reading order, the rules, the traps, and a section on rebuilding from scratch. |
| AI inside the product | Three models: a depth model (in-browser) turns the player's room into a level, a vision model names the furniture, a language model writes a level from a sentence. |
| Citations | `PRIOR-ART.md`, written *before* implementation. It refuted the project's original novelty claim, which is why it exists; §6 was added afterwards and narrows the claim further. |
| Guardrails | `src/boundary/validate.ts` treats every model output as hostile, and `src/engine/` decides everything the player is promised. `tests/purity.test.ts` fails if an engine module imports anything from outside itself or touches the network, the clock, or a random number generator. |
| Visible cost | The cost panel shows the model, the tokens, the cents and the wall-clock, per call, as it is spent. |
| No secrets in the code | None. The API key is typed into the page at runtime, used, and never persisted. Checked: `git log -p` contains no key, and the one time GitHub's push protection fired it was a false positive on a public Gist id inside `@huggingface/transformers` — recorded in the deploy commit rather than clicked past. |

## 3. The one architectural commitment

**The AI perceives. The engine judges.**

A depth model may say the chair is 80 cm away. A vision model may say it is a
chair and would make good cover. A language model may say where the walls go.
None of them may decide whether a position is fair, reachable, or escapable — that
is geometry, computed deterministically, from measurements of *this* player's body.

The engine's thresholds are not constants. The minimum lean is a fraction of the
player's measured reach; the minimum peek window is a multiple of the tracker's
measured jitter; an enemy's fuse is human reaction time plus the *measured*
perception latency plus the time to cross back into cover at the player's
*measured* speed. Every failure direction is the same: a slower body, a noisier
tracker, or a slower machine gets fewer enemies or more time — never a harder game.

And when a room cannot be played fairly, the game **refuses**, with the counts that
explain why. That is a first-class outcome, not an error path.

## 4. What the tests do not check

This is the section that matters, and it is short on purpose.

- **Whether the picture is right.** The projection maths and the scene geometry are
  tested; the WebGL wrapper and the tracker's real-world accuracy need eyes and a
  face. Nothing headless can check them.
- **Whether the vision model is any good at your room.** No test touches a network.
  The suite proves *containment* — that a wrong model answer stays harmless — and
  says nothing about correctness.
- **The 14 cm comfort ceiling** in `playEnvelope` is a bet about necks, not a
  measurement of one. It is the only such bet in the solver, and it moves
  difficulty rather than fairness.
- **The far-wall prior** in the room scan. Monocular depth is affine-invariant per
  image, so one of the two unknowns is a slider. It moves difficulty, not fairness,
  but it is the weakest link in that pipeline and is labelled as such.
- **Whether the game is fun.** No test has an opinion. Everything I know about that
  came from playing it.
- **The hosted build's depth scan**, which is not in it: 74 MB of weights do not
  belong in a repository, so the published version says so when you press `p`.

## 5. Where the AI helped, and where it cost

Claude wrote effectively all of the code. What that was good at, and what it was
not, is the interesting result here — more interesting than the game.

**It was good at:** holding a large invariant structure in mind and not violating
it; deriving rather than tuning (the fuse formula, the jitter-scaled window, the
reach-scaled lean floor are all its work and all better than the constants I would
have written); writing the instrument before the fix — more than half the findings
in DEVLOG came from a seven-line probe printing numbers rather than from reasoning;
and documenting *why*, at a density no human writes voluntarily.

**It was bad at:** knowing when a thing it had built was not fun. Every single
design correction in this project came from a person playing it. The complete list,
from the commit log: the dodge mechanic was unreadable and got cut; the targets
were invisible and needed a cue; the hunt was boring and became a shooter; two
successive art directions were rejected before the third landed; the spawn timer
made the room feel empty; the levels put every threat out of reach; the room scan
made the game hostage to the player's furniture; the rain looked like a texture.
Each of those is a commit that quotes the complaint it answers. **The model's
failure mode is not incorrectness — it is confidently building the wrong thing
correctly.**

**Its worst habit**, and this one is worth naming because it recurred: it broke
things in ways its own tests could not see. Three separate features were deleted by
having their call site removed while the tests on the function stayed green. The
countermeasure it eventually wrote down — *a leaf with no caller may not stay; grep
for the call, never the definition* — is now in CLAUDE.md, but it took three
occurrences.

**The failures it recorded against itself**, all in DEVLOG: two commits shipped
with a red test suite because `npm test | grep` succeeds on a failing run; an edit
that silently matched nothing and a commit message that claimed the feature was
wired; aliasing in grid sampling, four separate times; point-versus-extent
confusion, three times; a guard's test that passed for the wrong reason three
times before it passed for the right one; and a name that went stale for weeks
because a name is the one part of a project nothing tests.

## 6. Cost

Effectively nothing in money. The in-browser depth model is free after a 74 MB
download. The two Claude calls are one vision call per room and one JSON call per
designed level, at roughly $0.006 each — a heavy day of tuning is about a dollar.
The real cost was model time and my evenings.

---

## What I actually think

*Federico's own verdict. Replace this section entirely — it is the part the brief
is asking for, and it is the part nobody else can write.*

Prompts, if useful:

- What did you actually want from this, and did you get it?
- Playing it now: what is genuinely good, and what would you still change?
- Where did directing the model feel like leverage, and where did it feel like
  supervision? Was the ratio worth it?
- The project's rule is that the AI perceives and the engine judges. Did that hold
  up in practice, or is it a nice line?
- What would you do differently on the next one?
- What would you tell a colleague who is about to try building something this size
  the same way?
