---
description: Run the full hardware-free check (ruff + 466 tests) and report honestly what it does and does not prove.
allowed-tools: Bash(.venv/bin/python -m pytest:*), Bash(.venv/bin/python -m ruff:*), Read, Grep
---

Run both checks and report the result:

```bash
.venv/bin/python -m ruff check .
.venv/bin/python -m pytest tests/ -q -rs
```

Then report as follows.

**If anything failed**, show the actual output. Do not summarise a failure into
a sentence — the assertion message is the useful part, especially for the
accuracy-budget tests, which report in fret-widths.

**If both passed**, say so, and then state plainly what remains unverified.
Green here means the maths is right: the fret law, synthetic-homography
round-trips, note identities, the heatmap codec's accuracy ceiling, and the
trust gate's refusal conditions. It does **not** mean the overlay works. Nothing
in this suite touches a camera, a GPU or a guitar.

If the change under test touched any of `fretguide/capture.py`,
`fretguide/render.py`, or the live path in `fretguide/predict.py`, name the
specific manual check from QUICKSTART.md that a human still has to perform, and
say that the change is unverified until they do.

**Watch for a shrinking suite.** 382 tests is the current count. Fewer, or any
skip reported by `-rs`, means a dependency failed to install or a guard was
removed — treat that as a failure, not a pass.
