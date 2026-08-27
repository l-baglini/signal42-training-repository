# 05 — Audio Stack for FretGuide

**STATUS: COMPLETE**

Research date: 2026-07-31. Target machine: Ubuntu 25.10, kernel 6.17, Intel Core Ultra 7 155H
(Arc Xe-LPG iGPU + AI Boost NPU), 15 GB RAM, no NVIDIA GPU, PipeWire 1.4.7 @ 48 kHz float32,
Python 3.13.7, Node 22.14. No USB audio interface connected yet.

## Verdict so far

1. **FretGuide is not a low-latency audio product.** The guitar's own sound is already instant
   through the amp; we only update a visual overlay. Budget ~50 ms end-to-end and stop optimising.
2. **The binding constraint is the low-E analysis window, not the buffer size.** 82.41 Hz has a
   12.13 ms period; reliable YIN needs ~3.5 periods ⇒ **2048 samples @ 48 kHz (42.7 ms)**. Buffer
   size 256 frames (5.33 ms). Decouple window from hop: 2048-window / 256-hop.
3. **v1 stack:** PipeWire native or `sounddevice`/PortAudio capture at 48 kHz / 256 quantum → ring
   buffer → non-RT worker → decimate to 8–12 kHz → aubio `yinfft` (from **apt**, not pip) for
   monophonic + **harmonic-template scoring against the expected pitch set** for chords. No neural
   model needed for v1.
4. **Python 3.13 breaks most of the MIR ecosystem** (madmom dead, aubio PyPI stuck at 2019, essentia
   ships cp314-only wheels, basic-pitch pins TF<2.15.1). Plan to drive ONNX models yourself via
   `onnxruntime`/OpenVINO — which is also how you use the Arc iGPU / AI Boost NPU.
5. **Expectation-conditioning is real and peer-reviewed** (LadderSym, ICLR 2026: +29.5 F1 on missed
   notes from score conditioning) but not magic — *missed* notes (muted string) stay the hard case.
6. **Audio-only string ID caps out around 87.8% on held-out free play** (Fretiq, arXiv 2607.18303,
   verified). Good enough as a *prior*, not as an authority. Vision must be the arbiter of which
   string, audio the arbiter of which pitch. That division of labour is the design.
7. **Hardware: yes, buy an interface** — but mostly for the *input jack*, not the converters. This
   laptop has only `HDA Intel PCH SN6140 Analog` (a headset mic jack). See §6.

## 1. Real-time monophonic pitch detection

### The low-E problem, quantified from first principles
Standard tuning low E2 = **82.41 Hz**, period **12.13 ms**. Drop-D D2 = 73.42 Hz, period 13.62 ms.
Two independent floors apply:

1. **Time-domain floor (YIN/autocorrelation).** Any lag-based estimator needs at least ~2 periods in
   the analysis window to compute a correlation at the fundamental lag, and in practice 3–4 periods
   for a stable, octave-error-free estimate. At 82.41 Hz: 2 periods = 24.3 ms, 3 periods = 36.4 ms,
   4 periods = 48.5 ms. At 48 kHz that is **1164 / 1746 / 2328 samples**. So a YIN window of
   **2048 samples @ 48 kHz (42.7 ms, ≈3.5 periods of low E)** is the honest minimum for reliable
   low-E tracking; 1024 samples (21.3 ms, 1.76 periods) is *below* the floor and will octave-error
   or fail to lock on low E. This is the hard number the brief asked for.
2. **Frequency-domain floor (FFT/HPS).** Raw bin spacing = sr/N. To separate E2 (82.41) from F2
   (87.31) — 4.9 Hz apart — you need bin spacing ≲2.5 Hz, i.e. N ≳ 19,200 @ 48 kHz = 400 ms.
   Absurd for real time. Hence plain FFT peak-picking is unusable for low-E *without* interpolation.
   With parabolic/quadratic peak interpolation on a windowed spectrum you recover ~0.1 bin accuracy,
   so N = 4096 @ 48 kHz (85 ms, bin = 11.7 Hz) gives ~±1.2 Hz — enough for note ID but marginal for
   cents-accurate tuning. **This is why FFT+HPS is fine for chord/template work and bad for tuning.**

**The escape hatch, and it is important:** the *window* length and the *hop* are separate. You can
run a 2048-sample (42.7 ms) YIN window with a 256-sample (5.3 ms) hop, so you get a new estimate
every 5.3 ms while each estimate looks back 42.7 ms. Perceived responsiveness tracks the hop and
the onset detector, not the pitch window. Combined with an **onset-gated** design (see §7), the
user experiences "instant" because the onset fires within ~5–10 ms, and the pitch label is confirmed
~30–45 ms later — which is still inside the tolerance window for visual feedback.

**Second escape hatch: downsample.** Low-E analysis does not need 48 kHz. Decimate to 8 kHz for the
pitch stage: 2048 samples @ 8 kHz = 256 ms (way more than needed), and a 4-period low-E window is
only 388 samples. YIN cost is O(W²) or O(W log W), so decimating by 6 cuts pitch-stage CPU ~36x.
Keep the full 48 kHz path only for the timbre/string-ID features (which need the high harmonics).

### Algorithm / implementation comparison
| Method | Typical window for low E | Latency character | Accuracy on guitar | Implementations |
|---|---|---|---|---|
| Autocorrelation (plain) | ≥3 periods (~36 ms) | window-bound | octave errors common; needs post-filtering | trivial to write in TS/Rust/NumPy |
| **YIN** (2002) | 2048 @ 48 k (42.7 ms) | window-bound, hop-free | very good mono; the workhorse | `aubio` (`yin`, `yinfft`, `yinfast`), Essentia `PitchYin*`, librosa `yin`, Rust `pitch-detection` crate |
| **pYIN** (2014) | same + Viterbi over frames | **not causal** — HMM needs future frames | best classical mono accuracy | librosa `pyin`, Vamp pYIN plugin |
| FFT + HPS | 4096 @ 48 k (85 ms) + interp | window-bound, coarse | good note ID, poor cents | any FFT lib; easy in AudioWorklet |
| **CREPE** (ICASSP 2018) | 1024 @ 16 kHz = **64 ms**, 10 ms hop, range 50–2006 Hz | 64 ms window + heavy compute | SOTA-class clean; degrades in noise | `crepe` (TF, dead on 3.13), `torchcrepe` 0.0.24 |
| **SwiftF0** (2025-08-25) | 16 kHz, 256-sample hop (16 ms), range **46.875–2093.75 Hz** | ~42x faster than CREPE; 132 ms per 5 s audio on CPU (≈38x RT) | 91.80% harmonic mean @ 10 dB SNR, **>12 pts better than CREPE**; only −2.3 pts vs clean | `pip install swift-f0`, ONNX; 95,842 params; CC BY 4.0 |
| **PESTO** (TISMIR 8(1):334–352, 2025) | VQT input, configurable step (10 ms typical) | **"less than 10 ms"**, streamable VQT w/ cached convs; ONNX **~0.7 ± 0.03 ms** inference | competes with supervised methods, best cross-dataset generalisation (MIR-1K, MDB-stem-synth, PTDB) | `pip install pesto-pitch`, torch + TorchScript/ONNX export, `streaming=True` w/ circular buffers; CC BY 4.0 |
| SPICE (Google, 2019) | 1024-ish, TF-Hub | self-supervised, relative pitch | superseded by the above | TF-Hub only — TF on 3.13 is a problem |

**Read:** For FretGuide the standout is **SwiftF0** for robustness (its low bound of 46.875 Hz was
clearly chosen to cover bass/low guitar, and it is ONNX so it drops straight into `onnxruntime` or
OpenVINO on the Arc iGPU/NPU) and **PESTO** for the lowest-latency streaming path (0.7 ms inference,
explicit streaming mode, a Max/MSP C++ wrapper `QosmoInc/pesto_tilde` proving it runs in an audio
callback). But note both are 16 kHz-ish models with a fixed internal window — they do not escape the
physics above; they just do the same job with better noise robustness than YIN.
For v1, **aubio's `yinfft` at 2048/256 on a decimated 8–12 kHz stream is almost certainly enough**,
because a DI electric guitar signal has an SNR that makes the neural robustness gains moot.

### Repos (verified live, stars/pushed as of 2026-07-31)
- `lars76/swift-f0` — 175 stars, Python, last push 2025-09-02
- `SonyCSLParis/pesto` — 297 stars, Python, last push 2025-10-15
- `QosmoInc/pesto_tilde` — 48 stars, C++ Max/MSP external for streaming PESTO, push 2025-07-24
- `a5632645/swift_f0_cpp` — C, minimal ONNX inference example for SwiftF0
- `marl/crepe` — original CREPE (ICASSP 2018) pretrained model

