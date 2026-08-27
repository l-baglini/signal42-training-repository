# The PySide6 shell — plan

**Status:** P0 and P1 done; P2 onward not built. **Date:** 2026-08-27.
Implements PRD-v2 §6.1 (carried-forward decision 1) and
[`research/10-recommended-stack.md` §4](research/10-recommended-stack.md).

The tracker works. What the user sees it through is an OpenCV window, and that
is now the weakest part of the product. This plan replaces it without touching
anything that took measurement to get right.

---

## 1. What is actually wrong today

Not opinions — four specific things, each with a location.

### 1.1 The video is black and white, and it need not be

[`capture.py:82`](../fretguide/capture.py) takes the Y plane out of the I420
buffer and drops the rest:

```python
gray = buf.reshape(self.height * 3 // 2, self.width)[: self.height, :]
```

That reshape is over a buffer which **already contains** the U and V planes.
They have been read off the sensor, sent over USB and written into RAM. They are
then thrown away, and `run_app.py` displays `cvtColor(gray, GRAY2BGR)` — a grey
picture of a guitar.

The docstring's reasoning is correct and stays correct: *"matching is greyscale
anyway, so the conversion is pure waste: 0.66 ms per frame instead of 1.63 ms."*
That argument is about the **tracking** path. It was never an argument about the
**display** path, and the two have simply never been separated.

Colour costs nothing to recover. Upload Y, U and V as three single-channel GL
textures and do the conversion in the fragment shader — the GPU does it as part
of a blit it is already performing. The CPU capture path stays byte-for-byte as
measured, inference still receives the same grey plane, and the picture becomes
colour. **This is the single largest visual improvement available, and its cost
is a 12-line shader.**

### 1.2 Everything is drawn by OpenCV, and it looks like it

[`render.py`](../fretguide/render.py) is 182 lines of `cv2.circle`,
`cv2.putText` with `FONT_HERSHEY_SIMPLEX`, and `addWeighted` for the grid. The
drawing logic is *good* — `dot_radius` sizing to the tighter local dimension is
a real insight, and the halo-text-over-video reasoning is sound. The output
still reads instantly as a computer-vision demo, because that font and those
hard-quantised shapes are what every computer-vision demo is made of.

There is also a smoothness cost. Every draw call rounds to integers:

```python
x, y = int(p[0]), int(p[1])
```

That is not an accuracy problem — a fret is ~125 px wide at fret 1, so one pixel
is far inside the ±0.25 fret-width budget. It is a *shimmer* problem: a dot
whose true position drifts across a pixel boundary pops between two positions
frame to frame, and the eye is extremely good at spotting that. Drawing at float
coordinates removes it for free.

### 1.3 There is no interface

Selection is `1`–`7`, `s`, `a` on a keyboard, with the current choice shown as
HUD text. There is no way to see what is available, no camera picker, no
settings — the app cannot be handed to anyone without also handing them the
docstring.

### 1.4 Every state change snaps

Changing chord teleports every dot. The `NO LOCK` state dims the frame to 50%
grey, which reads as a glitch rather than as the deliberate, correct, *designed*
refusal that it is. Given how much of this project's identity rests on "refusing
to draw beats drawing nonsense", that state deserves to look intentional.

---

## 2. Architecture

### 2.1 Threads: two, not three

```
  worker thread                              GUI thread
  ┌──────────────────────────────┐          ┌────────────────────┐
  │ Camera.read()  →  Y,U,V      │          │  QOpenGLWidget     │
  │ predict(Y)     →  H, status  │  packet  │   YUV textures     │
  │ build FramePacket ───────────┼─────────►│   + QPainter       │
  └──────────────────────────────┘          └────────────────────┘
```

Capture and inference stay in **one** worker thread, in the order they run
today. This is deliberate: splitting them into two threads is the obvious
"optimisation" and it is where invariant 6 dies. A `FramePacket` carrying its
own `(y, u, v, t, index, H, status)` is assembled in exactly one place, so a
pose can never be composited onto a frame it was not computed from — the
invariant holds *by construction* rather than by discipline.

The GUI thread only ever displays the most recent completed packet. If
inference falls behind, the display drops packets; it never shows a stale pose
on a fresh frame.

### 2.2 Rendering: QPainter over a GL texture

