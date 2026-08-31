/**
 * The filter exists to solve a specific complaint — head tracking felt jerky in
 * poor light — so the tests are that complaint, made measurable: kill the jitter
 * of a held head, without adding lag to a moving one. A fixed exponential
 * average cannot do both, and there is a test here that says so.
 */
import { describe, expect, it } from 'vitest'
import { oneEuro, oneEuro3 } from '../src/perceive/oneEuro'

const RATE = 30
const dt = 1 / RATE

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

const std = (xs: number[]): number => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length)
}

/** A head being held still, seen by a tracker in bad light. */
function noisyHold(noiseCm: number, n = 300, seed = 7): number[] {
  const r = rng(seed)
  return Array.from({ length: n }, () => (r() - 0.5) * 2 * noiseCm)
}

/** A head leaning 20 cm over two thirds of a second. */
function lean(n = 60): number[] {
  return Array.from({ length: n }, (_, i) => Math.min(20, (i / 20) * 20))
}

describe('a held head stops shaking', () => {
  it('removes most of the jitter', () => {
    const f = oneEuro()
    const input = noisyHold(1.2)
    const output = input.map((v, i) => f.filter(v, i * dt))
    // Ignore the first few samples: the filter starts at its first value.
    expect(std(output.slice(20))).toBeLessThan(std(input) * 0.3)
  })

  it('and the worse the light, the more it removes', () => {
    const quiet = oneEuro()
    const loud = oneEuro()
    const a = noisyHold(0.3).map((v, i) => quiet.filter(v, i * dt)).slice(20)
    const b = noisyHold(2.0, 300, 9).map((v, i) => loud.filter(v, i * dt)).slice(20)
    expect(std(b)).toBeLessThan(2.0)
    expect(std(a)).toBeLessThan(0.3)
  })
})

describe('a moving head does not lag', () => {
  it('tracks a lean to within a couple of centimetres', () => {
    const f = oneEuro()
    const input = lean()
    const output = input.map((v, i) => f.filter(v, i * dt))
    expect(Math.abs(output[output.length - 1]! - 20)).toBeLessThan(2)
  })

  it('beats a fixed average that removes the same amount of jitter', () => {
    /**
     * The whole justification for the filter, as an experiment. Find the fixed
     * exponential average whose jitter suppression matches One Euro's, then show
     * it lags further behind on the same lean. One knob cannot serve both ends;
     * two adaptive ones can.
     */
    const noise = noisyHold(1.2)
    const euro = oneEuro()
    const euroJitter = std(noise.map((v, i) => euro.filter(v, i * dt)).slice(20))

    let matchedAlpha = 1
    for (let alpha = 1; alpha > 0.005; alpha -= 0.005) {
      let ema = noise[0]!
      const out = noise.map((v) => (ema += alpha * (v - ema)))
      if (std(out.slice(20)) <= euroJitter) {
        matchedAlpha = alpha
        break
      }
    }

    const ramp = lean()
    let ema = ramp[0]!
    for (const v of ramp) ema += matchedAlpha * (v - ema)
    const emaError = Math.abs(ema - 20)

    const euro2 = oneEuro()
    let euroOut = 0
    ramp.forEach((v, i) => (euroOut = euro2.filter(v, i * dt)))
    const euroError = Math.abs(euroOut - 20)

    expect(euroError).toBeLessThan(emaError)
  })
})

describe('robustness', () => {
  it('the first sample passes through unchanged', () => {
    expect(oneEuro().filter(12.5, 0)).toBe(12.5)
  })

  it('a repeated timestamp does not divide by zero', () => {
    const f = oneEuro()
    f.filter(0, 1)
    expect(Number.isFinite(f.filter(5, 1))).toBe(true)
  })

  it('reset forgets everything', () => {
    const f = oneEuro()
    for (let i = 0; i < 50; i++) f.filter(20, i * dt)
    f.reset()
    expect(f.filter(-3, 0)).toBe(-3)
  })

  it('is deterministic', () => {
    const run = () => {
      const f = oneEuro()
      return noisyHold(1).map((v, i) => f.filter(v, i * dt))
    }
    expect(run()).toEqual(run())
  })

  it('the three-axis form filters each axis independently', () => {
    const f = oneEuro3()
    f.filter({ x: 0, y: 0, z: 60 }, 0)
    const out = f.filter({ x: 10, y: 0, z: 60 }, dt)
    expect(out.y).toBe(0)
    expect(out.z).toBe(60)
    expect(out.x).toBeGreaterThan(0)
  })
})