## 2. Chord / polyphonic detection

### Python 3.13 reality check (queried PyPI + local apt, 2026-07-31)
This is the single most under-appreciated constraint. Most MIR packages are stale. Measured facts:

| Package | Latest ver | Released | Python support | Verdict on Py 3.13.7 |
|---|---|---|---|---|
| `aubio` (PyPI) | 0.4.9 | **2019-02-08** | no classifiers, **sdist only**, 1 file | ❌ won't pip-install cleanly on 3.13 |
| `python3-aubio` (Ubuntu 25.10 *questing/universe*) | 0.4.9-4.7build1 | — | built for the distro's Python 3.13 | ✅ **`sudo apt install python3-aubio aubio-tools libaubio5`** — the way to get aubio here |
| `librosa` | 0.11.0 | 2025-03-11 | classifiers incl. 3.13, `py3-none-any` | ✅ works (pure Python) — but batch-oriented, not RT |
| `essentia` | 2.1b6.dev1438 | 2026-05-19 | wheels are **cp314 only** (macOS arm64/x86_64, manylinux2014_x86_64) | ⚠️ no cp313 wheel in the current dev build; needs source build or a 3.14 venv |
| `madmom` | 0.16.1 | **2018-11-14** | classifiers max 3.7 | ❌ effectively dead on 3.13 (Cython + removed NumPy aliases) |
| `crepe` (TF, orig.) | 0.0.16 | 2024-08-19 | classifiers max 3.6, needs TF | ❌ |
| `torchcrepe` | 0.0.24 | 2025-05-16 | `py3-none-any`, needs torch | ✅ viable (torch 2.13.0, 2026-07-08, ships cp313 wheels, `>=3.10`) |
| `basic-pitch` | 0.4.0 | 2024-08-16 | `py2.py3-none-any` but pins `tensorflow<2.15.1` on Linux | ⚠️ TF path dead on 3.13; must drive the bundled **ONNX** model via `onnxruntime` yourself |
| `autochord` | 0.1.4 | **2021-10-07** | — | ❌ stale, unmaintained |
| `sounddevice` | 0.5.5 | 2026-01-23 | `>=3.7`, ships bundled PortAudio wheels | ✅ actively maintained, good sign |
| `numpy` / `scipy` | 2.5.1 / 1.18.0 | 2026-07-04 / 2026-06-19 | `>=3.12`, cp313 wheels | ✅ |

**Read:** the "just use madmom/aubio/essentia from pip" plan does not survive contact with Python
3.13. Practical consequences: (1) get aubio from apt, not pip; (2) treat librosa as an offline/
analysis tool only; (3) if you want essentia, expect a source build or a separate 3.14 venv;
(4) budget your own ONNX Runtime inference wrapper rather than relying on model authors' Python
packaging. Point (4) is actually good news, because it is also how you get OpenVINO/NPU acceleration.

### Polyphonic / tablature models
| System | Where | Real-time? | Weights? | Notes |
|---|---|---|---|---|
| **Spotify Basic Pitch** (ICASSP 2022) | https://github.com/spotify/basic-pitch — **5,357 stars, last push 2025-11-13, actively maintained, Apache-2.0**; PyPI 0.4.0 (2024-08-16) | ⚠️ Architecturally yes; the shipped Python API is file-in/MIDI-out batch, so you drive the ONNX graph yourself. | ✅ **bundled in the repo/wheel in four formats** | **Model size verified by inspecting the repo tree: `nmp.onnx` = 230,444 bytes (225 KB); `nmp.tflite` = 204,448 B; CoreML `.mlpackage` weights 146 KB; TF SavedModel 1.08 MB graph + 219 KB weights.** A 225 KB ONNX file is trivially cheap — this is the key finding. TF dep pinned `<2.15.1` ⇒ the pip path is broken on Py 3.13, **but you can bypass `basic_pitch` entirely and load `nmp.onnx` with `onnxruntime` (or convert to OpenVINO IR for the Arc iGPU/NPU).** Instrument-agnostic multipitch + onsets + pitch bend. **Best polyphonic option for v1.5.** |
| **TabCNN** (Wiggins & Kim, ISMIR 2019) | frame-level CNN on CQT, GuitarSet | yes (tiny) | community reimpls | The baseline everything is measured against. Predicts fret per string directly. |
| **FretNet** (Cwitkowitz et al., arXiv 2212.03023) | https://github.com/cwitkowitz/guitar-transcription-continuous | yes (TabCNN-class backbone) | ✅ code | Continuous-valued pitch contour streaming, so it captures bends/vibrato. "Comparable MPE to TabCNN, slightly better tablature, immensely better as pitch tolerance tightens." |
| **TabInception / Swin / ViT for tab** (Springer, *Advances in Computer Graphics*, 2023-12, doi 10.1007/978-3-031-50069-5_2) | "Leveraging Computer Vision Networks for Guitar Tablature Transcription" | yes-ish | paper only | TabInception beats TabCNN on multipitch precision + tablature precision/F; Swin best on recall; ViT best multipitch F. **Note the irony: these are vision architectures applied to spectrograms, not to video.** |
| **CRNN on GuitarSet** | https://github.com/trimplexx/music-transcription | probably | ✅ code | Claims **0.8736 MPE F1 on GuitarSet**, "surpassing SOTA for models trained exclusively on GuitarSet". Unreviewed community claim — flagged. |
| **SynthTab** (arXiv 2309.09085v4) | synthesized DadaGP-derived training data | n/a (data) | dataset method | The standard answer to GuitarSet being only ~3 hours. |
| **TART** (arXiv 2510.02597, 2025-10-02) | 4 stages: piano-transcription model adapted to guitar → MLP technique classifier → **Transformer string/fret assignment** → LSTM tab generation | ❌ no (4-stage, transformer) | not stated in abstract | Claims first system to produce fingerings **and** expressive labels (slides, bends, percussive hits) from audio. No GuitarSet numbers in the abstract — ⚠️ unverified. |
| **MT3** (Google, ICLR 2022) | multi-task multi-track transformer | ❌ definitively not — encoder-decoder over long segments | ✅ weights (T5X/JAX) | Great offline, wrong tool here. JAX/T5X on Py 3.13 is a fight. |
| **Omnizart** | Taiwan AcademiaSinica toolkit | ❌ batch | ✅ | Unmaintained relative to the above; TF-based, same 3.13 problem. |
| **Chordino / NNLS-Chroma** (Mauch) | Vamp plugin, C++ | ✅ yes, streaming, very cheap | ✅ | NNLS chroma + HMM chord decode. Old (2010) but rock-solid and *actually real-time*. Callable via `vamp` host / `sonic-annotator`. |
| **madmom** `DeepChromaProcessor` / `CNNChordFeatureProcessor` | https://github.com/CPJKU/madmom | ✅ designed for online use | ✅ | **But 0.16.1 is from 2018-11-14 and will not install on Py 3.13.** Dead end unless you vendor it. |
| **BTC** (Bi-directional Transformer for Chord recognition, Park et al. 2019) | https://github.com/jayg996/BTC-ISMIR19 | ❌ bidirectional ⇒ needs the whole segment | ✅ | Accurate, non-causal. Offline only. |
| **autochord** | PyPI 0.1.4 (2021-10-07) | ❌ | ✅ | Stale; wraps a Keras model. Skip. |

**Read:** nothing in the polyphonic column is both (a) real-time, (b) installable on Python 3.13
today, and (c) accurate on guitar chords. The closest is **Basic Pitch's ONNX graph driven manually**
or **Chordino**. This is a strong argument for the expectation-conditioned approach in §3 — you skip
this entire table.

## 3. Expectation-conditioned verification (primary design)

### Prior art that this framing maps onto
- **LadderSym** (arXiv 2510.08580, submitted 2025-09, revised 2026-03, **accepted ICLR 2026**):
  "A Multimodal Interleaved Transformer for Music Practice Error Detection". Task is exactly ours in
  spirit: compare a learner's audio against a known symbolic score and report errors. Two-stream
  encoder (audio + symbolic) with inter-stream alignment and symbolic prompts in the decoder;
  explicitly argues **late fusion limits inter-stream alignment**. Reported: missed-note F1 on
  MAESTRO-E 26.8% -> 56.3%; extra-note F1 72.0% -> 86.4%. Datasets MAESTRO-E, CocoChorales-E.
  Not real-time (no latency numbers).
  - **Read, two ways.** (a) Positive: conditioning on the expected score is a recognised,
    peer-reviewed way to make transcription-adjacent tasks tractable, and it buys large gains
    (+29.5 F1 on missed notes). (b) Sobering: even *with* the score, missed-note F1 is 56%. But
    that is dense polyphonic piano with pedal, over whole pieces. Our problem is 1–6 known pitches
    from one guitar with a DI signal and a UI that knows exactly which chord it just asked for.
    Do not read 56% as our expected ceiling; do read it as "score conditioning is not magic, and
    *missed* notes (a muted/buzzed string) are much harder than *extra* notes."
  - Asymmetry worth designing around: extra notes are easy to detect (energy where none expected),
    missed notes are hard (absence of evidence vs. weak evidence). For FretGuide, a muted string is
    exactly the "missed note" case, so expect that to be the weakest feedback channel.

