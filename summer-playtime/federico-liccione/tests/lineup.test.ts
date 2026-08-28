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
  gapCm,
  inradiusCm,
  chooseLineup,
  latticeOf,
  occupancyWeights,
  playEnvelope,
  reachCm,
  threatByReach,
  threatCoverage,
  threatUnion,
} from '../src/engine'
import type { LineupCandidate } from '../src/engine'
import { LEVELS } from '../fixtures/levels/authored'
import { roomy, seated } from '../fixtures/envelopes'

/** The same preparation the app does, once per level. */
function prepared(level: (typeof LEVELS)[number], inTheOpen = true) {
  const env = playEnvelope(seated())
  const { assessments, lattice } = assessEnemies(level.scan, env, {
    allowInTheOpen: inTheOpen,
  })
  const fair = assessments.filter((a) => a.fair)
  const candidates: LineupCandidate[] = fair.map((a) => ({
    at: a.enemy.at,
    radius: a.enemy.radius,
    // Cheap stand-in for the game's `pointsFor`: far and precise is hard.
    cost: 14 * a.leanCm + 180 / Math.max(a.windowCm, 0.5),
    retreatBudgetCm: a.retreatBudgetCm,
    verb: a.verb,
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
     *
     * Enemies-in-the-open are excluded here, and the reason is worth reading. With
     * them in, sorting by cost *wins* on raw coverage — it stands eight enemies
     * that between them threaten every cell, and a lineup that threatens every cell
     * is precisely the one `escapable` exists to refuse. So more coverage would
     * mean less fair, and the comparison stops meaning what it was written to mean.
     * The next test asserts that directly.
     */
    let strictWins = 0
    for (const level of LEVELS) {
      const { lattice, env, occluders, candidates, byCost } = prepared(level, false)
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
  it('leaves the cover pocket alone when every enemy needs a lean', () => {
    /**
     * A consequence of I2 rather than a separate rule: no enemy that needs a lean
     * can engage from the rest position, so however many stand there, the innermost
     * band is threatened by none of them. Asserted with enemies-in-the-open turned
     * **off**, because that is exactly the guarantee they trade away — and what
     * replaces it is asserted in `escapable`'s test below.
     */
    for (const level of LEVELS) {
      const { lattice, env, occluders, candidates } = prepared(level, false)
      const order = chooseLineup(lattice, env, occluders, candidates)
      const bands = threatByReach(lattice, env, occluders, candidates, order, candidates.length)
      expect(bands[0]!.cells).toBeGreaterThan(0)
      expect(bands[0]!.threatened).toBe(0)
    }
  })

  it('a full commit finds a threat, which is the point of committing', () => {
    for (const level of LEVELS) {
      const { lattice, env, occluders, candidates } = prepared(level, false)
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
    const { lattice, env, occluders, candidates } = prepared(LEVELS[1]!, false)
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

describe('playEnvelope', () => {
  const reachOf = (env: ReturnType<typeof seated>) => reachCm(latticeOf(env, 2), env.rest)

  it('lays the level out inside a fraction of what the body can reach', () => {
    const env = seated()
    const play = playEnvelope(env, { fraction: 0.68, comfortCm: 1000 })
    expect(reachOf(play)).toBeLessThan(reachOf(env) * 0.75)
    expect(reachOf(play)).toBeGreaterThan(reachOf(env) * 0.55)
  })

  it('also caps in centimetres, which is the half a fraction cannot do', () => {
    /**
     * The bug this fixes. A fraction scales with the calibration, so a player who
     * calibrated at thirty-six centimetres still had every threat placed past
     * fifteen — the same complaint, unchanged, because a comfortable head
     * excursion is a property of necks and not of how far somebody can stretch.
     */
    const big = roomy()
    expect(reachOf(big)).toBeGreaterThan(20)
    const play = playEnvelope(big, { fraction: 0.68, comfortCm: 14 })
    expect(reachOf(play)).toBeLessThanOrEqual(14.5)
  })

  it('leaves a body that already moves less than the ceiling alone', () => {
    const env = seated()
    const play = playEnvelope(env, { fraction: 1, comfortCm: 1000 })
    expect(play).toBe(env)
  })

  it('keeps the rest position, because that is where cover is', () => {
    const play = playEnvelope(roomy())
    expect(play.rest).toEqual(roomy().rest)
    // And the body's own measurements are untouched: this scales range, not the
    // person. A slower or noisier body must not be handed a harder game.
    expect(play.jitter).toBe(roomy().jitter)
    expect(play.vmax).toBe(roomy().vmax)
    expect(play.latency).toBe(roomy().latency)
  })
})

describe('a lineup with enemies in the open is still escapable', () => {
  const WAVE = 8

  it('always leaves a refuge wide enough to hold, on every level', () => {
    /**
     * The guarantee that replaces the free one. While every enemy needed a lean, I2
     * made the rest position safe from all of them by construction. Enemies that can
     * see you sitting still remove that, so `chooseLineup` has to earn it: the union
     * of what stands must leave somewhere safe, and — the part I got wrong first —
     * somewhere *holdable*. Requiring merely that one cell be safe let a lineup
     * through that threatened the whole envelope at every distance, which is a
     * firing range and not a game. A refuge is held against the same jitter a peek
     * window is held against, so it gets the same criterion.
     */
    for (const level of LEVELS) {
      const { lattice, env, occluders, candidates } = prepared(level)
      const order = chooseLineup(lattice, env, occluders, candidates)
      const union = threatUnion(lattice, occluders, candidates, order, WAVE)
      const safe = new Uint8Array(union.length)
      let safeCells = 0
      for (let i = 0; i < union.length; i++) {
        if (lattice.inside[i] && !union[i]) {
          safe[i] = 1
          safeCells++
        }
      }
      expect(safeCells).toBeGreaterThan(0)
      expect(inradiusCm(lattice, safe)).toBeGreaterThan(2 * env.jitter)
    }
  })

  it('and the refuge is reachable inside the tightest fuse in the lineup', () => {
    for (const level of LEVELS) {
      const { lattice, env, occluders, candidates } = prepared(level)
      const order = chooseLineup(lattice, env, occluders, candidates)
      const standing = order.slice(0, WAVE)
      const budget = Math.min(
        ...standing.map((i) => candidates[i]!.retreatBudgetCm ?? Infinity),
      )
      const union = threatUnion(lattice, occluders, candidates, order, WAVE)
      const safe = new Uint8Array(union.length)
      for (let i = 0; i < union.length; i++) {
        if (lattice.inside[i] && !union[i]) safe[i] = 1
      }
      expect(gapCm(lattice, union, safe)).toBeLessThanOrEqual(budget)
    }
  })

  it('caps them to a share of the lineup rather than letting them win every pick', () => {
    // Coverage is weighted towards where the body spends its time and these cover
    // exactly that, so uncapped they take every slot. Checked on every prefix, not
    // only the first eight, because the cap was per covering block once and the
    // prefixes span several of those.
    for (const level of LEVELS) {
      const { lattice, env, occluders, candidates } = prepared(level)
      const order = chooseLineup(lattice, env, occluders, candidates, { inTheOpenShare: 0.25 })
      let ducks = 0
      for (let n = 0; n < Math.min(order.length, 24); n++) {
        if (candidates[order[n]!]!.verb === 'duck') ducks++
        expect(ducks).toBeLessThanOrEqual(Math.floor((n + 1) * 0.25))
      }
    }
  })

  it('and none of them at all when the share is zero', () => {
    const { lattice, env, occluders, candidates } = prepared(LEVELS[0]!)
    expect(candidates.some((c) => c.verb === 'duck')).toBe(true)
    const order = chooseLineup(lattice, env, occluders, candidates, { inTheOpenShare: 0 })
    for (let n = 0; n < 8; n++) expect(candidates[order[n]!]!.verb).toBe('peek')
  })
})

describe('the guard earns its keep', () => {
  it('the ordering it refuses really does leave nowhere safe', () => {
    /**
     * Stated as a test because it is the whole argument for the guard rather than a
     * detail of it. Ordering the same candidates by difficulty — which is what the
     * game did before any of this — stands a set of enemies-in-the-open that between
     * them threaten the entire envelope. `chooseLineup` refuses that lineup and
     * pays for it in raw coverage, which is the correct trade and not a regression.
     */
    let foundOne = false
    for (const level of LEVELS) {
      const { lattice, env, occluders, candidates, byCost } = prepared(level)
      const holdable = (order: readonly number[]) => {
        const union = threatUnion(lattice, occluders, candidates, order, 8)
        const safe = new Uint8Array(union.length)
        let cells = 0
        for (let i = 0; i < union.length; i++) {
          if (lattice.inside[i] && !union[i]) {
            safe[i] = 1
            cells++
          }
        }
        return cells > 0 && inradiusCm(lattice, safe) > 2 * env.jitter
      }
      expect(holdable(chooseLineup(lattice, env, occluders, candidates))).toBe(true)
      if (!holdable(byCost)) foundOne = true
    }
    expect(foundOne).toBe(true)
  })
})
