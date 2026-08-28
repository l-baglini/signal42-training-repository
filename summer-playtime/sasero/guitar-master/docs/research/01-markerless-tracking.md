# 01 — Markerless Fretboard Keypoint Tracking on ONE Known Guitar

**STATUS: PARTIAL** — the agent producing this file was killed by an API/session limit. Raw notes below are complete and verified; the structured sections were never filled in. Synthesis lives in `10-recommended-stack.md`.

Research date: 2026-07-31. Target: FretGuide overlay, ±0.25 fret-widths (≈±4.8 px @ 640×480/0.7 m),
≥30 fps, Intel Core Ultra 7 155H (CPU / Arc Xe-LPG iGPU / AI Boost NPU), no CUDA, offline.

Constraint that shapes everything: **one guitar, forever.** Per-instance enrollment is preferred, not a compromise.

## Verdict so far

_(updated as research proceeds — see bottom for final)_

**As of Note 9 (mid-research) — high confidence:**

1. **Do the enrollment-template + local-feature-matching pipeline.** It is not speculative: Wang &
   Ohya (IS&T EI 2018) already demonstrated exactly this shape of algorithm — SIFT inside a
   hand-clicked fretboard quad on frame 1, match every later frame *back to frame 1*, RANSAC
   homography — and measured **2.3–4.5 mm in-image error on the fretboard corners**, i.e. roughly
   0.11–0.22 fret-widths, which is inside my ±0.25 spec. On 3 guitars, varied light, with finger
   occlusion. The open problem is purely **throughput** (they got 0.4 FPS).
2. **Do NOT build a per-frame independent fret-line detector.** Two independent sources say don't:
   TapToTab explicitly abandoned Canny+Hough for fret lines as too lighting/texture-sensitive, and
   Wang & Ohya's reimplementation of Scarr & Green's Hough approach was their weakest baseline.
   Frets should come from a *model* (a rectified board template / fret pencil), not from detection.
3. **Fret indexing is solved for free by the template design**, not by a clever cross-ratio scheme:
   if you match against a canonical rectified image of *your* board, the fret indices are baked into
   the template's coordinate frame. Cross-ratio reasoning becomes a *verification* test, not the
   primary mechanism. (Wang & Ohya's "crossing matching lines" filter is a crude version of exactly
   the off-by-one-fret guard I need.)
4. **Nobody has published a fast markerless fretboard tracker.** guitARhero (TU Graz, 2023 TVCG)
   deliberately bolted the camera to the headstock to avoid tracking; GuitXR used a capo + 3D-printed
   mount; every earlier AR guitar tutor used markers. Fretello "Mirror" ships something markerless
   but publishes nothing. So there is no library to drop in — but also no evidence the goal is
   infeasible, and I have a structural advantage none of them had (one guitar, forever).
5. **The single highest-risk component is throughput on Meteor Lake, not accuracy.** De-risk by
   measuring, in one day, the frame time of XFeat(+LighterGlue) at 640–1280 px on this CPU/iGPU.

## 1. Literature survey

### 1.1 Known leads to verify

### 1.2 Deep-learning fretboard detection (2024–2026)

### 1.3 AR guitar tutors (2010s → now)

## 2. Fret indexing — the hard sub-problem

## 3. Instance-specific tracking (enrollment / template)

## 4. Classical pipeline components

## 5. Detect-then-track architecture

## 6. Planarity error budget

## 7. Candidate pipelines + latency budgets

## 8. What I could NOT find / open questions

## 9. Links

## Raw notes (append-only, timestamped)

