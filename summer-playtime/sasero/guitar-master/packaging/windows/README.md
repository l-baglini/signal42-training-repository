# FretGuide — training on the Windows / RTX 4060 box

Everything needed to train the fretboard model is in this folder. Unzip it anywhere
(a short path like `C:\fretguide-train` is safest) and run three scripts in order.

```
setup.bat     once — creates .venv, installs CUDA PyTorch, checks the GPU   (~10 min, ~3 GB download)
verify.bat    tests + a 2-epoch smoke run, to prove it works               (~2 min)
train.bat     the real run                                                 (~1 hour)
```

Optional but worth 30 seconds, any time:

```
.venv\Scripts\python tools\preview_aug.py
```

It writes `diagnostics\aug_preview.png` — nine of the images the network is actually shown,
with the labels drawn on in green. The net never sees your photographs directly; every step
manufactures a new image from them. Two real bugs lived in there and both were obvious on
sight. Check: **exactly one sharp fretboard per tile, green lines sitting on it.**

Then copy **`models\best.pt`** back to the Linux laptop. That single file is the output;
nothing else needs to come back.

Needs an internet connection for `setup.bat` only. Training itself is fully offline.

---

## What is being trained

A small U-Net (0.97M parameters) that finds the fretboard in a single video frame — no
printed markers, no stickers on the guitar, no enrolment photo, no "hold it where it was
when you clicked". It predicts 26 keypoints (both ends of all 13 fret wires, nut through
fret 12) as one heatmap each, and a robust homography is fitted to whichever came back
confident. The fret rule `u(n) = 1 − 2^(−n/12)` fills in everything between them.

Input is 640×384 grayscale; the head predicts at stride 2. 285 hand-labelled frames.

## Reading the output

```
e 42  loss 0.00031  still: fret 0.041 posed 100%   aug: fret 0.088 p90 0.142 posed  98%  [true   12px | avg   68px]   17s
```

Everything is in **fret-widths**, never pixels or heatmap loss, because that is the only
unit that answers "did the dot land in the right fret". **The budget is 0.25.**

- **`aug`** is the number that matters. Held-out frames under random warps — it answers
  "does the overlay still land when the guitar moves?"
- **`still`** is the same frames un-warped. It flatters, because all 285 captured frames
  have the guitar in nearly the same place (17° of angle, 1.35× of scale), so `still`
  largely measures "did you memorise that one pose".
- **`posed`** is the fraction of frames that produced a pose passing the confidence and
  spread gates. A refused pose dims the app's screen instead of drawing something wrong —
  intended behaviour, but a low number here means the model lacks confidence.

`best.pt` is chosen on the **augmented** score. Choosing on `still` would reliably pick the
most over-fitted epoch.

**The failure mode to watch for is loss falling while `fret` stays flat.** That means the
net is learning to paint plausible blobs in the wrong places. Both are printed side by side
precisely so you can see it happen.

### `[true Npx | avg Npx]` — the shortcut check

This is the most important thing on the line, and it exists because the first training run
failed in a way the loss completely hid.

- **`true`** — how far the predicted board centre is from the actual board, in input pixels.
- **`avg`** — how far it is from the *average* board position across the training frames.

**`true` must be the smaller of the two.** If `avg` is smaller, the model is reciting where
the fretboard usually sits and ignoring the picture — and the line will say
`<-- LEARNING THE ROOM` outright.

That is exactly what run 1 did. After 200 epochs it scored `[true 74px | avg 11px]`: near
perfect on training frames (0.009 fret-widths) and useless on held-out ones (4.4). The
guitar moves only about 13 px between frames of a session, so memorising its position was
an easier hypothesis than finding it, and geometric augmentation could not prevent it —
warping the whole image moves the room and the guitar together, leaving the board's
position relative to the window and shelves perfectly intact.

The fix is not augmentation at all — it is the model's **receptive field**. `depth` controls
how far one output cell can see:

| depth | receptive field | params | can it see the room? |
| --- | --- | --- | --- |
| 3 (default) | 83 px | 0.30M | **no** |
| 4 (run 1) | 159 px | 0.97M | yes |

