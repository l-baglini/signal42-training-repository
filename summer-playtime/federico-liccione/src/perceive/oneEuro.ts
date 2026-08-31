/**
 * The One Euro filter (Casiez, Roussel & Vogel, CHI 2012).
 *
 * Written because the first tracker used a fixed exponential average plus
 * forward prediction, and in poor light that is the worst possible pair: the
 * average is too slow to hide the jitter and the prediction *amplifies* it,
 * because predicting from a noisy velocity multiplies the noise.
 *
 * One Euro adapts instead. The cutoff frequency rises with the speed of the
 * signal, so a held head is filtered hard — jitter disappears — and a moving
 * head is barely filtered at all, so there is no lag when it matters. Two knobs,
 * both meaningful: `minCutoff` sets how still "still" is, and `beta` sets how
 * quickly the filter gets out of the way.
 *
 * Pure and deterministic: the caller supplies the timestamp, so this is tested
 * without a clock.
 */

export interface OneEuroOptions {
  /** Hz. Lower means more jitter removed when the signal is slow. */
  readonly minCutoff?: number
  /** Speed coefficient. Higher means less lag when the signal moves fast. */
  readonly beta?: number
  /** Hz. Cutoff for the derivative estimate itself. */
  readonly dCutoff?: number
}

/**
 * Swept against the tests rather than guessed. 0.8/0.02 removed only 69 % of a
 * held head's jitter, which was not enough for the complaint that produced this
 * file; 0.5/0.03, 0.4/0.04 and 0.3/0.05 all pass both ends, and the middle one
 * is taken. These are the knobs to turn if playtesting says the tracking is
 * still shaky (raise beta) or now feels laggy (raise minCutoff).
 */
const DEFAULTS = { minCutoff: 0.4, beta: 0.04, dCutoff: 1.0 } as const

const alphaFor = (cutoff: number, dtS: number): number => {
  const tau = 1 / (2 * Math.PI * cutoff)
  return 1 / (1 + tau / dtS)
}

export interface OneEuro {
  /** Filter one sample. `tS` must be non-decreasing. */
  filter(value: number, tS: number): number
  /** The filtered derivative, in units per second. Useful for diagnostics. */
  speed(): number
  reset(): void
}

export function oneEuro(opts: OneEuroOptions = {}): OneEuro {
  const o = { ...DEFAULTS, ...opts }
  let xPrev: number | null = null
  let dxHat = 0
  let xHat = 0
  let tPrev = 0

  return {
    filter(value: number, tS: number): number {
      if (xPrev === null) {
        xPrev = value
        xHat = value
        tPrev = tS
        return value
      }
      const dtS = Math.max(1e-4, tS - tPrev)
      tPrev = tS

      const dx = (value - xPrev) / dtS
      xPrev = value
      dxHat += alphaFor(o.dCutoff, dtS) * (dx - dxHat)

      const cutoff = o.minCutoff + o.beta * Math.abs(dxHat)
      xHat += alphaFor(cutoff, dtS) * (value - xHat)
      return xHat
    },
    speed: () => dxHat,
    reset(): void {
      xPrev = null
      dxHat = 0
      xHat = 0
      tPrev = 0
    },
  }
}

/** Three independent filters, one per axis. */
export function oneEuro3(opts: OneEuroOptions = {}): {
  filter(v: { x: number; y: number; z: number }, tS: number): { x: number; y: number; z: number }
  speed(): number
  reset(): void
} {
  const fx = oneEuro(opts)
  const fy = oneEuro(opts)
  const fz = oneEuro(opts)
  return {
    filter: (v, tS) => ({
      x: fx.filter(v.x, tS),
      y: fy.filter(v.y, tS),
      z: fz.filter(v.z, tS),
    }),
    speed: () => Math.hypot(fx.speed(), fy.speed(), fz.speed()),
    reset() {
      fx.reset()
      fy.reset()
      fz.reset()
    },
  }
}
