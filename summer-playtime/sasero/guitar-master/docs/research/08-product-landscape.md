# Does this product already exist?

**Date:** 2026-07-31. Targeted search prompted by the question "is there already a product like this
available?" This is a partial delivery of the deferred competitive stream — enough to answer the
question, not a full market analysis. User-sentiment mining on Reddit/App Store was not done.

## Short answer

**Yes — at least three shipping products overlay finger positions onto your own real guitar.** The
concept is validated, not novel. But **none of them uses your configuration** (laptop + external
camera in front of the player), and the reason appears to be that yours is the hardest one.

## What exists

| Product | Platform | How the camera sees the neck | Price | Status |
|---|---|---|---|---|
| **Fretello "Mirror"** | iOS + Android | Phone **front-facing camera**, held/propped at roughly arm's length | subscription (7-day trial) | Announced 2025-01-28; app actively updated into 2026 |
| **GeetAR** | Android | Phone **in a hands-free headset** — first-person view from the head, close to the neck. Requires a *classical* guitar | — | Shipping on Google Play |
| **IMMERROCK** | Meta Quest 3 (mixed reality) | Headset passthrough cameras, on the head | $11.99 | Shipping; 300+ exercises, tab import |

Not the same thing, despite AR branding: **Guitar 3D – AR** places a *virtual* guitarist/guitar in
your room; it does not overlay onto your instrument. Several "AR guitar" search hits are of this kind.

A claim that the **Gibson App** does camera-AR fingering overlay appeared in one low-quality buying
guide and could **not** be verified — treat as unconfirmed.

## The pattern worth noticing

Every shipping product gets the camera **close to the neck**:

- GeetAR puts the phone **on your head**.
- IMMERROCK uses a headset **on your head**.
- Fretello uses a phone front camera at **arm's length**.
- guitARhero (TU Graz, academic) bolted a webcam to the **headstock**.
- GuitXR used a capo and a **3D-printed mount**.

Nobody ships the laptop-with-a-camera-in-front configuration. That is consistent with guitARhero's
stated reason for rejecting it: *"placing a camera at a distance from the user means that the guitar
neck will occupy only a small portion of its view, making it difficult to discern which frets should
be pressed."* It also matches the arithmetic in `00-diagnosis.md`: at 640×480 and 0.7 m a fret space
is only ~19 px wide; 1080p raises that to ~58 px, but a phone at arm's length does far better than
either.

**Implication for the build: camera placement and resolution deserve as much attention as the
tracking algorithm.** Getting the camera closer to the neck — a clamp, a boom arm, a tripod near the
guitar rather than across the room — is a cheaper accuracy win than any algorithmic improvement, and
it does not violate the "no hardware on the instrument" constraint.

## Do the existing ones actually work well?

Evidence is thin and mostly promotional, but the one independent signal available is not glowing.
UploadVR's hands-on with IMMERROCK is titled *"Slightly Off Tune"*, and reviews report that
**passthrough "occasionally lags or distorts, especially with fast finger movement"** and that the app
**"can misread input" if the room is dim or the hand moves fast**.

That is a Quest 3 — multiple cameras, depth sensing, dedicated tracking silicon, head-mounted at close
range. If that configuration still struggles with fast fingers and dim rooms, a single laptop webcam
across the room is not going to be comfortably better. Fretello publishes no precision figures at all.

**Read: the category is real but execution is genuinely hard, and marketing materially outruns
measured performance.** Nothing found contradicts the plan in `10-recommended-stack.md`; if anything
it strengthens the case for building the measurement rig first, since apparently nobody in this space
publishes numbers.

## Practical recommendation

**Try IMMERROCK or Fretello before building anything**, if only for a week. Two reasons:

1. If one of them is good enough, you have your tool for $12 or a subscription instead of several
   weeks of work.
2. If they are not good enough, you will know *specifically what's wrong with them* — which is worth
   more than any amount of further desk research for deciding what your version must do differently.

This is cheap, fast, and directly de-risks the product question rather than the technical one.

## Links

- Fretello Mirror announcement (2025-01-28) —
  https://fretello.com/news/mirror-revolutionizing-guitar-learning-with-augmented-reality/
- Fretello Mirror demo video — https://www.youtube.com/watch?v=F5X7T5TFKus
- GeetAR — https://play.google.com/store/apps/details?id=com.wizardsystems.guitar ·
  https://www.wizardsystems.co/geetar/
- IMMERROCK on Meta Quest — https://www.meta.com/experiences/immerrock/7334845636643834/
- UploadVR hands-on, "Immerrock Guitar Training Hands-On: Slightly Off Tune" —
  https://www.uploadvr.com/immerrock-guitar-training-hands-on-slightly-off-tune/
- Immerrock review (VOY Glasses) —
  https://voyglasses.com/blogs/blog/immerrock-learn-guitar-in-vr-with-meta-quest-3-vr-lenses
- Guitar 3D – AR (virtual guitar, not overlay) — https://apps.apple.com/us/app/guitar-3d-ar/id1349979435
