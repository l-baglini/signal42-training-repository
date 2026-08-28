# Research: rebuilding FretGuide on the right stack

Commissioned 2026-07-30 after v1's marker-based overlay failed to stay attached to the guitar.

**Start here: [`10-recommended-stack.md`](10-recommended-stack.md)** — the decision, the stack, and the
build plan. Everything else is evidence.

| File | What it is | Status |
|---|---|---|
| [`10-recommended-stack.md`](10-recommended-stack.md) | **The synthesis.** Architecture, stack with versions, build plan, risks | complete |
| [`00-diagnosis.md`](00-diagnosis.md) | Measured diagnosis of *why* v1 failed, by simulation. Establishes the accuracy budget the rebuild must meet | complete |
| [`09-local-hardware.md`](09-local-hardware.md) | The actual target laptop and camera, probed. Format/control tables, `v4l2-ctl` lock-down commands | complete |
| [`01-markerless-tracking.md`](01-markerless-tracking.md) | Tracking literature. Wang & Ohya 2018 prior art, guitARhero's negative result, XFeat/LightGlue, why to skip point trackers | partial — raw notes complete, sections unfilled |
| [`03-stack-and-runtime.md`](03-stack-and-runtime.md) | Runtime facts: OpenVINO/NPU driver stack, package versions, licenses, IPEX EOL | partial — raw notes complete, sections unfilled |
| [`07-data-and-training.md`](07-data-and-training.md) | Data availability (none), label design, the sports-field registration analog, the ChArUco labelling rig | partial — sections 1–3 complete, 4–8 unfilled |
| [`08-product-landscape.md`](08-product-landscape.md) | Does this already exist? Fretello Mirror, GeetAR, IMMERROCK — and why nobody ships the laptop-camera configuration | partial — products covered, sentiment mining not done |
| [`sim/`](sim/) | The simulation scripts behind `00-diagnosis.md`. Run with `node docs/research/sim/sim.mjs` | complete |

The three partial files were cut short by API/session limits. Their raw research notes are complete
and verified; only the write-up sections are missing, and their substance is folded into
`10-recommended-stack.md`.

## Not yet researched

Deferred as second-milestone concerns, not blockers for the tracking rebuild:

- **Audio** (Focusrite path): real-time pitch/chord detection, and the audio↔video fusion angle for
  resolving string/fret ambiguity.
- **Hand tracking**: whether landmark precision suffices for fingering verification against the
  ±4.8 px budget, and occlusion masking to draw the overlay behind the hand.
- **Product/UX**: whether an overlay attached to the live video is the right interaction at all,
  versus a rock-stable synthetic player's-eye fretboard. (Partially addressed in
  [`08-product-landscape.md`](08-product-landscape.md); the motor-learning and interaction-design
  question is still open.)