### Note 1 — arXiv sweep for guitar + vision (2026-07-31)
Query: `all:guitar AND (all:fretboard OR all:fingering OR all:tablature)`, 40 results sorted by date
(http://export.arxiv.org/api/query?search_query=all:guitar+AND+(all:fretboard+OR+all:fingering+OR+all:tablature)&max_results=40&sortBy=submittedDate).
**Finding: the arXiv guitar literature is overwhelmingly AUDIO/symbolic.** Of ~31 hits since 2011, only
TWO involve vision at all, and only one is guitar-video: TapToTab (2409.08618). Everything else is
MIDI→tab, tablature generation, audio transcription, datasets (DadaGP, GuitarSet, Guitar-TECHS,
GOAT, SCORE-SET), or transformer tab generation.
**My read: there is no active academic line of work on precise fretboard geometry from video.**
That is bad for "borrow a solution" and good for "nobody has solved it, so my instance-specific
approach isn't obviously dumb." The relevant literature will be in ISMIR/ISVC/AR venues and
non-guitar (planar tracking, local features), not arXiv-cs-CV guitar papers.

### Note 2 — "FretIQ" verification (2026-07-31)
**VERDICT: the thing named "FretIQ" is NOT a vision system.** arXiv 2607.18303 (2026-07-17),
"Fretiq: Browser-Native Electric Guitar String Classification via Engineered Spectral Features and
Held-Out Free-Play Evaluation" — https://arxiv.org/abs/2607.18303 — is **audio-only**; the abstract
explicitly says it needs "no hexaphonic pickup, fretboard sensor, camera, or multi-microphone setup."
26-dim features (band energies + spectral stats + MFCCs), 97.1% frame-level validation accuracy,
87.8% on held-out free play, single-instrument/single-player. Do NOT cite FretIQ as a fretboard
tracker. (It IS however a directly relevant datapoint for a *later* FretGuide feature: single-guitar
overfit audio string-ID at 87.8% — same "one instrument forever" philosophy, and it works.)

### Note 3 — TapToTab (arXiv 2409.08618, 2024-09-13) read in full from PDF
Ghaleb, ElSadawy, Essam, Zaky, Abdelhakim, Fahim, Bayoumi, Hindy (Ain Shams Univ., Cairo).
- Uses **YOLOv5 / YOLOv8 / YOLOv8-OBB / YOLOv9**; YOLOv8-OBB best: P 0.988, R 0.988,
  mAP50 0.993, mAP50-95 0.955.
- **CRITICAL CAVEAT: those numbers are for coarse boxes, not fret geometry.** The detector's
  classes are "fretboard" and "left hand position segment"; they divide the neck into **12 zones**
  (`ZONE = f / (max_frets/num_zones)`) and in one experiment reduce to **2 classes**. Fret ID comes
  from **IoU between the left-hand box and a zone**, then disambiguated by *audio* pitch.
  Spatial resolution is ~a zone, i.e. orders of magnitude coarser than my ±0.25 fret-width spec.
- **They tried and REJECTED classical Canny + Hough for fret lines**: "variability in fretboard
  appearances and lighting conditions resulted in inconsistent detection of fret lines" (§V.A.2).
  My read: this rejection is about *cross-guitar generalisation*, which I explicitly do not need.
  A single-instrument, enrolled prior changes the calculus completely. Still, it is real evidence
  that naive Hough on a glossy fretboard under room light is fragile.
- Dataset: their own "TapToTab: A Pitch-Labelled Guitar Dataset for Note Recognition",
  IEEE Dataport doi 10.21227/664p-5b45. No fret-line keypoint labels. No code link in paper.
- Useful earlier refs mined from its bibliography:
  - Scarr & Green, "Retrieval of guitarist fingering information using computer vision", IVCNZ 2010
    (markerless, no neck-mounted camera; background subtraction + Canny + probabilistic Hough +
    horizontal Sobel).
  - Duke & Salgian, "Guitar Tablature Generation using Computer Vision", ISVC 2019, pp. 247-257
    (vision-based markerless, tracks strings AND frets, skin detection for fingers, real-time).
  - Yazawa et al., ICASSP 2013, audio multipitch + playability constraints.
  - Wiggins & Kim, "Guitar Tablature Estimation with a CNN", ISMIR 2019.

### Note 4 — guitARhero (TU Graz, Schmalstieg group) — THE most important negative result
PDF: https://arbook.icg.tugraz.at/schmalstieg/Schmalstieg_416.pdf (NB: TLS cert expired, fetch with
`curl -k`). "guitARhero: Interactive Augmented Reality Guitar Tutorials" — Skreinig, Kalkofen,
Stanescu, Mohr, Heyen, Mori, Sedlmair, Plopski, Schmalstieg. IEEE VR/TVCG-style paper, 20-participant
user study, Varjo XR-3 HMD + desktop magic mirror.
**They do not track the guitar visually at all.** Verbatim (§4, magic mirror):
> "One design concern with this method of visualization is the need to track the instrument. Prior
> implementations require users to align the guitar with a static visualization on the monitor [19]
> or attach optical markers to track the guitar [21]. In addition, placing a camera at a distance
> from the user means that the guitar neck will occupy only a small portion of its view, making it
> difficult to discern which frets should be pressed. **Instead, we rigidly attach a 3D printed
> support to the head of the guitar and mount a lightweight webcam on it so that it captures the neck
> of the guitar. This approach ensures that the guitar does not move relative to the camera,
> eliminating the need for any tracking of the instrument.**"
For the HMD condition they add an **HTC Vive Tracker** screwed into the strap button. Note detection
is a **Fishman TriplePlay Connect hex MIDI pickup**, because they judged acoustic multipitch
"reliability remains imperfect for real-time applications".
Their Table 1 survey of prior AR guitar tutors lists the instrument-tracking column as
"Marker tracking" for essentially every prior system.
**My read (important, updates verdict):** As of 2024, the best-funded academic AR guitar tutor
concluded that markerless neck tracking from a distant camera was not worth attempting, and *also*
independently confirms my own diagnosis that a far camera makes the neck too few pixels. Two
consequences:
1. I should not expect to find an off-the-shelf markerless fretboard tracker. This is genuinely
   unsolved-in-public, so I must build it from generic planar-tracking parts.
