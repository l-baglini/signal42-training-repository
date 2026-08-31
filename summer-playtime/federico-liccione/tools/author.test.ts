/**
 * Authoring tool. Turns a hand-designed cover layout into a level.
 *
 *   npm run author
 *
 * The division of labour is the point. **What the room looks like is taste** —
 * where the jambs are, how many uprights, whether there is a parapet — and that
 * stays hand-written below. **Where the enemies may stand is measurement**, and
 * that is not written by hand any more: this sweeps a fine grid of candidate
 * positions through the solver, keeps the ones it can prove fair for two different
 * bodies, and writes them out.
 *
 * It exists because a playtester found The Desk presenting its targets in one
 * specific spot, and the cause was that its twenty-one anchors were placed by hand
 * before any of these instruments existed — four of them turned out to be
 * engageable. `npm run sweep` had already taught this lesson once, in the project's
 * own words: *measure, do not calculate*. This is that lesson made into a command,
 * so the next layout cannot repeat it.
 *
 * The reported profile is threat coverage **in centimetres of lean**, which is the
 * number the levels were iterated against: what fraction of the positions six, nine
 * and twelve centimetres from rest have a threat visible from them. The first band
 * must be zero — that is the cover, and the game needs it.
 */
import { it } from 'vitest'
import { writeFileSync } from 'node:fs'
import {
  assessEnemies,
  chooseLineup,
  footprintMask,
  nearestRevealing,
  playEnvelope,
  reachCm,
  threatByReach,
} from '../src/engine'
import type { Billboard, Point3, RoomScan } from '../src/engine'
import { LIMITS } from '../src/boundary/validate'
import { pointsFor } from '../src/game/combat'
import { roomy, seated } from '../fixtures/envelopes'

const bill = (
  z: number, x0: number, x1: number, y0: number, y1: number, label: string,
): Billboard => ({ z, x0, x1, y0, y1, label })

/** A row of uprights: `n` of width `w` separated by `g`, centred on x = 0. */
function uprights(
  n: number, w: number, g: number, z: number, y0: number, y1: number, tag: string,
): Billboard[] {
  const span = n * w + (n - 1) * g
  return Array.from({ length: n }, (_, i) => {
    const x0 = -span / 2 + i * (w + g)
    return bill(z, x0, x0 + w, y0, y1, `${tag} ${i + 1}`)
  })
}

/** A grid of candidate positions. The engine keeps what it can prove is fair. */
function candidates(
  depths: readonly number[], from: number, to: number, step: number, ys: readonly number[],
): Point3[] {
  const out: Point3[] = []
  for (const z of depths) for (const y of ys) for (let x = from; x <= to; x += step) out.push({ x, y, z })
  return out
}

const DEPTHS = [-150, -190, -235]
const COARSE = candidates(DEPTHS, -84, 84, 6, [-18, -6, 6, 18, 30])
const FINE = candidates(DEPTHS, -84, 84, 5, [-22, -13, -4, 5, 14, 23, 32])

/**
 * The four layouts.
 *
 * Every one of them follows the same two findings, both measured rather than
 * guessed. **Cover belongs near the window**: the player's leverage over a
 * sightline is `(1 - s)` from SPEC §6.3, so moving the jambs from z = -46 to
 * z = -22 took the fraction of positions with a threat visible at six centimetres
 * of lean from 18% to 54%. And **edges matter more than area**: a lattice of
 * narrow uprights crossed by horizontal bands beat two big slabs by another
 * twenty points, and is the only thing that produced any vertical peeking at all.
 */
