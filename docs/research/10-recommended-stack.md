# The recommended stack and build plan

**Date:** 2026-07-31. Synthesis of `00-diagnosis.md`, `01-markerless-tracking.md`,
`03-stack-and-runtime.md`, `07-data-and-training.md`, `09-local-hardware.md`, plus the gap-filling
research recorded at the end of this file.

Read this file alone if you read nothing else. The others are evidence.

---

## 1. The decision, in one page

**Build a Python/OpenVINO desktop application whose tracker matches each frame against a one-time
"enrollment" capture of your own fretboard, using learned local features. Do not train a neural
detector first. Build the ground-truth measurement rig before either.**

Three findings drive this:

1. **Accuracy is already proven for this exact approach.** Wang & Ohya (2018) clicked the fretboard
   corners on frame 1, extracted SIFT features inside that quad, and matched every later frame *back
   to frame 1* — never to the previous frame, which eliminates drift by construction. They measured
   **2.3–4.5 mm in-image error on the fretboard corners**, i.e. ~0.11–0.22 fret-widths, inside the
   ±0.25 spec, across 3 guitars, varied lighting, with fingers occluding the board. The only failure
   was speed: **0.4 fps** on 2018 CPU SIFT.
2. **Nothing off-the-shelf exists, and the best-funded academic attempt refused the problem.**
   guitARhero (TU Graz, 2023) bolted a webcam to the headstock specifically to avoid tracking the
   instrument. Every published guitar-AR system attaches either a marker or the camera. There is no
   library to drop in — but equally, no evidence of infeasibility.
3. **Your one-guitar constraint is a large, underexploited advantage.** Enrollment, a hard-coded
   fret template measured with a ruler, and instance-specific features are all *unavailable* to a
   commercial product and all available to you.

The speed gap is closable because every 2018 component has a modern replacement, and because you do
not need to match every frame — match at 5–10 Hz and propagate with optical flow in between.

**Sequencing that matters:** build the measurement rig *first*. It is simultaneously (a) how you
evaluate the tracker numerically instead of by eye — which is exactly how v1 went wrong — and (b) the
label generator if you later need to train a model. It is the single highest-leverage two days of
work in the project.

---

## 2. Architecture

### Track A — enrollment + feature matching (build this)

```
                 ONE-TIME ENROLLMENT (once per guitar, ~2 min)
  video of the neck ──► pick board corners ──► rectified template image
                                          └──► ruler-measured fret table (hard-coded)

                 PER FRAME (runtime)
  V4L2 MJPEG 1080p30
        │
        ├─► decode ──────────────────────────────────► keep frame + timestamp together
        │
        ├─► [every 100–200 ms] XFeat features ──► LightGlue match to TEMPLATE
        │        └─► RANSAC homography ──► inlier-spread gate ──► fret-template snap
        │
        ├─► [every frame] pyramidal Lucas–Kanade on the inlier points from the last match
        │        └─► re-solve homography from propagated points
        │
        ├─► one-euro filter on the 4 projected board corners (NOT on H's entries)
        │
        └─► render dots for the selected chord/scale, composited on THE FRAME THE POSE CAME FROM
```

Design points, each with a reason:

- **Match to the template, never to frame *i*−1.** This is Wang & Ohya's central decision and it is
  free. Frame-to-frame planar trackers drift; template matching cannot, and it recovers instantly
  after full occlusion or the guitar leaving frame.
- **Detect-then-track.** Matching costs ~50–90 ms (see budget below), so matching alone gives
  11–20 Hz. Lucas–Kanade on a few hundred inlier points costs 2–5 ms, giving a 30 fps+ overlay.
  Because the matcher re-anchors every 100–200 ms, LK drift cannot accumulate.
- **The inlier-spread gate is mandatory.** `00-diagnosis.md` proves a short-baseline solve is not
  merely inaccurate but wild (only frets 9–12 visible → 1.37 fret-widths mean). Reject solves whose
  inliers span too little of the neck and hold the last good pose, visibly greyed out. **Never draw
  an under-determined pose.**
- **Snap to the hard-coded fret table.** Measure your neck once (nut-to-12th distance, board width at
  nut and 12th, fret positions). Fret indexing then reduces to a search over ~13 discrete index
  offsets, scored by reprojection error. On a guitar you own forever this is essentially exact, and
  it is the cheapest large win available.
