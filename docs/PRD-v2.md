# FretGuide v2 — product definition

**Date:** 2026-07-31. Supersedes `FretGuide-PRD.md` (which describes the abandoned marker-based v1).
Technical basis: [`research/10-recommended-stack.md`](research/10-recommended-stack.md).

## 1. What we are building

**A laptop implementation of Fretello's "Mirror": a camera sees the player's own guitar, and
finger-placement dots for the selected chord or scale are drawn onto the live video of the real
fretboard — plus note verification from the guitar's direct signal via a USB audio interface.**

Two differences from Fretello, both deliberate:

| | Fretello Mirror | FretGuide v2 |
|---|---|---|
| Platform | phone / tablet app | **laptop desktop app** |
| Note detection | phone microphone (if any) | **direct DI via USB audio interface** — cleaner signal, lower latency, far more accurate |

Single user, one guitar, one room, offline, forever. Every design decision may exploit that.

## 1a. MVP scope — vision only

**The MVP is the visual overlay alone.** Pick a chord or scale, see dots on the live video of your own
fretboard telling you where to put your fingers. No audio acquisition, no note verification, no
"did I play it right" logic. The USB audio interface is not needed and need not be purchased yet.

The audio work is fully researched ([`research/05-audio-stack.md`](research/05-audio-stack.md)) and
deliberately parked. Nothing in the MVP design forecloses it: the verification layer consumes the
selected target (which the MVP already knows) and an audio stream, and touches neither the tracker nor
the renderer. Success criteria **A1–A4 below are out of scope for the MVP**; V1–V6 are the bar.

## 2. The two subsystems

### 2.1 Vision — the overlay
Track the fretboard markerlessly and draw dots aligned to real frets and strings. Approach, per the
research: one-time enrollment of this specific fretboard, then per-frame matching of learned local
features back to that template, RANSAC homography, detect-then-track with optical flow, filtered
geometry. See `research/10-recommended-stack.md` §2.

### 2.2 Audio — the verification
The guitar's DI signal tells us what actually sounded, so the app can say whether the player hit the
intended notes. **Framing that makes this tractable: this is verification against a known expected
target, not blind transcription.** The app already knows which pitches the current chord or scale
position should produce; scoring "did the expected pitch set sound?" is a far easier problem than
open-ended polyphonic transcription. Detail pending in `research/05-audio-stack.md`.

The two subsystems also help each other: audio gives accurate pitch but cannot distinguish string 6
fret 5 from string 5 fret 0; vision gives hand position but not pitch. Together they can resolve
which string/fret was actually played. Whether that fusion is worth building in v1 is an open
question the audio research is assessing.

## 3. Hardware setup (fixed and known)

- **Laptop:** Ubuntu 25.10, Intel Core Ultra 7 155H (Arc iGPU + NPU), 15 GB RAM, no NVIDIA.
- **Display:** a 34" Philips ultrawide on HDMI, plus the laptop panel.
- **Camera:** built-in 1080p30 (MJPEG only at 1080p). An external USB webcam is likely worth adding.
- **Audio:** PipeWire 1.4.7. **No USB interface connected yet** — to be acquired.
- **Nothing is attached to the guitar.** No markers, stickers, LEDs, clamps or pickups.

**Setup decision to make early: where does the camera go?** The player watches a screen while
playing, so the camera should sit near whichever screen that is — and as close to the guitar as
framing allows. Every shipping product in this category gets the camera close to the neck
(see `research/08-product-landscape.md`). Camera position and resolution are cheaper accuracy wins
than any algorithmic improvement, so treat this as a first-class setup variable, not an afterthought.

## 4. Success criteria — measurable, not subjective

v1's criteria were largely subjective, which is part of why its failure was hard to diagnose. These
are measured against the ChArUco ground-truth rig (`research/10-recommended-stack.md` §5).

| # | Criterion | Target |
|---|---|---|
| V1 | Dot placement error vs rig ground truth, frets 1–12, normal playing | **mean ≤ 0.15, worst ≤ 0.25 fret-widths** |
| V2 | Same, with the fretting hand occluding a 5-fret block | mean ≤ 0.20 fret-widths |
| V3 | Overlay frame rate | ≥ 30 fps sustained |
| V4 | Recovery after the guitar leaves frame entirely | re-locks within 0.5 s |
| V5 | Bad-pose behaviour | never draws an under-determined pose; degrades visibly instead |
| V6 | Setup time from launch to usable overlay | < 30 s, no per-session calibration taps |
| A1 | Correct detection of an intentionally-played target chord | ≥ 95 % |
| A2 | False "correct" when a wrong note is played | ≤ 5 % |
| A3 | Audio feedback latency, string pluck → on-screen response | ≤ 100 ms; ~50 ms is the design budget. **Do not optimise below this** — the guitar's own sound is already instant through the amp; we are only updating a visual overlay, so this is not a low-latency audio product |
| A4 | Tuning gate | refuse to score notes while the guitar is measurably out of tune, and say so |

V5 deserves emphasis: the measured cause of v1 feeling broken was drawing wildly wrong poses when
the geometry was under-determined. Refusing to draw is strictly better than drawing nonsense.

## 5. Non-goals for v2

- Generalising to other guitars, players, or rooms.
- Phone, tablet, headset, or ARKit/ARCore versions.
- Anything attached to the instrument.
- Distribution to other users, accounts, cloud, telemetry.
- Full song/tablature following, gamification, scoring streaks.
- Left-handed mode, alternate tunings (beyond detecting that tuning is wrong).
- Hand-landmark-based fingering verification — audio does this job better and more cheaply.

