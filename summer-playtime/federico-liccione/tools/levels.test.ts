/**
 * Instrument. Runs every authored level through the engine and reports what it
 * makes of it, so a layout is iterated against measurements instead of intuition.
 *
 *   npm run levels
 */
import { it } from 'vitest'
import {
  assessEnemies,
  chooseLineup,
  footprintMask,
  nearestRevealing,
  threatByReach,
  reachCm,
  playEnvelope,
} from '../src/engine'
import type { Point3 } from '../src/engine'
import { pointsFor } from '../src/game/combat'
import { LEVELS } from '../fixtures/levels/authored'
import { frozen, noisy, roomy, seated } from '../fixtures/envelopes'

/**
 * The fraction of the calibrated envelope the app lays a level out inside. See
 * `PLAY_FRACTION` in src/main.ts — calibration measures the maximum a body can
 * reach, and a level placed at that maximum is a level nobody plays.
 */
const PLAY = Number(process.env.PLAY ?? 0.68)
const COMFORT = Number(process.env.COMFORT ?? 14)

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
      const play = playEnvelope(env, { fraction: PLAY, comfortCm: COMFORT })
      const { assessments, lattice } = assessEnemies(level.scan, play)
      const fair = assessments.filter((a) => a.fair)
      const rejects: Record<string, number> = {}
      for (const a of assessments) if (a.reject) rejects[a.reject] = (rejects[a.reject] ?? 0) + 1

      // Which way does the body have to move? The complaint was "always left and
      // right", so the mix is measured for every level, every time.
      const axes = { x: 0, y: 0, z: 0 }
      for (const a of fair) {
        const near = nearestRevealing(lattice, footprintMask(lattice, level.scan.occluders, a.enemy.at), play.rest)
        if (!near) continue
        const d: Point3 = {
          x: near.at.x - play.rest.x, y: near.at.y - play.rest.y, z: near.at.z - play.rest.z,
        }
        const axis = (['x', 'y', 'z'] as const).reduce((m, k) => (Math.abs(d[k]) > Math.abs(d[m]) ? k : m))
        axes[axis]++
      }

      /**
       * The number the standing lineup lives or dies by: of all the ways this
       * body can peek, how many reveal at least one of the enemies standing
       * there. A round where this is low is a round that feels empty however many
       * fair positions the level has, which is exactly the playtest complaint the
       * selection was written to answer.
       */
      const cands = fair.map((a) => ({
        at: a.enemy.at,
        radius: a.enemy.radius,
        cost: pointsFor({ leanCm: a.leanCm, windowCm: a.windowCm, fuseS: a.enemy.fuseS }),
      }))
      const order = chooseLineup(lattice, play, level.scan.occluders, cands, { seed: 1 })
      /**
       * Banded, not averaged. The aggregate hid the problem: the lattice has far
       * more cells in the middle of an envelope than at its edge, so a mean over
       * cells is dominated by the middle. The first band is the cover and must
       * stay near zero; the last should be near one; the middle is the number
       * worth arguing about.
       */
      /**
       * In **centimetres of lean**, not in fractions of reach. Fractions are not
       * comparable between two values of PLAY, and centimetres are what the player
       * actually feels — this instrument exists to compare them.
       *
       * The lattice stops at the play envelope, so nothing past its edge is
       * measured. That is not a gap: leaning past the edge keeps every sightline
       * the edge had, so the real profile holds at the last figure.
       */
      const reach = reachCm(lattice, play.rest) || 1
      const CM = [3, 6, 9, 12, 15, 18, 24]
      const cover = (o: readonly number[], n: number) =>
        threatByReach(lattice, play, level.scan.occluders, cands, o, n,
          CM.map((cm) => cm / reach + 1e-9))
          .map((b, i) => `${CM[i]}cm ${
            b.cells ? ((100 * b.threatened) / b.cells).toFixed(0).padStart(3) : '  -'
          }%`)
          .join(' ')
      // What the rotating lean-sorted slice would have given, for comparison.
      const byLean = cands.map((_, i) => i).sort((a, b) => cands[a]!.cost - cands[b]!.cost)

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
      if (fair.length > 0) {
        console.log(
          `          threat, 8 standing: ${cover(order, 8)}  (reach ${reach.toFixed(0)}cm)` +
            `   window ${range(order.slice(0, 8).map((i) => fair[i]!.windowCm))}\n` +
            `                      cost-sorted 8: ${cover(byLean, 8)}`,
        )
      }
    }
  }
})