2. There is a cheap escape hatch that dominates on engineering risk: **rigidly fix the camera
   relative to the guitar** (clamp/mount, or conversely put the guitar in a stand and fix the
   camera). Then the homography is *constant* and calibrated once. My spec says "no markers or
   stickers on the guitar" but says nothing about a headstock clamp or a guitar stand. Worth
   pricing as the risk-free baseline that a markerless tracker must beat.
Also relevant: framing. They put the camera ON the neck to get pixels on the neck. My sim already
says full-neck framing is essential (short baseline is fatal) — so the camera must see frets 0–12
*and* give ≥19 px/fret. That argues for 1080p or 1280×720 minimum, not 640×480.

### Note 5 — GuitXR (UW Reality Lab XR capstone, 2021 spring)
https://uwrealitylab.github.io/xrcapstone21sp-team4/ — Magic Leap 1 app, chord/tab holograms.
Requirements list is "Magic Leap headset, a guitar **with capo**, and a **3D-printed mount**".
No tracking algorithm, no accuracy numbers published. **My read: also not markerless** — the capo
+ 3D-printed mount are a physical fiducial/registration jig. Student capstone, no evaluation.
Low value as a technical reference; useful only as further evidence that everyone punts on tracking.

### Note 6 — Fretello "Mirror" (commercial, shipping)
https://fretello.com/news/mirror-revolutionizing-guitar-learning-with-augmented-reality/ and
https://fretello.com/news/the-future-of-music-education-ai-ar-and-gamification/ (via DDG).
Marketing only, zero technical disclosure. What *is* stated: it "harnesses your device's
**front-facing camera** and AI vision algorithms to: Recognize your guitar and its **fretboard
orientation**, [and] overlay intuitive visual cues (e.g., **colored dots on frets**)". Demo video:
https://www.youtube.com/watch?v=F5X7T5TFKus.
**My read: this is an existence proof and nothing more.** It confirms markerless, single-RGB-camera,
dot-on-fret overlay is shippable in 2024–25 — so FretGuide's goal is not fantasy. But: (a) it's a
phone/tablate front camera at ~arm's length, i.e. the neck fills much more of the frame than my
laptop-at-0.7 m setup; (b) no published precision, and consumer AR tutors tolerate visibly loose
registration far worse than ±0.25 fret-widths. Do not treat "Fretello does it" as evidence that a
generic detector reaches my spec. Their business needs cross-guitar generalisation; I do not, which
is my one structural advantage over them.

