# Prior art

Written during specification, before implementation, to find out whether the
idea was already taken. It largely was, and the spec's novelty claim was
rewritten as a result — see SPEC.md §1, "What is actually being claimed".

The concept under investigation: a plain webcam tracks head position, and that
one signal drives **both** an off-axis / head-coupled perspective projection
**and** the core gameplay verbs — lean to peek around an occluder, lean to dodge.

---

## 1. Head-coupled perspective (HCP) as a display technique

| Work | Year | Type | What it did |
|---|---|---|---|
| Ware, Arthur & Booth, *Fish Tank Virtual Reality* (CHI '93) | 1993 | research | Coined the term. Head-tracked off-axis frustum on a fixed monitor. |
| Rekimoto, *A vision-based head tracker for fish tank VR* (VRAIS '95) | 1995 | research | "VR without head gear" — markerless camera-based HCP. The true ancestor of the webcam version. |
| Johnny Chung Lee, Wii Remote desktop VR | 2007 | tech demo | The famous one. **Not a webcam**: a stationary Wiimote IR camera tracking a head-mounted IR sensor bar. Published as *IEEE Pervasive Computing* 7(3):39–45, 2008. |
| Francone & Nigay, **i3D** (IIHM/LIG Grenoble) | 2011 | shipped app | Front-camera face tracking → true HCP on iPhone 4 / iPad 2. Display only. |
| headtrackr (Audun M. Øygard) | 2012 | library + demos | First browser head tracking via `getUserMedia`. Ships three.js controllers **explicitly for HCP**, plus **FaceKat**, a head-controlled avoidance game. Earliest verified pairing of browser HCP and a head-controlled game. |
| Amazon Fire Phone, *Dynamic Perspective* | 2014 | **shipped product** | Four IR cameras + IR LEDs. See §2 — this is also the closest shipped precedent for head-peeking. |
| New Nintendo 3DS, *Super-Stable 3D* | 2014 | **shipped product** | Real head tracking (inner camera + IR LED) steering a dynamic parallax barrier. Display only; corrects the stereo sweet spot rather than re-projecting off-axis. |
| trompeloeil; off-axis-sneaker; Depth Window; C. Gerard's digital frame | 2020–26 | tech demos | Browser MediaPipe/TF.js + three.js off-axis projection. **All viewers. None has gameplay.** |

**Not HCP, despite frequent citation as such** — corrections found during the survey:

- **Nintendo 3DS *Face Raiders* (2011)** does *not* use head tracking for
  perspective. The camera only photographs faces to texture enemies; the
  magic-window effect comes from the console's **gyroscope**. An earlier draft
  of this spec cited it wrongly.
- **TrackIR (2001), opentrack, Tobii, Eyeware Beam, ViewTracker** drive a
  first-person camera *pose* — translation and rotation — not a screen-anchored
  off-axis frustum. This is head-as-camera, which is a different thing, and the
  distinction matters: a camera pans, a window does not.

## 2. Lean-to-peek and lean-to-dodge as gameplay

| Work | Year | Type | What it did |
|---|---|---|---|
| **Wang et al., *Bullet Time* (CHI '06)** | 2006 | research | **Closest prior art for the gameplay half.** Webcam face tracking, flat screen, FPS: physical head offset → *"dodging-and-peeking"*. Both verbs, one webcam, twenty years ago. No HCP. |
| Yim, Qiu & Graham, *Experience in the Design and Development of a Game Based on Head-Tracking Input* (FuturePlay '08) | 2008 | research | A dodging shooter built directly on Lee's HCP: head position alters parallax **and** drives dodging. ⚠️ second-hand only — see §5. |
| **Sko & Gardner, *Interaction Techniques Using Head-Coupled Displays* (INTERACT '09)** | 2009 | research | **The key citation.** Source-engine build, FaceAPI + webcam. Seven techniques, split into **ambient** (HCP, handy-cam) and **control** (peering, zooming, iron-sighting). *Peering* = lean → camera offsets, with collision checks so you cannot peer through walls. Best-received of the seven. |
| Sko, Gardner & Martin, HAL mod | 2013 | shipped mod + research | Public Half-Life 2 mod, 2 500 users, 550 hours of telemetry. Immersion up; competitive performance not improved. |
| Arma II / 3 / Reforger + TrackIR | 2009–22 | **shipped product** | Analog lean bindable to a head tracker; players do physically lean to peek a corner. But an optional accessory binding over an existing keyboard lean, not a designed core verb — and no off-axis projection. |
| Amazon *To-Fu Fury*, *Saber's Edge* | 2014 | **shipped product** | From Amazon's own press release: players use "their head to peek around levels" and "peek around the corners of the cube". **Peek-for-information as a shipped commercial verb.** |
| **Kulshreshth & LaViola (SUI '13)** | 2013 | research | TrackIR 5, four games, n=40. Helped experts in two of four; *"potentially hurts performance in fast paced games."* A direct caution against the dodge verb. |
| PacCam (Nolen Royalty) | 2024 | shipped browser game | React + MediaPipe Face Landmarker; head steers Pac-Man. The most visible recent browser example. **2D, no HCP.** |

**How room-scale VR frames peeking:** not as a mechanic at all, but as an
ungated affordance — you lean around cover because you have a body, and the
design work lives in level geometry rather than in an input mapping. That is the
*opposite* of a flat-screen build, where the mapping is the design problem.

## 3. Is there a genre name?

No. There is no recognised term for browser webcam-controlled games. The de-facto
taxonomy is platform tagging — itch.io's `input-webcam`, `webcam`,
`face-tracking` filters. "Webcam game" is descriptive, not a genre.

## 4. Verdict

**The technique is not novel. The designed artifact appears unclaimed.**

Two pieces of work each got roughly two thirds of the way. Wang et al. (2006)
had webcam, flat screen, and *both* peek and dodge as head-driven verbs — but no
head-coupled projection. Yim et al. (2008) had HCP plus head-driven dodging —
but no peek-around-occluder and no design focus on it. Sko and Gardner (2009)
built HCP *and* lean-to-peek into one webcam-driven build, so the "one signal,
both jobs" architecture is nineteen years old.

What the survey could find **no evidence of anywhere**:

1. Any **shipped product** in which markerless head position simultaneously
   drives an off-axis frustum and the core gameplay loop. The Fire Phone titles
   are the closest, and there peeking is an optional information verb layered
   over tilt-and-touch gameplay, on IR hardware, on a phone.
2. Any **browser** implementation with gameplay at all. Every web HCP project
   found is a viewer; every notable browser face-controlled game is 2D with a
   conventional projection.
3. Any work that makes **peek-around-occluder the core verb** rather than a
   garnish — which is precisely what Sko and Gardner's paper closes by
   identifying as the unexplored opportunity: *"of all the techniques, it was
   felt that peering could benefit the most from focusing the game content
   around its use."*

Two things follow, and both are already in the spec:

- The claim is narrowed to **design synthesis plus zero-install delivery**, and
  explicitly not a new interaction technique. Claiming the latter would be
  refuted by a single citation of Wang 2006 or Sko 2009.
- **Peek leads and dodge follows**, because Kulshreshth and LaViola found head
  tracking degrading performance in fast-paced settings. Dodge is the first
  mechanic to cut if playtesting agrees with the literature.

## 5. Unverified — do not cite without checking

Recorded because a survey that hides its gaps is worth less than one that shows
them.

1. **Yim et al. (2008) specifics are second-hand only.** ACM DL returned 403,
   Semantic Scholar returned empty. Everything above about that game comes from
   Sko and Gardner's citation of it. Even the game's title is unconfirmed. This
   is the single closest prior art to the projection-plus-dodge combination, so
   **get the PDF before relying on any claim about it.**
2. **"Head-coupled perspective in computer games"** (`core.ac.uk`, Cloudflare
   blocked, every retrieval route failed). The title matches this topic exactly
   and it may be the most on-point document that exists. Plausibly a chapter of
   Torben Sko's ANU thesis — *not asserted*. Worth a manual look.
3. **Additional Fire Phone titles** surfaced only from a forum thread. Only
   *Saber's Edge* and *To-Fu Fury* are confirmed by Amazon's press release.
4. **ViewTracker doing off-axis projection** — marketing copy, not a verified
   technical claim. Treat it as a head-tracking input utility only.
5. **Teather & Stuerzlinger (GI 2008)** on exaggerating head-coupled camera
   motion — confirmed via the author's publication list, paper not read. Verify
   title and pages before citing. Relevant as a precedent for gain tuning.
6. **Wang et al. author list** — Sko and Gardner's bibliography spells the second
   author "Ziong"; search results give "Xiong". The ACM DL record is
   authoritative.

---

*Survey method: web search plus primary-source retrieval, with every claim
marked by whether the source itself was read. The corrections in §1 and the
narrowing in §4 are the reason this document exists — it changed the spec.*
