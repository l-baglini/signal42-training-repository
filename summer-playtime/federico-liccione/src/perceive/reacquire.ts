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
