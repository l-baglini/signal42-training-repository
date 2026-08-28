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
/**
 * The nearest place to stand that breaks this sightline.
 *
 * The dual of `nearestRevealing`, and needed for the same reason that one was:
 * without it the instruction "get out of the way" has no direction in it. An
 * enemy that can see the rest position is answered either by shooting it or by
 * moving, and moving is only a decision if the player can tell which way.
 *
 * Sampled on a fixed ring of directions rather than solved on the lattice, because
 * this runs every frame while the previous one ran once per level. Sixteen
 * `visible` tests, the same `visible` the rule uses — so the arrow can never point
 * somewhere that does not actually work.
 *
 * Returns null when nothing on the ring breaks it: the honest answer, and the game
 * should say nothing rather than point at a guess.
 */
export function nearestBreak(
  eye: Point3,
  at: Point3,
  occluders: readonly Billboard[],
  maxCm: number,
  steps = 3,
): Point3 | null {
  if (!visible(eye, at, occluders)) return null
  const dirs: ReadonlyArray<readonly [number, number]> = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071],
  ]
  // Nearest first: the ring is walked outwards, so the first hit is the shortest
  // move that works.
  for (let s = 1; s <= steps; s++) {
    const r = (maxCm * s) / steps
    for (const [dx, dy] of dirs) {
      const p: Point3 = { x: eye.x + dx * r, y: eye.y + dy * r, z: eye.z }
      if (!visible(p, at, occluders)) return p
    }
  }
  return null
}

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
