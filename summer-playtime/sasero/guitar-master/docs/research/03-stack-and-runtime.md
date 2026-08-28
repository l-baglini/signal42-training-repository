# 03 — Stack & Runtime: Inference, Vision, Capture, Shell for FretGuide Rebuild

**STATUS: PARTIAL** — the agent producing this file was killed by an API/session limit. Raw notes below are complete and verified; the structured sections were never filled in. Synthesis lives in `10-recommended-stack.md`.

Research date: 2026-07-31. Target machine (fixed): Ubuntu 25.10, kernel 6.17.0-41-generic,
Intel Core Ultra 7 155H "Meteor Lake" (16C/22T, Arc Xe-LPG iGPU at `/dev/dri/renderD128`,
AI Boost NPU with `intel_vpu` loaded + `/dev/accel/accel0`), 15 GB RAM (~7 GB free), NO NVIDIA/CUDA.
Python 3.13.7, Node 22.14.0, Rust NOT installed. Personal single-user offline tool, Linux-only.

Prior finding treated as fact: v1 failure was geometric (extrapolation from off-plane markers),
not latency, not lens distortion. Need markerless keypoints (σ≈3-5px), robust fitting, temporal
filtering. 1080p capture + ~5-frame filtering buys ~2x accuracy margin.

## Verdict so far

_(placeholder — filled in as research proceeds, finalized in section 7)_

## 1. Inference runtime on Meteor Lake (no CUDA)

### 1.1 OpenVINO (version, CPU/GPU/NPU plugins, NPU driver stack on Ubuntu 25.10)

### 1.2 ONNX Runtime (OpenVINO EP vs CPU EP; Python/Node bindings)

### 1.3 PyTorch CPU + torch.compile, IPEX, OpenCL/SYCL

### 1.4 Measured latency figures (Meteor Lake iGPU / NPU) — real vs estimated

### 1.5 Verdict: runtime + device + install commands

## 2. OpenCV

- Current version, `opencv-contrib-python` vs system packages vs building
- Relevant modules: calib3d (solvePnP/IPPE/RANSAC), video (Lucas-Kanade, KalmanFilter),
  imgproc (LSD/FastLineDetector), features2d
- OpenCL T-API (`cv::UMat`) on Arc iGPU — does it help?
- JS/WASM build sufficiency note (context only, not the recommendation)

## 3. Camera capture on Linux, low-latency

- V4L2 direct vs OpenCV `VideoCapture(CAP_V4L2)` vs GStreamer vs PipeWire camera portal vs libcamera
- MJPEG vs YUYV vs H.264 — decode cost/latency
- Forcing 1080p30; locking exposure/focus/white-balance via `v4l2-ctl` (concrete commands)
- Recommended external USB webcam characteristics (shutter type, focus, 1080p60)

## 4. App shell and UI

- Python + PySide6/Qt
- Python CV core + web UI via pywebview / local WebSocket (reuse React)
- Tauri 2 (Rust not installed) vs Electron + Python/native sidecar
- Pure Python Dear PyGui / imgui
- For each: capture→screen latency, GPU overlay rendering, CV↔UI boundary, IPC cost for 1080p
  frames (zero-copy/shared memory feasibility), dev velocity
- Explicit statement: must video preview be rendered natively?

## 5. Rendering the overlay

- OpenGL/Vulkan/wgpu vs Qt QPainter vs Canvas2D
- Crisp anti-aliased dots/labels over live video
- Compositing overlay against the frame it was computed from (timestamp matching) vs newest frame
- One-euro filtering for perceived stability
- Occlusion-aware drawing
- Concrete recommendation

## 6. Model families for real-time keypoints (with licenses)

- YOLO11/12-pose & -OBB (AGPL-3.0 — flagged)
- RTMPose/MMPose
- Plain PyTorch heatmap UNet
- MobileNetV4 / EfficientViT backbones
- Permissively-licensed alternatives
- OpenVINO-exportability / speed on this hardware

## 7. Verdict

- Single recommended stack: packages + versions + install commands
- Named fallback per risky piece
- First prototype to de-risk (runnable in a day)

## 8. What I could not verify / open questions

## 9. Links

## Raw notes (append-only, timestamped)

