# FretGuide

**Point a camera at your guitar. Pick a chord. The dots appear on the real
fretboard, on the live video, and stay there while you play.**

Nothing is attached to the instrument — no markers, no stickers, no reference
photo, no calibration taps. A trained keypoint model finds the fretboard in
every frame from its own pixels, so you can move the guitar, put it down and
pick it up again. There is no lock to lose.

Runs entirely on a laptop. No network calls, no accounts, no cloud, no
telemetry. Inference is on the Intel iGPU via OpenVINO.

```bash
.venv/bin/python tools/run_app.py -d 4     # your camera
.venv/bin/python tools/run_app.py          # no camera? a synthetic neck, same app
```

The second command is not a demo mode. It is the whole app — chords, scales, the
grid, the trust gate — driven by a fretboard drawn from a known matrix instead of
a camera. Nothing to install, nothing to train, nothing to plug in. Because the
pose is exact by construction, a dot in the wrong place there is the renderer's
fault and nothing else's.

Full setup and hotkeys: **[QUICKSTART.md](QUICKSTART.md)**.

---

## The one number that matters

Everything here is measured in **fret-widths** — never in pixels, never in
heatmap loss — because it is the only unit that answers the actual question:
*did the dot land in the right fret?*

The budget is **±0.25 fret-widths**, derived in
[`docs/research/00-diagnosis.md`](docs/research/00-diagnosis.md). It is
accounted for, not hoped for:

| Source | Cost (fret-widths) |
|---|---|
| Label noise, p90 | 0.035 |
| Encode → decode → pose ceiling, p95 | 0.014 |
| **Left for model error** | **~0.20** |

The ceiling row is enforced in CI by
`tests/test_dataset.py::test_perfect_heatmaps_meet_the_accuracy_budget`, which
bounds what *any* amount of training could achieve given the current input
size, stride and sigma.

## How it got here

This is the second attempt, and the first one's failure is why the second one
works.

**v1** ([archived](docs/archive/v1/)) was a React app that needed printed ArUco
markers stuck to the guitar and a four-tap manual calibration. All its tests
passed. It was still unusable: the overlay slid off the fretboard the moment
the guitar moved.

Rather than guess, the failure was reproduced in simulation
([`00-diagnosis.md`](docs/research/00-diagnosis.md)) and named. Four coplanar
marker corners are the **worst** available pose reference — they force the fret
law to be extrapolated from the extremes, and a tight cluster of inliers yields
a *confident-looking* homography that is badly wrong. Measured: **1.37
fret-widths** of error when only frets 9–12 were visible.

Two things follow, and they are the whole design of v2:

1. **26 per-fret keypoints, not 4 board corners.** Both ends of every fret wire
   from the nut to fret 12. Fitting 26 points to 8 unknowns is deliberate
   over-determination, so independent per-point error averages down instead of
   landing on the drawn dots. A fret hidden behind your hand produces an empty
   channel and drops out of the fit rather than corrupting it.

2. **A pose can be confident and wrong, so refuse to draw one.** Before
   anything is rendered, at least 8 keypoints must survive the confidence gate
   **and** span at least 12% of the neck's length. Inlier count alone does not
   catch a cluster. When the gate fails the frame dims and the HUD says
   `NO LOCK` with the reason — that is correct behaviour, not a bug. Refusing to
   draw beats drawing nonsense.

## The two invariants

Every geometric bug in this project has been a violation of one of these.

**Fret spacing is not linear.** Fret *n* sits at `u(n) = 1 − 2^(−n/12)` of the
scale length, and a dot for fret *f* is centred at `(u(f−1) + u(f)) / 2`. Never
interpolate between frets linearly. In normalised coordinates the scale length
cancels, which is why the template is exact for any equal-tempered guitar
without measuring the instrument.

**String numbering is fixed everywhere.** String 1 = high E (thinnest) …
string 6 = low E (thickest). Fret 0 = open. Standard tuning. No exceptions, no
per-module conventions.

## Layout

