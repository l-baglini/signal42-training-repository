# FretGuide — running it

Python MVP: finger-placement dots drawn on live video of your own fretboard.
Scope and reasoning: [`docs/PRD-v2.md`](docs/PRD-v2.md), [`docs/research/`](docs/research/).
Model training: [`docs/TRAINING.md`](docs/TRAINING.md).

## One-time setup

```bash
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
# training only, and only on a machine with a GPU worth using:
.venv/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu
.venv/bin/pip install -e ".[train]"
```

Versions are pinned in [`pyproject.toml`](pyproject.toml), which also explains
why torch is not a runtime dependency.

**No camera, no guitar, nothing trained?** You can still run the whole overlay:

```bash
.venv/bin/python tools/preview_render.py --chord Bm --frames 3
```

That draws a synthetic fretboard from a known pose and renders the overlay onto
it — no hardware, no dataset, no model. See [`fretguide/source.py`](fretguide/source.py).

## Each session: get the phone camera onto /dev/video4

```bash
# 1. virtual camera device (does NOT survive a reboot)
sudo modprobe v4l2loopback exclusive_caps=1 card_label=PhoneCam
ls /dev/video*                      # confirm the new device number

# 2. feed it from the phone's main rear camera, over USB
cd ~/Downloads/scrcpy-linux-x86_64-v4.1
./scrcpy --video-source=camera --camera-id=0 --no-audio \
         --camera-size=1920x1080 --camera-fps=30 --v4l2-sink=/dev/video4
```

`--v4l2-sink` is the part that matters: without it the video only reaches scrcpy's own
window and nothing else on the system can read it.

Sanity-check the feed at any time:

```bash
.venv/bin/python tools/probe_camera.py -d 4 --size 1920x1080
```

It reports real resolution, measured framerate, sharpness and exposure, with a verdict on
each. Known-good numbers from this rig: **30.0 fps, jitter 1.12, sharpness 260,
brightness 96/255**.

## Run without any hardware

```bash
.venv/bin/python tools/run_app.py
```

The full app against a synthetic fretboard: no camera, no trained model, no
dataset, no scrcpy. Every key below works. The pose is exact by construction, so
this is also the right place to judge the overlay itself — if a dot looks wrong
here, it *is* wrong, and the tracker is not involved.

Add `--refuse-every 40` to watch the `NO LOCK` state, or `--source replay` to
play back the labelled dataset instead.

## Run on the camera

```bash
.venv/bin/python tools/run_app.py -d 4
```

Nothing to enrol, nothing to click, nothing stuck to the guitar. The trained model finds
the fretboard in every frame from its own pixels, so you can move the instrument, put it
down and pick it up again — there is no lock to lose. Needs `models/fretnet.xml`; see
[`docs/TRAINING.md`](docs/TRAINING.md) to produce it.

| Key | Action |
|---|---|
| `TAB` | open/close the practice menu |
| `1`–`7` | chords: G, Am, Bm, C, D, Em, F#dim |
| `s` | cycle curated scale boxes |
| `a` | cycle generated scales (any root, whole neck) |
| `g` | toggle the fret/string grid |
| `f` | toggle finger numbers |
| `m` | mirror the view |
| `c` | toggle colour |
| `d` | debug: predicted keypoints and board outline |
| `SPACE` | freeze / unfreeze |
| `r` | reset temporal smoothing |
| `q` / `ESC` | quit |

### Choosing what to practise

Press `TAB`. Two columns: **Chords** and the twelve keys on the left, and on the
right whatever that choice holds — the seven modes, both pentatonics, blues and
harmonic minor, grouped and labelled. 139 things to practise, from 7 curated
chord voicings and every scale type in every key.

Arrow keys move, ←/→ switch column, mouse works throughout, `Esc` or `TAB`
closes, and clicking the video dismisses it. **The selection applies as you
move**, so the neck in front of you updates while you scroll — there is nothing
to confirm. The panel takes whichever side of the frame hides less of the
fretboard.

The modes are listed in derivation order (Ionian → Locrian), not alphabetically:
that order *is* the relationship between them, and Ionian and Aeolian are
labelled "(major)" and "(minor)" because they are the two you already know.

### The older enrolment backend

Still there, and still needs a reference photo and four clicks:

```bash
.venv/bin/python tools/enroll.py -d 4 --out enrollment.npz
.venv/bin/python tools/run_app.py -d 4 --source enrollment
```

Enrolment matches each frame against that one photo, so it must be redone whenever the
camera moves or the light changes much. That rigidity is the whole reason the model backend
exists; use this only to compare against it.

## The native shell (in progress)

```bash
.venv/bin/pip install -e ".[gui]"
.venv/bin/python tools/run_shell.py          # synthetic board, no hardware
.venv/bin/python tools/run_shell.py --source 4   # your camera, in colour
```

Video only so far — the overlay is still OpenCV-only until P3 of
[`docs/PLAN-shell.md`](docs/PLAN-shell.md). Keys: `M` mirror, `F11` fullscreen,
`Q` quit. Check your machine can run it at all with:

```bash
.venv/bin/python tools/probe_gl.py --verbose
```

## Reading the HUD

Model backend: `LOCK  24/26 kp  0.71` — keypoints that survived the confidence gate and the
pose fit, then their mean confidence. Below 8 keypoints, or a pose spanning less than 12% of
the neck's length, and it will not draw.

**A dimmed frame reading `NO LOCK` is correct behaviour, not a bug.** Refusing to draw beats
drawing nonsense. The reason says which gate failed. The spread gate in particular is the
fix for v1's core defect: a tight cluster of points yields a confident-looking but wildly
wrong pose — measured at 1.37 fret-widths of error when only frets 9–12 were visible.

Press `d` to see what the model actually thinks. Yellow dots are the keypoints it found;
if they are scattered off the guitar, the problem is the model, not the geometry.

## If tracking is poor

In rough order of effect:

1. **More light, from the side.** Raking light throws the grain and fret ends into relief.
   It also lets the camera use a shorter exposure, and motion blur is what limits accuracy.
2. **Get the camera closer**, so the neck fills more of the frame — more pixels per fret
   translates directly into accuracy.
3. **Keep the whole neck in view.** A cropped view is fatal, not merely worse.
4. **Capture and label a batch in the conditions that fail**, then retrain. If the model has
   never seen your room at night, it does not know your room at night — and that is a data
   problem no runtime setting fixes. See "Capturing more" in `docs/TRAINING.md`.

## Tests

```bash
.venv/bin/python -m pytest tests/ -q      # 258 tests, no camera or GPU needed
```

## Layout

See the layout table in [`README.md`](README.md#layout) — kept in one place so
the two cannot drift apart.
