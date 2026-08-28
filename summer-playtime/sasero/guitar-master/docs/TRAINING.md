# Training the fretboard model

The point of this model is to remove every fixed reference: no printed markers, no
stickers, no enrolment photo, no "hold the guitar where it was when you clicked". Each
frame is posed from its own pixels, so the overlay follows the instrument while you play.

## What the model predicts

26 keypoints — both ends of all 13 fret wires (nut through fret 12) — as one heatmap
channel each, at stride 2 on a 640×384 grayscale input. A robust homography is then fitted
to whichever keypoints came back confident, and the fret law `u(n) = 1 − 2^(−n/12)` fills
in everything between them.

Two keypoints per fret rather than four board corners, because corners measured *worst*
in `docs/research/00-diagnosis.md`: they force the fret law to be extrapolated from the
extremes. Per-fret points constrain it everywhere, and survive your hand covering part of
the neck — an occluded fret simply produces an empty channel and drops out of the fit.

Fitting 26 points to 8 unknowns is deliberate over-determination. Independent per-keypoint
error averages down instead of landing straight on the drawn dots.

## Accuracy budget

±0.25 fret-widths, from `docs/research/00-diagnosis.md`. Everything is reported in that
unit, never in pixels or heatmap loss, because it is the only unit that answers "did the
dot land in the right fret".

Where the budget currently goes, all measured on the real 285-frame set:

| source | cost (fret-widths) | note |
| --- | --- | --- |
| label noise, p90 | 0.035 | across-wire component; the along-wire component is harmless |
| encode → decode → pose ceiling, p95 | 0.014 | with *perfect* heatmaps; 18× headroom |
| **left for model error** | **~0.20** | what training has to stay inside |

The ceiling number is the one to re-check after changing input size, stride or sigma —
`tests/test_dataset.py::test_perfect_heatmaps_meet_the_accuracy_budget` guards it.

## The dataset's real weakness

285 labelled frames, and they cover almost one pose:

| | range across all 285 frames |
| --- | --- |
| board angle | 139–157° (17° total) |
| board length | 689–928 px (1.35×) |
| board centre | x 1010–1353, y 188–369 — always upper-right |
| near-duplicate consecutive pairs | 211 / 284 |

Worse than the table suggests: within a single capture session the board centre moves only
**13 px** (std, in network-input pixels). It is effectively nailed in place.

**This is not hypothetical — it broke run 1.** After 200 epochs on the 4060: 0.009
fret-widths on training frames, 4.4 on held-out ones, `[true 74px | avg 11px]`. The model
had learned to output the average board position and ignore the image.

The original design error was assuming augmentation would prevent it. It cannot: warping the
whole image moves the room and the guitar *together*, so the board's position relative to the
window and shelves survives every rotation, scale and perspective change. The shortcut is
preserved by construction.

The fix is structural — **bound the receptive field below the distance to the nearest room
cue**, so the model cannot see the furniture at all. `FretNet(depth=3)` sees 83 px; the neck
is 35 px wide with 10 px fret gaps, and the room is 150–400 px away. See `fretguide/model.py`
for the full table. Three things then address the dataset's thinness:

1. **Heavy geometric augmentation** (`AugConfig`) — random rotation ±35°, scale 0.6–1.55×,
   the board placed anywhere in the frame, plus perspective jitter. Because a label *is* a
   homography, the augmented label is exactly `A @ H`: pixels and points cannot drift apart.
   Plus photometric jitter, motion blur (the guitar moves while played), and elliptical
   occluders standing in for the fretting hand.
2. **Background compositing** (`AugConfig.bg_replace_p`, default 0.25) — robustness to an
   unfamiliar background, not the shortcut defence. A quarter of samples have the neck cut
   out along a perspective quad and composited onto a different frame's background, warped
   independently. Two subtleties, both learned the hard way: the background frame's own neck
   must be blurred out first (`erase_board`) or the image contains two fretboards and a label
   naming one, which trains the net to answer "not a fretboard" on real fretboards; and
   decoy islands of original content are pasted elsewhere, because cutting along the board
   quad otherwise draws a seam exactly around the answer. `tools/preview_aug.py` renders what
   the net is really shown — look at it after touching any of this.
3. **Splitting by capture order, never randomly.** The last 20% of frames are held out as a
   contiguous block. With 211/284 consecutive pairs near-identical, a random split would put
   a twin of nearly every validation frame into training and report a fantasy score. The
   held-out block also happens to sit a systematic 77 px from the training mean, which is
   precisely what exposed the shortcut.

More capture variety would still help more than any of this. See "Capturing more" below.

## Reading the output

```
e 42  loss 0.00031  still: fret 0.041 posed 100%   aug: fret 0.088 p90 0.142 posed  98%   214s
```

- `still` — held-out frames, un-augmented. **Flattering**, because it mostly asks "did you
  memorise the one pose the dataset contains".
- `aug` — the same frames under deterministic random warps. **This is the number to trust**,
  because it answers the actual question: does the overlay land when the guitar moves?
- `posed` — fraction of frames that produced a pose passing the confidence and
  inlier-spread gates. A refused pose dims the screen instead of drawing something wrong;
  that is intended behaviour, but a low number here means the model is not confident.
