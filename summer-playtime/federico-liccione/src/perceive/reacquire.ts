/**
 * What to report when the webcam stops being able to see the head.
 *
 * The complaint that produced this file: a fast sideways snap takes one eye out
 * of frame, the face detector loses the head, and the viewpoint **freezes** until
 * both eyes come back. Freezing is the worst possible answer, because the moment
 * it happens is the moment the player was moving fastest and cared most.
 *
 * The principle it is built on is worth stating, because it is the same one the
 * whole project runs on and it points the opposite way to the obvious fix: *an
 * eye leaving the frame is information, not the absence of it.* It says the head
 * went that way. So this module does not guess a safe default — it continues the
 * measurement it already had, in the two ways the situation allows, and then
 * stops rather than inventing.
 *
 * Pure, and separate from `camera.ts`, for the reason the typing guard was
 * separated from its event handler: the *decision* can be tested, and the thing
 * holding a video element cannot.
 */
import type { Point3 } from '../engine'

/** A landmark in MediaPipe's normalised image space. 0..1 inside the frame. */
export interface Normalised {
  readonly x: number
  readonly y: number
}

/**
 * Is this landmark still inside the picture?
 *
 * The margin is not decoration. MediaPipe keeps emitting coordinates for a
 * landmark that has left the frame — extrapolated, and increasingly wrong — so
 * the useful test is not "is it outside" but "is it close enough to the edge that
 * I should stop believing it".
 */
export function inFrame(p: Normalised, margin = 0.02): boolean {
  return p.x >= margin && p.x <= 1 - margin && p.y >= margin && p.y <= 1 - margin
}

/**
 * The midpoint between the eyes, from the one eye still in frame.
 *
 * The separation between the two is what gives this pipeline its metric scale, so
 * losing one eye loses the distance estimate — but not the *lateral* position,
 * which is the one the game is played with. Carrying the last known separation
 * forward keeps that: the head continues to be tracked, at a depth that is now
 * held rather than measured, which is a far better answer than a frozen frame.
 *
 * `half` is half of the last good (second - first) vector, in pixels. If the
 * landmark still visible is the first of the pair, the midpoint is ahead of it by
 * that vector; if it is the second, behind.
 */
export function midpointFromOneEye(
  seenPx: { readonly x: number; readonly y: number },
  half: { readonly x: number; readonly y: number },
  seenIsFirst: boolean,
): { x: number; y: number } {
  const s = seenIsFirst ? 1 : -1
  return { x: seenPx.x + s * half.x, y: seenPx.y + s * half.y }
}

export interface DeadReckonLimits {
  /** Stop extrapolating after this long. Seconds. */
  readonly maxS: number
  /** And never extrapolate further than this. Centimetres. */
  readonly maxCm: number
}

/**
 * Two bounds, not one, and both are needed.
 *
 * `maxCm` is the honest one: a head moving at 60 cm/s that vanishes for a third
 * of a second has plausibly travelled 20 cm, and reporting that is a guess, not a
 * measurement. `maxS` catches the case `maxCm` cannot — a slow drift out of frame
 * that would otherwise creep forever without ever hitting the distance bound.
 */
export const DEFAULT_LIMITS: DeadReckonLimits = { maxS: 0.30, maxCm: 10 }

export interface Continuation {
  readonly at: Point3
  /**
   * True once it has given up extrapolating and is holding the last position.
   * The status line says so, because a held position is the one thing here the
   * player must not mistake for tracking.
   */
  readonly holding: boolean
}

/**
 * Carry the last known head position forward along its last known velocity.
 *
 * Dead reckoning, bounded twice, and then it stops. Deliberately *not* the
 * suggestion that produced it — "jump to the furthest point from centre" — because
 * that answer is wrong in one direction and right in the other, and which one
 * depends on level geometry the tracker cannot see. Exposure in this game is
 * symmetric: moving further out is as likely to walk into a sightline as out of
 * one. Continuing the measured motion is the only claim a tracker is entitled to
 * make, and it happens to reach almost the same place when the snap was fast,
 * which is the case that prompted this.
 */
