/**
 * Instrument. Classifies fair targets by which axis the required lean is
 * dominated by, to answer a playtest complaint — "it is always left and right" —
 * with a measurement instead of an opinion.
 */
import { it } from 'vitest'
import { assess, footprintMask, latticeOf, nearestRevealing } from '../src/engine'
import type { Point3, RoomScan } from '../src/engine'
import raw from '../fixtures/desk.room.json'
import { seated } from '../fixtures/envelopes'

const base = raw as RoomScan

it('axis mix', () => {
  const env = seated()
  const lat = latticeOf(env)
  const grid: Point3[] = []
  for (const z of [-150, -190, -240]) {
    for (const y of [-30, -18, -8, 0, 10, 24, 38]) {
      for (let x = -84; x <= 84; x += 6) grid.push({ x, y, z })
    }
  }
  const { assessments } = assess({ ...base, anchors: grid }, env)
  const tally = { x: 0, y: 0, z: 0 }
  const examples: Record<string, string[]> = { x: [], y: [], z: [] }

  for (const a of assessments) {
    if (!a.fair) continue
    const mask = footprintMask(lat, base.occluders, a.target.at)
    const near = nearestRevealing(lat, mask, env.rest)
    if (!near) continue
    const d = { x: near.at.x - env.rest.x, y: near.at.y - env.rest.y, z: near.at.z - env.rest.z }
    const axis = (['x', 'y', 'z'] as const).reduce((m, k) =>
      Math.abs(d[k]) > Math.abs(d[m]) ? k : m,
    )
    tally[axis]++
    if (examples[axis]!.length < 3) {
      examples[axis]!.push(
        `(${a.target.at.x},${a.target.at.y},${a.target.at.z}) -> lean ` +
          `${d.x.toFixed(0)},${d.y.toFixed(0)},${d.z.toFixed(0)}`,
      )
    }
  }

  const total = tally.x + tally.y + tally.z
  console.log(`\n${total} fair targets of ${grid.length} candidates`)
  for (const k of ['x', 'y', 'z'] as const) {
    const pct = total ? ((tally[k] / total) * 100).toFixed(0) : '0'
    console.log(`  ${k}-dominant: ${String(tally[k]).padStart(4)}  (${pct}%)`)
    for (const e of examples[k]!) console.log(`      ${e}`)
  }
  console.log(`\nbody: x +-${env.support[0]!.toFixed(0)} / y +${env.support[2]!.toFixed(0)} -${env.support[3]!.toFixed(0)} / z ${env.support[4]!.toFixed(0)}..${(-env.support[5]!).toFixed(0)}`)
})
