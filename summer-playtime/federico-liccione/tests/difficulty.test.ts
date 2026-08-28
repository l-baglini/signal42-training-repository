/**
 * Three difficulties, and the one property that makes them legitimate.
 *
 * The whole project rests on fairness being *derived* from measurements of the
 * player rather than tuned, so a difficulty setting is only allowed to move things
 * that are not fairness. The last describe block is the test that says so, and it
 * is the reason this file exists: if a difficulty could make an enemy unfair, then
 * "every enemy can be escaped" would depend on which radio button was selected,
 * and every other guarantee in the suite would be worth less.
 */
import { describe, expect, it } from 'vitest'
import {
  ADVANCED,
  DEFAULT_DIFFICULTY,
  DIFFICULTIES,
  EASY,
  STANDARD,
  combatConfigFor,
  difficultyById,
} from '../src/game/difficulty'
import { assessEnemies, playEnvelope } from '../src/engine'
import { pointsFor } from '../src/game/combat'
import { LEVELS } from '../fixtures/levels/authored'
import { roomy, seated } from '../fixtures/envelopes'

describe('the three settings', () => {
  it('are all usable, and the default is one of them', () => {
    expect(DIFFICULTIES).toHaveLength(3)
    expect(DIFFICULTIES).toContain(DEFAULT_DIFFICULTY)
    for (const d of DIFFICULTIES) {
      expect(d.waveSize).toBeGreaterThan(0)
      expect(d.hitPenaltyS).toBeGreaterThan(0)
      expect(d.repositionAfterS).toBeGreaterThan(0)
      expect(d.blurb.length).toBeGreaterThan(10)
    }
  })

  it('order monotonically on every axis, so the middle one is the middle one', () => {
    // Not decoration: three settings that each moved a different direction would be
    // three games rather than one game at three difficulties.
    expect(EASY.waveSize).toBeLessThan(STANDARD.waveSize)
    expect(STANDARD.waveSize).toBeLessThan(ADVANCED.waveSize)
    expect(EASY.fuseMarginS).toBeGreaterThan(STANDARD.fuseMarginS)
    expect(STANDARD.fuseMarginS).toBeGreaterThan(ADVANCED.fuseMarginS)
    expect(EASY.hitPenaltyS).toBeLessThan(STANDARD.hitPenaltyS)
    expect(STANDARD.hitPenaltyS).toBeLessThan(ADVANCED.hitPenaltyS)
    expect(EASY.repositionAfterS).toBeGreaterThan(ADVANCED.repositionAfterS)
  })

  it('never take the margin to zero', () => {
    /**
     * The margin is slack over a derived floor, which is what makes it a legitimate
     * difficulty knob at all. At zero the fuse would equal the derivation exactly —
     * arriving in cover at the same instant the shot lands is not an escape, and any
     * error in the latency measurement then costs the player a hit they could not
     * have avoided.
     */
    for (const d of DIFFICULTIES) expect(d.fuseMarginS).toBeGreaterThan(0.25)
  })

  it('resolve by id and fall back rather than throwing', () => {
    expect(difficultyById('advanced')).toBe(ADVANCED)
    expect(difficultyById('nonsense')).toBe(DEFAULT_DIFFICULTY)
    expect(difficultyById('')).toBe(DEFAULT_DIFFICULTY)
  })

  it('carry into the round config without touching the round length', () => {
    // Ninety seconds is a design constraint from SPEC §2 — a neck complains after
    // two or three minutes — not a difficulty dial.
    for (const d of DIFFICULTIES) {
      const c = combatConfigFor(d)
      expect(c.waveSize).toBe(d.waveSize)
      expect(c.hitPenaltyS).toBe(d.hitPenaltyS)
      expect(c.repositionAfterS).toBe(d.repositionAfterS)
      expect(c.durationS).toBe(90)
    }
  })
})

describe('no difficulty can make an enemy unfair', () => {
  /**
   * The load-bearing test. Every enemy the solver ships must satisfy the retreat
   * guarantee — the distance back into cover must fit inside the budget the fuse
   * allows, after reaction time and measured latency are subtracted — and that has
   * to hold at every difficulty, on every level, for every body. Advanced takes the
   * slack away; it may not take the escape away.
   */
  for (const d of DIFFICULTIES) {
    for (const [bodyName, base] of [['seated', seated()], ['roomy', roomy()]] as const) {
      it(`${d.id} · ${bodyName}`, () => {
        const env = playEnvelope(base)
        for (const level of LEVELS) {
          const { assessments } = assessEnemies(level.scan, env, {
            fuseMarginS: d.fuseMarginS,
          })
          const fair = assessments.filter((a) => a.fair)
          expect(fair.length).toBeGreaterThan(0)
          for (const a of fair) {
            expect(Number.isFinite(a.enemy.fuseS)).toBe(true)
            expect(a.retreatCm).toBeLessThanOrEqual(a.retreatBudgetCm + 1e-9)
          }
        }
      })
    }
  }

  it('advanced is genuinely tighter, not just labelled that way', () => {
    // Guards against a difficulty that reads as harder in the panel and changes
    // nothing the player can feel — which is the failure mode of most difficulty
    // settings, and would be invisible to every other test here.
    const env = playEnvelope(seated())
    const fuses = (marginS: number) =>
      assessEnemies(LEVELS[0]!.scan, env, { fuseMarginS: marginS }).assessments
        .filter((a) => a.fair)
        .map((a) => a.enemy.fuseS)
    const easy = fuses(EASY.fuseMarginS)
    const hard = fuses(ADVANCED.fuseMarginS)
    expect(Math.min(...hard)).toBeLessThan(Math.min(...easy))
    expect(Math.max(...hard)).toBeLessThan(Math.max(...easy))
  })

  it('and the tighter fuse is still longer than reaction plus latency', () => {
    // Below that there is no version of responding at all, whatever the geometry.
    const env = playEnvelope(seated())
    const { assessments } = assessEnemies(LEVELS[0]!.scan, env, {
      fuseMarginS: ADVANCED.fuseMarginS,
    })
    for (const a of assessments.filter((x) => x.fair)) {
      expect(a.enemy.fuseS).toBeGreaterThan(0.25 + env.latency)
    }
  })
})

describe('the cost sign flips which end of the range opens the round', () => {
  it('inverts the ordering rather than changing the set', () => {
    /**
     * `chooseLineup` breaks ties in coverage by the caller's cost, and the caller is
     * the game. Advanced signs it negative, so the round opens with the long reaches
     * held to a centimetre. The positions are the same positions and every one of
     * them was proved fair before the sign was applied — this is presentation order,
     * not a change to what ships.
     */
    const env = playEnvelope(seated())
    const { assessments } = assessEnemies(LEVELS[1]!.scan, env)
    const fair = assessments.filter((a) => a.fair)
    const costs = fair.map((a) =>
      pointsFor({ leanCm: a.leanCm, windowCm: a.windowCm, fuseS: a.enemy.fuseS }),
    )
    const cheapestFirst = costs.map((c, i) => [c, i] as const).sort((x, y) => x[0] - y[0])
    const dearestFirst = costs.map((c, i) => [-c, i] as const).sort((x, y) => x[0] - y[0])
    expect(cheapestFirst[0]![1]).not.toBe(dearestFirst[0]![1])
    // And the hardest-first ordering really does start with a harder position.
    expect(costs[dearestFirst[0]![1]]!).toBeGreaterThan(costs[cheapestFirst[0]![1]]!)
  })
})