| Path | What |
|---|---|
| [`fretguide/geometry.py`](fretguide/geometry.py) | Fret law, homography, `solve_is_trustworthy` — the trust gate |
| [`fretguide/theory.py`](fretguide/theory.py) | Note maths, scales, chords, neck-wide generation |
| [`fretguide/content.py`](fretguide/content.py) | Curated voicings and scale boxes |
| [`fretguide/modes.py`](fretguide/modes.py) | Modes as degrees of a key: root, chord, box position, fingering |
| [`fretguide/menu.py`](fretguide/menu.py) | The practice catalogue and cursor — pure state, no toolkit, shared by both apps |
| [`fretguide/capture.py`](fretguide/capture.py) | V4L2 capture, raw-YUV path |
| [`fretguide/dataset.py`](fretguide/dataset.py) | Labels → homographies, augmentation, heatmap codec |
| [`fretguide/model.py`](fretguide/model.py) | FretNet, the keypoint U-Net (torch, training only) |
| [`fretguide/predict.py`](fretguide/predict.py) | Live OpenVINO inference, pose fit, smoothing |
| [`fretguide/render.py`](fretguide/render.py) | The overlay |
| [`fretguide/source.py`](fretguide/source.py) | Frame sources: live camera, dataset replay, or a synthetic board needing no hardware at all |
| [`fretguide/shell/`](fretguide/shell/) | The native shell — YUV planes as GL textures, converted in a shader |
| [`fretguide/tracker.py`](fretguide/tracker.py) | Legacy enrollment/SIFT backend, kept as a baseline |
| [`tools/`](tools/) | `run_app`, `collect`, `train`, `export`, `probe_camera`, … |
| [`tests/`](tests/) | 321 tests. No camera, no GPU, no guitar required. |

## Documentation

| Doc | What it answers |
|---|---|
| [`QUICKSTART.md`](QUICKSTART.md) | How do I run it, and what do I do when tracking is poor? |
| [`docs/PRD-v2.md`](docs/PRD-v2.md) | What are we building, and how will we know it works? |
| [`docs/TRAINING.md`](docs/TRAINING.md) | How do I capture, label, train and export a model? |
| [`docs/PLAN-shell.md`](docs/PLAN-shell.md) | What replaces the OpenCV window, and in what order? |
| [`docs/research/`](docs/research/) | Why this stack, this approach, this budget. Ten documents; start with [`10-recommended-stack.md`](docs/research/10-recommended-stack.md). |
| [`docs/archive/v1/`](docs/archive/v1/) | What the first attempt was and why it was abandoned. |
| [`CLAUDE.md`](CLAUDE.md) | The contract for AI agents working in this repo. |

## Tests

```bash
.venv/bin/python -m pytest tests/ -q
```

321 tests, ~9 seconds, no hardware. They cover the parts that *can* be proven
without a guitar: synthetic-homography round-trips, the fret law, note
identities, the heatmap codec's accuracy ceiling, and the trust gate's refusal
conditions.

They also cover the overlay itself, which is unusual for a computer-vision app
and is what [`fretguide/source.py`](fretguide/source.py) buys: a synthetic
source draws a moving fretboard from a matrix it also hands back, so the pose is
exact and every drawn dot can be checked against where the geometry says it
belongs. See [`tests/test_render.py`](tests/test_render.py).

They deliberately do **not** cover whether a dot lands on your actual fret.
That needs a camera and an instrument, and it is judged by eye — see
"Reading the HUD" in [QUICKSTART.md](QUICKSTART.md). Per
[`docs/PRD-v2.md`](docs/PRD-v2.md) §6.3, for a single user judging their own
overlay the eye is an adequate acceptance test; *"is that dot on fret 4 or fret
5?"* is precisely what eyes are good at.

## Status

MVP: vision only. The overlay works; audio note-verification is fully
researched ([`05-audio-stack.md`](docs/research/05-audio-stack.md)) and
deliberately parked. Nothing in the current design forecloses it — the
verification layer consumes the selected target and an audio stream, and
touches neither the tracker nor the renderer.

The native [PySide6 shell](docs/PLAN-shell.md) is part-built. Its video surface
works — colour 1080p on the GPU at **1.2 ms/frame**, which is 28× the headroom
needed for the 30 fps target — but the overlay has not been ported to it yet, so
the app you actually use is still the OpenCV window:

```bash
.venv/bin/python tools/run_shell.py     # video only, no hardware needed
```

Colour is new, and was free: the camera always sent Y, U and V, and
[`capture.py`](fretguide/capture.py) was keeping only Y. The conversion now
happens in a fragment shader, so the CPU capture path is unchanged and inference
still sees exactly the same grey plane.

Single user, one guitar, one room, offline. Every design decision is allowed to
exploit that.
