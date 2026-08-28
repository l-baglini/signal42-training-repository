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
import { assess } from '../src/engine'
import type { Point3, RoomScan } from '../src/engine'
import raw from '../fixtures/desk.room.json'
import { seated } from '../fixtures/envelopes'

const base = raw as RoomScan
const MIN_SEPARATION_CM = 14

it('pick', () => {
  const grid: Point3[] = []
  for (const z of [-150, -180, -210, -240]) {
    for (const y of [-10, 0, 10, 22]) {
      for (let x = -84; x <= 84; x += 6) grid.push({ x, y, z })
    }
  }
  const { assessments } = assess({ ...base, anchors: grid }, seated())

  const fair = assessments
    .filter((a) => a.fair && a.leanCm >= 6 && a.windowCm >= 1.6)
    // Hardest first, so the greedy spread keeps the interesting ones.
    .sort((a, b) => b.leanCm / b.windowCm - a.leanCm / a.windowCm)

  const picked: typeof fair = []
  for (const a of fair) {
    const far = picked.every(
      (p) =>
        Math.hypot(
          p.target.at.x - a.target.at.x,
          p.target.at.y - a.target.at.y,
          p.target.at.z - a.target.at.z,
        ) >= MIN_SEPARATION_CM,
    )
    if (far) picked.push(a)
    if (picked.length >= 44) break
  }

  const leans = picked.map((p) => p.leanCm)
  const windows = picked.map((p) => p.windowCm)
  console.log(`\n${picked.length} anchors from ${grid.length} candidates`)
  console.log(`lean   ${Math.min(...leans).toFixed(1)} .. ${Math.max(...leans).toFixed(1)} cm`)
  console.log(`window ${Math.min(...windows).toFixed(1)} .. ${Math.max(...windows).toFixed(1)} cm`)
  console.log(
    JSON.stringify(picked.map((p) => ({ x: p.target.at.x, y: p.target.at.y, z: p.target.at.z }))),
  )
})
