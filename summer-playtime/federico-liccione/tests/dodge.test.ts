/**
 * I7 — the latency guard bites.
 *
 * A guard that never fires is not a guard, so the central test here is not that
 * dodgeable threats pass: it is that adding latency makes previously-acceptable
 * threats be rejected.
 */
import { describe, expect, it } from 'vitest'
import { REACTION_S, dodgeVerdict, dodgeableFromAnywhere, latticeOf, shouldSpawn } from '../src/engine'
import type { Envelope, Threat } from '../src/engine'
import { seated } from '../fixtures/envelopes'

const env = seated()
const lat = latticeOf(env)
const REST = env.rest

/** Aimed at the rest position, so standing still is being hit. */
const aimedAtRest = (flightS: number, radius: number): Threat => ({
  from: { x: 0, y: 0, z: -300 },
  to: REST,
  tSpawn: 0,
  tImpact: flightS,
  radius,
})

describe('the arithmetic is the stated arithmetic', () => {
  it('usable time subtracts reaction and measured latency, and never goes negative', () => {
    const v = dodgeVerdict(lat, aimedAtRest(0.6, 10), env, REST)
    expect(v.usableS).toBeCloseTo(0.6 - REACTION_S - env.latency, 6)
    expect(v.budgetCm).toBeCloseTo(env.vmax * v.usableS, 6)
    expect(dodgeVerdict(lat, aimedAtRest(0.1, 10), env, REST).usableS).toBe(0)
  })
})

describe('I7 — injecting latency rejects threats that previously passed', () => {
  // 0.6 s of flight, 14 cm of impact radius: the nearest safe cell is ~14 cm
  // away, the budget is 17.4 cm at 60 ms of latency and 11.4 cm at 160 ms.
  const threat = aimedAtRest(0.6, 14)

  it('passes with the measured latency', () => {
    expect(shouldSpawn(lat, threat, env, REST)).toBe(true)
  })

  it('and is refused with 100 ms more', () => {
    const slower: Envelope = { ...env, latency: env.latency + 0.1 }
    expect(shouldSpawn(lat, threat, slower, REST)).toBe(false)
  })

  it('the guard is not vacuous: something must actually flip', () => {
    const slower: Envelope = { ...env, latency: env.latency + 0.1 }
    let flipped = 0
    for (let flight = 0.4; flight <= 1.2; flight += 0.05) {
      for (const radius of [6, 10, 14, 18]) {
        const t = aimedAtRest(flight, radius)
        if (shouldSpawn(lat, t, env, REST) && !shouldSpawn(lat, t, slower, REST)) flipped++
      }
    }
    expect(flipped).toBeGreaterThan(3)
  })

  it('a slower tracker never makes MORE threats acceptable', () => {
    const slower: Envelope = { ...env, latency: env.latency + 0.1 }
    for (let flight = 0.3; flight <= 1.5; flight += 0.05) {
      for (const radius of [4, 8, 12, 16, 20]) {
        const t = aimedAtRest(flight, radius)
        if (shouldSpawn(lat, t, slower, REST)) {
          expect(shouldSpawn(lat, t, env, REST), 'monotone in latency').toBe(true)
        }
      }
    }
  })
})

describe('the impossible cases are refused, not fudged', () => {
  it('an impact that swallows the whole envelope has no safe cell', () => {
    const v = dodgeVerdict(lat, aimedAtRest(3, 500), env, REST)
    expect(v.safeCells).toBe(0)
    expect(v.needCm).toBe(Infinity)
    expect(v.dodgeable).toBe(false)
  })

  it('no time at all is never dodgeable, however small the threat', () => {
    expect(dodgeVerdict(lat, aimedAtRest(0.05, 2), env, REST).dodgeable).toBe(false)
  })

  it('plenty of time and a small impact is dodgeable from anywhere', () => {
    expect(dodgeableFromAnywhere(lat, aimedAtRest(2.5, 5), env)).toBe(true)
  })

  it('for a threat aimed at rest, rest IS the worst case', () => {
    /**
     * Not what I assumed when writing this test. `needCm` is the distance to the
     * nearest *safe* cell, so a player near the edge of their envelope is often
     * already outside the impact and has nothing to do. The hardest place to be
     * is the centre of the impact. So when a threat is aimed at rest, the
     * offline check over the whole envelope collapses to the check from rest.
     */
    const t = aimedAtRest(0.6, 14)
    expect(shouldSpawn(lat, t, env, REST)).toBe(true)
    expect(dodgeableFromAnywhere(lat, t, env)).toBe(true)
  })

  it('the offline check IS stricter when the threat is aimed off-centre', () => {
    // Aimed at the +x edge: a player at rest is already 18 cm clear and has
    // nothing to do, while a player sitting in the impact needs ~14 cm and has
    // a budget of 8.4 cm.
    const t: Threat = {
      from: { x: 0, y: 0, z: -300 },
      to: { x: 18, y: 0, z: 60 },
      tSpawn: 0,
      tImpact: 0.45,
      radius: 14,
    }
    expect(shouldSpawn(lat, t, env, REST)).toBe(true)
    expect(dodgeableFromAnywhere(lat, t, env)).toBe(false)
  })
})

describe('a body that cannot move cannot dodge', () => {
  it('zero speed means nothing is dodgeable unless it already misses', () => {
    const still: Envelope = { ...env, vmax: 0 }
    expect(dodgeVerdict(lat, aimedAtRest(2, 12), still, REST).dodgeable).toBe(false)
    // A threat aimed AT you always hits you where you stand, however small it
    // is — `to` is the impact centre, so any radius >= 0 covers that point.
    expect(dodgeVerdict(lat, aimedAtRest(2, 1), still, REST).dodgeable).toBe(false)
    // Aimed elsewhere: already safe, nothing to do, no movement needed.
    const elsewhere: Threat = {
      from: { x: 0, y: 0, z: -300 },
      to: { x: 100, y: 0, z: 60 },
      tSpawn: 0,
      tImpact: 2,
      radius: 1,
    }
    expect(dodgeVerdict(lat, elsewhere, still, REST).dodgeable).toBe(true)
    expect(dodgeVerdict(lat, elsewhere, still, REST).needCm).toBe(0)
  })
})
