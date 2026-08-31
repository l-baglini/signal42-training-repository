/**
 * The combat loop, tested as the state machine it is: scripted ticks, no clock,
 * no DOM, no renderer.
 *
 * The first version of this file assumed enemy 0 always spawns first. It does
 * not — the spawn order is seeded for variety — so the tests now *read* which
 * enemy is in play instead of assuming. A test that depends on the arithmetic of
 * a seed is testing the seed.
 *
 * Note what is not tested here, because it is not this file's business: whether
 * an enemy is shootable, survivable or escapable. Those are engine questions,
 * asserted in exposure.test.ts.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_COMBAT,
  accuracy,
  newCombat,
  pointsFor,
  startCombat,
  step,
} from '../src/game/combat'
import type { CombatConfig, CombatState, CombatTick, EnemySpec } from '../src/game/combat'
import type { Point3 } from '../src/engine'

const EYE: Point3 = { x: 0, y: 0, z: 60 }
const SPECS: EnemySpec[] = [
  { leanCm: 7, windowCm: 4, fuseS: 1.4 },
  { leanCm: 12, windowCm: 2, fuseS: 1.1 },
]
const cfg: CombatConfig = { ...DEFAULT_COMBAT, seed: 5, waveSize: 1 }

interface Driver {
  readonly state: CombatState
  readonly events: CombatState['events'][number][]
  /** The enemy currently in play, or -1. */
  readonly index: number
  at(tS: number, over?: Partial<CombatTick>): Driver
  /** Ticks at 20 Hz from `fromS` to `toS`. */
  span(fromS: number, toS: number, over?: Partial<CombatTick>): Driver
}

function driver(config: CombatConfig = cfg, specs: readonly EnemySpec[] = SPECS): Driver {
  let state = startCombat(config)
  const events: CombatState['events'][number][] = []
  const d: Driver = {
    get state() { return state },
    get events() { return events },
    get index() { return state.active[0]?.index ?? -1 },
    at(tS, over = {}) {
      state = step(state, config, specs, {
        tS, eye: EYE, exposed: [false, false], aimedAt: [], firing: false, ...over,
      })
      events.push(...state.events)
      return d
    },
    span(fromS, toS, over = {}) {
      for (let t = fromS; t <= toS + 1e-9; t += 0.05) d.at(Number(t.toFixed(3)), over)
      return d
    },
  }
  return d
}

/** An exposure vector with just this enemy visible. */
const only = (i: number): boolean[] => SPECS.map((_, k) => k === i)

describe('scoring', () => {
  it('pays more for a longer lean and a tighter window', () => {
    const base = pointsFor(SPECS[0]!)
    expect(pointsFor({ ...SPECS[0]!, leanCm: 20 })).toBeGreaterThan(base)
    expect(pointsFor({ ...SPECS[0]!, windowCm: 1 })).toBeGreaterThan(base)
  })
})

describe('the trigger', () => {
  it('kills an enemy that is exposed and under the crosshair', () => {
    const d = driver().at(0)
    const i = d.index
    expect(i).toBeGreaterThanOrEqual(0)
    d.at(0.1, { exposed: only(i), aimedAt: [i], firing: true })
    expect(d.state.killed).toBe(1)
    expect(d.state.score).toBe(pointsFor(SPECS[i]!))
    expect(d.events.some((e) => e.kind === 'killed')).toBe(true)
  })

  it('cannot shoot through cover, however good the aim', () => {
    // The symmetry cuts both ways: what cannot see you, you cannot shoot.
    const d = driver().at(0)
    d.at(0.1, { exposed: [false, false], aimedAt: [d.index], firing: true })
    expect(d.state.killed).toBe(0)
    expect(d.state.shotsFired).toBe(1)
    expect(d.events.some((e) => e.kind === 'miss')).toBe(true)
  })

  it('misses when the crosshair is on nothing', () => {
    const d = driver().at(0)
    d.at(0.1, { exposed: only(d.index), firing: true })
    expect(d.state.killed).toBe(0)
    expect(d.state.shotsFired).toBe(1)
  })

  it('cannot shoot an enemy that has not spawned', () => {
    const d = driver().at(0)
    const other = d.index === 0 ? 1 : 0
    d.at(0.1, { exposed: only(other), aimedAt: [other], firing: true })
    expect(d.state.killed).toBe(0)
  })

  it('counts every shot, so accuracy means something', () => {
    const d = driver().at(0)
    const i = d.index
    d.at(0.1, { firing: true })
    d.at(0.2, { firing: true })
    d.at(0.3, { exposed: only(i), aimedAt: [i], firing: true })
    expect(d.state.shotsFired).toBe(3)
    expect(accuracy(d.state)).toBeCloseTo(1 / 3, 6)
    expect(accuracy(newCombat(cfg))).toBe(0)
  })
})