### Note 7 — XFeat (CVPR 2024) — candidate enrollment matcher
https://arxiv.org/abs/2404.19174 · code https://github.com/verlab/accelerated_features ·
project https://www.verlab.dcc.ufmg.br/descriptors/xfeat_cvpr24
- Lightweight CNN local features, 64-D descriptors, sparse **or semi-dense**; "first to offer
  semi-dense matching efficiently"; ~5× faster than other learned features.
- **Speed claims (from repo README):** "Real-time sparse inference on CPU for VGA images (tested on
  laptop with an i5 CPU and vanilla pytorch)". ~150 FPS single-batch VGA on RTX 4090; ~1400 FPS
  batched. **The relevant number for me is the i5-CPU-VGA-realtime claim** — plausibly 20–40 ms/frame
  on my 155H, and that's before OpenVINO/OpenCL conversion.
- MegaDepth-1500 pose AUC@5/10/20 with XFeat+LighterGlue: 0.444/0.610/0.746 (fast: 640 px, 1300 kpts)
  and 0.564/0.710/0.819 (accurate: 1024 px, 4096 kpts).
- **No ONNX export in-repo** as of README (they ask for contributors for ONNX/TensorRT). That is a
  real friction point for OpenVINO/NPU deployment — flag as risk. (Third-party ONNX exports exist in
  the wild; must verify separately.)
- **Gap: neither paper nor repo publishes keypoint *localisation* error in pixels.** Pose AUC is not
  the metric I need. My spec needs σ≈3–5 px on the board plane, which is a *loose* bar by
  local-feature standards (sub-pixel refinement modules target <1 px repeatability), but I could not
  find a direct number. OPEN QUESTION — must measure empirically on my own guitar.

### Note 8 — ★★★ Wang & Ohya 2018 — closest prior art to my proposed approach, and it hits spec
"An Accurate and Robust Algorithm for Tracking Guitar Neck in 3D Based on Modified RANSAC
Homography", Zhao Wang & Jun Ohya, Waseda Univ. IS&T Electronic Imaging 2018, 3DIPM session.
doi: https://doi.org/10.2352/ISSN.2470-1173.2018.18.3DIPM-460
PDF: https://library.imaging.org/admin/apis/public/api/ist/website/downloadArticle/ei/30/18/art00005
**Method — essentially my "instance enrollment" idea, done in 2018 with SIFT:**
1. **Manually click the 4 corners of the fretboard on frame 1.** Detect SIFT keypoints *inside* that
   region (region deliberately dilated to catch border features).
2. Every subsequent frame: detect SIFT, match to **frame 1** (not to the previous frame) via KD-tree.
   Matching always against the reference means **no drift and no tracking-failure recovery problem**
   — their own stated motivation.
3. **Modified RANSAC:** stack the two images vertically, draw "matching lines" between
   correspondences; **delete any matching line that crosses >=70% of the other matching lines**, then
   run ordinary RANSAC homography on survivors.
   *Why they needed this:* verbatim — "since the area in the guitar neck appears nearly same (fret and
   string), the SIFT feature points in the fretboard area tend to share nearly same scales and
   directions. If the traditional RANSAC is applied ... it is difficult to calculate the homography H
   due to too many wrong matches." **This is the repetitive-texture / off-by-one-fret failure mode,
   observed and named in the literature.** Their crossing-line filter is a cheap global
   order/monotonicity prior on the match field.