const LAYOUTS: ReadonlyArray<{
  id: string
  occluders: Billboard[]
  grid: Point3[]
  noSpawn?: Billboard[]
}> = [
  {
    // The introduction, and deliberately the simplest: one axis, one idea.
    id: 'doorway',
    occluders: [
      bill(-22, -96, -13, -44, 48, 'left jamb'),
      bill(-22, 13, 96, -44, 48, 'right jamb'),
      bill(-62, -30, 30, 16, 52, 'lintel'),
    ],
    grid: COARSE,
  },
  {
    // The lattice. Best profile in the set, and the only layout that makes the
    // neck work in both directions.
    id: 'shelves',
    occluders: [
      ...uprights(7, 10, 12, -20, -44, 50, 'upright'),
      bill(-34, -110, 110, -14, -4, 'shelf low'),
      bill(-34, -110, 110, 12, 22, 'shelf mid'),
      bill(-34, -110, 110, 38, 48, 'shelf high'),
    ],
    grid: FINE,
  },
  {
    // Vertical first: a wall to rise above, pillars to lean past, a rail overhead.
    id: 'parapet',
    occluders: [
      bill(-20, -120, 120, -50, -2, 'parapet'),
      ...uprights(5, 12, 22, -30, -4, 52, 'pillar'),
      bill(-44, -120, 120, 34, 52, 'rail'),
    ],
    grid: FINE,
  },
  {
    // A room of furniture rather than a designed layout, which is what the scan
    // pipeline produces. It is here to keep that case honest.
    id: 'desk',
    occluders: [
      bill(-26, -34, -6, -16, 18, 'monitor'),
      bill(-30, 10, 30, -30, 4, 'chair back'),
      bill(-22, 34, 46, -28, 34, 'shelf upright'),
      bill(-36, -58, -40, -24, 30, 'lamp'),
      bill(-44, -120, 120, -50, -26, 'desk edge'),
      bill(-40, -20, 6, 22, 44, 'shelf above'),
    ],
    grid: FINE,
    noSpawn: [bill(-300, -110, -45, 10, 70, 'backlit window')],
  },
]

/**
 * A level holds at most 256 anchors and a fine sweep proposes seven hundred, so
 * something has to choose. **The engine chooses.**
 *
 * My first version took every nth of the swept list, and it cost twenty-five points
 * of threat coverage — a grid subsampled at a regular stride lands on a regular
 * sublattice, which is the exact aliasing that took three attempts to get right in
 * `proposeAnchors` and which I walked straight back into. Running the coverage
 * objective and keeping its prefix has no such failure mode: it is the same
 * criterion the game uses to decide who stands, applied one level up to decide who
 * is even eligible.
 */
function chosenByCoverage(
  scan: RoomScan, keep: readonly string[], want: number,
): readonly string[] {
  if (keep.length <= want) return keep
  const env = playEnvelope(seated())
  const { assessments, lattice } = assessEnemies(scan, env)
  const fair = assessments.filter((a) => a.fair)
  const cands = fair.map((a) => ({
    at: a.enemy.at, radius: a.enemy.radius, verb: a.verb,
    retreatBudgetCm: a.retreatBudgetCm,
    cost: pointsFor({ leanCm: a.leanCm, windowCm: a.windowCm, fuseS: a.enemy.fuseS }),
  }))
  const order = chooseLineup(lattice, env, scan.occluders, cands,
    { seed: 1, inTheOpenShare: 0, limit: want })
  const eligible = new Set(keep)
  const out: string[] = []
  for (const i of order) {
    const at = cands[i]!.at
    const k = `${at.x},${at.y},${at.z}`
    if (eligible.has(k) && !out.includes(k)) out.push(k)
    if (out.length >= want) break
  }
  return out
}

const BODIES = [['seated', seated()], ['roomy', roomy()]] as const