describe('exposure is the risk and the opportunity at once', () => {
  it('staying out past the fuse gets you shot, and it costs clock', () => {
    const d = driver().at(0)
    const i = d.index
    d.span(0.05, SPECS[i]!.fuseS + 0.4, { exposed: only(i) })
    expect(d.state.timesShot).toBeGreaterThan(0)
    expect(d.events.some((e) => e.kind === 'shot')).toBe(true)
    expect(d.state.endsAtS).toBeLessThan(cfg.durationS)
  })

  it('ducking before the fuse ends is the whole defence', () => {
    const d = driver().at(0)
    const i = d.index
    const fuse = SPECS[i]!.fuseS
    d.span(0.05, fuse - 0.3, { exposed: only(i) })
    d.span(fuse - 0.25, fuse + 3, { exposed: [false, false] })
    expect(d.state.timesShot).toBe(0)
  })

  it('the fuse drains in cover rather than resetting instantly', () => {
    const d = driver().at(0)
    const i = d.index
    const almost = SPECS[i]!.fuseS - 0.15
    d.span(0.05, almost, { exposed: only(i) })
    // A single frame of cover: forgiving, but it must not wipe the whole fuse.
    d.at(almost + 0.05, { exposed: [false, false] })
    d.span(almost + 0.1, almost + 0.4, { exposed: only(i) })
    expect(d.state.timesShot).toBe(1)
  })

  it('firing and ducking on the same frame earns the kill — the shot left first', () => {
    const d = driver().at(0)
    const i = d.index
    d.span(0.05, SPECS[i]!.fuseS - 0.1, { exposed: only(i) })
    d.at(SPECS[i]!.fuseS + 0.5, { exposed: only(i), aimedAt: [i], firing: true })
    expect(d.state.killed).toBe(1)
    expect(d.state.timesShot).toBe(0)
  })
})

