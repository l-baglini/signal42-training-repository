# 07 — Data & Training: zero → working custom fretboard model for ONE guitar

**STATUS: PARTIAL** — the agent producing this file was killed by an API/session limit. Raw notes below are complete and verified; the structured sections were never filled in. Synthesis lives in `10-recommended-stack.md`.

Research date: 2026-07-31. Target hardware: Intel Core Ultra 7 155H (Arc Xe-LPG iGPU + AI Boost NPU), 15 GB RAM, Ubuntu 25.10, no NVIDIA GPU. Budget: a few hundred USD max.

Spec inherited from `docs/research/00-diagnosis.md` (treated as fact): keypoint noise σ ≲ 5 px suffices for 0.25 fret-width dot accuracy; wide fret baseline coverage and correct fret indexing dominate raw precision; 5-frame temporal averaging ≈ 2.2× σ reduction; 1080p ≈ halves error vs 480p.

## Verdict so far

_(updated as research proceeds)_

## 1. Existing data and weights

### Hugging Face Hub — nothing usable (verified)
Fetched `https://huggingface.co/api/datasets?search=guitar&limit=100` (2026-07-31). ~45 hits, all irrelevant to fretboard *geometry*:
- Audio/MIDI/tab-text: `taohu/guitarset`, `jhartquist/guitarset`, `vldsavelyev/guitar_tab`, `juancopi81/mutopia_guitar_dataset`, `severyn-k/isolated-guitar-chords`, `collegefishiesd/guitar-fretboard-notes` (single-note *audio* recordings, not images).
- Chord-hand object detection: `dduka/guitar-chords` (207 dl), `noamFF/guitar-chords`, `j-asra-j/guitar-chords` — bounding boxes over chord shapes, no fret geometry.
- Robotics/LeRobot episodes of a robot "playing guitar" (`RoboCOIN/AIRBOT_MMK2_play_the_guitar`, `Guitar-Fan/*`) — RGB video of guitars exists but unlabeled for our purpose.
- `TylerHilbert/3D-Printable-Guitar-Models` — 3D models (possibly relevant to §4 synthetic).
**Conclusion: zero fret-line / fretboard-keypoint datasets on HF.**

### arXiv — the literature is nearly empty (verified)
`http://export.arxiv.org/api/query?search_query=all:"fretboard"&max_results=30` returns only **2** papers:
- **2409.08618 TapToTab** (2024-09-13): YOLO for real-time fretboard detection + FFT audio. This is the only fretboard-detection paper.
- 2607.18303 Fretiq (2026-07-17): audio-only string classification, explicitly *no camera*.
This is a strong signal: there is no established academic benchmark to inherit from. We must generate our own data — which, for a single-instance target, is fine.

### Roboflow Universe (search via DuckDuckGo; universe.roboflow.com returns 403 to WebFetch)
- `universe.roboflow.com/ghaleb/guitar-fretboard` — "384 open source Frets images" + pretrained model/API.
- `universe.roboflow.com/guitarfretannotation/guitar-fretboard-5vaz3` — same 384-image "Frets" dataset (looks like a fork/original pair).
- `universe.roboflow.com/test-l4egp/guitars-strings-frets-zupqa` — "626 open source frets images" + pretrained model, classes appear to be guitars / strings / frets.
- `universe.roboflow.com/joaomarcoscrs/guitar-chords-daewp` — **keypoint** detection, but keypoints are on the *hand/chord shape*, not the fretboard.
- `universe.roboflow.com/zhenyuandaxian/detection-model-for-guitar-chord` — chord detection boxes.
**Caveat (flagged): I could not verify these pages directly — `universe.roboflow.com` returns HTTP 403 to WebFetch, so image counts/licences/annotation types come from search-engine snippets, not from the pages themselves. Verify in a browser before relying on them.** Roboflow Universe datasets are usually CC BY 4.0 by default but per-project licences vary — check each.
Even in the best case these are *bounding boxes over fret regions* at low resolution — useless as direct supervision for σ ≤ 5 px fret-line endpoints, and useless for our specific guitar. Their only value: (a) a free pretrained "where is the neck" ROI detector, (b) proof the coarse task is easy.