## 6. Carried-forward decisions

From `research/10-recommended-stack.md` and `research/00-diagnosis.md`:

1. Python + OpenCV 5 + OpenVINO; PySide6 shell with native GL video compositing.
2. Enrollment + feature matching first; a trained keypoint model only if that fails.
3. ~~Build the ChArUco measurement rig before the tracker.~~ **Revised 2026-07-31: deferred, and not
   part of the MVP.** For a single user judging their own overlay, the human eye is an adequate
   acceptance test — "is that dot on fret 4 or fret 5?" is exactly what eyes are good at. The rig
   earns its cost in only two cases: (a) the overlay looks *nearly* right and eyeballing can no longer
   distinguish good from subtly-wrong, or (b) we proceed to Track B, where it becomes a label
   generator producing thousands of auto-labelled frames instead of days of hand-clicking. Also
   dropped: hard-coding ruler-measured fret positions — fret spacing follows `1 − 2^(−n/12)` exactly
   and cancels out in normalised coordinates, so no measurement of the instrument is needed
   (see item 8, revised).
4. Capture 1080p MJPEG; lock exposure, white balance and dynamic-framerate via `v4l2-ctl`.
5. Frame and pose travel together; composite the overlay on the frame it was computed from.
6. Filter the projected corner geometry, never the homography's matrix entries.
7. Reject solves whose inlier spread is too small; hold and grey out the last good pose.
8. Snap fret indices to the analytic fret table. **Revised: no ruler needed** — fret positions are
   fully determined by `u(n) = 1 − 2^(−n/12)`, and in normalised fretboard coordinates the scale
   length cancels, so the template is exact for any equal-tempered guitar without measuring anything.
   The only quantity a ruler would add is the neck taper (board slightly wider at fret 12 than at the
   nut), which the tracker can estimate itself and which is a refinement, not a prerequisite.
9. Salvage from v1: music theory, chord voicings, fret geometry math (~340 lines, tested) — port to
   Python. Discard the marker tracking, calibration flow, and Canvas2D rendering.

From [`research/05-audio-stack.md`](research/05-audio-stack.md):

10. **v1 needs no neural audio model.** Verifying one known 6-vector is ~64 hypotheses versus ~7.1 M
    subsets for open transcription — five orders of magnitude, which changes the problem class from
    estimation to matched-filter detection. Harmonic template matching against expected partials.
11. **Low-E sets the window floor:** E2 = 82.41 Hz (12.13 ms period), and YIN needs ~3.5 periods, so
    **2048 samples @ 48 kHz (42.7 ms) is the minimum** — 1024 is below the floor and will produce
    octave errors. Window and hop are independent: use a 2048 window with a 256 hop for estimates
    every 5.3 ms. Decimate to 8–12 kHz for the pitch stage (~36× CPU saving); keep 48 kHz only for
    timbre features.
12. **PipeWire quantum is currently 1024 (21.3 ms) — drop it to 256** (min-quantum is 32, max 2048).
    `jackd2` *and* `pipewire-jack` are both installed: never start `jackd`, use `pw-jack`.
13. **Python's GIL rules out DSP in the audio callback.** The audio thread copies into a ring buffer
    and nothing else; analysis happens elsewhere.
14. **Python 3.13 has broken much of the MIR ecosystem** (madmom last released 2018; aubio's PyPI is a
    2019 sdist; essentia ships cp314-only wheels; basic-pitch pins TF<2.15.1). Install aubio from
    apt (`python3-aubio 0.4.9-4.7build1`, built against the distro's 3.13), and if Basic Pitch is
    ever wanted, use its `nmp.onnx` (225 KB, Apache-2.0) directly via OpenVINO rather than its
    Python package.
15. **Buy the Scarlett Solo 4th Gen for its 1 MΩ Hi-Z instrument input, not its converters.** A laptop
    mic jack loads a passive pickup into a few kΩ and destroys precisely the high harmonics that
    string identification depends on. Kernel 6.8+ supports Gen 4 (we run 6.17). Disable
    MSD / "Easy Start" first.
16. **Gate everything on a tuning check.** A guitar 30 cents flat makes every other measurement look
    broken. One 5-minute calibration ritual can fit per-string inharmonicity, per-fret intonation
    offsets, and harmonic profiles. For capo detection, ask the user or use vision — not audio.
17. Audio-only string identification tops out around **87.8 %** on held-out free play (Fretiq, 2026,
    single-guitar single-player). Treat that as the ceiling, not a starting point.

## 7. Open questions

- Whether audio↔vision fusion earns its complexity in v1. **The literature cannot answer this** — an
  arXiv search for `"audio-visual" AND guitar` returns zero results, and no paper reports an
  audio-only vs audio+visual ablation on guitar string ID. Test it against our own calibration data
  rather than trusting anyone's claim, and if built, use an explicit Bayesian arbiter over the ≤64
  legal string/fret assignments — not an end-to-end multimodal network.
- Whether "you missed / muted string 3" is worth shipping at all: the peer-reviewed state of the art
  (LadderSym, ICLR 2026) reaches only **56.3 % F1 on missed notes** even with score conditioning,
  while extra/wrong notes are comparatively easy. Plan the feedback UX around that asymmetry.
- Whether the built-in webcam suffices or an external camera is needed (measure first).
- Whether IMMERROCK or Fretello is already good enough to make this unnecessary — worth a week of
  trying before committing weeks of building (`research/08-product-landscape.md`).