describe('the room stands full', () => {
  it('is full on the first tick, not on a timer', () => {
    /**
     * The complaint this answers, in the playtester's words: *"prima quando ti
     * affacciavi vedevi già presenti i nemici ed era tutto più dinamico e
     * divertente"*. A drip-feed meant leaning out mostly found nothing, and the
     * loop collapsed into move-and-shoot. Leaning out has to find a situation.
     */
    const d = driver({ ...cfg, waveSize: 2 }).at(0)
    expect(d.state.active.length).toBe(2)
  })

  it('an enemy that is never engaged stays put', () => {
    // They do not leave any more. There is nothing to wait out: the only way the
    // room empties is that you empty it.
    const d = driver().at(0).span(0, 30)
    expect(d.state.active.length).toBe(1)
    expect(d.state.score).toBe(0)
  })

  it('replaces a kill one at a time, so the kill reads', () => {
    const d = driver({ ...cfg, waveSize: 2 }).at(0)
    const target = d.state.active[0]!.index
    d.at(0.1, { exposed: only(target), aimedAt: [target], firing: true })
    expect(d.state.active.length).toBe(1)
    d.span(0.15, 1.4)
    expect(d.state.active.length).toBe(2)
  })

  it('a killed enemy does not walk back into the same spot', () => {
    /**
     * The playtest report was *"una volta uccisi, rinascono sempre nella stessa
     * posizione"*, and it was exactly right. The specs arrive in the engine's
     * coverage order, best first, and the room stands the front of that order — so
     * the moment index 3 died, index 3 was again the best available candidate.
     * Correct by the old rule and absurd on screen.
     */
    const specs: EnemySpec[] = [
      { leanCm: 7, windowCm: 4, fuseS: 1.4 },
      { leanCm: 8, windowCm: 4, fuseS: 1.4 },
      { leanCm: 9, windowCm: 4, fuseS: 1.4 },
    ]
    const d = driver({ ...cfg, waveSize: 1 }, specs).at(0)
    const first = d.index
    d.at(0.1, { exposed: specs.map((_, i) => i === first), aimedAt: [first], firing: true })
    d.span(0.15, 2)
    expect(d.state.active.map((a) => a.index)).not.toContain(first)
    expect(d.state.dead).toContain(first)
  })

  it('refills a cleared room rather than ending the round early', () => {
    // Ninety seconds is the contract. Running out of bodies with thirty left would
    // be a worse answer than a second pass through a room already read.
    const specs: EnemySpec[] = [{ leanCm: 7, windowCm: 4, fuseS: 1.4 }]
    const d = driver({ ...cfg, waveSize: 1 }, specs).at(0)
    d.at(0.1, { exposed: [true], aimedAt: [0], firing: true })
    expect(d.state.killed).toBe(1)
    d.span(0.15, 2)
    expect(d.state.active.map((a) => a.index)).toEqual([0])
    expect(d.state.dead).toEqual([])
    expect(d.state.phase).toBe('playing')
  })

  it('an enemy nobody looks at moves on rather than holding one spot all round', () => {
    /**
     * *"Il bersaglio continua a presentarsi in un solo punto specifico."* The
     * playtester's own suggestion was moving targets, and this is that in the only
     * form the engine can honestly support: a step between positions the solver has
     * **already judged**, so every place it can be was proved fair, escapable and on
     * screen before the round began. A freely moving enemy would make fairness a
     * claim about a trajectory, which is not provable at the price of the rest of
     * the solver.
     */
    const specs: EnemySpec[] = [
      { leanCm: 7, windowCm: 4, fuseS: 1.4 },
      { leanCm: 8, windowCm: 4, fuseS: 1.4 },
    ]
    const d = driver({ ...cfg, waveSize: 1, repositionAfterS: 2 }, specs).at(0)
    const first = d.index
    d.span(0.05, 1.5)
    expect(d.index).toBe(first)
    d.span(1.55, 3.5)
    expect(d.events.some((e) => e.kind === 'moved')).toBe(true)
    expect(d.index).not.toBe(first)
    // And nobody died for it.
    expect(d.state.killed).toBe(0)
    expect(d.state.dead).toEqual([])
  })

  it('does not move one the player is currently looking at', () => {
    // Or something would vanish out from under a shot, and something else would
    // materialise in front of a player who had earned the kill.
    const specs: EnemySpec[] = [
      { leanCm: 7, windowCm: 4, fuseS: 1.4 },
      { leanCm: 8, windowCm: 4, fuseS: 1.4 },
    ]
    const d = driver({ ...cfg, waveSize: 1, repositionAfterS: 2 }, specs).at(0)
    const first = d.index
    d.span(0.05, 4, { exposed: specs.map((_, i) => i === first) })
    expect(d.index).toBe(first)
  })

  it('never hands a vacated position straight back to the body that left it', () => {
    // The identical mistake as the respawn, one tick apart: the top-up takes the
    // front of the coverage order, and the position just vacated is at the front.
    const specs: EnemySpec[] = [
      { leanCm: 7, windowCm: 4, fuseS: 1.4 },
      { leanCm: 8, windowCm: 4, fuseS: 1.4 },
      { leanCm: 9, windowCm: 4, fuseS: 1.4 },
    ]
    const d = driver({ ...cfg, waveSize: 1, repositionAfterS: 1 }, specs).at(0)
    const first = d.index
    d.span(0.05, 2.5)
    expect(d.index).not.toBe(first)
  })

  it('never has the same enemy in play twice', () => {
    const wide: CombatConfig = { ...cfg, waveSize: 2, waveGapS: 0.1 }
    const d = driver(wide).span(0, 8)
    expect(new Set(d.state.active.map((a) => a.index)).size).toBe(d.state.active.length)
  })

  it('cannot want more bodies than the level has positions', () => {
    const d = driver({ ...cfg, waveSize: 9 }).span(0, 6)
    expect(d.state.active.length).toBe(SPECS.length)
  })

  it('a hit resets every fuse, not only the one that landed', () => {
    /**
     * With a standing lineup one lean can open three sightlines, and without this
     * a single moment of over-exposure would bill the player three times in three
     * frames. It also buys one fuse of grace to get back behind cover.
     */
    const d = driver({ ...cfg, waveSize: 2 }).at(0)
    const all = SPECS.map(() => true)
    d.span(0.05, 3, { exposed: all })
    const shots = d.events.filter((e) => e.kind === 'shot')
    // Two enemies, three seconds fully exposed, fuses of 1.4 s and 1.1 s: without
    // the reset this would be five or six hits.
    expect(shots.length).toBeGreaterThan(0)
    expect(shots.length).toBeLessThanOrEqual(3)
  })
})

describe('the round ends', () => {
  it('at its duration', () => {
    expect(driver().at(0).at(cfg.durationS + 0.1).state.phase).toBe('over')
  })

  it('earlier when hits have eaten the clock', () => {
    const d = driver().at(0)
    d.span(0.05, cfg.durationS - 20, { exposed: [true, true] })
    expect(d.state.timesShot).toBeGreaterThan(0)
    expect(d.state.endsAtS).toBe(cfg.durationS - d.state.timesShot * cfg.hitPenaltyS)
  })

  it('and stops changing once it is over', () => {
    const d = driver().at(cfg.durationS + 1)
    const before = d.state.score
    d.at(cfg.durationS + 2, { exposed: [true, true], aimedAt: [0, 1], firing: true })
    expect(d.state.score).toBe(before)
    expect(d.state.events).toHaveLength(0)
  })

  it('immediately when the engine shipped no enemies — a refusal is not a round', () => {
    expect(step(startCombat(cfg), cfg, [], {
      tS: 0, eye: EYE, exposed: [], aimedAt: [], firing: false,
    }).phase).toBe('over')
  })
})

describe('determinism', () => {
  it('the same script produces the same round', () => {
    const run = () => driver().span(0, 40).state
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()))
  })
})