### TapToTab (arXiv 2409.08618) — chased to ground truth (verified from the PDF)
Extracted the full text of `https://arxiv.org/pdf/2409.08618`:
- **Data NOT released.** Verbatim: "The annotations can be requested directly from the authors." Only the *audio* side is public ("TapToTab: A Pitch-Labelled Guitar Dataset for Note Recognition"). So no visual data, no weights, no GitHub. Emailing the authors is a low-cost long shot; do not plan around it.
- **How much they labeled (very useful anchor):** Table 2 "Generated Dataset Volume":

| Approach | Before augmentation | After augmentation | Augmentations |
|---|---|---|---|
| Zone annotation (12 fret classes / zones) | 440 | 1100 | flip, shear, noise |
| Fretboard segmentation | 730 | 1790 | flip, rotate, saturation, exposure, mosaic |

- **Results** (Table 3, detection/segmentation mAP — *not* keypoint precision):

| Model | Precision | Recall | mAP50 | mAP50-95 |
|---|---|---|---|---|
| YOLOv5 | 0.919 | 0.822 | 0.913 | 0.769 |
| YOLOv8 | 0.987 | 0.995 | 0.992 | 0.951 |
| **YOLOv8-OBB** | 0.988 | 0.988 | **0.993** | **0.955** |
| YOLOv9 | 0.958 | 0.949 | 0.983 | 0.907 |

- Data was multi-guitar, multi-guitarist, self-recorded + YouTube, acoustic and electric. They also tried and rejected classical CV: manual ROI ("contradicts the goal of an automated system") and Canny + Hough line transform for fret lines (too brittle to lighting/angle) — which independently validates the decision to train a model rather than hand-tune Hough.
- **Takeaway: ~700 hand-labeled frames across many guitars sufficed for near-saturated OBB detection. For ONE guitar with far lower variability, the honest estimate is 150–400 hand-labeled frames for a keypoint model — and TapToTab did not need to hit σ ≤ 5 px, so treat 700 as a soft upper bound rather than proof.**

## 2. Label design / target representation

### The strongest analog: sports-field registration (verified in depth)
A fretboard is a planar target with ~13 near-parallel transverse lines (frets), 6 near-parallel longitudinal lines (strings), two board edges, and sparse unique landmarks (nut, inlay dots, body junction). A soccer pitch is a planar target with parallel touchlines/goal lines, repeated boxes, and sparse unique landmarks (centre circle, penalty spots). **Same problem shape, and the sports community has solved it well enough to be a template.** arXiv survey of the field (`http://export.arxiv.org/api/query?search_query=all:"soccer field"+AND+all:"camera calibration"`):

| Paper | arXiv | Primitives | Relevance to FretGuide |
|---|---|---|---|
| **PnLCalib** (Gutiérrez-Pérez & Agudo, CVIU 2026) | 2404.08401 | keypoints **+** line extremities, then non-linear PnL refinement | **The architecture to copy.** SOTA, code released |
| No-Bells-Just-Whistles (same authors, ref [16]) | — | keypoints, lines auxiliary | predecessor; SN23 baseline |
| TVCalib | 2207.11709 | line **segments** only, differentiable objective | shows a pure-line objective works, but is beaten |
| KaliCalib (basketball) | 2209.07795 | keypoint heatmaps, perspective-aware keypoint spacing | small court ≈ small fretboard; 4.7× over baseline |
| BroadTrack | 2412.01721 | lines + camera/tripod motion model, temporal | **halves mean reprojection error** purely from temporal modelling |
| "Can Geometry Save Central Views…" | 2504.20052 | derives points from circles when few landmarks visible | the short-baseline / few-landmarks failure mode — our known killer |
| Universal benchmark protocol (ProCC) | 2404.09807 | — | evaluation methodology |
| Monocular 3D pose w/ partial field registration | 2304.04437 | lines; **10k+ synthetic images from Unreal Engine 5** | synthetic-data precedent for this exact task family |