### 2026-07-31 T0 — PyPI JSON lookups (versions)

- https://pypi.org/pypi/openvino/json — **openvino 2026.2.1** on PyPI. Supports Python 3.10–3.14.
  Apache-2.0 license. Deps: numpy<2.5.0,>=1.16.6, openvino-telemetry>=2023.2.1. Confirms Python
  3.13.7 on target machine is supported.
- https://pypi.org/pypi/onnxruntime/json — **onnxruntime 1.28.0** (core, CPU EP), MIT license,
  requires Python >=3.11 (3.13.7 OK). Note: no onnxruntime-openvino info bundled in this package.
- https://pypi.org/pypi/onnxruntime-openvino/json — **onnxruntime-openvino 1.24.1**, released
  2026-02-26, supports Python 3.11–3.13. **IMPORTANT: this EP-specific wheel LAGS the core
  onnxruntime version (1.24.1 vs 1.28.0 core)** — a real integration risk to flag: cannot always
  get latest ORT core features + OpenVINO EP together. Need to check compatibility matrix.
- https://pypi.org/pypi/opencv-contrib-python/json — **opencv-contrib-python 5.0.0.93** (OpenCV 5.0
  line). Apache-2.0, bundles FFmpeg (LGPLv2.1) + Qt5 (LGPLv3) in non-headless builds. Supports
  Python 3.6+. Need exact OpenCV core version + release date from GitHub next.
- https://pypi.org/pypi/torch/json — **torch 2.13.0** on PyPI. Mentions dedicated "Intel GPU
  Support" build docs section (Linux + Windows) alongside CUDA/ROCm — i.e. Intel XPU backend is
  now a first-class upstream PyTorch build target, not just an IPEX add-on.
- WebSearch "IPEX deprecated 2026" — **CRITICAL finding**: Intel has discontinued active
  development of Intel Extension for PyTorch (IPEX) after the 2.8 release; it's maintained
  open-source only until end of March 2026 for migration purposes. Intel has upstreamed CPU
  (AVX-512 VNNI, AMX) and XPU (Arc/PVC via `torch.xpu`, from PyTorch >=2.8) optimizations directly
  into vanilla PyTorch. **Recommendation implication: do NOT install IPEX for a new 2026 project —
  use stock `torch` 2.8+ (we have 2.13.0) with `torch.xpu` for iGPU and default CPU backend (which
  already has AVX-512/AMX paths on Meteor Lake) with `torch.compile`.**
  Source: https://github.com/intel/intel-extension-for-pytorch/releases and
  https://intel.github.io/intel-extension-for-pytorch/ (EOL notice), also
  https://github.com/ACEsuit/mace/issues/1302 corroborates.

### 2026-07-31 T1 — NPU driver stack (verified via GitHub API, not just prose summaries)

