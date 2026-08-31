/**
 * Instrument, not a test. Sweeps a grid of candidate anchor positions and
 * reports which the solver considers fair, so a fixture can be authored from
 * measured geometry rather than from arithmetic done by hand — which, the first
 * time, got it wrong by forgetting that two occluders can wall off a side
 * together.
 *
 *   npx vitest run tools/sweep.test.ts --reporter=basic
 */
import { it } from 'vitest'
import { assess } from '../src/engine'
import type { Point3, RoomScan } from '../src/engine'
import raw from '../fixtures/desk.room.json'
import { seated, roomy } from '../fixtures/envelopes'

const base = raw as RoomScan

it('sweep', () => {
  const anchors: Point3[] = []
  for (const z of [-150, -190, -240]) {
    for (const y of [-8, 0, 10]) {
      for (let x = -80; x <= 80; x += 4) anchors.push({ x, y, z })
    }
  }
  const scan: RoomScan = { ...base, anchors }

  for (const [name, env] of [['seated', seated()], ['roomy', roomy()]] as const) {
    const { assessments } = assess(scan, env)
    const fair = assessments.filter((a) => a.fair).sort((a, b) => a.leanCm - b.leanCm)
    console.log(`\n=== ${name}: ${fair.length} fair of ${anchors.length}`)
    for (const a of fair) {
      const t = a.target.at
      console.log(
        `  (${String(t.x).padStart(4)},${String(t.y).padStart(4)},${String(t.z).padStart(5)})` +
          `  lean ${a.leanCm.toFixed(1).padStart(5)}  window ${a.windowCm.toFixed(1).padStart(5)}` +
          `  seen ${String(a.seen).padStart(5)}`,
      )
    }
  }
})
