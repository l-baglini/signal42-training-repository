import type { Envelope, Point3 } from './types'
import { dot } from './vec'

/**
 * The support basis: six axis directions first, then a 32-point Fibonacci
 * sphere.
 *
 * The axes come first so that an axis-aligned bounding box can be read straight
 * off the support values. The Fibonacci points give isotropy without a random
 * number generator — the basis must be identical across every envelope, or two
 * envelopes are not comparable and I3 becomes meaningless.
 */
export function supportBasis(fib = 32): readonly Point3[] {
  const dirs: Point3[] = [
    { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
    { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
  ]
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < fib; i++) {
    const y = 1 - (i / (fib - 1)) * 2
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = golden * i
    dirs.push({ x: Math.cos(theta) * r, y, z: Math.sin(theta) * r })
  }
  return dirs
}

export const AXIS = { XMAX: 0, XMIN: 1, YMAX: 2, YMIN: 3, ZMAX: 4, ZMIN: 5 } as const

export interface EnvelopeInput {
  readonly samples: readonly Point3[]
  readonly rest: Point3
  readonly vmax: number
  readonly jitter: number
  readonly latency: number
  readonly dirs?: readonly Point3[]
}

/**
 * Build the support polytope { p : dot(dirs[i], p) <= support[i] }.
 *
 * `support` is a per-direction maximum over the samples, so adding a sample can
 * only ever raise it. That monotonicity is why I3 — a wider range of motion
 * never removes an option — holds structurally rather than by luck. The
 * polytope is an outer approximation of the true convex hull (accepted
 * weakness 1).
 */
export function envelopeFrom(input: EnvelopeInput): Envelope {
  const dirs = input.dirs ?? supportBasis()
  if (input.samples.length === 0) throw new Error('envelopeFrom: no samples')
  const support = dirs.map((d) => {
    let m = -Infinity
    for (const s of input.samples) {
      const v = dot(d, s)
      if (v > m) m = v
    }
    return m
  })
  return {
    dirs,
    support,
    rest: input.rest,
    vmax: input.vmax,
    jitter: input.jitter,
    latency: input.latency,
  }
}

/** Point-in-polytope. The tolerance absorbs float error only. */
export function contains(env: Envelope, p: Point3, eps = 1e-9): boolean {
  for (let i = 0; i < env.dirs.length; i++) {
    if (dot(env.dirs[i]!, p) > env.support[i]! + eps) return false
  }
  return true
}

/**
 * Bounds implied by the six axis constraints. Contains the polytope, so it is
 * safe as iteration bounds even though it may be looser than the polytope's own
 * bounding box.
 */
export function bounds(env: Envelope): { min: Point3; max: Point3 } {
  const s = env.support
  return {
    min: { x: -s[AXIS.XMIN]!, y: -s[AXIS.YMIN]!, z: -s[AXIS.ZMIN]! },
    max: { x: s[AXIS.XMAX]!, y: s[AXIS.YMAX]!, z: s[AXIS.ZMAX]! },
  }
}

/** Scale an envelope about its rest position. Used by I3's monotonicity test. */
export function scaledAbout(env: Envelope, factor: number): Envelope {
  const support = env.dirs.map((d, i) => {
    const restProj = dot(d, env.rest)
    return restProj + (env.support[i]! - restProj) * factor
  })
  return { ...env, support }
}
