# CLAUDE.md — working agreement for agents in this repo

FretGuide draws finger-placement dots onto live video of a real guitar. A
trained keypoint model (FretNet) locates the fretboard in every frame; a
homography maps the flat board to the image; the overlay is composited on the
frame the pose was computed from. Python 3.13, OpenCV, OpenVINO. Local-only:
no network calls at runtime, ever.

**Read first:** [README.md](README.md), then [docs/PRD-v2.md](docs/PRD-v2.md)
for what "working" means. [docs/research/00-diagnosis.md](docs/research/00-diagnosis.md)
is the origin of every number in this file.

---

## Hard invariants

Violating any of these produces code that looks right and is wrong. Every
geometric bug in this project so far has been one of them.

1. **Fret spacing is not linear.** `u(n) = 1 − 2^(−n/12)`. A dot for fret *f*
   sits at `(u(f−1) + u(f)) / 2`. Never linearly interpolate between frets, and
   never hard-code measured fret positions — the law is exact, and in
   normalised coordinates the scale length cancels, so it holds for any
   equal-tempered guitar without measuring anything.

2. **String 1 = high E (thinnest) … string 6 = low E (thickest).** Fret 0 =
   open. Standard tuning. No module gets its own convention.

3. **Report error in fret-widths.** Never pixels, never heatmap loss. The
   budget is ±0.25. Pixels don't answer "did the dot land in the right fret";
   fret-widths do. This applies to test assertions, log lines and commit
   messages alike.

4. **Refusing to draw beats drawing nonsense** (PRD-v2 V5). A pose must clear
   `solve_is_trustworthy` — ≥8 inliers **and** ≥0.12 u-spread — before anything
   is rendered. The spread half is the load-bearing one: a tight cluster of
   points can be entirely inliers and still leave the pose under-determined
   along the neck. That exact failure cost v1 1.37 fret-widths. `NO LOCK` and a
   dimmed frame are correct output, not a bug to fix.

5. **Filter projected geometry, never homography matrix entries.** The nine
   entries are not independent; smoothing them directly yields matrices that
   are not valid homographies. Filter the projected corners
   (`fretguide/tracker.py` → `OneEuroFilter`).

6. **Pose travels with its frame.** Never composite an overlay onto a frame it
   was not computed from.

---

## What you can and cannot verify

**You have no camera and no guitar.** This is the single most important thing
to internalise before claiming anything works.

Provable here, in ~7 s, with no hardware:

```bash
.venv/bin/python -m pytest tests/ -q      # 344 tests
.venv/bin/python -m ruff check .          # must be clean
```

That covers synthetic-homography round-trips, the fret law, note identities
against tonal's tables, the heatmap codec's accuracy ceiling, and the trust
gate's refusal conditions.

It also covers **where the overlay draws**. `source.SyntheticSource` draws a
moving fretboard from a matrix it also returns, so the pose is exact and every
dot can be checked against where the geometry says it belongs
(`tests/test_render.py`). Use it — an overlay change is not unverifiable, and
`tools/preview_render.py` will show you the result as a PNG.

**Still not provable here:** whether a dot lands on a *real* fret, whether the
model finds a *real* fretboard, whether tracking survives real motion blur,
whether the camera pipeline works. Anything touching `capture.py` or
`predict.py`'s live path needs a human at the instrument, and so does any claim
about how the overlay *looks* as opposed to where it lands. Say so plainly
rather than implying test-green means working. The manual checks are in
[QUICKSTART.md](QUICKSTART.md).

Do not add tests that skip without hardware. A test that quietly skips is worse
than no test — see the CI note in [.github/workflows/ci.yml](.github/workflows/ci.yml).

---

## Layout and boundaries

| Path | Note |
|---|---|
| `fretguide/` | The package. Flat layout on purpose — see the comment in `pyproject.toml`. |
| `tools/` | CLI entry points. They `sys.path.insert` the repo root deliberately, so they run inside the Windows training bundle where nothing is pip-installed. Don't "clean that up". |
| `fretguide/source.py` | Frame sources — the one abstraction both apps consume. `SyntheticSource` needs no camera, no model and no dataset; it is how the overlay gets developed and tested here, and it draws a full 21-fret Strat neck (`STRAT_FRETS`). **Camera sources stay pinned at 12 frets** — the model predicts two keypoints per fret wire from the nut to the twelfth and cannot pose past it. Its backdrop is cached per size, so don't reintroduce per-frame full-resolution numpy: that cost 74 ms/frame and capped the mode at 13 fps. |