**PnLCalib specifics extracted from the PDF (all verified):**
- Two separate encoder–decoder nets, both **HRNetv2-W48**: one emits **57 + 1 heatmaps** (57 semantic keypoints + a boundary channel), the other **23 + 1 heatmaps** for line extremities. Predictions at **half input resolution**; ground-truth peaks are Gaussians with **σ = 2 px**. (Note: 2 px is exactly our σ budget — the sports people target the same precision class.)
- Training: 200 epochs, Adam, MSE heatmap regression, batch size 1–2, augmentation limited to **random horizontal flip + colour jitter**, on a **single RTX 2080 Ti (12 GB)**. Deliberately modest hardware.
- Datasets: SoccerNetV3-Calibration = **22,816 images**; **WorldCup-2014 = only 209 training images / 186 test**; TS-WorldCup = 3,812 frames. On WC14-test, PnLCalib+PnL reaches **JaC₅ = 85.9 %, CR = 100 %** (JaC₅ = fraction of line segments reprojected within **5 px**). On SN22-test-center, JaC₅ = 80.6 %.
- **How they resolve which-line-is-which** — the crux for a fretboard, where fret 5 looks like fret 7. Two mechanisms:
  1. **Identity is baked into the heatmap channel.** Each of the 57 keypoints has its own output channel, so the network must decide semantics from global context. To help, they add a **boundary channel** so the net "captures global information" and behaves near image borders. This is the standard trick and it works because the pitch has asymmetric context.
  2. **Explicit deferred disambiguation.** For genuinely ambiguous keypoints (the two semi-circles), they *defer disambiguation until after inference*: if ≥ 4 unambiguous points are detected, fit a homography and assign ambiguous candidates by **minimum reprojection error**; otherwise do a **set-wise grid search** over candidate assignments, keeping the assignment with lowest reprojection error, plus a cross-check to reject the mirrored (top-view-flipped) solution. Verbatim intent: this "facilitates an effective model training process by deferring the disambiguation task until after the inference stage."
  Additionally a **grid of RANSAC reprojection-error thresholds** is searched and the lower-error result kept, and a **maximum allowable reprojection error** validates/masks keypoints; keypoints that would be derived from the homography itself are masked out of training when no homography is available.
- Ablation (Table VII): points-only refine and lines-only refine each help modestly or even hurt CR; **points + lines jointly is what gives the big jump** (JaC₅ 74.4 → 80.6 on SN22-center, 77.6 → 85.9 on WC14). **Direct lesson: predict both fret-line endpoints AND fit lines, then optimise jointly.**
- Failure modes they report are exactly ours: "close-up shots, where few or no landmarks are visible" — the short-baseline catastrophe from `00-diagnosis.md`.
- **Licence: GPL-2.0** (`https://github.com/mguti97/PnLCalib`). Fine for a personal tool; viral if distributed. Weights are released as GitHub release assets (SV/MV keypoint + line models, plus WC14/TSWC/WorldPose fine-tunes). Reusing their *weights* is useless (soccer semantics) but their **training loop, heatmap decoder, and disambiguation code are directly portable**.

### Ranking of candidate target representations for FretGuide

