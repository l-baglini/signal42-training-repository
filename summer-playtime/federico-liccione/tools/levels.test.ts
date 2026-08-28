/**
 * Instrument. Runs every authored level through the engine and reports what it
 * makes of it, so a layout is iterated against measurements instead of intuition.
 *
 *   npm run levels
 */
import { it } from 'vitest'
import { assessEnemies, footprintMask, nearestRevealing } from '../src/engine'
import type { Point3 } from '../src/engine'
import { LEVELS } from '../fixtures/levels/authored'
import { frozen, noisy, roomy, seated } from '../fixtures/envelopes'

const bodies = [
  ['seated', seated()],
  ['roomy', roomy()],
  ['noisy', noisy()],
  ['frozen', frozen()],
] as const

it('levels', () => {
  for (const level of LEVELS) {
    console.log(`\n=== ${level.name} (${level.scan.occluders.length} cover, ${level.scan.anchors.length} candidates)`)
    for (const [bodyName, env] of bodies) {
      const { assessments, lattice } = assessEnemies(level.scan, env)
      const fair = assessments.filter((a) => a.fair)
      const rejects: Record<string, number> = {}
      for (const a of assessments) if (a.reject) rejects[a.reject] = (rejects[a.reject] ?? 0) + 1

      // Which way does the body have to move? The complaint was "always left and
      // right", so the mix is measured for every level, every time.
      const axes = { x: 0, y: 0, z: 0 }
      for (const a of fair) {
        const near = nearestRevealing(lattice, footprintMask(lattice, level.scan.occluders, a.enemy.at), env.rest)
        if (!near) continue
        const d: Point3 = {
          x: near.at.x - env.rest.x, y: near.at.y - env.rest.y, z: near.at.z - env.rest.z,
        }
        const axis = (['x', 'y', 'z'] as const).reduce((m, k) => (Math.abs(d[k]) > Math.abs(d[m]) ? k : m))
        axes[axis]++
      }

      const leans = fair.map((a) => a.leanCm)
      const windows = fair.map((a) => a.windowCm)
      const fuses = fair.map((a) => a.enemy.fuseS)
      const range = (xs: number[], d = 1) =>
        xs.length ? `${Math.min(...xs).toFixed(d)}..${Math.max(...xs).toFixed(d)}` : '—'
      console.log(
        `  ${bodyName.padEnd(7)} ${String(fair.length).padStart(3)} fair` +
          `   lean ${range(leans).padEnd(11)} window ${range(windows).padEnd(11)}` +
          ` fuse ${range(fuses, 2).padEnd(11)}` +
          ` axes x${axes.x}/y${axes.y}` +
          `   ${Object.entries(rejects).map(([k, n]) => `${n} ${k}`).join(', ')}`,
      )
    }
  }
})
