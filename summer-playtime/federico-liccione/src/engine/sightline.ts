import type { Billboard, Point3 } from './types'

/**
 * Can the target be seen from eye position `e`?
 *
 * Only occluders strictly between the eye and the target can hide it. The
 * crossing point of the segment with the occluder's plane is exact — no
 * epsilon, no iteration.
 *
 * One convention had to be chosen, and it is stated here so that the tests
 * assert it rather than discover it: a sightline that grazes a rectangle's edge
 * counts as **occluded**.
 */
export function visible(e: Point3, t: Point3, occluders: readonly Billboard[]): boolean {
  const dz = t.z - e.z
  if (dz === 0) return true // degenerate: no plane can lie strictly between
  for (const o of occluders) {
    if (!(t.z < o.z && o.z < e.z)) continue
    const s = (o.z - e.z) / dz
    const px = e.x + (t.x - e.x) * s
    const py = e.y + (t.y - e.y) * s
    if (px >= o.x0 && px <= o.x1 && py >= o.y0 && py <= o.y1) return false
  }
  return true
}

/**
 * Which occluders are hiding the target from here.
 *
 * The game needs this to be able to say *what to peek around*. A target the
 * player cannot see is, on screen, nothing at all — and a hunt with no visible
 * subject is not a hunt. Pointing at the furniture doing the hiding is the
 * smallest cue that makes the goal legible without giving the position away.
 */
export function blockingOccluders(
  e: Point3,
  t: Point3,
  occluders: readonly Billboard[],
): Billboard[] {
  const blocking: Billboard[] = []
  const dz = t.z - e.z
  if (dz === 0) return blocking
  for (const o of occluders) {
    if (!(t.z < o.z && o.z < e.z)) continue
    const s = (o.z - e.z) / dz
    const px = e.x + (t.x - e.x) * s
    const py = e.y + (t.y - e.y) * s
    if (px >= o.x0 && px <= o.x1 && py >= o.y0 && py <= o.y1) blocking.push(o)
  }
  return blocking
}

/**
 * The player's leverage over where the sightline crosses an occluder's plane.
 *
 * The crossing point is `e·(1-s) + t·s`, so leverage is `(1 - s)`. An occluder
 * close to the target has s → 1 and the player has almost none: no amount of
 * leaning will clear it. Leverage lives in occluders close to the window.
 *
 * Exported because level design has to be able to ask, and because a number
 * that explains why a target is unreachable is worth more than the bare verdict.
 */
export function leverage(e: Point3, t: Point3, occluderZ: number): number {
  const dz = t.z - e.z
  if (dz === 0) return 0
  return 1 - (occluderZ - e.z) / dz
}