| `tests/` | Must stay hardware-free. Build a fixture (see `test_source.py::_write_fake_dataset`) rather than reaching for `dataset/frames/`, which a fresh clone does not have. |
| `fretguide/modes.py` | Modes as degrees of a key, not as roots. **Every mode of a key is the same note set** — asked for whole-neck, all seven return identical positions. What differs is the root, the chord it sits over, and the box. All seven box shapes are **transcribed** into `SHAPES_IN_G`, never computed: four span four frets and use one hand position, three span five and the hand shifts between strings, which no offset formula expresses. Positions are not stored — they fall out of the notes and reproduce the source sheet's roman numerals, which is the transcription's own check. Pentatonic positions are derived here too: a modal box minus the 4th and 7th. The seven modes occupy five distinct windows, which is why there are five pentatonic positions — same shapes. |



| `fretguide/menu.py` | The practice catalogue and cursor state. **No drawing and no toolkit** — that is what lets the OpenCV app and the native shell render the same menu. Put structure and navigation here, painting in the renderer. |
| `fretguide/shell/` | The native shell. `layout.py` and `shaders.py` must stay Qt-free so they stay testable without the `[gui]` extra; `video.py` and `app.py` import Qt. |
| `tools/probe_gl.py` | The GL gate. Anything touching the shader, the textures or the viewport: run this, it exits non-zero. It is not in pytest because that would mean a test that skips itself without a GL context. |
| `dataset/labels.json` | **Hand-clicked and irreplaceable.** `dataset/frames/` is gitignored and regenerable; the labels are not. Never rewrite this programmatically without being asked. |
| `docs/research/` | Evidence. Read it before proposing an approach that was already measured and rejected. |
| `docs/archive/v1/` | **Frozen. Do not edit, lint, test or "fix".** Excluded from ruff. It exists so the rebuild is legible. |
| `fretguide/detect.py` | A spike, not on the live path — nothing imports it, no tests. Its docstring argument is why the model predicts per-fret keypoints. Don't wire it in; don't extend it without deciding to revive it. |

## Conventions

- **Comments say why, not what.** This codebase is dense with rationale
  (`predict.py`, `dataset.py`, `docs/TRAINING.md`) — match that register. If a
  constant has a measured justification, put the measurement next to it.
- **Suppressing a lint rule requires the reason inline.** See
  `pyproject.toml` — a blanket ignore list is an unreviewed lint run.
- **Changing input size, stride or sigma?** Re-run
  `tests/test_dataset.py::test_perfect_heatmaps_meet_the_accuracy_budget`. It
  bounds what *any* amount of training can achieve and is the first thing those
  changes invalidate.
- **Don't add dependencies casually.** The runtime set is deliberately small and
  torch is deliberately excluded from it (`pyproject.toml`).
- Commit messages explain the reasoning, not the diff. Match the existing log.

## Current state

MVP is vision-only and works. Audio note-verification is researched
([05-audio-stack.md](docs/research/05-audio-stack.md)) and deliberately parked;
it consumes the selected target plus an audio stream and touches neither the
tracker nor the renderer.

The UI is still an OpenCV window with keyboard hotkeys — `tools/run_app.py` is
what you use, and it now runs with **no camera at all** (`--source synthetic`),
which is the fastest way to see any overlay change. The native PySide6 shell replacing it is planned in
[docs/PLAN-shell.md](docs/PLAN-shell.md): **P0–P2 are done** (GL gate, frame
sources and the render parity harness, and the colour video surface), P3 onward
is not. `tools/run_shell.py` runs, but draws no overlay yet — porting
`render.py` to QPainter is P3.

`render.py` and `tools/run_app.py` are deliberately kept as the diagnostic path.
Do not delete them when the shell lands: they are what the Qt renderer is
bisected against, and `tests/test_render.py` asserts the two agree.