- **Filter geometry, not matrix entries.** The nine entries of a homography are not independent or
  metrically meaningful; smoothing them individually produces skew artifacts. Filter the four
  projected corner points (or a decomposed rotation/translation) and re-derive H.
- **Composite against the frame the pose was computed from.** Keep `(frame, pose)` as one struct
  through the pipeline. Drawing a 100 ms-old pose over the newest frame is the classic cause of an
  overlay that swims. Note this is a *perceived-quality* fix, not an accuracy fix — the diagnosis
  measured latency's contribution to error at ≤0.02 fret-widths.

### Latency budget (1080p capture, matching at 640–1024 px)

| Stage | Cost | Basis |
|---|---|---|
| V4L2 capture + MJPEG decode, 1080p | 5–8 ms | measured format table in `09-local-hardware.md` |
| downscale for matching | 1–2 ms | — |
| XFeat sparse extraction @640 | 20–40 ms CPU | repo claims real-time VGA on an i5; **estimate** |
| LightGlue match, ~512 kpts | 20–50 ms CPU | 20 fps @512 kpts on i7-10700K (repo README) |
| RANSAC homography + snap | <1 ms | — |
| **matcher subtotal** | **~50–90 ms → 11–20 Hz** | run at 5–10 Hz |
| Lucas–Kanade propagation, few hundred pts | 2–5 ms | — |
| filter + render | 2–4 ms | — |
| **per-frame path** | **~10–17 ms → 30–60 fps** | |

LightGlue's adaptive depth and width prune aggressively on easy pairs, and template-vs-live-frame of
the same object under similar lighting is the easiest case there is — expect the optimistic end.
Moving XFeat to the Arc iGPU via OpenVINO should improve it further, but **no Meteor Lake number
exists in public for either model; this must be measured locally on day one.**

### Track B — trained keypoint model (only if Track A's throughput or robustness disappoints)

Copy the **sports-field registration** architecture, which is the same problem shape (planar target,
repeated parallel lines, heavy occlusion, sparse unique landmarks) and is largely solved. PnLCalib is
the reference: two heads on one backbone — keypoint heatmaps *and* line-extremity heatmaps, σ = 2 px
Gaussians, half-resolution output, soft-argmax decoding — with the ablation showing **points and
lines jointly** is what produces the accuracy jump. Target representation: 26 fret-line endpoints
(frets 0–12 × both board edges) + nut + body junction, each on its own channel with a visibility
flag, plus a boundary channel.

Do **not** build a per-frame Hough/Canny fret-line detector. TapToTab and Wang & Ohya independently
tried and rejected it as too brittle to lighting and texture.

---

## 3. The stack

| Layer | Choice | Version | License | Why |
|---|---|---|---|---|
| CV core language | **Python** | 3.13.7 (installed) | — | OpenCV, OpenVINO, torch all first-class; fastest path |
| Vision library | **opencv-contrib-python** | 5.0.0.93 (OpenCV 5.0.0, 2026-06-06) | Apache-2.0 | `calib3d` (findHomography/RANSAC, solvePnP), `video` (LK, Kalman), `aruco`+ChArUco for the rig, `features2d` |
| Inference runtime | **OpenVINO** | 2026.2.1 | Apache-2.0 | The only sane choice with no CUDA; CPU + Arc iGPU + NPU plugins |
| Alt runtime | onnxruntime-openvino | 1.24.1 | MIT | **lags core ORT 1.28.0** — can't have both latest |
| Training / export | **torch** (stock) | 2.13.0 | BSD | `torch.xpu` for Arc; **do not install IPEX** (discontinued after 2.8, maintenance ended March 2026) |
| Matcher | **XFeat + LightGlue** | — | Apache-2.0 / Apache-2.0 | XFeat is built for real-time CPU; LightGlue-ONNX has a documented OpenVINO EP path |
| UI shell | **PySide6** | 6.11.1 | LGPL-3.0 | Native video compositing; see §4 |
| Keypoint model (Track B) | **RTMPose / MMPose** or plain PyTorch heatmap UNet + `timm` backbone | — | Apache-2.0 | **Avoid Ultralytics YOLO — AGPL-3.0** |