### How much easier is the constrained problem? Quantified
The app knows the target. Concretely, for a target chord the app knows an exact set of 1–6 MIDI
pitches, and (because it drew the dots) which string each is on. Compare the hypothesis spaces:

| Problem | Hypothesis space per frame |
|---|---|
| Open polyphonic transcription | any subset of ~44 guitar pitches (E2–C6) with ≤6 elements ≈ 7.1 million subsets |
| Chord-vocabulary classification | ~24–60 chord labels (major/minor × 12, + 7ths…) |
| **FretGuide: verify one known 6-vector** | **2⁶ = 64** (each expected string: sounded correctly / not) — and if you only need a single "correct?" bit, **2** |

That is a reduction of roughly **5 orders of magnitude** in the decision space, and it changes the
problem class from *estimation* to *detection*. In detection you get to use a matched filter, which
is provably optimal for known signals in additive noise — you are no longer guessing, you are
measuring the response at 6 known frequencies and their known partials. This is why the framing in
the brief is correct and why v1 should not touch a transcription model.

### Recommended scoring design (concrete)
Signal chain per analysis frame (window 4096 @ 48 kHz, hop 512, Hann):
1. **Onset gate.** Only score in a window that starts at a detected onset (aubio `onset` with
   `specflux` or `hfc`). Between onsets, hold the last verdict. This kills the two worst failure
   modes: scoring silence, and scoring the decay tail after the player has moved on.
2. **Build the expected template.** For each expected pitch *p* with f0 = 440·2^((p−69)/12), generate
   expected partial frequencies. For guitar, use the **stiff-string / inharmonicity** model
   f_n = n·f0·√(1 + B·n²), with B a per-string constant fitted once during calibration
   (see arXiv 2106.13030, "Design of a fretboard using the stiff string equation", for the physics).
   B is small for guitar (~1e-5–1e-4) but non-zero and, critically, **differs per string** — that is
   the cue in §4. Weight partials with a per-string, per-fret amplitude profile learned during
   calibration.
3. **Score.** Two complementary scores, both cheap:
   - **Harmonic salience / spectral peak matching:** S(p) = Σ_n w_n · |X(f_n)| measured with
     quadratic-interpolated peaks in a ±50 cent band. Normalise by total frame energy.
   - **Constrained NMF:** fix the dictionary W to the expected templates (plus one "everything else"
     noise atom) and solve only for the activations H (non-negative least squares, 6–7 columns).
     This is a handful of ms in NumPy and gives per-note activation directly, with the templates
     *known* rather than learned — far more robust than blind NMF.
4. **Decide** by thresholding activations, with a hysteresis so the UI doesn't flicker.
5. **Also score the "unexpected energy" channel** — energy at pitches *not* in the template. High
   unexpected energy at a semitone offset from an expected pitch ⇒ "wrong fret by one".

### Honest feedback granularity
| Feedback claim | Confidence | Why |
|---|---|---|
| "Chord correct / incorrect" | **high** — this should be near-perfect on a DI signal | Matched-filter detection over 64 hypotheses; the pitch set either rang or it didn't |
| "You're a semitone flat/sharp" (wrong fret by 1) | **high** | A semitone is 100 cents = 5.9% in frequency; trivially resolvable with peak interpolation at 4096 samples |
| "You're X cents out of tune" | **high** for open strings / single notes, medium in a chord | Needs the tuning check of §7 first |
| "String 3 is muted / not ringing" | **medium** | This is LadderSym's hard "missed note" case. A lightly-fretted note that buzzes still has an f0 peak. Confusable with the player simply not having strummed that string. Mitigate by requiring the *sustain* of that partial set, not just its onset. |
| "String 3 is fretted at the wrong fret (and here's what you played)" | **medium** | Requires attributing an *unexpected* pitch to a string — falls back on §4 |
| "Your 2nd finger is on the wrong string" | **low from audio alone** | Needs vision (§4). Audio can say "an A rang instead of a B"; only the camera knows which finger |
| "Wrong voicing but right chord" (e.g. played open C instead of barre C) | **medium** | Pitch classes match, absolute pitches don't; detectable, but you must decide whether to be pedantic |

**The one thing not to promise:** per-string diagnosis from audio alone in a full 6-string strum.
Ship "chord correct?" + "which expected pitch is missing?" and let vision handle the rest.

## 4. String+fret ambiguity and audio↔vision fusion

### Fretiq (arXiv 2607.18303) — VERIFIED, and it matters a lot
- URL: https://arxiv.org/abs/2607.18303 — "Fretiq: Browser-Native Electric Guitar String
  Classification via Engineered Spectral Features and Held-Out Free-Play Evaluation",
  Aadi Garg, submitted 2026-07-17 (v1). Categories cs.SD, cs.LG, eess.AS.
- Confirmed numbers: **97.1% shuffled frame-level validation** accuracy over 322,215 balanced
  frames; **87.8% on held-out free-play** (~103,000 frames). The gap between those two numbers is
  the honest number — shuffled frame-level validation leaks neighbouring frames of the same note
  into train and val, so 97.1% is optimistic and 87.8% is the one to design against.
- Features: 26-dim = frequency band energies + spectral statistics + 13 MFCCs. Ablation says MFCCs
  are the main driver (92.2% -> 97.1%). So this is timbre classification, not inharmonicity physics.
- "Comparison Training": deliberately alternate recordings of adjacent open-string / 5th-fret pairs
  (i.e. the exact unison pairs that are ambiguous). Reduced one confusion pattern by 44%, mixed
  elsewhere.
- Scope, stated by the author: "preliminary single-instrument, single-player". No hexaphonic pickup,
  no fretboard sensor, no camera, no multi-mic. Runs in-browser; TypeScript inference with parity
  against a Python training pipeline.
- **Read:** this is the single most relevant prior art for FretGuide. Its "overfit to one guitar
  forever" philosophy is exactly our situation (one player, one instrument, one pickup, one
  interface). It also proves the plumbing we want (TS/browser-grade feature extraction is enough;
  no deep net required). Caveats: single author, preliminary, one player — treat 87.8% as the
  ceiling for *audio-only* string ID on a well-calibrated personal model, not a general result.
  For FretGuide this means: audio-only string ID is good enough for confidence weighting, not good
  enough to be the sole authority on "which string did you play".

### Related 2024–2026 tablature/transcription work (arXiv, dates verified)
| Paper | arXiv | Date | Relevance |
|---|---|---|---|
| Velocity Prediction in Automatic Guitar Transcription | 2606.24912 | 2026-06-19 | synthetic data + transfer learning; velocity, not string ID |
| TART: Technique-Aware Audio-to-Tab Guitar Transcription | 2510.02597 | 2025-10-02 | 4-stage end-to-end audio->tab incl. string/fret assignment + technique |
| Fretting-Transformer (MIDI->tab, T5) | 2506.14223 | 2025-06-17 | symbolic only: resolves string/fret from MIDI, no audio |
| Generalizability to Tone/Content Variations, Amp-Rendered Electric Guitar | 2504.07406 | 2025-04-10 | tone-aware transformer; amp/tone robustness |
| GAPS: classical guitar dataset + benchmark | 2408.08653v2 | 2024-08-16 | 14 h audio-score aligned, largest real guitar audio dataset |
| High Resolution Guitar Transcription via Domain Adaptation | 2402.15258 | 2024-02-23 | piano-transcription model adapted to guitar |
| Feasibility & Pairwise Likelihood in DL Tablature Transcription | 2204.08094 | 2022-04-17 | playability constraints from symbolic tab (pre-window but load-bearing) |

Note: arXiv full-text search for `abs:"audio-visual" AND abs:guitar` returns **0 results**
(queried 2026-07-31). Audio-visual *guitar* transcription is a very thin literature — flagged.

### Why audio can partially resolve string/fret: the physics is real
The ambiguity: string 6 fret 5 and string 5 fret 0 are both A2 (110 Hz). Same f0, different sound.
Three physically-grounded cues:

