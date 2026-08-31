/**
 * Instrument. Chooses a spread of candidate anchors for a room fixture, so the
 * fixture proposes what a real scan would propose — many candidates — instead of
 * the handful I picked by hand.
 *
 * The complaint that produced this: hunting the same four positions for ninety
 * seconds is not a game.
 *
 *   npx vitest run --config vitest.tools.config.ts tools/pick-anchors.test.ts
 */
import { it } from 'vitest'
import { assess, footprintMask, latticeOf, nearestRevealing } from '../src/engine'
import type { Point3, RoomScan } from '../src/engine'
import raw from '../fixtures/desk.room.json'
import { seated } from '../fixtures/envelopes'

const base = raw as RoomScan
const MIN_SEPARATION_CM = 14

it('pick', () => {
  const env = seated()
  const lat = latticeOf(env)
  const grid: Point3[] = []
  for (const z of [-150, -180, -210, -240]) {
    for (const y of [-30, -18, -8, 0, 10, 24, 38]) {
      for (let x = -84; x <= 84; x += 6) grid.push({ x, y, z })
    }
  }
  const { assessments } = assess({ ...base, anchors: grid }, env)

  /**
   * The axis mix is enforced, not left to chance. A playtest said the game is
   * "always left and right", and measuring proved it: 79 % of fair targets need
   * a lateral lean, 21 % a vertical one, and 0 % a lean in or out — moving along
   * the sightline barely changes where it crosses an occluder. So the room can
   * be made to feel less monotonous, but only within those two axes.
   */
  const axisOf = (at: Point3): 'x' | 'y' | 'z' | null => {
    const near = nearestRevealing(lat, footprintMask(lat, base.occluders, at), env.rest)
    if (!near) return null
    const d = { x: near.at.x - env.rest.x, y: near.at.y - env.rest.y, z: near.at.z - env.rest.z }
    return (['x', 'y', 'z'] as const).reduce((m, k) => (Math.abs(d[k]) > Math.abs(d[m]) ? k : m))
  }

  const fair = assessments
    .filter((a) => a.fair && a.leanCm >= 6 && a.windowCm >= 1.6)
    // Hardest first, so the greedy spread keeps the interesting ones.
    .sort((a, b) => b.leanCm / b.windowCm - a.leanCm / a.windowCm)

  /**
   * Quota on width as well as axis. Sorting hardest-first and taking the top
   * filled the room with 1.8 cm windows and left no ramp at all — a round has to
   * open with something a first-time player can actually hold.
   */
  const band = (w: number): 'wide' | 'medium' | 'tight' =>
    w >= 4 ? 'wide' : w >= 2.5 ? 'medium' : 'tight'
  const QUOTA: Record<'x' | 'y', Record<'wide' | 'medium' | 'tight', number>> = {
    x: { wide: 5, medium: 5, tight: 3 },
    y: { wide: 3, medium: 2, tight: 2 },
  }
  const taken: Record<'x' | 'y', Record<'wide' | 'medium' | 'tight', number>> = {
    x: { wide: 0, medium: 0, tight: 0 },
    y: { wide: 0, medium: 0, tight: 0 },
  }
  const picked: typeof fair = []
  for (const a of fair) {
    const axis = axisOf(a.target.at)
    if (axis !== 'x' && axis !== 'y') continue
    const b = band(a.windowCm)
    if (taken[axis][b] >= QUOTA[axis][b]) continue
    const far = picked.every(
      (p) =>
        Math.hypot(
          p.target.at.x - a.target.at.x,
          p.target.at.y - a.target.at.y,
          p.target.at.z - a.target.at.z,
        ) >= MIN_SEPARATION_CM,
    )
    if (!far) continue
    picked.push(a)
    taken[axis][b]++
  }
  console.log(
    `lateral ${JSON.stringify(taken.x)}  vertical ${JSON.stringify(taken.y)}`,
  )

  const leans = picked.map((p) => p.leanCm)
  const windows = picked.map((p) => p.windowCm)
  console.log(`\n${picked.length} anchors from ${grid.length} candidates`)
  console.log(`lean   ${Math.min(...leans).toFixed(1)} .. ${Math.max(...leans).toFixed(1)} cm`)
  console.log(`window ${Math.min(...windows).toFixed(1)} .. ${Math.max(...windows).toFixed(1)} cm`)
  console.log(
    JSON.stringify(picked.map((p) => ({ x: p.target.at.x, y: p.target.at.y, z: p.target.at.z }))),
  )
})
