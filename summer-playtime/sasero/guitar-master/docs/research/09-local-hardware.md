# The actual target machine — measured, not assumed

**Date:** 2026-07-31. Probed directly on the development/target laptop. Everything here is
observed output, not a spec-sheet guess.

## Compute

| | |
|---|---|
| OS | Ubuntu 25.10, kernel 6.17.0-41-generic |
| CPU | Intel Core Ultra 7 155H ("Meteor Lake"), 16 cores / 22 threads |
| iGPU | Intel Arc Xe-LPG — `/dev/dri/renderD128` |
| NPU | Intel AI Boost — `intel_vpu` module **loaded**, `/dev/accel/accel0` **present** |
| RAM | 15 GiB total, ~7.4 GiB available |
| Discrete GPU | **none — no NVIDIA, no CUDA** |
| Audio | PipeWire 1.4.7, default 48 kHz float32 stereo |
| Toolchains | Python 3.13.7, Node 22.14.0, npm; **Rust not installed** |

Consequences that follow directly:

- **No CUDA means no TensorRT and no practical local training.** Model training has to be
  rented (or done on a free tier); the laptop is an *inference* target only.
- **The NPU is real and the kernel driver is already loaded.** The userspace stack
  (level-zero + the NPU plugin) still needs verifying — being enumerated is not the same as
  being usable from OpenVINO. That verification is the single cheapest de-risking experiment
  available and should be run before committing to the NPU for anything.
- **Intel-first inference stack**, i.e. OpenVINO or ONNX Runtime with the OpenVINO execution
  provider, on CPU / Arc iGPU / NPU. This is the opposite of the usual CUDA-centric advice
  found in tutorials, so generic benchmark numbers found online will mostly not apply.
- Python 3.13 is new enough that some ML wheels may lag. Worth checking per-package; a 3.12
  venv is a cheap fallback if a needed wheel isn't built for 3.13 yet.

## Camera — the built-in one, and why the format matters

`/dev/video0` (Integrated RGB Camera; `/dev/video0..3` plus two media nodes).

**Only MJPEG reaches 1080p30. YUYV at 1080p is 5 fps.**

| Format | 1920×1080 | 1280×720 | 640×480 |
|---|---|---|---|
| MJPG | **30 fps** | 30 fps | 30 fps |
| YUYV (uncompressed) | 5 fps | 10 fps | 30 fps |

My earlier simulation showed 1080p roughly halves dot error versus 480p (a fret space goes
from ~19 px to ~58 px wide), so **1080p is worth having** — which means MJPEG, which means a
JPEG decode per frame. That decode is cheap on a 22-thread CPU but it is not free, and it
adds compression artifacts right where sub-pixel line localisation happens. Two implications:

- Request MJPEG explicitly and decode it; do not let a library silently fall back to YUYV
  and 5 fps. This is a classic silent-failure mode.
- If an external webcam is bought later, prefer one that offers **1080p60**, **manual focus**,
  and ideally MJPEG at high bitrate. Global shutter would be nice but is rare and expensive
  in USB webcams; rolling shutter is tolerable given the guitar moves slowly.

## Camera controls — what can be locked down

Auto-adjustment is the enemy of stable CV. What this camera exposes:

| Control | Default | Notes |
|---|---|---|
| `auto_exposure` | 3 (Aperture Priority) | **can be set to 1 = Manual** |
| `exposure_time_absolute` | 156 (range 2–1250) | inactive until auto_exposure=1 |
| `white_balance_automatic` | 1 (on) | **can be disabled** |
| `white_balance_temperature` | 4600 (2800–6500) | inactive until auto WB off |
| `exposure_dynamic_framerate` | **1 (ENABLED)** | **drops fps in low light — turn off** |
| `power_line_frequency` | 1 (50 Hz) | correct for Europe; prevents flicker banding |
| focus | *not exposed* | this camera is fixed-focus — no autofocus hunting, but no control either |
| gain | *not exposed* | — |

`exposure_dynamic_framerate = 1` is the nastiest default here: in dim room light the camera
will quietly drop below 30 fps, adding motion blur and lag that look exactly like a tracking
bug. Turn it off and light the room instead.

Recommended lock-down before any capture session:

```bash
v4l2-ctl -d /dev/video0 \
  --set-ctrl=exposure_dynamic_framerate=0 \
  --set-ctrl=auto_exposure=1 \
  --set-ctrl=exposure_time_absolute=156 \
  --set-ctrl=white_balance_automatic=0 \
  --set-ctrl=white_balance_temperature=4600 \
  --set-ctrl=power_line_frequency=1 \
  --set-ctrl=backlight_compensation=0
```

Tune `exposure_time_absolute` to taste: **lower = less motion blur but darker**. Motion blur
is the enemy of line/keypoint localisation, so bias toward a short exposure and add light.
Verify the settings stuck with `v4l2-ctl -d /dev/video0 --list-ctrls`, and re-apply them at
app startup — some drivers reset controls when the device is reopened.

