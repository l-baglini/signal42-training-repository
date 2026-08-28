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

The synthetic neck is a **full 21-fret Stratocaster** — inlays at 3, 5, 7, 9,
12, 15, 17, 19 and 21, doubled at the octave. Use `--max-fret 22` for a modern
Strat, or `--max-fret 24`.

That matters for the modes: Misolidio ends at fret 13 and Eolio at 15, so on the
twelve frets the camera can pose they are cut short. On the synthetic neck all
seven boxes fit whole, which makes it the better place to learn them.

The neck holds still. Add `--motion` to make it drift, which is there to prove
the overlay tracks a moving board rather than to practise against.

Add `--refuse-every 40` to watch the `NO LOCK` state, or `--source replay` to
play back the labelled dataset instead.

## Run on the camera

```bash
.venv/bin/python tools/run_app.py -d 4
```

The camera is pinned to **12 frets** whatever `--max-fret` says: the model
predicts 26 keypoints, two per fret wire from the nut to the twelfth, and there
is nothing beyond that to pose from. Only the synthetic neck shows the rest of
the instrument.

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

Press `TAB`. The catalogue is a tree, browsed as columns — choose in one and the
next shows what is inside:

```
Chords ─── G, Am, Bm, C, D, Em, F#dim
Scales ─── C, C#, D … ─── Modals ─────────── I Ionian … VII Locrian
                          Minor pentatonic ─ 1st … 5th shape
                          Major pentatonic ─ 1st … 5th shape
                          Whole neck ─────── Blues, Harmonic minor, …
```

↑/↓ move within a column, →/← step in and out, the mouse works throughout,
`Esc` or `TAB` closes, clicking the video dismisses it. A `>` marks an entry
with another column behind it.

**The selection applies as you move** — the neck updates while you scroll,
nothing to confirm. It follows the *deepest* entry, not the one you are standing
on, so stepping through keys keeps showing the same mode in each new key rather
than resetting. The panel takes whichever side of the frame hides less of the
fretboard.

### Modes, and why they are shown by key

Pick a key, then Modals, and you get its seven modes as degrees:

```
I    Ionian       G  · over G       · pos II
II   Dorian       A  · over Am      · pos IV
III  Phrygian     B  · over Bm      · pos VII
IV   Lydian       C  · over C       · pos VII
V    Mixolydian   D  · over D7      · pos IX
VI   Aeolian      E  · over Em      · pos XI
VII  Locrian      F# · over F#m♭5   · pos II
```

This is not a stylistic choice. **Every mode of a key is the same set of notes** —
G ionian, A dorian, B phrygian, C lydian, D mixolydian, E aeolian and F# locrian
are one scale, and across the whole neck all seven light up identically. Shown
that way they are unlearnable, because on those terms nothing distinguishes them.

What distinguishes them is the three things on each row: the **root**, the
**chord it belongs over** (Dorian over Am, not over G — that is what makes it
sound like Dorian), and the **position** of the box it is played in. So each mode
is drawn as a box with finger numbers, not as the whole neck.

### Pentatonics

Five shapes each, minor and major, one at a time. Take a modal box, remove the
4th and the 7th, and what remains is the pentatonic in that position — two notes
on every string, the same fingering, the same place on the neck.

That is not a convenient coincidence. The seven modal boxes occupy only **five
distinct windows**, and five is exactly how many pentatonic positions there are,
because they are the same five shapes.

**The minor pentatonic of a key is rooted on that key.** Pick A and ask for the
minor pentatonic and you get A minor pentatonic — A C D E G, first shape at frets
5–8. Its *notes* come from the relative major three semitones up (C), which is
why its boxes are carved out of C's modal shapes rather than A's. The major
pentatonic of A is a different scale entirely: A B C# E F#.

Shapes are numbered from the one that begins on the root — A at the fifth fret of
the low E — and run up the neck from there, which is where a teaching sheet
starts counting. A shape that would run off the end drops an octave if there is
room, so on twelve frets the last two sit low rather than vanishing.

**Whole neck** keeps blues, harmonic minor and the unboxed pentatonics, for when
you want the map rather than one position.

To print the modal boxes for a music stand, or to check them against your own
material:

```bash
.venv/bin/python tools/print_boxes.py --key G       # -> diagnostics/boxes.png
```

All seven shapes are **transcribed from a teaching sheet** and cross-checked
three ways: every note belongs to the key, every box starts on its own root, and
the fret each box begins at reproduces the sheet's own roman numeral (II, IV,
VII, VII, IX, XI, II) without that number being stored anywhere.

The notes of a box are derivable; the fingering is not, and the sheet shows why.
Four of the boxes span four frets and use one hand position. Three span five —
and four fingers cannot cover five frets, so the hand shifts, and which strings
it shifts on is a playing decision rather than a consequence of the notes.

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
.venv/bin/python -m pytest tests/ -q      # 467 tests, no camera or GPU needed
```

## Layout

See the layout table in [`README.md`](README.md#layout) — kept in one place so
the two cannot drift apart.

## Playing along to a song

```bash
.venv/bin/pip install -e ".[score]"
.venv/bin/python tools/run_app.py --source synthetic --max-fret 21 \
    --song yoursong.gp3
```

Reads Guitar Pro (`.gp3`/`.gp4`/`.gp5`) and plays the part on the neck. It lists
the file's tracks on startup with their note counts and how far up the neck they
reach; `--track N` picks one, otherwise it takes the first six-string guitar
part. Bass and drums are filtered out — they have the wrong string count or no
fretboard at all.

| Key | Action |
|---|---|
| `p` | play / pause |
| `[` `]` | back / forward one bar |
| `-` `=` | slower / faster (0.25×–2×) |
| `0` | back to the start |
| `SPACE` | freeze the picture — which freezes the song with it |

**Slow it down first.** `-` four times is half speed, and the dots are an
instruction you have to read before your hand can follow it.

Two things worth knowing. The neck ends at fret 12 on camera, so a solo written
above that cannot be drawn there — the startup listing says which tracks fit.
`--refinger` throws the tab's fingering away and re-solves the part for the neck
you have, which brings most of those back into reach:

```bash
.venv/bin/python tools/run_app.py --song yoursong.gp3 --track 1 --refinger -d 4
```

### Hearing it

```bash
.venv/bin/pip install -e ".[audio]"
.venv/bin/python tools/run_app.py --source synthetic --max-fret 21 \
    --song yoursong.gp3 --audio
```

The part is synthesised — a Karplus–Strong plucked string, no soundfont — and
played in time with the dots. **When audio is on it becomes the clock**: the
play head follows the sound card rather than the video frames, because the two
would otherwise drift apart and a dot that disagrees with what you hear is
worse than a silent one. The speed and seek keys move both together.

No sound device, or the `[audio]` extra missing, prints one line and carries on
silently. The overlay is the product.

To hear it without running the app at all — which needs neither `[audio]` nor a
sound device, since synthesis is pure numpy and the file is written with the
standard library:

```bash
.venv/bin/python tools/preview_audio.py --song yoursong.gp3 --bars 1-8 \
    --out diagnostics/riff.wav
paplay diagnostics/riff.wav
```

`--rate 0.5` writes it at half speed without changing the pitch.

Sample a song as stills instead of watching it, one beat per frame:

```bash
.venv/bin/python tools/preview_render.py --song yoursong.gp3 --beat 8 --frames 4 \
    --max-fret 21 --out diagnostics/song.png
```