The neck is ~35 px wide with ~10 px fret gaps, and the furniture is 150–400 px away. At 83 px
a cell still sees the whole neck width and about eight gaps — everything needed to identify
which fret it is looking at — but the room is simply out of reach. The shortcut becomes
impossible rather than merely discouraged, and 3× fewer parameters means far less capacity to
memorise 228 frames.

Background compositing is still there at a modest 0.25 (the neck pasted onto a different
frame's background, that frame's own neck blurred away first) purely as robustness to an
unfamiliar background. It was briefly cranked to 0.85 when it was carrying the whole burden,
which made the training images stop looking like anything a camera produces — trading a
shortcut for a train/serve mismatch, which is not a fix.

### What good looks like

`posed` should reach 100% within the first 20–30 epochs, then `aug fret` should grind
downward, and `true` should be well below `avg` throughout. Anything under **0.25** is inside
budget; under 0.10 is comfortable.

If `aug fret` plateaus above 0.25 *and* `true` is comfortably below `avg`, the model is
genuinely looking at the guitar but is not accurate enough yet — that wants more capture
variety, not more epochs. See "If the score plateaus" below.

### Look at the picture

`models\val_montage.png` is rewritten every time the score improves. **Green is predicted,
red is labelled.** Open it. A number can hide a failure that a picture makes obvious in a
second — and it distinguishes the two kinds of failure:

- **grid offset by whole frets** → genuinely insufficient context. Retrain with
  `--depth 5` (adds a stride-32 stage: receptive field 163→217 px, 2.4× the parameters).
- **grid blurry / roughly right but loose everywhere** → just needs more training, or the
  augmentation is harder than the model can currently handle.

## If something goes wrong

**`setup.bat` says CUDA is not available.** Update the NVIDIA driver and reboot — a reboot
after a driver update is usually what fixes it. Training will otherwise silently fall back
to the CPU and take many hours.

**Out of memory.** Lower the batch size: `train.bat` uses `--batch 16`; try 8. The 4060's
8 GB should handle 16 at this input size comfortably, so an OOM more likely means something
else is using the GPU.

**Training is much slower than ~20 s/epoch.** Almost certainly the CPU-only PyTorch build.
Check with:

```
.venv\Scripts\python -c "import torch; print(torch.cuda.is_available())"
```

If that prints `False`, delete `.venv` and re-run `setup.bat` — plain `pip install torch`
on Windows fetches the CPU build, which is why `setup.bat` uses PyTorch's CUDA index.

**Stopped it by accident.** `resume.bat` continues from `models\last.pt`, written every
epoch.

## If the score plateaus above budget

The limit is the data, not the training. Augmentation synthesises **geometry** — rotation
±35°, scale 0.6–1.55×, the board anywhere in frame, perspective jitter, motion blur, and
elliptical occluders standing in for the fretting hand. It cannot synthesise **appearance**:
different lighting directions, different backgrounds, real depth-of-field at different
distances.

So capture more, back on the Linux laptop:

```bash
.venv/bin/python tools/collect.py capture -d 4 -n 60 --interval 1.5
.venv/bin/python tools/collect.py label
```

Change something real between batches — move the camera nearer and further, raise and lower
it, turn a lamp off, sit against a different background, tilt the guitar much further than
feels natural. **Variety between batches is worth far more than frame count within one.**
Then regenerate this bundle with `tools/make_bundle.py` and train again.

## Files here

| Path | What |
| --- | --- |
| `setup.bat` / `verify.bat` / `train.bat` / `resume.bat` | the four scripts |
| `requirements-train.txt` | everything except torch, which needs the CUDA index |
| `dataset/frames/` | 285 captured frames, 1920×1080 grayscale PNG |
| `dataset/labels.json` | the hand-made labels — the irreplaceable part |
| `fretguide/` | the library: dataset/augmentation, the model, geometry |
| `tools/train.py` | training |
| `tools/export.py` | ONNX + OpenVINO export (run on the Linux laptop instead) |
| `tests/` | 170 tests, no GPU or camera needed |
| `docs/TRAINING.md` | the full reasoning: accuracy budget, design decisions, measurements |
