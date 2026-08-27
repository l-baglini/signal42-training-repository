/**
 * Not a test — a tuning instrument. Prints what the solver thinks of a room, so
 * a fixture can be authored against measured numbers instead of intuition.
 *
 *   npm run probe
 */
import { it } from 'vitest'
import { assess, generate } from '../src/engine'
import type { RoomScan } from '../src/engine'
import raw from '../fixtures/desk.room.json'
import { all } from '../fixtures/envelopes'

const scan = raw as RoomScan

it('probe', () => {
  for (const [name, env] of all()) {
    const { assessments, lattice } = assess(scan, env)
    const out = generate(scan, env)
    console.log(`\n=== ${name}  (lattice ${lattice.count} cells, jitter ${env.jitter}cm)`)
    console.log(
      ['anchor'.padEnd(22), 'seen'.padStart(6), 'lean'.padStart(8), 'window'.padStart(8), 'verdict']
        .join(' '),
    )
    for (const a of assessments) {
      const at = `(${a.target.at.x}, ${a.target.at.y}, ${a.target.at.z})`
      console.log(
        [
          at.padEnd(22),
          String(a.seen).padStart(6),
          (Number.isFinite(a.leanCm) ? a.leanCm.toFixed(1) : '—').padStart(8),
          a.windowCm.toFixed(1).padStart(8),
          a.fair ? 'FAIR' : a.reject,
        ].join(' '),
      )
    }
    console.log(
      out.kind === 'level'
        ? `-> level with ${out.targets.length} targets`
        : `-> REFUSAL: ${out.reason}`,
    )
  }
})