1. **Inharmonicity.** A real string has bending stiffness, so partials are
   f_n = n·f0·√(1 + B·n²) rather than n·f0. B scales roughly as d⁴/(T·L²) — **fourth power of string
   diameter**, inverse square of speaking length. For the A2 example: string 6 fret 5 is a much
   thicker string with a *shorter* speaking length; both factors push B up. String 5 open is thinner
   at full length; B is lower. So B is a **monotonic, deterministic, per-(string,fret) signature**,
   not a statistical artefact. Measured B for guitar/piano-class strings ranges ~0.0001 in the
   midrange up to ~0.002 for the lowest bass strings.
   - Classic prior art: *Inharmonicity-Based Method for the Automatic Generation of Guitar Tablature*
     (Barbancho et al., IEEE TASLP) — extracts tablature from audio by using inharmonicity to find
     the string/fret combinations in each chord. This is exactly the technique, and it predates ML.
   - Supporting perceptual work: Järveläinen et al., *Perceptibility of Inharmonicity in the
     Acoustic Guitar* / *Audibility of inharmonicity in string instrument sounds* — inharmonicity is
     **near the JND for the four lowest strings and imperceptible on the two highest**. That is the
     honest limit: **the inharmonicity cue is strong on strings 6/5/4/3 and essentially absent on
     2/1.** Convenient, because low strings are where beginners' chord errors cluster.
2. **Timbre / spectral envelope.** Wound vs plain strings, pickup position relative to the vibrating
   length, and the different nodal patterns at different frets all change the harmonic amplitude
   profile. This is what Fretiq's MFCCs capture, and the ablation (92.2% → 97.1% from adding MFCCs)
   says timbre carries more usable signal than the hand-designed band energies.
3. **Attack transient / pick position.** Weak and inconsistent; I would not build on it.

### The GuitarSet lever
- **GuitarSet** (Xi, Bittner, Ye, Newbold, Bello — ISMIR 2018; Zenodo records 1492449 and 3371780;
  website guitarset.weebly.com; also wrapped by `mirdata`) recorded with a **hexaphonic pickup — one
  audio channel per string** — which is what makes per-string ground truth possible at all. It is the
  reason TabCNN/FretNet/SynthTab exist.
- ⚠️ I could not verify from the search snippets the exact hours / number of players / licence. It is
  commonly cited as ~3 hours from 6 players; **verify before relying on those figures.**
- **Read for FretGuide:** GuitarSet is small, recorded on *other people's* guitars with *another*
  pickup. A model trained on it will transfer poorly to one specific instrument through one specific
  Scarlett. Fretiq's insight is the right one for us: **don't use GuitarSet, collect 20 minutes of
  your own guitar.** A per-instrument calibration pass (play every string at every fret 0–12 once,
  ~72 notes, twice = ~5 minutes) gives you a labelled dataset that is perfectly matched to the
  deployment condition and lets you *fit B per string directly* rather than learning it. That is
  both cheaper and better than any transfer-learning approach.

### Playability constraints — cheap and effective
Independent of both audio and vision: given a target chord shape the app *drew*, the set of plausible
(string, fret) assignments is tiny. arXiv 2204.08094 (*A Data-Driven Methodology for Considering
Feasibility and Pairwise Likelihood in Deep Learning Based Guitar Tablature Transcription Systems*)
and Fretting-Transformer (2506.14223) both show that enforcing playability/hand-span constraints
improves string/fret assignment materially. For FretGuide this is nearly free: the expected shape is
a hard prior, and any hypothesis requiring a >4-fret span or two fingers on one fret-string cell is
rejected outright.

### Audio↔vision fusion: real technique or wishful thinking?
**It is a real technique, the literature is thin but non-empty, and for FretGuide specifically it is
the right architecture. Here is the honest case.**