| Representation | Occlusion tolerance | Partial-view tolerance | Fret-index ambiguity | Sub-px precision | Label cost | Verdict |
|---|---|---|---|---|---|---|
| **4 ordered board corners** (or 1 OBB) | poor — a hand over a corner kills it | very poor — corners off-screen ⇒ no fit | n/a | corners are the *worst-localised* points (thin acute geometry), and error extrapolates inward | lowest | **Reject as primary.** This is what TapToTab did and it is why they only claim zone-level accuracy |
| **All fret-line endpoints, per-keypoint channel + visibility flag** (≈ 13 frets × 2 edges = 26 kpts, + nut + body-junction) | **good** — diagnosis says frets 3–7 hidden ⇒ 0.06 err | **good** if ≥ ~6 well-spread frets seen; degrades gracefully | solved by per-channel identity + PnLCalib-style deferred check | good; heatmap + soft-argmax gives sub-px | moderate | **PRIMARY CHOICE** — direct match to the spec in `00-diagnosis.md`, and identical in form to the sports SOTA |
| **Line-segment / heatmap-of-lines + fit** (TVCalib style) | **best** — a line survives partial occlusion because it is over-determined along its length | good | needs ordering logic | excellent along-normal, weak along-line | moderate | **Use as the SECOND head**, exactly as PnLCalib does. Lines are what make the fit robust |
| **Segmentation mask of the board + fitted quad** | good | moderate | none available — mask has no fret identity | mask boundary is ±2–4 px, and quad fitting to a mask is biased by the hand | cheap to label (SAM2 auto) | **Useful as a stage-1 ROI/crop only**, not as geometry |
| **Heatmaps of all 6×13 = 78 fret×string intersections** | good | good | severe — 78 near-identical blobs, huge channel count, and the *strings* move/vibrate and are occluded by fingers | fine | very high | **Reject.** Strings are a bad supervision target; derive them analytically from the fret geometry + scale-length model instead |
| **Direct pose/homography regression (8-DoF)** | brittle | brittle | n/a | poor — regressing H directly is well known to underperform keypoints (see 1909.08034 which had to add a learned-error optimiser to fix it) | cheapest | **Reject as primary**; acceptable as an initialiser |
| **Dense UV / NOCS-style coordinate map over the board** | **excellent** — every visible board pixel votes, so a hand covering 60 % still leaves thousands of correspondences | **excellent** | resolved densely and smoothly; no discrete matching at all | good with a robust PnP/homography solve over dense correspondences | labels come free once you have geometry (render the UV map from the same homography), so cost ≈ same as keypoints | **STRONG SECOND CHOICE / stretch goal.** Best occlusion behaviour of any option; more code to write; combine with RANSAC |

**Recommended target: a two-head, single-backbone model.**
1. Head A: 28 keypoint heatmaps (frets 0–12 × {bass edge, treble edge}, + nut centre, + a body-junction landmark) + 1 boundary channel, σ = 2 px Gaussians, half-resolution output, soft-argmax + per-keypoint confidence.
2. Head B: 13 fret-line heatmaps (thin line masks) — or, in the stretch version, a 2-channel dense UV map over the board plus a board-mask channel.
3. Post-processing: fit board homography from keypoints with RANSAC → PnL-style joint point+line refinement → temporal smoothing. `00-diagnosis.md` already shows 5-frame averaging buys 2.2×; BroadTrack (2412.01721) reports temporal modelling **halves** reprojection error in the sports case, which corroborates it.

**On fret-index ambiguity specifically:** our situation is *easier* than soccer. A guitar neck has (a) monotonically decreasing fret spacing (the ratio 2^(1/12) is a strong global cue — spacing alone determines absolute fret index given ≥ 3 frets and a known scale length), (b) unique inlay markers at 3/5/7/9/12, (c) an asymmetric nut/headstock end. So a hybrid is available and cheap: let the network give approximate identities, then **snap to the known one-guitar fret template by minimising reprojection error over the small discrete set of index offsets** — a 1-D search over ~13 hypotheses, far cheaper than PnLCalib's grid search. Because the guitar is fixed forever, the exact scale length and fret positions can be measured once with a ruler and hard-coded, making this snap essentially exact. **This is the single highest-value design decision in the project and it costs almost nothing.**

Also checked as analogs: chessboard/ChArUco corner detection (OpenCV `findChessboardCornersSB`, and deep variants) — relevant only as a labeling tool (§3), because a chessboard has no occlusion problem; and document-corner detection, which is the "4 corners" row above and shares its weaknesses.

