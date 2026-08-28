---
description: Walk the capture → label → train → export loop for a new FretNet model, in order, with the checks that catch the expensive mistakes.
---

Guide the human through producing a new `models/fretnet.xml`. Most of this needs
hardware you do not have, so your job is to drive the sequence, run what can be
run here, and check each result — not to claim steps you cannot perform.

Read [docs/TRAINING.md](../../docs/TRAINING.md) first; it is the authority and
this command is only the running order.

**Argument (optional):** $1 — what is failing, e.g. "loses lock in low light".
If given, treat it as the reason for the retrain and let it drive step 1.

### 1. Diagnose before capturing

Ask what conditions the model fails in. This matters more than any
hyperparameter: if the model has never seen that room at that light level, no
runtime setting fixes it, and no amount of training on the existing 285 frames
will either. Capture where it fails.

Check the camera is not the actual problem first:

```bash
.venv/bin/python tools/probe_camera.py -d 4 --size 1920x1080
```

Known-good on this rig: 30.0 fps, jitter 1.12, sharpness 260, brightness
96/255. A dropped framerate or a soft image is a lighting or exposure problem
wearing a model problem's clothes — motion blur is what limits accuracy.

### 2. Capture and label

```bash
.venv/bin/python tools/collect.py capture -d 4
.venv/bin/python tools/collect.py label
```

Labelling is four corners per frame, by hand, and it is the slowest step. Label
noise is already 0.035 fret-widths at p90 out of a 0.25 budget — sloppy clicking
is a permanent cost the model cannot recover from.

`dataset/labels.json` is irreplaceable. Never rewrite it programmatically.

### 3. Sanity-check what the model will actually see

```bash
.venv/bin/python tools/preview_aug.py
```

Look at `diagnostics/aug_preview.png`. Augmentation bugs are invisible in a loss
curve and expensive in wasted training time.

### 4. Bundle and train

This laptop has no NVIDIA GPU, so training happens on the Windows box:

```bash
.venv/bin/python tools/make_bundle.py
```

The bundle refuses to build if the labels do not parse. On the Windows side,
`packaging/windows/setup.bat` must run first — it installs torch from PyTorch's
CUDA index. Plain PyPI silently gives the CPU-only build and trains ~15× slower,
which is the single easiest mistake in this whole loop.

Bring `models\best.pt` back.

### 5. Export and verify

```bash
.venv/bin/python tools/export.py
```

Produces ONNX then OpenVINO IR, and checks numerical agreement with the torch
model rather than assuming the conversion was faithful. Read the reported
agreement and benchmark — do not skip past them.

### 6. Judge it in the right unit

Report validation error in **fret-widths**, never heatmap loss. The budget is
±0.25 total, of which label noise takes 0.035 and the encode/decode/pose ceiling
takes 0.014, leaving ~0.20 for model error.

Then confirm nothing else broke:

```bash
.venv/bin/python -m pytest tests/ -q
```

Finally: whether the overlay is actually better is a human judgement at the
instrument. Say so. A better validation number is evidence, not proof.