Install (day one, in a venv):

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install opencv-contrib-python==5.0.0.93 openvino==2026.2.1 numpy scipy
pip install torch --index-url https://download.pytorch.org/whl/xpu   # only for training/export
```

Nothing is currently installed on the machine — no `cv2`, `torch`, `openvino` or `onnxruntime`. Day
one is installing and benchmarking, not coding.

**NPU notes.** The kernel driver (`intel_vpu`) is already loaded and `/dev/accel/accel0` exists, but
the userspace stack (`intel-level-zero-npu`, `intel-driver-compiler-npu`, `intel-fw-npu`) is
separate. Driver **v1.35.0 (2026-07-24)** lists Meteor Lake on kernel **6.17.0-40** as a tested
configuration — you are on 6.17.0-41, and on Ubuntu 25.10 versus Intel's tested 24.04 LTS. Low risk,
but unverified. The NPU **supports static shapes only** and computes FP16 internally, so export at a
fixed input size. Use `ov::cache_dir` — NPU compilation is slow enough that OpenVINO tracks
"first ever inference" as a separate metric.

**Which device to use is an empirical question, not a research one.** Run `benchmark_app` on CPU,
`GPU`, and `NPU` with the real model. Published Core Ultra 155H figures are suite-level and
contradictory (one source ranks raw throughput GPU > NPU > CPU while the NPU wins on power); no
per-model millisecond figure for a small keypoint model on this chip exists in public. Measuring
takes minutes and settles it authoritatively.

---

## 4. App shell and rendering

**Recommendation: PySide6 with the video and overlay rendered natively in a `QOpenGLWidget`.**

The reasoning is narrow and worth stating, because the alternative is tempting: your existing React
UI is only ~2,150 lines total, and the parts worth keeping are *logic* (music theory, chord voicings,
fret geometry), not presentation. Pushing 1080p30 frames into an embedded browser engine adds copies
and a compositor for no benefit, when the UI is a video canvas plus two side panels. `pywebview`
6.2.1 works and would let you reuse the React code, but it renders through WebKitGTK/QtWebEngine —
you would be paying browser overhead for the one thing browsers are worst at. Electron is worse
still (~150–300 MB idle, against ~7 GB free RAM). Tauri 2.11.5 needs a Rust toolchain you don't have,
for a project whose core will be Python anyway.

So: **the video preview should be native.** Port the theory/content layer (~340 lines, already
specified and unit-tested) to Python — roughly a day — and treat that as the price of a correct
rendering path.

Rendering specifics: upload each frame as a GL texture, draw the overlay in a shader or with
`QPainter` over the texture, and keep the frame/pose pairing intact through the pipeline. Note that
heatmap-based keypoint decoding introduces its own quantization error from the discrete grid — use
**soft-argmax rather than argmax** if you get to Track B, since plain argmax cannot reach sub-pixel
accuracy at all.

---

## 5. The measurement rig — build this first

Purpose: generate exact per-frame fretboard geometry for real video, so you can (a) measure any
tracker's error numerically and (b) auto-label training data if needed.

**Design: a printed ChArUco strip held coplanar with the fretboard**, e.g. thin card on a flat
batten resting on the fret crowns, extending past the board edge so the markers occupy image area
*outside* the region you care about. Optionally add low-tack ArUco tiles directly on the board
between frets, masked out of the label region.

**Why coplanarity is the whole design:** off-plane markers produce a *systematic*, non-zero-mean
bias in every label. A model would faithfully learn that bias, and no amount of temporal averaging
removes it. This is the same error that sank v1, reappearing as a data-quality problem. ChArUco
corner refinement is routinely sub-pixel (~0.1–0.3 px), i.e. ~10× better than the 5 px budget.

Labels are then `fret template point → board homography → image`, which is exactly the quantity the
tracker must produce. Two free wins: you get ground truth for **occluded** frets (the homography
knows where fret 5 is even when a finger covers it — something a human labeller cannot do reliably),
and you can compute an *unsupervised* quality signal at runtime, since high reprojection error tells
you you're wrong without any label.

**Validation protocol before trusting it:** capture a static shot, project the fret lines, overlay at
4× zoom, and confirm the lines land on the fret crowns across the whole neck; repeat at five camera
angles. Hold out ~100 hand-labelled frames as an independent test set — never evaluate solely against
marker-derived labels, since they share the rig's bias.

Also do a one-time **camera intrinsics calibration** with the same ChArUco board. The diagnosis showed
distortion contributes only ≤0.04 fret-widths, so this is not urgent for correctness — but it costs
five minutes and removes a variable.

---

## 6. If Track B becomes necessary: data and cost

- **No usable public data exists.** Zero fretboard-keypoint datasets on Hugging Face; arXiv contains
  exactly two fretboard papers; TapToTab's visual data was never released ("available on request").
  The Roboflow Universe hits are coarse bounding boxes and unverified (the site returns 403 to
  automated fetches).
- **Volume needed is modest.** TapToTab saturated its metric with ~730 hand-labelled frames across
  *many* guitars. WorldCup-2014 — the reference sports-field benchmark — trains on **209 images**.
  For one guitar in one room, the honest estimate is **150–400 hand-labelled frames**, or
  **5,000–20,000 rig-labelled frames for free** plus ~100–150 hand-labelled frames as an unbiased
  test set (3–5 hours of human time).
- **Training cost is negligible.** RTX 4090 rents at ~$0.29–0.39/hr on Vast.ai and ~$0.34/hr on
  RunPod Community; A100 80 GB ~$1.39–1.49/hr (aggregator sources, approximate). A small heatmap
  model needs hours, not days: **$5–20 for a real training campaign**, and free Colab/Kaggle tiers
  may suffice. PnLCalib itself trained on a single RTX 2080 Ti. **The cost of Track B is developer
  time, not money.**
- **Annotation tooling: spend $0.** Write ~150 lines of Python to emit COCO-keypoints from the rig,
  and use self-hosted CVAT only for the small hand-labelled holdout.
- **Quantization caution:** I could find **no** direct study of INT8's effect on sub-pixel keypoint
  precision — the literature discusses heatmap *grid* quantization, a different phenomenon. Default
  to FP16 (which the NPU uses internally anyway) and treat INT8 as an experiment to validate against
  your own rig, not an assumption.

---

## 7. Planarity — closing an open question

Stream 1 left the planarity error budget open. It resolves favourably, by arithmetic:

Fretboard radius is 9.5″–16″; over a 45 mm string spread the sagitta (deviation from a flat plane)
is **0.6–1.05 mm**. At 1080p and 0.72 m (f ≈ 1,660 px) that is **~2.3 px**, against a ±14 px budget
at that resolution. **Treating the fretboard as a plane is fine — a single homography is the correct
model, and full 6-DoF PnP on a 3D neck model is a refinement, not a prerequisite.**

Related: the strings sit 2–4 mm above the board, which at an oblique angle displaces them ~5 px in
the image. This matters if you ever detect *string lines* as tracking features — but not for dot
placement, because the fingertip presses the string down to the board, so the board plane you are
already tracking is the correct surface to draw on.

---

## 8. Build plan

| # | Step | Output | Effort |
|---|---|---|---|
| 0 | `pip install`; `benchmark_app` on CPU/GPU/NPU; verify the NPU userspace stack | a table of real latencies for *your* machine | 0.5 day |
| 1 | Lock the camera (`v4l2-ctl`), confirm true 1080p30 MJPEG, light the area | a stable, blur-free feed | 0.5 day |
| 2 | **Build the ChArUco measurement rig** + intrinsics calibration + the validation protocol | per-frame ground truth; a way to *measure* | 2 days |
| 3 | Record 10–20 realistic clips (playing, leaning, shifting, hand occlusion) with the rig attached | an evaluation set | 0.5 day |
| 4 | Spike XFeat + LightGlue: template match on one clip, measure error against the rig **and** frame time | **go/no-go on Track A** | 2 days |
| 5 | Add detect-then-track (LK), the inlier-spread gate, the fret snap, one-euro filtering | 30 fps tracker with numbers | 3 days |
| 6 | PySide6 shell, native GL overlay, frame/pose pairing; port theory + chord data from TS | a usable app | 4 days |
| 7 | Re-measure end-to-end against the rig; iterate on the worst cases | a validated tool | ongoing |
| 8 | *Only if step 4 or 7 fails:* Track B — rig-label 10k frames, train the two-head model | a learned detector | 1–2 weeks |

Step 4 is the real go/no-go and it arrives in under a week. If XFeat+LightGlue matching on your own
fretboard's texture produces enough inliers with enough spread, the project is essentially solved and
the rest is engineering. If it doesn't, you will know *why*, with numbers, and Track B is waiting
with its label pipeline already built.

## 9. Risks, honestly

1. **Fretboard texture may be too weak for local features.** Wang & Ohya got 2.3–4.5 mm on three
   guitars, so this generally works — but a very clean, glossy, unfigured rosewood board under flat
   lighting is the adversarial case. Inlay dots, fret ends, wear marks and grain are what carry the
   signal. **Mitigation:** step 4 measures it directly; if inliers are sparse, add side/raking light
   to raise grain contrast before concluding anything.
2. **Throughput on Meteor Lake is unmeasured.** No public per-model latency figures exist for this
   chip for either XFeat or LightGlue. This is the largest unknown in the plan, and step 0 exists to
   kill it in half a day.
3. **XFeat has no official ONNX export.** Several third-party exports exist (the most-starred at 46
   stars, last pushed 2024-06) and LightGlue-ONNX documents an OpenVINO path, but you may end up
   maintaining an export script. **Fallback:** ALIKED or SuperPoint, both with better-maintained
   ONNX/OpenVINO paths, at some speed cost.
4. **Repetitive fret texture causes off-by-one-fret matches.** This is a *named, observed* failure —
   Wang & Ohya built their crossing-line RANSAC filter specifically for it. LightGlue's
   cross-attention handles repetition far better, and the fret-table snap is a second line of
   defence, but expect to spend time here.
5. **Ubuntu 25.10 is outside Intel's tested NPU matrix.** Low risk; and CPU/iGPU are viable fallbacks.
6. **The escape hatch, recorded not recommended:** fixing the camera rigidly relative to the guitar
   (headstock clamp, or guitar in a stand with a fixed camera) makes the homography *constant* and
   calibrated once. This is what guitARhero chose after considering the alternative. It violates the
   spirit of your hardware constraint but not its letter, and it is the zero-risk baseline any tracker
   should be compared against.

## 10. Gap-filling research done for this synthesis

- XFeat ONNX exports (GitHub search API): `DavideCatto/XFeat-ONNX` (46★, 2024-06-19),
  `Derkai52/XFeat-Lightglue-TRT` (36★, 2025-07-11), `Kazuhito00/XFeat-Image-Matching-ONNX-Sample`
  (35★, 2024-05-04), `Philfei/xfeat_onnx_export` (13★, 2024-07-24). All third-party; none official.
- GPU rental, approximate 2026 rates (aggregator blogs, treat as indicative): RTX 4090 ~$0.29–0.39/hr
  (Vast.ai), ~$0.34/hr (RunPod Community), ~$0.69/hr (RunPod Secure); A100 80 GB ~$1.39–1.49/hr.
- INT8 vs keypoint sub-pixel precision: **no direct evidence found.** The retrievable literature
  concerns heatmap grid quantization and the argmax→soft-argmax fix, which is a different issue.
  Recorded as an open question.
- Planarity arithmetic (§7): my own calculation, not from a source.

## Links

- Wang & Ohya 2018, "An Accurate and Robust Algorithm for Tracking Guitar Neck in 3D Based on
  Modified RANSAC Homography" — https://doi.org/10.2352/ISSN.2470-1173.2018.18.3DIPM-460
- guitARhero (TU Graz) — https://arbook.icg.tugraz.at/schmalstieg/Schmalstieg_416.pdf
- TapToTab, arXiv 2409.08618 — https://arxiv.org/pdf/2409.08618
- XFeat (CVPR 2024) — https://arxiv.org/abs/2404.19174 · https://github.com/verlab/accelerated_features
- LightGlue (ICCV 2023) — https://github.com/cvg/LightGlue
- LightGlue-ONNX with OpenVINO EP — https://github.com/fabio-sim/LightGlue-ONNX
- PnLCalib, arXiv 2404.08401 — https://github.com/mguti97/PnLCalib (GPL-2.0)
- OpenVINO NPU device docs (raw) —
  https://raw.githubusercontent.com/openvinotoolkit/openvino/master/docs/articles_en/openvino-workflow/running-inference/inference-devices-and-modes/npu-device.rst
- Intel Linux NPU driver releases — https://github.com/intel/linux-npu-driver/releases
- Fretello "Mirror" (existence proof only) —
  https://fretello.com/news/mirror-revolutionizing-guitar-learning-with-augmented-reality/