4. Warp the 4 corners with H; rectify the board to a canonical centred image.
**Results (Table 1, Table 2, Fig. 5):**
| Variant | mean 3D corner error | variance |
|---|---|---|
| SIFT + modified RANSAC (theirs) | **4.17 mm** | 1.5 |
| SURF + modified RANSAC | 4.59 mm | 1.7 |
| SIFT + vanilla RANSAC | 6.90 mm | 3.44 |
| SURF + vanilla RANSAC | 7.51 mm | 3.98 |
Per-corner **in-image (u,v) error is only 2.3-4.5 mm**; the 5.6-7.4 mm depth error is Kinect depth,
not their algorithm. 100% of frames under an 8 mm error threshold. Baselines they reimplemented:
Scarr & Green's Canny+Hough ("detect lines by Hough Transform and remain the biggest cluster of lines
that have the same slope"), their own earlier optical-flow-on-40-Shi-Tomasi-points method, and a
**VGG16-style fully-convolutional net** (7-level, last 3 FC -> conv).
Dataset: own, 50 videos / ~3000 frames, Kinect 1200x800, **3 different guitars**, daylight +
incandescent, complex backgrounds. Hardware: i7 3.0 GHz, 16 GB, **no GPU**, C++/OpenCV 2.4.10.
**Speed - the fatal flaw: 2.5 s/frame = 0.4 FPS.** (SIFT+KD-tree alone was 2.3 s; the crossing-line
filter added 0.2 s.) The FCN baseline ran at **35 FPS** but needed >=400 labelled images and ~10 h of
GPU training, and was less accurate.
**MY READ - this reframes the whole project:**
- The accuracy question is **answered in the affirmative**. 2.3-4.5 mm in-image on the *fretboard
  corners* (the worst, most extrapolated points) is ~0.11-0.22 fret-widths on a 25.5" scale
  (fret 1 ~ 36.4 mm wide, fret 12 ~ 20.5 mm). **Template-to-reference-frame planar matching on the
  fretboard's own texture already meets my +/-0.25 fret-width spec**, using 2018-era SIFT, on three
  different guitars, under varied lighting, with fingers occluding the board.
- What is *not* solved is **speed**: 0.4 FPS vs my >=30 FPS - a 75x gap. But essentially all of it is
  2018 CPU SIFT at 1200x800 in OpenCV 2.4 plus an O(N^2) line-crossing filter. Every one of those is
  now replaceable: XFeat/ALIKED instead of SIFT, LightGlue instead of KD-tree ratio test, and - most
  importantly - **you do not need to re-detect every frame** (see detect-then-track).
- Their "match to frame 1, never to frame i-1" design is the right call and I should copy it: it
  eliminates drift, the classic killer of frame-to-frame planar trackers.
- Their crossing-line filter is a 2018 hack for a problem LightGlue-class matchers are explicitly
  designed for (repetitive structure, cross-attention over both images). I should still keep a
  *geometric sanity* test in the same spirit - and my own sim already tells me to add an
  inlier-spread / baseline test.

### Note 9 — other AR-guitar leads found (2026-07-31)
- arXiv 2603.23639 (posted 2026-03-24) "Augmented Reality Visualization for Musical Instrument
  Learning", Frank Heyen & Michael Sedlmair — https://arxiv.org/abs/2603.23639 — this is an arXiv
  posting of an **ISMIR 2022 late-breaking demo**, drums (projector) + guitar (screen magic mirror /
  OST headset). Per search snippet they "fitted guitars with **printed optical markers**" for the
  headset condition. No accuracy numbers, no algorithm. Same authors as guitARhero. Low value.
- Prior art chain named by Wang & Ohya for *marker/attachment-based* guitar AR: Motokawa & Saito
  (AR tag), Kerdvibulvech & Saito (AR tag), A. Burns (camera fixed to the neck). Confirms again:
  **every published guitar-AR system either attaches a marker or attaches the camera.**