To confirm the real achieved framerate (I did not run this, as it activates the camera):

```bash
ffmpeg -f v4l2 -input_format mjpeg -video_size 1920x1080 -framerate 30 \
       -i /dev/video0 -t 5 -f null - 2>&1 | tail -3
```

Compare the reported average fps against 30. If it is materially lower, revisit lighting and
the dynamic-framerate control before blaming any CV code.

## Measured software findings (2026-07-31, after installing the stack)

Installed into `.venv`: `opencv-contrib-python==5.0.0.93` (OpenCV **5.0.0**),
`openvino==2026.2.1`, numpy 2.4.6. All the OpenCV entry points the plan depends on are present:
`findHomography`, `solvePnP`, `calcOpticalFlowPyrLK`, `SIFT_create`, `createLineSegmentDetector`,
and `aruco.CharucoDetector` (needed for the measurement rig).

### OpenVINO sees only the CPU

```
Devices: ['CPU']   # Intel(R) Core(TM) Ultra 7 155H
```

Neither the Arc iGPU nor the NPU is available, because only the kernel-side pieces are installed:

| Accelerator | What's missing | How to get it |
|---|---|---|
| Arc Xe-LPG iGPU | `intel-opencl-icd`, `libze-intel-gpu1` | **in apt**, candidate `25.31.34666.3-1ubuntu1` (needs sudo) |
| AI Boost NPU | `intel-level-zero-npu`, `intel-driver-compiler-npu`, `intel-fw-npu` | **not in apt** — GitHub release tarball (driver v1.35.0) |

The Level Zero loader (`libze1 1.24.1`) is already present. `cv2.ocl.haveOpenCL()` is also **False** —
the pip OpenCV wheel has no usable OpenCL, which is downstream of the same missing iGPU runtime.

**Not a blocker for the MVP**: the planned tracker is CPU-viable, so this is deferred until
measurement shows it's needed.

### ⚠️ `CAP_PROP_BUFFERSIZE = 1` halves the capture framerate

This is the important find, and it is a trap: setting the buffer size to 1 — the standard "reduce
latency" advice for OpenCV V4L2 capture — makes the camera deliver **exactly half** its real rate,
because with a single queued buffer you can only dequeue every other frame.

| `CAP_PROP_BUFFERSIZE` | 1280×720 MJPEG |
|---|---|
| unset (default) | **29.6 fps** |
| 1 | **15.1 fps** ← the trap |
| 2 | 29.7 fps |
| 3 | 29.6 fps |
| 4 | 29.7 fps |

Cross-checked against a completely different capture stack to be sure the hardware wasn't the limit:
`ffmpeg -f v4l2 -input_format mjpeg` reports a steady **29–30 fps** at both 640×480 and 1280×720.

**Corrected conclusion: the built-in camera does deliver a genuine 30 fps, at 1080p as well as 720p**
(measured 29.6 fps at 1920×1080 MJPEG). An earlier reading of ~15 fps was entirely this
`BUFFERSIZE=1` artifact, not the sensor. Use **2** — lowest latency that doesn't halve the rate.

This is exactly the class of silent defect that makes an overlay feel broken while every individual
component looks correct, so it is worth a regression check in the app: assert the measured capture
rate at startup and warn if it is below ~25 fps.

### Exposure and framerate

Framerate is flat at ~15.4 fps (with the BUFFERSIZE=1 artifact in play) across
`exposure_time_absolute` 10→312, then collapses to 8.1 fps at 625 — i.e. only a very long exposure
costs frames. Since short exposures are wanted anyway (motion blur is what limits line localisation),
exposure is not a framerate concern in practice. `ffmpeg` also emits a harmless recurring
`unable to decode APP fields` warning on this camera's MJPEG stream; it does not drop frames.

## Audio (for the later Focusrite work)

PipeWire 1.4.7 is the server, currently at 48 kHz float32. PipeWire exposes both a JACK and
an ALSA/PulseAudio interface, so a Focusrite class-compliant interface should appear without
custom drivers, and low buffer sizes are reachable via the JACK API or PipeWire's native API.
The onboard codec is `HDA Intel PCH`. Detail deferred to the audio research stream.

## What this means for the stack

1. Target **OpenVINO / ONNX Runtime + OpenVINO EP**; ignore CUDA-based advice.
2. **Verify the NPU userspace stack early** — cheap experiment, large architectural
   consequence.
3. **Capture 1080p30 MJPEG**, decode explicitly, and lock exposure/WB/framerate.
4. Plan on **renting a GPU** for training; the laptop cannot train.
5. Light the practice area properly. It is the cheapest accuracy improvement available and it
   costs no engineering at all.