The video is a GL texture (§1.1). The overlay is drawn with **`QPainter` on the
`QOpenGLWidget`**, not with custom shaders.

Qt backs `QPainter` on a GL surface with GL itself, so this is still native and
still GPU-composited, while giving antialiased vector drawing, float
coordinates, real alpha, and actual typography — every fix from §1.2 — without
writing and debugging shader code for rounded rectangles and text. Custom
shaders stay available for the one or two effects that genuinely need them
(a glow, a dimming pass), rather than being the default tool for all of it.

### 2.3 What does not change

`predict.py`, `geometry.py`, `theory.py`, `content.py`, `dataset.py`,
`model.py` — **untouched**. The shell consumes `H` and a `ResolvedSelection` and
draws. If this plan requires editing the trust gate or the fret law, something
has gone wrong.

`render.py` and `tools/run_app.py` are **kept, not replaced**. The OpenCV app
becomes the diagnostic tool it is already better suited to being: it starts in a
second, has no GL dependency, and `d` shows raw keypoints. Keeping it means the
shell can always be bisected against a known-good renderer.

---

## 3. The replay source — how this gets built without a guitar

This is the keystone, and it should be built first.

There are **384 labelled frames** in `dataset/labels.json`, each carrying both
endpoints of every fret wire, and `dataset.load_dataset` already converts those
labels into homographies. That is real footage of the real instrument with a
**ground-truth pose for every frame**.

So introduce a `FrameSource` protocol with two implementations:

| Source | Frames from | Pose from |
|---|---|---|
| `CameraSource` | V4L2, live | `predict.FretboardModel` |
| `ReplaySource` | `dataset/frames/*.png` | the labels — exact, by construction |

Three things follow, and each of them matters:

1. **The shell can be built, run, and looked at with no camera and no guitar.**
   Per [CLAUDE.md](../CLAUDE.md), that is otherwise impossible, and it is the
   difference between designing this visually and designing it blind.

2. **The front end becomes testable.** Render frame `f0003` with its known `H`
   and a known chord, and the output is deterministic — a golden PNG that CI can
   diff. A computer-vision front end that has visual regression tests is a rare
   thing, and it is rare precisely because nobody separates the pose source from
   the renderer.

3. **It permanently separates "the model is wrong" from "the shell is wrong".**
   With an exact pose, any misplaced dot is the renderer's fault. That question
   currently costs a debugging session every time it comes up.

`ReplaySource` also gives the demo a reproducible mode — the same footage, the
same result, every time, on a machine with no hardware attached.

---

## 4. Build order

Each phase ends somewhere it is worth stopping.

### P0 — Prove the stack (half a day) — **done**

Install PySide6 on Python 3.13 and confirm a `QOpenGLWidget` gets a real GL
context on the Arc iGPU under Wayland. **Do this before anything else.** It is
the only step that can invalidate the whole plan, and it is cheap.

Add PySide6 to a new `[gui]` extra, not to the runtime dependencies — the
training and CI paths must not start needing Qt.

**Result: go.** PySide6 6.11.2, GL 4.6 core on Mesa Intel Arc (MTL). Rather than
merely opening a context, [`tools/probe_gl.py`](../tools/probe_gl.py) runs the
whole §1.1 mechanism — three R8 planes, BT.601 in GLSL, rendered and read back —
and the four probe colours round-trip to within 1/255.

### P1 — `FrameSource` + `ReplaySource` (1 day) — **done**

The abstraction from §3, and a headless script that renders frame N with its
ground-truth pose through the *existing* `render.py`. No Qt yet. This is
verifiable here, in CI, immediately.

**Result:** [`fretguide/source.py`](../fretguide/source.py) with three sources
and [`tools/preview_render.py`](../tools/preview_render.py). A third source was
added beyond the plan — `SyntheticSource`, which draws the board procedurally —
because `ReplaySource` depends on `dataset/frames/`, which is gitignored and
absent from a fresh clone; a test needing it would be a test that silently
skips, which CLAUDE.md forbids. The synthetic source needs no camera, no model
and no dataset, so the overlay is testable in CI and anyone cloning the repo can
run it.