- https://api.github.com/repos/intel/linux-npu-driver/releases/latest — **v1.35.0, published
  2026-07-24** (i.e. ONE WEEK before this research date — very fresh). Verified configuration
  table lists **Meteor Lake, Ubuntu 24.04 LTS, kernel 6.17.0-40-generic** as the officially tested
  combo — this is essentially IDENTICAL to the target machine's kernel (6.17.0-41-generic), just
  one point release newer, and Ubuntu 25.10 vs the officially-tested 24.04.
  **Flag: 25.10 is not in Intel's tested matrix (only 24.04 LTS) — real but low risk**, since the
  packages are plain userspace .deb libs (intel-level-zero-npu, intel-driver-compiler-npu,
  intel-fw-npu) + the in-kernel `intel_vpu` driver (drivers/accel tree, already present per
  problem statement) — no distro-specific patches known. Companion versions in this release:
  Level Zero v1.28.2, OpenVINO 2026.2 (matches PyPI's 2026.2.1), NPU compiler npu_ud_2026_28_rc1.
- Install procedure (from release notes / overview.md at
  https://github.com/intel/linux-npu-driver/blob/main/docs/overview.md):
  1. `sudo dpkg --purge --force-remove-reinstreq intel-driver-compiler-npu intel-fw-npu intel-level-zero-npu intel-level-zero-npu-dbgsym` (clean old)
  2. `wget https://github.com/intel/linux-npu-driver/releases/download/v1.35.0/linux-npu-driver-v1.35.0.20260722-29947505341-ubuntu2404.tar.gz`
  3. `tar -xf linux-npu-driver-v1.35.0.20260722-...-ubuntu2404.tar.gz` then `sudo apt install ./*.deb`
     (deb package names: `intel-driver-compiler-npu`, `intel-fw-npu`, `intel-level-zero-npu`; also
     needs `libtbb12` and `libze1`/`libze-dev` for the Level Zero loader — apt/PPA can resolve).
  - Verify kernel module: `lsmod | grep intel_vpu` (per problem statement this is ALREADY loaded
    on the target machine — good sign, driver stack should "just work" once userspace libs added).
  - Naming gotcha: library renamed `libze_intel_vpu.so` → `libze_intel_npu.so` after driver
    v1.16.0; need Level Zero >= v1.17.17 to match.
  - Still OPEN: exact NPU op coverage, dynamic-shape support, and INT8/FP16 requirement details —
    the docs.openvino.ai NPU pages returned only nav-menus via WebFetch (JS-rendered SPA, content
    not in static HTML). Will try OpenVINO GitHub source docs (.md) directly instead of the
    docs.openvino.ai site next.

### 2026-07-31 T2 — NPU plugin doc, fetched raw .rst source directly from GitHub (bypasses SPA)

Source: https://raw.githubusercontent.com/openvinotoolkit/openvino/master/docs/articles_en/openvino-workflow/running-inference/inference-devices-and-modes/npu-device.rst
(mirrors https://docs.openvino.ai/2026/openvino-workflow/running-inference/inference-devices-and-modes/npu-device.html)

- **"Currently, only models with static shapes are supported on NPU."** (verbatim, Limitations
  section) — CONFIRMED: no dynamic shapes on NPU. Must export the keypoint model with a fixed
  input size (e.g. static 256x256x3) — fine for our use case since input is already fixed-size.
- **Supported inference data types on NPU:** F32, F16 (compute precision on HW is always FP16
  internally), and quantized U8 (INT8 or mixed FP16-INT8). So FP32 ONNX/IR models are accepted but
  internally run FP16; for best NPU throughput, export/quantize to INT8 via NNCF (post-training
  quantization) or at least let the plugin's default FP16 compute apply.
  Doc: "Computation precision for the HW is FP16."
- Officially supported host/NPU: "Host: Intel Core Ultra series, NPU device: NPU 3720" (that's the
  Meteor Lake NPU generation — matches AI Boost NPU on this machine), OS listed as "Ubuntu 22.04
  64-bit (kernel 6.6+)" in the doc prose (older/looser than the driver release's own tested-matrix
  of Ubuntu 24.04/kernel 6.17 — the doc text is generic/unmaintained, the release notes are the
  more current source of truth).
- Default performance mode is **LATENCY** (optimal_number_of_infer_requests = 1 for LATENCY mode,
  4 for THROUGHPUT) — right default for a real-time single-stream video pipeline.
- `ov::intel_npu::turbo` property exists to push max NPU frequency, at the cost of power draw —
  worth trying for our latency-critical single-model workload.
- Model caching (UMD + OpenVINO ``ov::cache_dir``) avoids recompilation on every app launch —
  important because compiling for NPU is comparatively slow (dedicated "First Ever Inference
  Latency" vs "First Inference Latency" metrics exist specifically for this).
- Note on Meteor Lake specifically: "the plugin will fall back to Compiler-in-Driver" rather than
  the newer in-plugin compiler, because of a driver-compatibility guard — expected/default and
  fine, no action needed unless we hit compiler errors.
- Op coverage / full operator list was NOT found as a simple table in this doc (OpenVINO does not
  publish a static per-device op-support matrix the way ONNX Runtime does); in practice op support
  for NPU is validated per-model via successful `compile_model()` — **recommend prototyping early
  compile of the actual chosen keypoint model onto NPU to confirm no unsupported-op fallback**,
  rather than trusting a coverage table.

### 2026-07-31 T3 — Real-world latency figures (partial — flag as estimate where noted)

- WebSearch "OpenVINO benchmark Core Ultra 155H NPU vs iGPU vs CPU" — best figure found: **"NPU
  provides more than 4x better performance than the CPU using OpenVINO"** on Core Ultra 155H
  (source: https://www.tech-critter.com/ai-performance-test-benchmark-14th-gen-intel-core-ultra-7-155h/,
  via UL Procyon AI benchmark suite — GPU fastest wall-clock (~20.5 min suite), CPU ~21 min, NPU
  ~25 min wall-clock BUT NPU used least power; ranking for raw throughput is GPU > NPU > CPU).
  **No millisecond-level figure for a small keypoint/pose model was found for this exact chip** —
  a separate unverified forum mention cites "<10ms for YoloNAS-M 256x256 on Core Ultra 7 155H
  iGPU" (could not independently confirm source/methodology — **flagged as unverified**).
  **Honest assessment: could NOT find a directly-published, reproducible ms-latency number for a
  5-20M-param 256x256 keypoint model on THIS chip's NPU or iGPU.** Given the model hub reference
  (OpenVINO Model Hub, benchmarked at FP32/FP16/INT8 on Core Ultra 155H per OpenVINO 2026.2.0) does
  exist, recommend the prototype step actually run `benchmark_app` locally on all 3 devices with
  the real candidate model rather than trust secondhand numbers — this is fast (minutes) and
  authoritative for this exact machine.
- WebSearch "OpenCV UMat OpenCL Arc iGPU" — no direct Arc-specific benchmark found. General OpenCV
  T-API/UMat facts (not iGPU-specific): T-API auto-dispatches OpenCL-accelerated code paths
  transparently for many core ops, sponsored originally by AMD+Intel
  (https://opencv.org/opencl/, https://github.com/opencv/opencv/wiki/OpenCL-optimizations). Given
  our pipeline is dominated by ONE neural-net forward pass (not classical per-pixel OpenCV ops),
  **UMat/OpenCL is a secondary concern — expect it to matter only for imgproc/video-module
  preprocessing (undistort, resize, optical flow), not the keypoint model itself, which should run
  through OpenVINO/ONNX Runtime, not OpenCV's DNN module.**

### 2026-07-31 T4 — OpenCV version, model licenses, v4l2 controls

- https://api.github.com/repos/opencv/opencv/releases/latest — **OpenCV 5.0.0**, published
  2026-06-06. Confirms opencv-contrib-python 5.0.0.93 wheel tracks this core version.
- License checks (raw LICENSE files fetched directly from each repo's default branch):
  - **Ultralytics YOLO (YOLO11/12/26-pose, -obb) = AGPL-3.0**, confirmed via
    https://raw.githubusercontent.com/ultralytics/ultralytics/main/LICENSE (GNU AGPLv3 text) AND
    README: "AGPL-3.0 ... perfect for students/researchers/enthusiasts" vs "Enterprise License ...
    for development and production use ... bypassing AGPL-3.0". **AGPL-3.0's network-use copyleft
    clause is the standard concern, but for a purely personal, never-distributed, never-networked
    tool, AGPL obligations (source-disclosure on distribution/network service) are NOT triggered —
    however, if this code is ever pushed to a public repo, shared with anyone, or turned into a
    service, that changes.** Flagging loudly per instructions regardless.
  - **MMPose / RTMPose = Apache-2.0**, confirmed via
    https://raw.githubusercontent.com/open-mmlab/mmpose/main/LICENSE. No AGPL concern.
  - **MobileNetV4 (as shipped in `timm`) = Apache-2.0**, confirmed via
    https://raw.githubusercontent.com/huggingface/pytorch-image-models/main/LICENSE.
  - **EfficientViT (MIT-HAN-Lab reference impl) = Apache-2.0**, confirmed via
    https://raw.githubusercontent.com/mit-han-lab/efficientvit/master/LICENSE.
  - All three permissive alternatives (RTMPose, MobileNetV4/timm, EfficientViT) are safe even if
    the project is later open-sourced or shared, unlike Ultralytics YOLO.
- v4l2-ctl camera locking (WebSearch, corroborated by well-known UVC control semantics):
  - List controls: `v4l2-ctl -d /dev/video0 -l`
  - Disable autofocus + fix focus: `v4l2-ctl -d /dev/video0 --set-ctrl focus_auto=0 --set-ctrl focus_absolute=<value>`
  - Disable auto-exposure + fix exposure: UVC `exposure_auto` is an **enum, not a bool** — typical
    values are 1=Manual, 3=Aperture Priority(auto) on most UVC webcams (varies by driver/kernel
    version) — set `v4l2-ctl -d /dev/video0 --set-ctrl exposure_auto=1 --set-ctrl exposure_absolute=<value>`
    (newer kernels may expose `auto_exposure`/`exposure_time_absolute` naming instead — always
    run `-l` first to get the exact names/menu values for the actual device, since UVC control
    naming drifted across kernel versions).
  - Disable auto white-balance: `v4l2-ctl -d /dev/video0 --set-ctrl white_balance_temperature_auto=0 --set-ctrl white_balance_temperature=<value>`
  - Combined 3A lock (if supported): `V4L2_CID_3A_LOCK` control locks focus+exposure+white-balance
    together (kernel docs: https://dri.freedesktop.org/docs/drm/media/uapi/v4l/ext-ctrls-camera.html).
  - Source: OctoPrint community thread https://community.octoprint.org/t/disable-autofocus-on-usb-webcam-config-using-v4l2-ctl-on-linux/30393
    and kernel docs above. **Exact control names/enum values are device-specific — must be
    verified with `v4l2-ctl -l` against whatever webcam is actually plugged in, this is a
    per-device prototype step, not a universal command.**

### 2026-07-31 T5 — App shell package versions, GPU plugin confirmation, Electron

- https://pypi.org/pypi/PySide6/json — **PySide6 6.11.1**, released 2026-05-13, license
  LGPL-3.0-only OR GPL-2.0-only OR GPL-3.0-only (official Qt-for-Python binding), Python 3.10-3.14.
- https://pypi.org/pypi/pywebview/json — **pywebview 6.2.1**, BSD-3-Clause. Linux backends: GTK
  (via PyGObject 3.50+) or Qt (via PySide6/PyQt through QtPy). Renders UI via system WebKitGTK or
  QtWebEngine — i.e. still a browser-engine widget embedded natively, not our own window.
  Confirms viability of "reuse existing React code" path if desired, at the cost of an embedded
  browser engine's compositing/IPC overhead for the live video layer.
- https://github.com/tauri-apps/tauri/releases — **Tauri v2.11.5**, published 2026-07-01. Tauri 2
  requires a Rust toolchain to build (not installed on target machine per problem statement) —
  installable via `rustup` but adds a whole second language/toolchain for a personal tool where
  the CV core will be Python anyway; only worth it if the UI layer specifically needs
  Tauri's smaller footprint over Electron, which is not a stated requirement here.
- Electron (GitHub API, `electron/electron` releases): latest stable **v43.2.0** (2026-07-21),
  v42.8.0 (2026-07-28) also current-maintenance, v44 in alpha. Electron remains Chromium+Node,
  heavier baseline RAM (~150-300MB idle) than a native Qt app, relevant given only ~7GB free RAM.
- https://raw.githubusercontent.com/openvinotoolkit/openvino/master/docs/articles_en/openvino-workflow/running-inference/inference-devices-and-modes/gpu-device.rst
  — confirms: **"The GPU plugin is an OpenCL based plugin for inference of deep neural networks on
  Intel GPUs, both integrated and discrete ones."** Devices enumerate as `GPU.0` (iGPU is always
  index 0 when present), `GPU` is an alias for `GPU.0`. This is the plugin that targets the Arc
  Xe-LPG iGPU via OpenCL/oneAPI — separate code path from the NPU plugin (proprietary NPU ISA via
  the compiler-in-driver/compiler-in-plugin route) and from the CPU plugin (oneDNN).
- https://pypi.org/pypi/dearpygui/json — **Dear PyGui 2.3.1**, MIT license, built on Dear ImGui
  with GPU-based rendering (ImPlot for plotting, imnodes for node editor). Confirms viable as a
  lightweight pure-Python immediate-mode GUI option, though it is not a natural fit for
  frame-accurate video compositing the way a QGraphicsView/QOpenGLWidget or raw OpenGL is.


