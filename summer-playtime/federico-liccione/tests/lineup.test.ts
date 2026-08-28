/**
 * Which of the fair positions stand in the room.
 *
 * The properties here are the ones the playtest was reporting the absence of, so
 * they are asserted rather than hoped for: the cover pocket survives any lineup,
 * a full commit finds a threat, and choosing for coverage beats choosing by
 * difficulty alone.
 */
import { describe, expect, it } from 'vitest'
import {
  assessEnemies,
  chooseLineup,
  occupancyWeights,
  threatByReach,
  threatCoverage,
} from '../src/engine'
import type { LineupCandidate } from '../src/engine'
import { LEVELS } from '../fixtures/levels/authored'
import { seated } from '../fixtures/envelopes'

/** The same preparation the app does, once per level. */
function prepared(level: (typeof LEVELS)[number]) {
  const env = seated()
  const { assessments, lattice } = assessEnemies(level.scan, env)
  const fair = assessments.filter((a) => a.fair)
  const candidates: LineupCandidate[] = fair.map((a) => ({
    at: a.enemy.at,
    radius: a.enemy.radius,
    // Cheap stand-in for the game's `pointsFor`: far and precise is hard.
    cost: 14 * a.leanCm + 180 / Math.max(a.windowCm, 0.5),
  }))
  const byCost = candidates.map((_, i) => i).sort((x, y) => candidates[x]!.cost - candidates[y]!.cost)
  return { env, lattice, occluders: level.scan.occluders, candidates, byCost }
}

describe('chooseLineup', () => {
  it('is a permutation: nothing lost, nothing duplicated', () => {
    for (const level of LEVELS) {
      const { lattice, env, occluders, candidates } = prepared(level)
      const order = chooseLineup(lattice, env, occluders, candidates)
      expect(order).toHaveLength(candidates.length)
      expect(new Set(order).size).toBe(candidates.length)
      for (const i of order) expect(i).toBeGreaterThanOrEqual(0)
    }
  })

  it('is deterministic for a seed and varies with it', () => {
    const { lattice, env, occluders, candidates } = prepared(LEVELS[0]!)
    const a = chooseLineup(lattice, env, occluders, candidates, { seed: 3 })
    const b = chooseLineup(lattice, env, occluders, candidates, { seed: 3 })
    const c = chooseLineup(lattice, env, occluders, candidates, { seed: 4 })
    expect(a).toEqual(b)
    expect(a.slice(0, 8)).not.toEqual(c.slice(0, 8))
  })

  it('handles a level with nothing fair in it', () => {
    const { lattice, env, occluders } = prepared(LEVELS[0]!)
    expect(chooseLineup(lattice, env, occluders, [])).toEqual([])
  })

  it('beats choosing by difficulty alone, which is the whole reason it exists', () => {
    /**
     * The failure this replaced: the fair positions were sorted and a slice taken,
     * so a round could stand a set that all needed a long lean the same way. Every
     * one fair, and the room felt empty. Coverage is never worse and is usually
     * better — asserted on every authored level, with at least one strict win so
     * the test cannot pass by the two orderings being identical.
     */
    let strictWins = 0
    for (const level of LEVELS) {
      const { lattice, env, occluders, candidates, byCost } = prepared(level)
      const order = chooseLineup(lattice, env, occluders, candidates, { seed: 1 })
      const chosen = threatCoverage(lattice, occluders, candidates, order, 8)
      const sorted = threatCoverage(lattice, occluders, candidates, byCost, 8)
      expect(chosen).toBeGreaterThanOrEqual(sorted - 1e-9)
      if (chosen > sorted + 1e-6) strictWins++
    }
    expect(strictWins).toBeGreaterThan(0)
  })
})

describe('threatByReach', () => {
  it('leaves the cover pocket alone, on every level', () => {
    /**
     * A consequence of I2 rather than a separate rule, and worth pinning here
     * because it is what makes a *full* room fair rather than merely loud: no
     * shipped enemy can engage from the rest position, so however many stand
     * there, the innermost band of the envelope is threatened by none of them.
     */
    for (const level of LEVELS) {
      const { lattice, env, occluders, candidates } = prepared(level)
      const order = chooseLineup(lattice, env, occluders, candidates)
      const bands = threatByReach(lattice, env, occluders, candidates, order, candidates.length)
      expect(bands[0]!.cells).toBeGreaterThan(0)
      expect(bands[0]!.threatened).toBe(0)
    }
  })

  it('a full commit finds a threat, which is the point of committing', () => {
    for (const level of LEVELS) {
      const { lattice, env, occluders, candidates } = prepared(level)
      const order = chooseLineup(lattice, env, occluders, candidates)
      const bands = threatByReach(lattice, env, occluders, candidates, order, 8)
      const last = bands[bands.length - 1]!
      expect(last.cells).toBeGreaterThan(0)
      expect(last.threatened / last.cells).toBeGreaterThan(0.8)
    }
  })

  it('rises monotonically with how far out you are', () => {
    // Not a coincidence of these fixtures: leaning further can only ever add
    // sightlines, never remove them, so the profile has to climb.
    const { lattice, env, occluders, candidates } = prepared(LEVELS[1]!)
    const order = chooseLineup(lattice, env, occluders, candidates)
    const bands = threatByReach(lattice, env, occluders, candidates, order, 8)
      .filter((b) => b.cells > 0)
      .map((b) => b.threatened / b.cells)
    for (let i = 1; i < bands.length; i++) expect(bands[i]!).toBeGreaterThanOrEqual(bands[i - 1]!)
  })
})

describe('occupancyWeights', () => {
  it('weighs where the body actually is above where it can barely reach', () => {
    // The correction that mattered. Counting cells prefers the widest footprints,
    // which are the long-lean ones, so the plain version was biased against every
    // enemy that makes a modest peek worth making.
    const { lattice, env } = prepared(LEVELS[0]!)
    const w = occupancyWeights(lattice, env)
    let near = 0
    let far = 0
    for (let k = 0; k < lattice.nz; k++)
      for (let j = 0; j < lattice.ny; j++)
        for (let i = 0; i < lattice.nx; i++) {
          const n = i + lattice.nx * (j + lattice.ny * k)
          if (!lattice.inside[n]) continue
          const c = {
            x: lattice.origin.x + i * lattice.pitch,
            y: lattice.origin.y + j * lattice.pitch,
            z: lattice.origin.z + k * lattice.pitch,
          }
          const d = Math.hypot(c.x - env.rest.x, c.y - env.rest.y, c.z - env.rest.z)
          if (d < 4) near = Math.max(near, w[n]!)
          if (d > 16) far = Math.max(far, w[n]!)
        }
    expect(near).toBeGreaterThan(far * 2)
  })
})