19 new tests. Two of them failed first and were right to: the initial
perspective taper (far end 1.34× the nut) very nearly cancelled the fret law,
flattening on-screen fret gaps from the true 1.89:1 to 1.10:1 — close enough to
uniform that a renderer interpolating frets *linearly* would have passed. A
backdrop that hides this project's central bug is worse than none, so the taper
was reduced.

`tests/test_render.py` recovers dot positions from the rendered **pixels**, not
from the drawing code's own arithmetic, so it is renderer-agnostic: the same
assertions check the QPainter overlay at P3, and "the two renderers disagree"
becomes a test failure rather than something noticed later on a video.

### P2 — GL video widget, in colour (1–2 days)

`capture.py` grows a `colour=True` option returning the U and V planes
alongside Y — additive, so the existing grey path is untouched. Three textures,
a YUV→RGB fragment shader, correct aspect-ratio letterboxing, and the two-thread
packet handoff from §2.1.

**Stop and look at it.** Colour 1080p video of your own guitar, at frame rate,
with no overlay, is already better than anything the project has shown.

### P3 — Overlay parity (2 days)

Port `draw_grid`, `draw_selection`, `draw_debug`, `draw_hud` to `QPainter`.
Parity first, beauty second: same positions, same colour semantics, verified
against P1's goldens on replay frames. Only then take the float coordinates, the
real font, and proper alpha.

### P4 — The interface (2–3 days)

A chord and scale picker that shows what exists, a camera picker, the display
toggles that are currently hotkeys. Hotkeys stay — they are genuinely better
when a guitar is in your hands, and the panel is for discovering what the keys
do.

Design the `NO LOCK` state here, as a state: a legible "looking for the
fretboard" treatment with the reason the gate gave, not a 50% grey wash.

### P5 — Motion (1–2 days)

Animate voicing changes instead of teleporting them.

Match dots **by string** — each string carries at most one dot per voicing — so
a change is per-string and musically meaningful: the dot on string 5 slides from
fret 2 to fret 3, a string that gains a note fades its dot in, a string that
loses one fades it out.

Interpolate in **fretboard `(u,v)` space, then project through `H`** — not
between screen positions. A homography maps lines to lines, so both give the
same *path*; they differ in *timing along it*. A board-space interpolation moves
at constant speed across the actual fretboard, which is what the eye expects. A
screen-space one appears to accelerate wherever the neck is foreshortened.

The animation must run on the display clock and be re-projected through each new
frame's `H` — a transition in flight while the guitar moves has to stay stuck to
the guitar.

### P6 — Finish (1–2 days)

Typography, spacing, the colour system as a considered palette rather than eight
BGR tuples, and a look at it in the room it is used in.

**Total: roughly 8–12 working days.** The research doc's estimate of 4 days for
this phase covers P2 and P3 only.

---

## 5. Risks

| Risk | Mitigation |
|---|---|
| **PySide6 + GL fails on this hardware/Wayland.** Kills the plan. | P0, first, before anything else. Fallback: `QPainter` onto a plain `QWidget` with a `QImage`. Loses the free YUV conversion, keeps everything else. |
| **Threading breaks frame/pose pairing** — invariant 6, and the failure is subtle and intermittent. | One assembly point for `FramePacket` (§2.1). Assert `packet.index` is monotonic at the display end and log any drop. Never split capture from inference. |
| **The shell diverges from `render.py`** and the two disagree about where a dot goes. | P1's goldens exist before the Qt renderer does; parity is asserted against them at P3, not eyeballed. |
| **Qt drags into the training/CI path**, breaking the Windows bundle. | `[gui]` extra only. `tools/make_bundle.py` already filters what it ships; confirm it excludes the shell. |
| **Scope drift into the audio milestone.** | Out of scope. PRD-v2 §1a parks it, and nothing here forecloses it. |

## 6. Success criteria

Visual quality is not measurable the way tracking error is, so these are the
honest checks:

- **V3 still holds:** ≥30 fps sustained, measured, with the overlay on. A
  prettier shell that drops frames is a worse product — the current loop reports
  its own fps and the new one must too.
- Replay goldens match between `render.py` and the Qt renderer at P3.
- The hardware-free suite still passes and keeps growing: 193 before this plan,
  212 after P1.
- Someone who has not seen the project can pick a chord without being told how.
- A recording of it running is something worth showing on purpose.
