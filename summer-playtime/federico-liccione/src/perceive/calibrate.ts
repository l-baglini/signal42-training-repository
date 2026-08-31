/**
 * Calibration. SPEC §6.1.
 *
 * Ten seconds of "lean as far as is comfortable — left, right, up, towards me",
 * turned into the `Envelope` that every guarantee in the engine is expressed
 * against. This is not onboarding decoration: without it the game would be
 * tuned to the developer's body, and with it the game adapts to whatever range
 * the player actually has.
 *
 * Pure and deterministic, so it is testable without a camera. The tracker
 * supplies timestamped positions; nothing here knows where they came from.
 */
import { envelopeFrom } from '../engine'
import type { Envelope, Point3 } from '../engine'

export interface Sample {
  readonly at: Point3
  /** Seconds. Monotonic. Gaps and duplicates are tolerated. */
  readonly tS: number
}

export interface CalibrationOptions {
  /** Length of the window used to find "still", in seconds. */
  readonly stillWindowS?: number
  /** Which speed percentile becomes vmax. Not the maximum — see below. */
  readonly speedPercentile?: number
  readonly minSamples?: number
  /** Measured end-to-end perception latency, seconds. */
  readonly latencyS?: number
}

const DEFAULTS = {
  stillWindowS: 2,
  speedPercentile: 0.95,
  minSamples: 30,
  latencyS: 0.06,
} as const

export interface Quality {
  readonly samples: number
  readonly durationS: number
  readonly reachCm: number
  /** How many of the support directions the player actually pushed into. */
  readonly directionsCovered: number
  readonly directionsTotal: number
  /** True when the cloud is barely larger than the noise — SPEC §6.7 I9. */
  readonly degenerate: boolean
}

export type CalibrationResult =
  | { readonly ok: true; readonly envelope: Envelope; readonly quality: Quality }
  | { readonly ok: false; readonly reason: string; readonly samples: number }

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const i = Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))
  return s[i]!
}

/**
 * The stillest window: the one whose positional spread is smallest. Used for
 * both `rest` and `jitter`, because the two questions — where does this player
 * sit, and how much does the signal wobble when they are not moving — have the
 * same answer window.
 */
function stillest(samples: readonly Sample[], windowS: number): Sample[] {
  let best: Sample[] = []
  let bestSpread = Infinity
  for (let i = 0; i < samples.length; i++) {
    const window: Sample[] = []
    for (let j = i; j < samples.length && samples[j]!.tS - samples[i]!.tS <= windowS; j++) {
      window.push(samples[j]!)
    }
    if (window.length < 5) continue
    const cx = median(window.map((s) => s.at.x))
    const cy = median(window.map((s) => s.at.y))
    const cz = median(window.map((s) => s.at.z))
    let sum = 0
    for (const s of window) {
      sum += (s.at.x - cx) ** 2 + (s.at.y - cy) ** 2 + (s.at.z - cz) ** 2
    }
    const spread = Math.sqrt(sum / window.length)
    if (spread < bestSpread) {
      bestSpread = spread
      best = window
    }
  }
  return best
}

export function calibrate(
  samples: readonly Sample[],
  opts: CalibrationOptions = {},
): CalibrationResult {
  const o = { ...DEFAULTS, ...opts }
  const clean = samples
    .filter((s) => Number.isFinite(s.tS) && Number.isFinite(s.at.x) && Number.isFinite(s.at.y) && Number.isFinite(s.at.z))
    .slice()
    .sort((a, b) => a.tS - b.tS)

  if (clean.length < o.minSamples) {
    return { ok: false, reason: `only ${clean.length} usable samples`, samples: clean.length }
  }

  const still = stillest(clean, o.stillWindowS)
  if (still.length === 0) {
    return { ok: false, reason: 'no still period found', samples: clean.length }
  }
  const rest: Point3 = {
    x: median(still.map((s) => s.at.x)),
    y: median(still.map((s) => s.at.y)),
    z: median(still.map((s) => s.at.z)),
  }
  // Jitter is a radius, because that is how `fair` consumes it: the peek window
  // has to be wider than the noise the tracker adds to a held position.
  const jitter = Math.sqrt(
    still.reduce(
      (a, s) => a + (s.at.x - rest.x) ** 2 + (s.at.y - rest.y) ** 2 + (s.at.z - rest.z) ** 2,
      0,
    ) / still.length,
  )

  /**
   * vmax is the 95th percentile, not the maximum. One flinch, or one frame where
   * the tracker lost the face and found it again somewhere else, must not define
   * what this player is capable of for the rest of the session — and vmax is
   * what the dodge guarantee spends.
   */
  const speeds: number[] = []
  for (let i = 1; i < clean.length; i++) {
    const dt = clean[i]!.tS - clean[i - 1]!.tS
    if (dt <= 0) continue
    const a = clean[i - 1]!.at
    const b = clean[i]!.at
    speeds.push(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / dt)
  }
  const vmax = percentile(speeds, o.speedPercentile)

  const envelope = envelopeFrom({
    samples: clean.map((s) => s.at),
    rest,
    vmax,
    jitter,
    latency: o.latencyS,
  })

  let reachCm = 0
  let directionsCovered = 0
  for (let i = 0; i < envelope.dirs.length; i++) {
    const d = envelope.dirs[i]!
    const restProj = d.x * rest.x + d.y * rest.y + d.z * rest.z
    const push = envelope.support[i]! - restProj
    if (push > Math.max(3 * jitter, 2)) directionsCovered++
  }
  for (const s of clean) {
    const d = Math.hypot(s.at.x - rest.x, s.at.y - rest.y, s.at.z - rest.z)
    if (d > reachCm) reachCm = d
  }

  return {
    ok: true,
    envelope,
    quality: {
      samples: clean.length,
      durationS: clean[clean.length - 1]!.tS - clean[0]!.tS,
      reachCm,
      directionsCovered,
      directionsTotal: envelope.dirs.length,
      degenerate: reachCm < Math.max(4 * jitter, 3),
    },
  }
}
