/**
 * Calibration is the input to every guarantee the engine makes, so it is tested
 * as carefully as the engine. Deterministic synthetic streams — no camera, no
 * clock, and a seeded generator standing in for tracker noise.
 */
import { describe, expect, it } from 'vitest'
import { calibrate } from '../src/perceive/calibrate'
import type { Sample } from '../src/perceive/calibrate'
import { generate } from '../src/engine'
import raw from '../fixtures/desk.room.json'
import type { RoomScan } from '../src/engine'

const room = raw as RoomScan

/** Seeded, so the tests are reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A plausible session: two seconds sitting still, then leaning out along each
 * axis in turn and coming back.
 */
function session(noiseCm = 0.3, reach = 18, seed = 42): Sample[] {
  const r = rng(seed)
  const jitter = () => (r() - 0.5) * 2 * noiseCm
  const out: Sample[] = []
  const rest = { x: 0, y: 0, z: 60 }
  let t = 0
  const push = (x: number, y: number, z: number) => {
    out.push({ at: { x: x + jitter(), y: y + jitter(), z: z + jitter() }, tS: t })
    t += 1 / 30
  }
  for (let i = 0; i < 60; i++) push(rest.x, rest.y, rest.z) // 2 s still
  const dirs: Array<[number, number, number]> = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -0.6, 0], [0, 0, 0.7], [0, 0, -0.8],
  ]
  for (const [dx, dy, dz] of dirs) {
    for (let k = 0; k <= 12; k++) {
      const f = Math.sin((k / 12) * Math.PI) * reach
      push(rest.x + dx * f, rest.y + dy * f, rest.z + dz * f)
    }
  }
  return out
}

describe('it refuses inputs it cannot work with', () => {
  it('too few samples', () => {
    const r = calibrate(session().slice(0, 10))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/usable samples/)
  })

  it('non-finite samples are discarded, not propagated', () => {
    const s = session()
    s[5] = { at: { x: NaN, y: 0, z: 60 }, tS: 0.2 }
    s[6] = { at: { x: 0, y: Infinity, z: 60 }, tS: 0.21 }
    const r = calibrate(s)
    expect(r.ok).toBe(true)
    if (r.ok) {
      for (const v of r.envelope.support) expect(Number.isFinite(v)).toBe(true)
      expect(Number.isFinite(r.envelope.rest.x)).toBe(true)
    }
  })
})

describe('it recovers what it is supposed to measure', () => {
  it('rest lands on the still position despite the noise', () => {
    const r = calibrate(session(0.4))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.envelope.rest.x).toBeCloseTo(0, 0)
    expect(r.envelope.rest.y).toBeCloseTo(0, 0)
    expect(r.envelope.rest.z).toBeCloseTo(60, 0)
  })

  it('jitter tracks the injected noise', () => {
    const quiet = calibrate(session(0.1))
    const loud = calibrate(session(1.5))
    expect(quiet.ok && loud.ok).toBe(true)
    if (!quiet.ok || !loud.ok) return
    expect(loud.envelope.jitter).toBeGreaterThan(quiet.envelope.jitter * 3)
  })

  it('reach tracks how far the player actually leaned', () => {
    const small = calibrate(session(0.3, 8))
    const big = calibrate(session(0.3, 25))
    expect(small.ok && big.ok).toBe(true)
    if (!small.ok || !big.ok) return
    expect(big.quality.reachCm).toBeGreaterThan(small.quality.reachCm * 2)
  })

  it('vmax is a percentile, so one glitch does not define the player', () => {
    const clean = calibrate(session())
    const s = session()
    // The tracker loses the face and finds it 40 cm away one frame later.
    s.splice(80, 0, { at: { x: 40, y: 40, z: 90 }, tS: s[80]!.tS + 0.001 })
    const glitched = calibrate(s)
    expect(clean.ok && glitched.ok).toBe(true)
    if (!clean.ok || !glitched.ok) return
    // A 40 cm jump in 1 ms is 40 000 cm/s. It must not survive.
    expect(glitched.envelope.vmax).toBeLessThan(clean.envelope.vmax * 2)
    expect(glitched.envelope.vmax).toBeLessThan(1000)
  })

  it('reports which directions the player never pushed into', () => {
    const r = calibrate(session())
    const lazy = calibrate([
      ...session().slice(0, 60),
      ...session().slice(60, 90), // only the first lean
    ])
    expect(r.ok && lazy.ok).toBe(true)
    if (!r.ok || !lazy.ok) return
    expect(lazy.quality.directionsCovered).toBeLessThan(r.quality.directionsCovered)
  })
})

describe('the degenerate body is flagged, and the engine refuses it', () => {
  it('a player who cannot move is marked degenerate', () => {
    const r = calibrate(session(0.3, 0.5))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.quality.degenerate).toBe(true)
  })

  it('and generating a level from that envelope refuses — I9 end to end', () => {
    const r = calibrate(session(0.3, 0.5))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(generate(room, r.envelope).kind).toBe('refusal')
  })

  it('while a normal body gets a playable level', () => {
    const r = calibrate(session())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.quality.degenerate).toBe(false)
    expect(generate(room, r.envelope).kind).toBe('level')
  })
})

describe('determinism', () => {
  it('same stream, same envelope', () => {
    const s = session()
    expect(JSON.stringify(calibrate(s))).toBe(JSON.stringify(calibrate(s)))
  })

  it('sample order does not matter', () => {
    const s = session()
    const shuffled = [...s].reverse()
    const a = calibrate(s)
    const b = calibrate(shuffled)
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(b.envelope.rest).toEqual(a.envelope.rest)
    expect(b.envelope.support).toEqual(a.envelope.support)
  })
})