## 3. Semi-automatic labeling of real video — the key insight

### 3.1 Markers-during-capture-only (the recommended core method)
Concept: mount printed fiducials **only while recording training data**, use them to compute the exact board-plane homography per frame, project the (once-measured) fret template through it to synthesise ground-truth keypoints for *every* frame, then train a model on crops that exclude the markers. At inference the markers are gone. This converts labeling from "hours per hundred frames" to "minutes per thousands of frames".

**The plane problem you already identified is real and is the whole design.** Body-mounted or headstock-mounted markers sit off the fretboard plane, so the homography they define is not the board's homography; any error in the marker-to-board rigid transform shows up as a systematic (not zero-mean) bias in every single label — the worst possible failure, because the model will faithfully learn the bias and no amount of temporal averaging removes it. Ranked options:

| Rig | Coplanarity | Bias risk | Practicality | Verdict |
|---|---|---|---|---|
| **A. Printed ChArUco strip clamped in the fretboard plane, alongside the neck** (e.g. thin card taped to a flat batten resting on the frets, extending past the board edge so it occupies image area *outside* the label region) | true coplanarity achievable to ~1 mm if the card rests on the fret crowns | low, and any residual is a measurable constant offset | easy, ~£0 (paper + card + clamp) | **BEST** |
| **B. Small ArUco tiles stuck directly onto the fretboard between frets** (low-tack vinyl, e.g. frets 1–2, 6–7, 11–12) | exactly coplanar (they *are* on the board, minus fret-crown height ≈ 1 mm) | very low | easy but they cover board area and must be masked/inpainted or the model learns to depend on them | **BEST for accuracy, use A+B together**; label region excludes the tiles |
| C. Markers on body/headstock + measured rigid offset | not coplanar | **high**, systematic | easy | Use only as a fallback/cross-check |
| D. Full 3D scan of the guitar + PnP against the mesh | exact, in 3D | low but depends on scan quality | photogrammetry session, hours of work | overkill for v1; revisit if A/B disappoint |
| E. Two-stage: ChArUco board held in the plane to calibrate camera intrinsics *once*, then markers on the guitar for extrinsics | best of both | low | one extra 5-minute session | **Do the intrinsics calibration regardless** — it removes lens distortion, which otherwise eats several px of your 5 px budget |

**Critical detail: labels must be derived from a per-guitar fret template, not from the markers alone.** Measure the real guitar once (nut-to-12th-fret distance, board width at nut and at fret 12, fret positions from the 17.817 rule or actual measurement). Then every label is `template_point → board_homography → image`, which is *exactly* the quantity `00-diagnosis.md` says the model must output. Two more free wins: (i) you get labels for **occluded** frets too (the homography knows where fret 5 is even when a finger covers it) — that is how you teach visibility flags properly, something a human labeler cannot do reliably; (ii) label noise is bounded by marker-detection noise, and ChArUco corner refinement is routinely sub-pixel (~0.1–0.3 px), i.e. ~10× better than the 5 px budget.

**Sanity check protocol before trusting the rig:** record a static shot, compute the projected fret lines, and overlay on the image at 4× zoom; visually confirm lines land on fret crowns across the whole neck; repeat at 5 camera angles. Also hold out a small set of *hand-labeled* frames as an independent test set — never evaluate only against marker-derived labels, since they share the rig's bias.

