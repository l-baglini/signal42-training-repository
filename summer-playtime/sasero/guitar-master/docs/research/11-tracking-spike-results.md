# Tracking spike — measured result on the real guitar

**Date:** 2026-07-31. Tool: [`tools/spike_match.py`](../../tools/spike_match.py).
Rig: POCO F2 Pro rear camera (main sensor, `--camera-id=0`) via scrcpy → v4l2loopback
`/dev/video4`, 1920×1080 @ 30 fps, matching performed at 1280 px wide.

## What was tested

The Wang & Ohya (2018) approach: enrol one reference frame of the fretboard, then match
every later frame **back to that reference** (never to the previous frame, so drift
cannot accumulate), and fit a homography with RANSAC. SIFT was used as the detector —
not as the shipping choice, but because it answers the prior question: *does this
fretboard carry enough texture to be matched at all?*

## Result

| Measure | Value |
|---|---|
| Reference region | 995 × 226 px |
| Reference keypoints | **900** (40 per 100×100 px) |
| Frames matched | 1,260 |
| Inliers | mean 94, median 92, **min 61**, max 153 |
| Baseline spread (fraction of neck length) | mean 0.75, **min 0.38** |
| Match time | 54 ms (18.4 fps unassisted) |
| **Frames yielding a trustworthy pose** | **100 %** |

## Reading

**Texture is not a problem — it is abundant.** 900 keypoints on a 995×226 board region
is far more than the fit needs (a homography needs 4). The concern that a glossy,
plainly-figured fretboard might carry too little signal is answered: grain, fret ends,
inlays and wear are plenty.

**Robustness is the striking number.** Across 1,260 frames of normal playing the inlier
count never fell below 61 and the baseline spread never fell below 0.38 — above the 0.35
gate throughout. Lock was never lost. Compare this with v1, where a single occluded
marker collapsed the solve to a 19-fret-width error.

**Speed is far better than the prior art suggested.** Wang & Ohya reported 2.5 s/frame
with SIFT; we measure 54 ms — roughly 45× faster, from a newer CPU, a smaller matching
resolution, and a bounded reference set.

## Consequence: XFeat may not be needed at all

54 ms/frame is 18.4 fps for matching alone, and the tracker does not need to match every
frame. With detect-then-track — SIFT matching at ~10 Hz plus pyramidal Lucas–Kanade
propagation of the inliers between matches (a few ms for a few hundred points) — 30 fps
is comfortably reachable **on pure OpenCV, with no PyTorch, no XFeat, no ONNX, and no
2 GB download**.

That is a large simplification of the planned stack, so it should be tried before
reaching for the learned matcher. Further headroom if needed, cheapest first:

1. **Restrict detection to a dilated region around the last known board quad.** Currently
   SIFT scans the whole frame; the board occupies a fraction of it. Expect a large saving.
2. Lower the matching resolution (1280 → 960 or 800 px).
3. Reduce `nfeatures`.
4. Only then: swap SIFT for XFeat + LightGlue.

Revised plan: **Track A′ — SIFT/ORB + Lucas–Kanade on OpenCV alone.** XFeat is demoted
from "the plan" to "an optimisation if 1–3 prove insufficient". Track B (training a
custom keypoint model) recedes further still.

## Capture cost, measured

Separating the blocking wait from actual CPU work (an earlier measurement conflated
them and overstated the cost by ~20×):

| Path | `retrieve()` | → grey + resize | CPU total |
|---|---|---|---|
| BGR (`CONVERT_RGB=1`) | 1.29 ms | 0.34 ms | 1.63 ms |
| Raw YUV (`CONVERT_RGB=0`, Y plane) | 0.56 ms | 0.10 ms | **0.66 ms** |

Capture consumes under 2 ms of the 33 ms frame budget, so ~32 ms is available for
tracking and rendering. Use the raw-YUV path: greyscale falls out of the Y plane for
free, with no colour conversion.

## Camera characterisation (`tools/probe_camera.py`)

1920×1080 @ **30.0 fps** measured, timing jitter p95/mean **1.12**, sharpness
(variance of Laplacian) **260**, brightness **96/255** with a frame-to-frame range of
only 95.5–96.7 — i.e. exposure is already stable rather than hunting. All four checks
pass. The phone camera is materially better than the built-in webcam and needs no
further tuning for now.

## Environment notes

- OpenCV's Qt build emits harmless warnings on Wayland ("Could not find the Qt platform
  plugin", missing font directory) and falls back successfully. Silence with
  `QT_QPA_PLATFORM=xcb` if desired; it does not affect capture or matching.
- `v4l2loopback` must be loaded before scrcpy: `sudo modprobe v4l2loopback
  exclusive_caps=1 card_label=PhoneCam`. It does not survive a reboot.
- scrcpy must be given `--v4l2-sink=/dev/videoN`; without it the feed only reaches its
  own window and no other process can read it.