Verified prior art (not much, and mostly small venues — this is the flag):
| Work | Venue / date | What it does |
|---|---|---|
| *An Audio-Visual Framework for Transcription and Fingering Optimization in Bass Guitar Performance* | **ACM UIST 2025 Adjunct**, doi 10.1145/3746058.3758448 | Detects strings, frets and finger positions from video, then a Bi-LSTM estimates the optimal fingering sequence. (Abstract only — dl.acm.org returned 403 to automated fetch, so details are from the search snippet: ⚠️ partially unverified.) |
| *TapToTab: Video-Based Guitar Tabs Generation using AI and Audio Analysis* | arXiv 2409.08618, 2024-09-13 | **YOLO real-time fretboard detection + Fourier-based note identification.** Explicitly the two-modality architecture. Abstract claims "substantial improvements in detection accuracy and robustness" but gives **no numbers** — ⚠️ unverified magnitude. |
| *Automatic Performative Transcription of Guitar Music Based on Multimodal Network* | Springer, 2025, doi 10.1007/978-981-96-4783-5_4 | Multimodal audio+visual guitar transcription |
| *Automatic Music Transcription using Audio-Visual Fusion for Violin Practice in Home Environment* | (older, violin) | Same idea on violin; establishes the pattern for bowed strings |
| *Audio-visual guitar transcription* (Schutz et al.) | pre-2024, academia.edu copies | Early statement of the problem |
| *Joint Transcription of Acoustic Guitar Strumming Directions and Chords* | arXiv 2508.07973, 2025-08-11 | Chords + strumming direction; uses **motion sensor** data alongside mic audio — i.e. the same insight (a second modality resolves what audio can't) with an IMU instead of a camera |
| *PianoVAM: A Multimodal Piano Performance Dataset* | arXiv 2509.08800, 2025-09 | Multimodal (video + audio + MIDI) performance dataset for piano — shows the field is actively building A/V datasets |
| *LadderSym* | arXiv 2510.08580, ICLR 2026 | Not vision, but the key methodological point: **late fusion limits inter-stream alignment** |

**Why fusion genuinely beats either alone here — the information-theoretic argument.**
The two modalities fail in *orthogonal* ways, which is the precondition for fusion to help:
- **Vision knows position, not sound.** A camera can see a fingertip at (string 5, fret 2) with high
  spatial confidence. What it *cannot* know: whether the string actually rang, whether it was muted
  by an adjacent finger, whether the fret was pressed hard enough, whether the note was in tune.
  Occlusion by the strumming hand and by the player's own fretting hand is the dominant failure mode.
- **Audio knows sound, not position.** It knows the exact pitch set to a few cents and knows an onset
  occurred. It cannot reliably say which string, capping around Fretiq's **87.8% held-out**.
- Vision's errors are driven by occlusion and lighting; audio's errors are driven by unison ambiguity
  and polyphony. These are uncorrelated. Combining an 87.8% audio string classifier with a vision
  string estimate — even a mediocre one — via a joint posterior over (string, fret) with the
  playability prior should land materially above either. I will not invent a number for that; **no
  paper I found reports an audio-only vs. audio+visual ablation on guitar string ID**, and that is
  the single biggest gap in this research.

**Where it becomes wishful thinking — be honest about these:**
1. **Fine-grained fret localisation from a laptop webcam is hard.** Fret spacing near fret 12 on a
   25.5" scale is ~20 mm, and at typical laptop-camera distance/resolution with the neck at an angle,
   you are trying to resolve a few pixels through motion blur. The existing overlay work in this repo
   (ArUco markers) helps enormously — that is a real advantage over the cited papers, which do
   fretboard detection from scratch. **The markers are the thing that makes vision reliable enough
   to arbitrate.**
2. **Occlusion is not a corner case, it is the normal state.** In a barre chord the fretting hand
   covers the strings being fretted. Vision will often see the *hand*, not the *fingertips*.
3. **Temporal alignment is a prerequisite, not a detail** (see §7). LadderSym's finding that late
   fusion limits alignment applies: if your audio onset and your video frame are 40 ms apart with
   unknown sign, fusion actively *hurts*.
4. **You do not need it for v1.** "Did the right pitch set sound?" needs zero vision. Fusion only
   buys you the *per-string diagnosis*, which is a v2 feature.

**Recommended fusion design (late fusion, but with explicit alignment):**
Do not build an end-to-end multimodal net. Build a small **Bayesian arbiter** over the 6 strings:
- Vision emits, per frame, P_vis(fret | string) from fingertip positions in marker-rectified
  fretboard coordinates, plus an occlusion/confidence flag per string.
- Audio emits, per onset, the detected pitch set, plus P_aud(string | pitch) from the fitted-B +
  MFCC classifier (Fretiq-style, trained on your own 5-minute calibration).
- A hard **playability + expected-shape prior** P(assignment).
- Posterior ∝ P_vis · P_aud · P(assignment), argmax over the ≤64 legal assignments. Exhaustive search
  is trivially cheap at that size.
- Fall back to audio-only when the occlusion flag is set, and to vision-only when no onset fired.

This is honest, debuggable, needs no new dataset beyond your own calibration, and degrades gracefully.
It is also, notably, *not* what any of the cited papers do — they all train joint networks. For a
one-instrument one-player product the explicit-prior version should beat them.

## 5. Latency & plumbing on this machine (PipeWire 1.4.7)

### Measured current state (run on the target box, 2026-07-31)
```
$ pw-metadata -n settings
clock.rate        = 48000
clock.allowed-rates = [ 48000 ]
clock.quantum     = 1024      # = 21.33 ms  <-- far too big
clock.min-quantum = 32        # = 0.67 ms
clock.max-quantum = 2048
clock.force-quantum = 0
$ pw-cli info 0 | grep clock
default.clock.quantum-limit = 8192 ; default.clock.quantum-floor = 4
clock.power-of-two-quantum  = "true"
$ arecord -l
card 0: PCH [HDA Intel PCH], device 0: SN6140 Analog   # <-- the ONLY capture device
```
Also present, already installed (this box is already a pro-audio box): `pipewire-jack 1.4.7-3ubuntu2`,
`pw-jack`, `qjackctl 1.0.4`, `qpwgraph 0.9.5`, `jack-example-tools`, `a2jmidid`, `guitarix 0.46.0`,
`wireplumber 0.5.10`, plus KXStudio-packaged `cadence`/`catia`/`ladish`. RT limits are configured
(`/etc/security/limits.d/25-pw-rlimits.conf` and `audio.conf`). CPU: 16 cores / 22 threads.

⚠️ **Conflict to fix:** both `jackd2 1.9.22` **and** `pipewire-jack` are installed. `pipewire-jack`
provides a drop-in libjack, so do **not** start `jackd` — run JACK-API clients through `pw-jack`
instead. Having real jackd running will fight PipeWire for the device.

### Setting the quantum — concrete commands
Temporary (survives until reboot / until you unset it), the one to use while experimenting:
```bash
# force a 128-frame quantum = 2.67 ms at 48 kHz
pw-metadata -n settings 0 clock.force-quantum 128
# back to dynamic
pw-metadata -n settings 0 clock.force-quantum 0
```
Note `clock.max-quantum` is currently 2048 and `min-quantum` 32, so 64/128/256 are all already legal.
`clock.power-of-two-quantum = true` means non-power-of-two requests get rounded.

Persistent, via a drop-in (the `/etc/pipewire` dir does not exist yet on this box — create it):
```bash
sudo mkdir -p /etc/pipewire/pipewire.conf.d
sudo tee /etc/pipewire/pipewire.conf.d/99-fretguide-lowlatency.conf >/dev/null <<'EOF'
context.properties = {
  default.clock.rate          = 48000
  default.clock.quantum       = 256
  default.clock.min-quantum   = 64
  default.clock.max-quantum   = 2048
}
EOF
systemctl --user restart pipewire pipewire-pulse wireplumber
```
(Per-user equivalent: `~/.config/pipewire/pipewire.conf.d/99-fretguide.conf`. Drop-in dicts merge
and override; arrays append. Search order: `$XDG_CONFIG_HOME/pipewire/` → `/etc/pipewire/` →
`/usr/share/pipewire/`.)

Per-client quantum request (better than forcing it globally — only your app gets the small buffer):
```bash
PIPEWIRE_LATENCY=128/48000 python3 fretguide_audio.py     # native/PulseAudio clients
PIPEWIRE_QUANTUM=128/48000 pw-jack python3 fretguide.py   # JACK-API clients
```
Monitor actual achieved quantum and xruns live with `pw-top` (watch the `ERR` column).

### Which API to capture with
| Path | Realistic quantum | Verdict for FretGuide |
|---|---|---|
| **PipeWire native** (`libpipewire`, `pw_stream`) | 32–256 | lowest overhead, best integration, but C API; no first-class Python binding |
| **JACK API via `pipewire-jack`** (`pw-jack`) | 64–256 | already installed; `PIPEWIRE_QUANTUM` respected; `jack` Python bindings exist and are callback-based. Good middle ground |
| **ALSA via `pipewire-alsa`** (default `alsa` device) | 128–512 | extra conversion layer; fine but not the lowest |
| **ALSA direct `hw:0`** (bypass PipeWire) | 32–128 | lowest possible, but you **lose the device** to other apps and lose PipeWire routing. Only worth it if all else fails |
| **PortAudio / `sounddevice`** | 128–256 | `sounddevice` 0.5.5 (2026-01-23) bundles PortAudio wheels, works on 3.13. PortAudio will route via ALSA→PipeWire; adds one buffer of latency. **Best effort/complexity ratio for a Python prototype** |
| `cpal` (Rust) | 64–256 | ALSA backend; good if the DSP goes to Rust |
| `miniaudio` (C, single header) | 128–256 | trivial to embed; ALSA/PulseAudio backends |
| JUCE | 64–256 | overkill unless you want plugin hosting |

### Latency budget (48 kHz)
| Stage | 64 frames | 128 frames | 256 frames | 1024 (current default) |
|---|---|---|---|---|
| One buffer period | 1.33 ms | 2.67 ms | 5.33 ms | 21.33 ms |
| Capture + app round of buffering (~2 periods typical) | 2.7 ms | 5.3 ms | 10.7 ms | 42.7 ms |
| + USB interface hardware/driver (class-compliant, typical) | +2–4 ms | +2–4 ms | +2–4 ms | +2–4 ms |
| + low-E pitch window (2048 @ 48 k, §1) | +42.7 ms | +42.7 ms | +42.7 ms | +42.7 ms |
| **Total to a confirmed low-E pitch label** | **~48–50 ms** | **~50–52 ms** | **~56–58 ms** | **~88–90 ms** |
| Total to an *onset* event (no pitch needed) | ~5–7 ms | ~7–9 ms | ~13–15 ms | ~45–47 ms |

**Read:** the buffer size barely matters compared to the pitch window. Going from 1024 to 256 saves
32 ms and costs nothing; going 256 → 64 saves a further 8 ms and buys xrun risk. **Use 256, or 128
if `pw-top` shows zero errors.** Do NOT chase 64.

### Perceptual latency thresholds — what counts as "instant"
- Jack, Mehrabi, Stockman, McPherson (2018), *Action-sound Latency and the Perceived Quality of
  Digital Musical Instruments: Comparing Professional Percussionists and Amateur Musicians*,
  **Music Perception 36(1)** — https://qmro.qmul.ac.uk/xmlui/handle/123456789/44614 . Establishes
  that action-sound asynchrony is disruptive and that professionals are markedly more sensitive
  than amateurs. ⚠️ I could not extract a specific ms threshold from the abstract — flagged as
  unverified; do not quote a number from this paper without reading the full text.
- Wessel & Wright (2002), *Problems and Prospects for Intimate Musical Control of Computers*,
  Computer Music Journal 26(3) — the canonical **10 ms** action-to-sound target with **≤1 ms jitter**
  for gestural instruments. Widely cited; this is the number the pro-audio world designs to.
- ACM AM'24, *Measuring the Just Noticeable Difference for Audio Latency*
  (https://dl.acm.org/doi/fullHtml/10.1145/3678299.3678331), 37 participants, PEST method — a
  2024 JND estimate for audio latency. Verify the exact JND value before quoting.
- **Crucially, these thresholds are about action→*sound*, not action→*visual annotation*.** FretGuide
  does not resynthesise the guitar; the guitar's own sound is already instantaneous through the amp.
  We only need the *overlay* to update quickly. Visual feedback tolerance is far looser — the
  relevant ballpark is one to two video frames (33–66 ms at 30 fps), which our ~50 ms pitch pipeline
  already meets. **This is the most important reframing in this document: FretGuide is not a
  low-latency audio product.** Do not over-engineer for 64-frame buffers.

### Python GIL: is a Python audio callback at 128 frames viable?
Short answer: **at 128 frames, no; at 256–512 frames with all DSP in NumPy, marginally yes; but do
not architect it that way.** Reasoning:
- 128 frames @ 48 kHz = a hard 2.67 ms deadline per callback. Python function-call overhead plus any
  GC pause plus GIL contention with the vision thread (OpenCV releases the GIL during processing, but
  the OpenVINO Python wrapper and any `numpy` allocation still take it) makes a missed deadline a
  matter of when, not if. Every miss is an audible xrun / dropped block.
- Python 3.13 has a free-threaded build (PEP 703), but 3.13.7 as shipped by Ubuntu 25.10 is the
  **GIL-enabled** default build, and `numpy` free-threaded support is still maturing. Not a fix today.
- **Recommended architecture instead:** the audio callback does *nothing but copy* into a lock-free
  ring buffer, and all analysis runs on a normal (non-RT) worker thread or a separate process reading
  that ring buffer. This is standard practice and it removes the GIL from the deadline path entirely.
  In `sounddevice` you can even skip the callback and use the blocking `InputStream.read()` API from
  a plain thread at 256–1024 frames — simplest correct thing.
- If you later want true sub-5 ms, move the ring-buffer producer to Rust (`cpal` + `ringbuf`) or C
  (`miniaudio`) and hand frames to Python over shared memory. Given the §5 conclusion above, you
  almost certainly never need this.

## 6. Hardware advice (interface vs built-in codec)

### Why the built-in codec is not merely "worse" — it's the wrong connector
`arecord -l` on the target shows exactly one capture device: `card 0: PCH [HDA Intel PCH], device 0:
SN6140 Analog`. On a modern laptop that is a **single 3.5 mm TRRS combo jack** wired for a headset
microphone. The problems, in order of severity:

1. **Impedance mismatch (the real killer).** A passive electric guitar pickup is a high-impedance
   source (typically 5–15 kΩ, with resonant peaks much higher) and wants to see ≥1 MΩ input
   impedance. A laptop mic input presents on the order of 2–10 kΩ *and* supplies bias voltage.
   Loading a passive pickup into a few kΩ rolls off the treble severely and drops level — the
   high harmonics you need for **string identification (§4) are exactly what gets destroyed.**
   This is not a small SNR delta; it removes the information.
2. **Mono/level.** Mic inputs expect ~10 mV; a guitar puts out 100–500 mV peaks, so you clip.
3. **No physical 1/4" jack** — you'd need an adapter, adding another failure point.
4. **Latency and stability.** HDA codecs are fine latency-wise, but the SN6140 UCM profile on Ubuntu
   is tuned for headsets, not instrument capture.
5. **No hardware monitoring**, so the player has no way to hear themselves at zero latency if they
   are not already amped.

**So: yes, buy an interface.** But the honest reason is "you need a 1 MΩ instrument input and a
1/4" jack", not "you need better converters". Any class-compliant interface with a real Hi-Z
instrument input solves 90% of it; the Focusrite converters are a bonus, not the point.

### Electric vs acoustic — this changes the answer completely
| Guitar type | Signal path | Interface need | Consequence for FretGuide |
|---|---|---|---|
| **Electric (passive pickups)** | DI straight into Hi-Z instrument input | any interface with an **Inst/Hi-Z** switch | Best case. Clean, isolated, no room noise, no bleed. Fretiq-style string ID is plausible. |
| **Electric (active pickups)** | line-level, still fine on Inst input | same | same |
| **Acoustic with piezo/undersaddle** | 1/4" out into Inst input | same | piezo timbre is very different from magnetic — any string-ID model must be retrained per pickup |
| **Acoustic, no pickup** | needs a **microphone** (XLR + phantom, or a clip-on) | Scarlett **2i2** (has a proper XLR preamp + 48 V), or a stick-on piezo | Much harder: room noise, computer fan, monitor bleed. Onset detection degrades. Pitch still OK. |
| **Nylon/classical** | mic only, weak high harmonics | 2i2 + condenser | String ID from timbre becomes near-hopeless |

**If the guitar is acoustic-without-pickup, buy the 2i2, not the Solo**, and expect §4's string
disambiguation to lean almost entirely on vision.

### Which Focusrite, and Linux verification
| Model | Inputs | Linux status | Notes |
|---|---|---|---|
| **Scarlett Solo 4th Gen** | 1× XLR mic, 1× 1/4" Hi-Z instrument | ✅ Works with PulseAudio, PipeWire and JACK **with no configuration** ([Interfacing Linux, 2024-04-30](https://interfacinglinux.com/2024/04/30/focusrite-scarlett-solo-gen-4/)) | Cheapest thing that fully solves the problem. One instrument input is all FretGuide needs. |
| **Scarlett 2i2 4th Gen** | 2× combo XLR/instrument | ✅ same driver family | Buy this if you also want a mic (acoustic guitar, voice), or want to record DI + amp simultaneously |
| Scarlett 3rd Gen (used) | same shape | ✅ supported, `scarlett2` mixer since kernel 6.7 | Perfectly fine and cheaper used |
| Cheap alternative: Behringer UM2/UMC22, Audient EVO 4, MOTU M2 | 1–2 inst inputs | class-compliant USB Audio Class 2 | All work; **Audient EVO 4** and **MOTU M2** have measurably better converters than the Behringer, but for FretGuide's purposes the Behringer is genuinely sufficient |

**Verified Linux facts:**
- Focusrite USB interfaces are **USB Audio Class 2 class-compliant** — audio streaming works with the
  in-tree `snd-usb-audio` driver, no vendor driver, no install step.
- The in-tree **`scarlett2`** ALSA driver adds *mixer/routing/gain* control and "supports nearly every
  Focusrite USB device from the 2nd Gen Scarlett range onwards" (https://github.com/geoffreybennett/linux-fcp).
  **Comprehensive 4th Gen support landed in kernel 6.8.** This machine runs **6.17**, so it is
  comfortably covered.
- Optional GUI: **`alsa-scarlett-gui`** (https://github.com/geoffreybennett/alsa-scarlett-gui) —
  needs kernel ≥6.7. Useful for setting the Inst/Line switch and gain from software.
- ⚠️ **Known quirk 1 — MSD / "Easy Start" mode.** 3rd and 4th Gen units ship presenting themselves as
  a USB Mass Storage Device. **MSD mode must be disabled for full functionality on Linux.** Do this
  before anything else (hold the 48 V/Inst button pattern per Focusrite's instructions, or use
  Focusrite Control once, or `scarlett2`/`fcp` tooling).
- ⚠️ **Known quirk 2 — intermittent disappearance.** A user reported the Solo 4th Gen card vanishing
  intermittently on Xubuntu 25.04 with PipeWire even after installing `alsa-ucm-conf`
  (https://github.com/alsa-project/alsa-lib/issues/460). Unresolved in that thread. Mitigation:
  keep `alsa-ucm-conf` current, avoid USB hubs, and prefer a USB-C→USB-C direct connection.
  Flag this as a real (if uncommon) risk; it is the single reason I'd suggest buying from somewhere
  with a return policy and testing within the window.
- The 4th Gen **"Big" family** (16i16, 18i16, 18i20) uses a *different* driver stack (FCP) — irrelevant
  here, but don't buy those expecting the same code path.

### Concrete recommendation
**Focusrite Scarlett Solo 4th Gen** if the guitar is electric (or has a pickup) — one Hi-Z input is
all FretGuide uses, it is the cheapest fully-supported option, and Linux support is verified.
**Scarlett 2i2 4th Gen** if there's any chance of needing a microphone. If budget is tight, an
**Audient EVO 4** is an equally class-compliant alternative with a good instrument input. First
action after unboxing, before writing any code: disable MSD mode, then confirm with
`arecord -l` and `pw-top`.

## 7. Practical extras (tuning, capo, onset, A/V alignment)

### 7.1 Tuning check — do this FIRST, gate everything on it
This is the highest-value, lowest-effort feature in the whole document, and skipping it will make
every other measurement look broken. If the guitar is 30 cents flat, harmonic template matching
misses every partial band and the app tells the user they played the wrong chord.

Design:
- **Flow:** on app start (and on a "check tuning" button), ask the user to play each open string
  6→1. Detect the onset, take a 4096-sample window ~100 ms after onset (past the attack transient,
  before decay), run YIN, report cents error vs the target.
- **Accuracy needed:** ±3 cents is a comfortable target and easily achieved. Cents error =
  1200·log2(f_measured/f_target). At 82.41 Hz, 3 cents = 0.143 Hz — so you need frequency resolution
  ~0.1 Hz, which YIN with parabolic lag interpolation over 2048–4096 samples gives comfortably
  (aubio's `yinfft` reports sub-cent precision on clean DI signals).
- **Gate:** if any string is >15 cents off, show a tuner UI and refuse to score chords. If 5–15 cents
  off, widen the template match bands and warn. Store the per-session tuning offsets and *subtract
  them* from expectations so a slightly-flat guitar still scores correctly.
- **Bonus, free:** this same pass is when you fit the per-string inharmonicity coefficient B and the
  per-string harmonic amplitude profile needed by §3 and §4. One 60-second ritual, three payoffs.
- ⚠️ **Watch for stretch tuning / intonation error.** Real guitars are not perfectly intonated; the
  12th fret can be several cents sharp of the open string even when the open string is dead on.
  Calibrate expectations **per (string, fret)** during the 72-note calibration pass, not from theory.

### 7.2 Capo detection
Honest assessment: **do not detect the capo from audio. Ask the user.**
- A capo simply shifts all open-string pitches up by N semitones. From audio alone, "capo on 2,
  playing an open D shape" is *acoustically identical* to "no capo, playing an E shape at fret 2"
  except for subtle inharmonicity/timbre differences (shorter speaking length ⇒ higher B) — exactly
  the weak cue from §4, now being asked to do harder work.
- **Vision can see a capo trivially** — it is a large high-contrast bar across the neck, and in this
  project the fretboard is already marker-rectified, so a horizontal-edge / dark-bar detector across
  all six strings at a fret position is a ~30-line OpenCV function with high reliability.
- Cheapest correct answer: a capo position dropdown in the UI, *optionally* auto-suggested by vision,
  *verified* by re-running the open-string tuning check (which will show all six strings N semitones
  sharp). That third path is a genuinely robust audio confirmation: if all six open strings read
  exactly +N semitones, there's a capo at fret N.

### 7.3 Onset detection for rhythm/timing feedback
- **Use aubio.** Methods available (`aubio/src/spectral/specdesc.h`): `hfc` (default; the docs note
  it "is efficient at detecting percussive onsets"), `energy`, `complex`, `phase`, `specdiff`,
  `kl`, `mkl`, `specflux`. For plucked guitar, `specflux` and `complex` are usually better than
  `hfc` for *soft* onsets and legato; `hfc` is better for hard picking. **Test both on your own
  recordings** — this is one parameter genuinely worth tuning empirically.
- Onset latency: aubio's onset detector operates on hop-sized frames. With hop 256 @ 48 kHz you get
  5.3 ms granularity, and the detector typically fires 1–3 hops after the true onset ⇒ **~5–16 ms**.
  That is far inside any perceptual requirement for visual feedback.
- ⚠️ *Benchmark caveat:* the only guitar-specific aubio onset comparison I found is
  *Bio-Inspired Optimization of Parametric Onset Detectors* (ResearchGate 354581340), which evaluates
  all aubio onset methods on monophonic acoustic guitar — but I could not extract the accuracy
  figures from the abstract. **Flagged as unverified**; don't quote numbers from it.
- **Strumming direction** (up vs down) is a real 2025 research topic — arXiv 2508.07973 *Joint
  Transcription of Acoustic Guitar Strumming Directions and Chords* — and it needed a motion sensor.
  For FretGuide, vision (strumming-hand vertical velocity) is the natural source. Don't try audio.

### 7.4 Latency compensation / A/V timeline alignment
This is a prerequisite for §4's fusion, and it's plumbing, not research. Do it properly once.
- **Single monotonic clock.** Use `CLOCK_MONOTONIC` (`time.monotonic_ns()` in Python) as the one
  timeline. Do not use wall clock, and do not use frame indices as timestamps.
- **Stamp at the source, not at the consumer.** PipeWire gives you real hardware timestamps: in the
  native API each buffer carries a `pw_time` with `now`, `delay` and `queued`; via the JACK API,
  `jack_get_cycle_times()` / `jack_last_frame_time()`. V4L2 gives per-frame timestamps
  (`v4l2_buffer.timestamp`, monotonic by default) which OpenCV exposes via
  `cap.get(cv2.CAP_PROP_POS_MSEC)` — unreliable — so prefer reading V4L2 directly or at minimum
  stamping immediately after `cap.read()` returns and subtracting a measured constant.
- **Measure, don't assume, the two fixed offsets:**
  - *Audio capture offset* = quantum × periods + interface ADC latency. Get it from
    `pw-top` (shows the negotiated latency per node) or `jack_iodelay` under `pw-jack`.
  - *Video capture offset* = exposure + USB transfer + decode. Measure it with a **clap test**:
    point the camera at your hands, clap once, and compare the audio onset timestamp to the video
    frame in which the hands meet. Repeat 10×, take the median. Expect webcam latency of
    **60–150 ms** — typically *much larger and much more variable than the audio path*, which is the
    opposite of most people's intuition and the reason this section exists.
- **Then align by subtracting offsets**, and only fuse events whose corrected timestamps fall within
  a tolerance window (start with ±40 ms). LadderSym's point about late fusion and alignment
  (arXiv 2510.08580) is exactly this: unaligned late fusion is worse than no fusion.
- **Practical consequence:** because video is the *slower* modality, the audio verdict will be ready
  before the video frame that shows the same event. Buffer audio verdicts in a short ring and match
  them to video frames as those arrive, rather than the reverse.

## 8. Verdict

### (a) v1 — "did I play the right note/chord"

| Decision | Choice | Why |
|---|---|---|
| **Hardware** | **Focusrite Scarlett Solo 4th Gen** (or 2i2 4th Gen if a mic is ever needed) | Class-compliant USB Audio Class 2; full 4th-Gen support in-tree since **kernel 6.8**, this box runs **6.17**. Verified to work with PipeWire/JACK/Pulse with no configuration. **Disable MSD/"Easy Start" mode first.** The built-in `SN6140` jack is a headset mic input — wrong impedance, wrong level, wrong connector. |
| **Sample rate** | **48 000 Hz** | Matches PipeWire's `clock.allowed-rates = [48000]` on this machine, so zero resampling. Do not use 44.1 k. |
| **Buffer / quantum** | **256 frames** (5.33 ms). Try 128 only if `pw-top` shows zero errors. | Currently 1024 (21.3 ms). Dropping to 256 is free. Going below 256 buys nothing because the low-E pitch window dominates. |
| **Capture API** | **`python-sounddevice` 0.5.5** (PortAudio) for the prototype; `pipewire-jack` via `pw-jack` if you need tighter timestamps | Only Python audio lib in the list that is actively maintained (2026-01-23) and works on 3.13. Set `PIPEWIRE_LATENCY=256/48000`. |
| **Process architecture** | **Audio thread copies into a lock-free ring buffer and does nothing else.** All DSP on a separate non-RT worker thread; vision in a **separate process** communicating over a socket/shared memory. | Removes the GIL from every deadline. Keeps OpenCV/OpenVINO from ever stalling audio. |
| **Analysis window / hop** | **2048 samples @ 48 kHz (42.7 ms) window, 256-sample (5.3 ms) hop.** Decimate to 8–12 kHz for the pitch stage. | 2048 @ 48 k = 3.5 periods of low E (82.41 Hz, 12.13 ms period) — the physics-derived minimum from §1. Decoupling window from hop is what makes it feel instant. |
| **Onset** | **aubio `onset`, try `specflux` and `hfc`**, from `apt install python3-aubio aubio-tools` | Fires in ~5–16 ms. Gates all scoring. `apt`, not `pip` — PyPI aubio is from 2019. |
| **Monophonic pitch** | **aubio `yinfft`** | Sub-cent on a DI signal. No model, no weights, no inference runtime. |
| **Chord verification** | **Expectation-conditioned harmonic template matching + constrained NMF over the ≤7 known templates** (see §3) | 5 orders of magnitude smaller hypothesis space than transcription (64 vs ~7.1 M). Turns estimation into matched-filter detection. No ML. |
| **Calibration** | **One 5-minute ritual: 6 open strings for tuning, then every string × frets 0–12 twice.** Fit per-string inharmonicity B, per-(string,fret) intonation offset, per-string harmonic amplitude profile. | The Fretiq lesson: overfitting to one instrument is a *feature* here. This single pass feeds §3, §4 and §7. |
| **Language** | **Python 3.13.7**, NumPy 2.5.1 / SciPy 1.18.0 | Genuinely fast enough given the architecture above. No Rust/C needed for v1. |
| **Neural model in v1** | **None.** | Nothing in the model tables beats a matched filter on a known target with a clean DI input. |

**Expected v1 quality:** "chord correct / incorrect" and "you're a semitone off" should be
near-perfect. "String 3 is muted" will be the weak spot (LadderSym's missed-note asymmetry).

### (b) Later — tablature-following

| Decision | Choice |
|---|---|
| Polyphonic pitch | **Basic Pitch `nmp.onnx` (225 KB, Apache-2.0)** driven directly through `onnxruntime`, or converted to **OpenVINO IR** to run on the Arc Xe-LPG iGPU / AI Boost NPU (which is why `docs/research/10-recommended-stack.md` already picks OpenVINO — same runtime, one dependency) |
| String attribution | **Fretiq-style classifier trained on your own calibration data**: 13 MFCCs + band energies + fitted B, gradient-boosted trees or a tiny MLP. Expect ~85–90% held-out, per Fretiq's 87.8%. |
| Arbitration | **Explicit Bayesian arbiter** over ≤64 legal (string, fret) assignments: P_vis × P_aud × playability prior. Not an end-to-end multimodal net. |
| Alignment | Clap-test-calibrated fixed offsets on a single `CLOCK_MONOTONIC` timeline, ±40 ms fusion window (§7.4) |
| Stretch | If you ever want real transcription, **FretNet** (github.com/cwitkowitz/guitar-transcription-continuous) is the closest thing to a real-time-capable, code-available guitar tablature model. |

### What is genuinely hard
1. **Per-string diagnosis in a full six-string strum.** Audio-only string ID caps at ~87.8% on
   held-out free play even in Fretiq's single-instrument single-player best case, and that was
   *monophonic*. In a strum, six overlapping harmonic series with unison collisions is much worse.
2. **Detecting a *muted* string.** LadderSym gets 56.3% F1 on missed notes *with the score known*.
   Absence of evidence is not evidence of absence, and "didn't strum it" is indistinguishable from
   "muted it" without vision.
3. **Fret localisation from a laptop webcam under occlusion**, especially above fret 7 where spacing
   shrinks and the fretting hand covers the strings. The existing ArUco markers help a lot; the
   fretting hand is still in the way.
4. **A/V temporal alignment.** Webcam latency (60–150 ms) is larger and jitterier than audio latency
   (~5–50 ms). This must be measured empirically; there is no formula.
5. **Python 3.13 packaging.** madmom is dead, aubio's PyPI release is 7 years old, essentia ships
   cp314-only wheels, basic-pitch pins TF<2.15.1. Budget real time for this.

### What I could not verify
- No specific millisecond threshold extracted from **Jack et al. 2018** (Music Perception 36(1)) —
  the 10 ms figure quoted in §5 comes from **Wessel & Wright 2002**, which is widely cited but which
  I did not fetch in full. Do not attribute 10 ms to Jack et al.
- The exact JND value in **ACM AM'24 doi 10.1145/3678299.3678331**.
- **GuitarSet**'s exact hours / player count / licence (commonly cited as ~3 h, 6 players — unconfirmed).
- **TART** (arXiv 2510.02597): no GuitarSet numbers, no code-release status, no latency figures in the
  abstract.
- **TapToTab** (arXiv 2409.08618): claims "substantial improvements" with **no numbers** and no
  confirmed code release. The only directly-analogous system to FretGuide, and its evidence is thin.
- The **ACM UIST 2025 bass audio-visual paper** (doi 10.1145/3746058.3758448): dl.acm.org returns 403
  to automated fetch; details are from a search snippet only.
- **SwiftF0**'s internal window length and its accuracy specifically at ~82 Hz (its stated range
  starts at 46.875 Hz, so low E is in-range, but no per-frequency breakdown was available).
- **No paper anywhere reports an audio-only vs. audio+visual ablation for guitar string
  identification.** The central claim of §4 — that fusion beats either modality alone — is
  argued from orthogonal failure modes, not measured. Treat it as a hypothesis to test, and test it
  early with your own calibration data before building on it.
- Whether the **Scarlett Solo 4th Gen disappearing-device bug** (alsa-lib issue #460) affects Ubuntu
  25.10 / PipeWire 1.4.7 specifically. Buy somewhere with a return policy.

## Links

### Models & pitch detection
- SwiftF0 (arXiv 2508.18440, 2025-08-25) — https://arxiv.org/abs/2508.18440 · code https://github.com/lars76/swift-f0 · C++ example https://github.com/a5632645/swift_f0_cpp
- PESTO (TISMIR 8(1):334–352, 2025; arXiv 2508.01488) — https://arxiv.org/abs/2508.01488 · code https://github.com/SonyCSLParis/pesto · Max/MSP external https://github.com/QosmoInc/pesto_tilde
- CREPE (ICASSP 2018) — https://github.com/marl/crepe · torchcrepe https://pypi.org/project/torchcrepe/
- Cross-domain Neural Pitch and Periodicity Estimation — https://arxiv.org/pdf/2301.12258
- aubio docs (onset methods) — https://aubio.org/doc/latest/specdesc_8h.html · https://man.archlinux.org/man/aubioonset.1.en

### Polyphonic / tablature
- Spotify Basic Pitch — https://github.com/spotify/basic-pitch (Apache-2.0, 5.4k stars, push 2025-11-13) · https://pypi.org/pypi/basic-pitch/json
- FretNet (arXiv 2212.03023) — https://arxiv.org/pdf/2212.03023 · code https://github.com/cwitkowitz/guitar-transcription-continuous
- Leveraging Computer Vision Networks for Guitar Tablature Transcription (TabInception/Swin/ViT) — https://link.springer.com/chapter/10.1007/978-3-031-50069-5_2
- CRNN GuitarSet 0.8736 MPE F1 (community) — https://github.com/trimplexx/music-transcription
- SynthTab (arXiv 2309.09085) — https://arxiv.org/pdf/2309.09085
- TART (arXiv 2510.02597, 2025-10-02) — https://arxiv.org/abs/2510.02597
- Fretting-Transformer (arXiv 2506.14223, 2025-06-17) — https://arxiv.org/abs/2506.14223
- Velocity Prediction in Automatic Guitar Transcription (arXiv 2606.24912, 2026-06-19) — https://arxiv.org/abs/2606.24912
- Tone/content generalizability, amp-rendered electric guitar (arXiv 2504.07406) — https://arxiv.org/abs/2504.07406
- GAPS classical guitar dataset (arXiv 2408.08653v2) — https://arxiv.org/abs/2408.08653
- High Resolution Guitar Transcription via Domain Adaptation (arXiv 2402.15258) — https://arxiv.org/abs/2402.15258
- Feasibility & Pairwise Likelihood in tab transcription (arXiv 2204.08094) — https://arxiv.org/abs/2204.08094
- ML approach for MIDI→tab (arXiv 2510.10619, 2025-10-12) — https://arxiv.org/abs/2510.10619
- madmom — https://github.com/CPJKU/madmom · BTC — https://github.com/jayg996/BTC-ISMIR19

### String ID, fusion, expectation-conditioned scoring
- **Fretiq** (arXiv 2607.18303, 2026-07-17) — https://arxiv.org/abs/2607.18303
- **LadderSym** (arXiv 2510.08580, ICLR 2026) — https://arxiv.org/abs/2510.08580
- Audio-Visual Framework for Bass Guitar Transcription & Fingering (ACM UIST 2025 Adjunct) — https://dl.acm.org/doi/10.1145/3746058.3758448
- TapToTab (arXiv 2409.08618, 2024-09-13) — https://arxiv.org/abs/2409.08618
- Automatic Performative Transcription of Guitar Music Based on Multimodal Network (Springer 2025) — https://link.springer.com/chapter/10.1007/978-981-96-4783-5_4
- Joint Transcription of Strumming Directions and Chords (arXiv 2508.07973) — https://arxiv.org/abs/2508.07973
- PianoVAM multimodal piano dataset (arXiv 2509.08800) — https://arxiv.org/pdf/2509.08800
- Automatic Transcription of Guitar Chords and Fingering From Audio (IEEE) — https://ieeexplore.ieee.org/document/6064873/
- Inharmonicity-Based Method for the Automatic Generation of Guitar Tablature — https://www.researchgate.net/publication/260691838
- Perceptibility of Inharmonicity in the Acoustic Guitar (Järveläinen et al.) — https://www.researchgate.net/publication/233604568
- Importance of Inharmonicity in the Acoustic Guitar (ICMC 2005) — https://quod.lib.umich.edu/i/icmc/bbp2372.2005.165
- Design of a fretboard using the stiff string equation (arXiv 2106.13030) — https://arxiv.org/abs/2106.13030
- GuitarSet — https://zenodo.org/records/3371780 · https://guitarset.weebly.com

### Latency & plumbing
- PipeWire `pipewire.conf(5)` — https://docs.pipewire.org/page_man_pipewire_conf_5.html
- Action-sound Latency and Perceived Quality of DMIs (Jack, Mehrabi, Stockman, McPherson 2018) — https://qmro.qmul.ac.uk/xmlui/handle/123456789/44614
- Measuring the Just Noticeable Difference for Audio Latency (ACM AM'24) — https://dl.acm.org/doi/fullHtml/10.1145/3678299.3678331
- Delving into Hearing Threshold of the Delay Gap (Applied Sciences 13(21):11856) — https://www.mdpi.com/2076-3417/13/21/11856
- `python-sounddevice` — https://pypi.org/pypi/sounddevice/json

### Hardware
- Focusrite Scarlett Solo Gen 4 on Linux (Interfacing Linux, 2024-04-30) — https://interfacinglinux.com/2024/04/30/focusrite-scarlett-solo-gen-4/
- Scarlett Solo Gen 3 on Linux (2024-01-08) — https://interfacinglinux.com/2024/01/08/focusrite-scarlett-solo-on-linux-gen-3/
- `linux-fcp` — Focusrite Scarlett/Clarett/Vocaster kernel support — https://github.com/geoffreybennett/linux-fcp
- `alsa-scarlett-gui` (needs kernel ≥6.7) — https://github.com/geoffreybennett/alsa-scarlett-gui
- Scarlett Solo 4th Gen disappearing-device report — https://github.com/alsa-project/alsa-lib/issues/460
- Scarlett Gen2 MSD-mode notes — https://github.com/F1LT3R/scarlett-gen2