it('author', () => {
  for (const layout of LAYOUTS) {
    const keep = new Map<string, number>()
    for (const [, base] of BODIES) {
      const env = playEnvelope(base)
      const { assessments } = assessEnemies(
        { source: 'fixture', occluders: layout.occluders, anchors: layout.grid, noSpawn: [],
          provenance: { model: 'author', atISO: '2026-08-29T00:00:00.000Z', costCents: 0 } },
        env,
      )
      assessments.forEach((a, i) => {
        if (!a.fair) return
        const p = layout.grid[i]!
        const k = `${p.x},${p.y},${p.z}`
        keep.set(k, (keep.get(k) ?? 0) + 1)
      })
    }
    /**
     * Fair for **at least one** reference body, not for all of them.
     *
     * I wrote the intersection first — "so a level is not tuned to one neck" — and
     * it cost twenty-five points of coverage at six centimetres of lean. The reason
     * is a property of the solver I had not thought through: "requires a lean" is
     * `leanCm >= leanFraction * reach`, and reach scales with the body, so a larger
     * body's threshold rejects precisely the *shortest-lean* candidates — which are
     * the ones that make a modest peek find anything. Intersecting two bodies
     * therefore deletes the easy enemies and keeps the hard ones, which is exactly
     * backwards.
     *
     * The union is also the honest structure. What is stored here is a set of
     * **candidates**; `assessEnemies` re-judges every one of them against the body
     * actually playing, and discards what it cannot prove. A wider proposal cannot
     * make a level unfair — it can only give the judge more to work with.
     */
    const both = [...keep.keys()]
    const eligible: RoomScan = {
      source: 'fixture',
      occluders: layout.occluders,
      anchors: both.map((k) => {
        const [x, y, z] = k.split(',').map(Number)
        return { x: x!, y: y!, z: z! }
      }),
      noSpawn: [],
      provenance: { model: 'author', atISO: '2026-08-29T00:00:00.000Z', costCents: 0 },
    }
    const anchors = chosenByCoverage(eligible, both, LIMITS.maxAnchors - 56).map((k) => {
      const [x, y, z] = k.split(',').map(Number)
      return { x: x!, y: y!, z: z! }
    })

    const scan: RoomScan = {
      source: 'fixture',
      occluders: layout.occluders,
      anchors,
      noSpawn: layout.noSpawn ?? [],
      provenance: {
        model: `swept:${layout.id}`,
        atISO: '2026-08-29T00:00:00.000Z',
        costCents: 0,
      },
    }
    writeFileSync(`fixtures/levels/${layout.id}.room.json`, JSON.stringify(scan, null, 2) + '\n')

    const lines: string[] = []
    for (const [bn, base] of BODIES) {
      const env = playEnvelope(base)
      const { assessments, lattice } = assessEnemies(scan, env)
      const fair = assessments.filter((a) => a.fair)
      const cands = fair.map((a) => ({
        at: a.enemy.at, radius: a.enemy.radius, verb: a.verb,
        retreatBudgetCm: a.retreatBudgetCm,
        cost: pointsFor({ leanCm: a.leanCm, windowCm: a.windowCm, fuseS: a.enemy.fuseS }),
      }))
      const order = chooseLineup(lattice, env, layout.occluders, cands,
        { seed: 1, inTheOpenShare: 0, limit: 40 })
      const reach = reachCm(lattice, env.rest) || 1
      const CM = [3, 6, 9, 12]
      const bands = threatByReach(lattice, env, layout.occluders, cands, order, 8,
        CM.map((c) => c / reach + 1e-9))
      const axes = { x: 0, y: 0 }
      for (const a of fair) {
        const near = nearestRevealing(
          lattice, footprintMask(lattice, layout.occluders, a.enemy.at), env.rest,
        )
        if (!near) continue
        if (Math.abs(near.at.x - env.rest.x) >= Math.abs(near.at.y - env.rest.y)) axes.x++
        else axes.y++
      }
      lines.push(
        `  ${bn.padEnd(7)} ${String(fair.length).padStart(3)} fair  ` +
        bands.map((b, i) =>
          `${CM[i]}cm ${b.cells ? ((100 * b.threatened) / b.cells).toFixed(0).padStart(3) : '  -'}%`,
        ).join(' ') +
        `  axes x${axes.x}/y${axes.y}`,
      )
    }
    console.log(
      `\n=== ${layout.id}: ${layout.occluders.length} cover, ` +
      `${layout.grid.length} swept -> ${anchors.length} anchors\n${lines.join('\n')}`,
    )
  }
})
