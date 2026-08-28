# Salvo Asero — Summer Build

## [`guitar-master/`](guitar-master) — FretGuide

**Point a camera at your guitar. Pick a chord. The dots appear on the real
fretboard, on the live video, and stay there while you play.**

A markerless guitar-fretboard AR overlay. A trained keypoint model finds the
neck in every frame from its own pixels — no markers, no stickers, no reference
photo, no calibration. Python 3.13, OpenCV, OpenVINO, entirely offline.

It also runs with **no camera and no trained model at all**, on a virtual neck,
which is the fastest way to see what it does:

```bash
cd guitar-master
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/python tools/run_app.py
```

Start with [`guitar-master/README.md`](guitar-master/README.md).

### The craft that goes with it

| | |
|---|---|
| **The spec that directed it** | [`docs/PRD-v2.md`](guitar-master/docs/PRD-v2.md), and [`docs/PLAN-shell.md`](guitar-master/docs/PLAN-shell.md) for the front end |
| **The agent contract** | [`CLAUDE.md`](guitar-master/CLAUDE.md) — six hard invariants, and an explicit list of what cannot be verified without a guitar |
| **The evidence** | [`docs/research/`](guitar-master/docs/research) — ten documents. Every number in the project traces to one |
| **The review pass** | The commit log. Messages explain the reasoning, not the diff — including the bugs that were wrong before they were right |
| **Why v1 was abandoned** | [`docs/archive/v1/`](guitar-master/docs/archive/v1) — kept frozen, so the rebuild is legible |