- `[true Npx | avg Npx]` — **the shortcut check.** Distance from the predicted board centre
  to the true board, versus to the training-average board position. `true` must be the
  smaller. If it is not, the model is reciting the average position rather than looking at
  the guitar, and the line says `<-- LEARNING THE ROOM`. Loss and fret error tell you
  something is wrong; this tells you *what*.

`best.pt` is selected on the **augmented** score, not the still score — choosing on `still`
would pick the most over-fitted epoch. `models/val_montage.png` is rewritten on every
improvement: green is predicted, red is labelled. Look at it. A number can hide a failure
that a picture makes obvious.

Watch for loss falling while `fret` stays flat. That means the net is learning to paint
plausible blobs in the wrong places, and it is why both are printed.

## Running it

Two routes. The 4060 is roughly 15× faster and is what these 285 frames deserve.

### On the NVIDIA 4060 laptop (recommended)

Build the bundle here, copy the one zip across, run three scripts there.

```bash
.venv/bin/python tools/make_bundle.py            # -> fretguide-train-windows.zip (~239 MB)
.venv/bin/python tools/make_bundle.py --out /media/usb/fretguide-train.zip
```

The bundler verifies before it writes: it imports the training modules, loads and checks
the labels, confirms every file the Windows scripts reference exists, and writes the `.bat`
files with CRLF endings (cmd.exe can mis-parse `goto` in an LF-only batch file, and the
symptom is a script that silently does nothing). Re-run it after labelling more frames.

On the Windows box, unzip and run in order:

| Script | What | Time |
| --- | --- | --- |
| `setup.bat` | creates `.venv`, installs **CUDA** PyTorch, verifies the GPU is visible | ~10 min, ~3 GB download |
| `verify.bat` | GPU check, 170 tests, dataset check, 2 real epochs | ~2 min |
| `train.bat` | the real run: 200 epochs, batch 16, 4 augmented views per frame | ~1 hour |
| `resume.bat` | continue from `models\last.pt` after an interruption | — |

`setup.bat` installs torch from `https://download.pytorch.org/whl/cu126` deliberately. Plain
`pip install torch` on Windows fetches the **CPU-only** build, which trains ~15× slower and
is the easiest mistake to make here; `setup.bat` fails loudly if CUDA is not visible
afterwards. cu126 is the newest index carrying Windows wheels (torch 2.13.0, CPython
3.10–3.14) and covers the 4060's Ada architecture.

Then bring `models\best.pt` back and export it **here**, because export benchmarks *this*
laptop's OpenVINO devices — the machine that actually runs the app:

```bash
.venv/bin/python tools/export.py --checkpoint models/best.pt
```

### On this laptop (no CUDA)

Works, just slower — measured ~70 s/epoch at `--repeats 1`, ~215 s at `--repeats 3` on 22
cores. Cap the threads so the machine stays usable:

```bash
OMP_NUM_THREADS=14 MKL_NUM_THREADS=14 .venv/bin/python -u tools/train.py \
    --epochs 140 --batch 8 --repeats 3 --workers 4 --out models > models_train.log 2>&1 &
```

Resume after an interruption with `--resume models/last.pt`; both `last.pt` and
`history.jsonl` are written every epoch.

### Then export and run

```bash
.venv/bin/python tools/export.py --checkpoint models/best.pt   # ONNX + OpenVINO IR
.venv/bin/python tools/run_app.py -d 4                         # picks up models/fretnet.xml
```

Export verifies the IR against PyTorch before reporting timings — it prints `peak shift`,
which must be 0 cells. It then benchmarks every OpenVINO device it finds so the CPU/GPU/NPU
choice comes from measurement. Measured here: **30 ms on CPU (33 fps)**, and 32 ms for the
whole per-frame pipeline including letterbox, decode and pose fit. No GPU or NPU device is
exposed on this laptop, so CPU is the only option and it is fast enough.

## Sanity checks worth knowing about

Run `pytest tests/ -q` (170 tests, ~3 s, no GPU or camera needed). Three are load-bearing:

- `test_perfect_heatmaps_meet_the_accuracy_budget` — the ceiling. Fails ⇒ the
  representation is wrong and training cannot fix it.
- `test_augmented_labels_stay_glued_to_augmented_pixels` — warps a synthetic frame with
  bright fret wires and checks the labels still land on bright pixels. This catches the
  classic augmentation bug where the image is warped and the points are not.
- `test_channel_order_matches_the_labeller_convention` — channel `2n` is fret `n`'s low-E
  edge. If this ever disagrees with `tools/collect.py`, training silently learns mirrored
  keypoints and every dot lands on the wrong string.

## Capturing more

Augmentation synthesises geometry but cannot synthesise *appearance* — different lighting
directions, different backgrounds, different distances with the real depth-of-field and
real motion blur that go with them. If the augmented score stalls, that is the gap.

```bash
.venv/bin/python tools/collect.py capture -d 4 -n 60 --interval 1.5
.venv/bin/python tools/collect.py label
```

Between batches, change something real: move the camera nearer and further, raise and lower
it, turn a lamp off, sit somewhere with a different background, tilt the guitar much further
than feels natural. Variety between batches is worth far more than frame count within one.