### 3.2 Propagation / label-once-then-track tooling (2026 state)
- **SAM 3** — Meta released SAM 3 on **2025-11-20**; **SAM 3.1** followed (`https://ai.meta.com/blog/segment-anything-model-3/`) adding "faster and more accessible real-time video detection and tracking with multiplexing and global reasoning". It introduces *Promptable Concept Segmentation* (segment all instances of a concept from a text or visual prompt) and `Sam3TrackerVideo` for *Promptable Visual Segmentation* — point/box/mask prompt on one frame, tracked across the video (`https://huggingface.co/docs/transformers/model_doc/sam3_tracker_video`, `https://docs.ultralytics.com/models/sam-3`). Practical use here: **prompt once, get a per-frame fretboard mask for a whole video** — excellent for the stage-1 ROI/crop and for auto-masking the hand, but SAM gives *regions, not fret identities*, so it cannot produce our keypoints. Treat it as a crop/mask generator. (Licence not confirmed in what I fetched — **flagged as unverified**; SAM 2 was Apache-2.0, SAM 3's terms should be checked before any redistribution.)
- **Point trackers (CoTracker / TAP-family)** — track a hand-clicked set of fret-line endpoints through a video. Genuinely useful for the *no-marker* fallback: label frame 0 by hand (28 points), propagate, spot-fix drift. Risk: point trackers drift under occlusion and on repetitive texture (frets are maximally repetitive), so drift correction still needs the fret-template snap from §2. Prefer the marker rig; keep this as plan B.
- **Active learning loop:** train on the marker-derived set, run on marker-free video, then hand-fix only the frames where the model's own fret-template reprojection error is high. This is cheap because the reprojection-error check is an *unsupervised* quality signal — you know when you are wrong without labels.

### 3.3 Annotation tools and 2026 pricing (verified where noted)
- **Roboflow** (`https://roboflow.com/pricing`, fetched 2026-07-31): **Public/free = $0, 15 credits/month, up to 250,000 images, 2 users, dataset must be public.** Core = **$79/mo annual or $99/mo monthly**, 50 credits/month, 3 users, private data, uncapped storage pay-as-you-go. "Data labeling suite w/ AI features" on all tiers. Enterprise-only outsourced labeling is quoted at **$0.10/bounding box, $0.20/polygon, $0.05/classification-or-keypoint** (— unclear whether $0.05 is per point or per keypoint *instance*; **flagged**. At per-point it would be 28 × $0.05 = $1.40/frame ⇒ $420 for 300 frames: not worth it versus the marker rig).
  For this project the **free public tier is adequate** (our data is one guitar in one room; publishing it is harmless and arguably useful).
- **CVAT** — open source, self-hostable free (`docker compose up`), supports keypoints/skeletons and interpolation between keyframes; cvat.ai cloud has a free tier with limits. Self-hosting is the zero-cost choice and keeps data local.
- **Label Studio** — Community edition is free/open source, supports KeyPointLabels and ML-backend-assisted prelabeling; Enterprise is quote-based.
- **Recommendation:** don't pay anyone. Write a ~150-line Python script that reads marker-derived labels and dumps YOLO-pose or COCO-keypoints JSON directly. Use CVAT locally only for the ~100-frame hand-labeled holdout/QA set. Annotation-tool spend: **$0**.

### 3.4 How few frames can a human realistically label by hand?
Empirical anchors:
- WorldCup-2014, *the* reference benchmark for sports-field registration, has **209 training images** and still supports JaC₅ ≈ 86 % after fine-tuning (PnLCalib Table II).
- TapToTab: **730** hand-labeled fretboard-segmentation images, multi-guitar, saturated their metric.
- Human throughput for 28 ordered keypoints with visibility flags, using interpolation between keyframes in CVAT: realistically **1.5–4 min/frame** cold, ~40 s/frame when interpolating a slow-motion clip. So **100 frames ≈ 2–4 hours; 300 frames ≈ 1–1.5 days.** That is the honest ceiling of hand labeling for a hobby budget, and it is *just* enough — which is precisely why the marker rig matters: it turns 300 frames into 30,000 for the same wall-clock time.
- Plan: **~5,000–20,000 marker-derived frames** (free) + **~100–150 hand-labeled frames** as an unbiased val/test set (~3–5 h of human time).

## 4. Synthetic data

## 5. Training practicalities

## 6. Personalization vs general model

## 7. Deployment (ONNX → OpenVINO, quantization vs keypoint precision)

## 8. Verdict: sequenced plan, days and dollars

## Links