- US patent 11996070 ("Isolated guitar string audio capture and visual string indication and
  chord-finger number overlay process and system") describes detecting **edges of the guitar neck and
  fretboard**, fitting vectors to those edges, and drawing overlay lines aligned to fretboard and
  strings. Patent, not a validated system; note for prior-art awareness only.

### Note 10 — LightGlue + ONNX/OpenVINO path; local environment audit (2026-07-31)
LightGlue (Lindenberger, Sarlin, Pollefeys, ICCV 2023) repo https://github.com/cvg/LightGlue README:
- **RTX 3080: 150 FPS @1024 kpts, 50 FPS @4096 kpts. Intel i7-10700K CPU: 20 FPS @512 kpts.**
  4–10x faster than SuperGlue. Pretrained weights for SuperPoint, DISK, ALIKED, SIFT.
- Adaptive depth (fewer layers on easy pairs) + adaptive width (prune keypoints) with "marginal
  impact on accuracy" — *both of these fire hard on an easy pair, and my pair is the easiest possible
  case: same object, same lighting, small viewpoint change from the enrolled template.* Expect the
  optimistic end of the range.
- ONNX/OpenVINO: https://github.com/fabio-sim/LightGlue-ONNX — **explicit OpenVINO execution
  provider with dedicated inference examples**, SuperPoint/DISK/ALIKED (+XFeat referenced), FP16 and
  quantization workflows, dynamic batch. This is the deployment route for Intel Arc iGPU / NPU.
  Caveat: repo does not publish an ms-latency table for CPU/NPU, so I have no Meteor Lake number.
- **20 FPS @512 kpts on a 2020 desktop i7 is the load-bearing datapoint.** My 155H has 16 cores /
  22 threads and is newer; 512 keypoints is plenty for a single planar template. So matching is
  ~30–50 ms on CPU, i.e. *not* 30 FPS on its own — which is exactly why the architecture must be
  detect-then-track (match at 5–10 Hz, optical flow between).
**Local environment audit (bash):** `python3 -c "import cv2/torch/openvino/onnxruntime"` — **all four
FAIL, nothing is installed.** `/dev/accel/accel0` present (intel_vpu NPU) and `/dev/dri/renderD128`
present (Arc Xe-LPG). CPU confirmed `Intel(R) Core(TM) Ultra 7 155H`, 16 cores / 2 threads-per-core,
400–4800 MHz. So the very first day of work is `pip install opencv-python openvino onnxruntime-openvino`
and measuring, not coding.

### Note 11 — point trackers (CoTracker3 etc.): the wrong tool for this job
CoTracker3, Karaev/Makarov/Wang/Neverova/Vedaldi/Rupprecht, arXiv 2410.11831 (2024-10-15),
https://arxiv.org/abs/2410.11831 — "available in online and offline variants", so causal operation
*is* supported; trained with pseudo-labelling, "1,000x less data", simpler/smaller than predecessors.
The abstract page gives no runtime numbers or GPU requirements.
**My read: skip this entire class (CoTracker3 / BootsTAPIR / LocoTrack).** Reasons, in order:
1. They solve a *harder* problem than mine — tracking arbitrary points through arbitrary
   deformation, with no object model. I have a **known, rigid, near-planar target that I own and can
   enroll offline**. That collapses my state to 8 DoF (homography) or 6 DoF (PnP). Using a generic
   TAP model here is throwing away the strongest prior I have.
2. They are transformer video models built for offline analysis on discrete NVIDIA GPUs; I have no
   CUDA. Even the online variants are heavy, and none of these repos publish an Intel-iGPU number.
3. They **drift**. Wang & Ohya's central design decision — always match against the enrolled
   reference frame, never against frame i-1 — is specifically to eliminate drift, and it is free.
   A TAP tracker reintroduces the problem I'd be paying a GPU to avoid.
I looked for, and did not find, any published Intel-iGPU/NPU latency figures for these trackers.
Recording as an open question, but not a blocking one.