export function deadReckon(
  last: Point3,
  velocityCmS: Point3,
  sinceS: number,
  limits: DeadReckonLimits = DEFAULT_LIMITS,
): Continuation {
  const t = Math.min(Math.max(0, sinceS), limits.maxS)
  const holding = sinceS >= limits.maxS
  const dx = velocityCmS.x * t
  const dy = velocityCmS.y * t
  const dz = velocityCmS.z * t
  const travelled = Math.hypot(dx, dy, dz)
  if (travelled <= 1e-9) return { at: last, holding }
  // Scaled as a whole rather than clamped per axis, so the direction of the
  // extrapolation survives the bound. Clamping x and y separately would bend it.
  const k = Math.min(1, limits.maxCm / travelled)
  return {
    at: { x: last.x + dx * k, y: last.y + dy * k, z: last.z + dz * k },
    holding: holding || k < 1,
  }
}

/* ---------------- handing over between estimators ---------------- */

/**
 * The residual complaint after the freeze was fixed: *"rimane forse ancora un po'
 * scattoso quando entrambi gli occhi ritornano visibili."*
 *
 * Fixing the freeze left three discontinuities behind, and they are all the same
 * shape. This tracker does not have one estimator, it has three — both irises,
 * one iris plus the last known separation, and dead reckoning — and every switch
 * between them steps the reported position, because they are different estimators
 * of the same quantity and they disagree by a centimetre or two. Coming back from
 * a gap is the largest of the three steps, since the extrapolation and the truth
 * have had up to a third of a second to diverge, but it is not a special case: it
 * is the same hand-off.
 *
 * So instead of three ad-hoc smoothings there is one rule. On every switch, record
 * the disagreement as a **bias**, so the reported position does not move at the
 * instant of the switch; then decay that bias to nothing. What the player sees is
 * continuous, and it converges on the measurement.
 *
 * Kept separate from the One Euro filter on purpose. That filter's job is jitter
 * on a *measured* signal, and it is swept against tests for that; this is a
 * discontinuity in *which measurement is being made*, and the two want different
 * time constants.
 */

/** How fast a hand-off bias is given up. Seconds to fall to 1/e of it. */
export const BIAS_TAU_S = 0.12

/**
 * And the most it is allowed to absorb, in centimetres.
 *
 * The honest bound. Absorbing a discontinuity means reporting a position the
 * tracker knows is wrong, briefly — and a 30 cm disagreement smoothed over a third
 * of a second is a 30 cm lie about where the player's head is, which in this game
 * decides whether they are behind cover. Past this bound the remainder snaps: a
 * visible jump is better than a plausible untruth.
 */
export const BIAS_MAX_CM = 6

/**
 * The bias that makes a switch of estimator invisible at the instant it happens.
 *
 * Clamped as a vector rather than per axis, for the same reason `deadReckon` scales
 * rather than clamps: bending the direction of a correction is a worse lie than
 * shortening it.
 */
export function handoffBias(
  prevReported: Point3,
  estimate: Point3,
  maxCm = BIAS_MAX_CM,
): Point3 {
  const dx = prevReported.x - estimate.x
  const dy = prevReported.y - estimate.y
  const dz = prevReported.z - estimate.z
  const d = Math.hypot(dx, dy, dz)
  if (d <= 1e-9) return { x: 0, y: 0, z: 0 }
  const k = Math.min(1, maxCm / d)
  return { x: dx * k, y: dy * k, z: dz * k }
}

/**
 * Exponential decay towards zero. Driven by elapsed time rather than by frames, so
 * a camera running at fifteen frames a second and one running at sixty converge in
 * the same wall clock — which matters here, because a webcam's frame rate collapses
 * in exactly the poor light that makes the head hard to find.
 */
export function decayBias(bias: Point3, dtS: number, tauS = BIAS_TAU_S): Point3 {
  if (!(dtS > 0) || !(tauS > 0)) return bias
  const k = Math.exp(-dtS / tauS)
  return { x: bias.x * k, y: bias.y * k, z: bias.z * k }
}
