/**
 * The geometry of exposure. SPEC §6, extended for cover combat.
 *
 * The central observation is a symmetry that costs nothing: **a sightline has no
 * direction.** If the player can see the enemy from an eye position, the enemy
 * can see the player from there too. So `V(e)` — the footprint that already
 * decided whether a position reveals a target — is simultaneously the set of
 * positions from which the player may shoot and the set in which the player may
 * be shot. One computation, both questions, and no new geometry.
 *
 * What that buys is a stronger fairness theorem than the hunt had. An enemy is
 * fair only if it is **shootable** (some reachable position sees it),
 * **survivable** (some reachable position does not), and the **trip between them
 * is makeable** in the time the enemy gives you, at the speed you were measured
 * moving. All three are properties of one mask and one envelope.
 */
import type { Envelope, Point3 } from './types'
import { cellCentre, cellIndex, type Lattice } from './lattice'
import { dist } from './vec'
import { inradiusCm, maskCount } from './footprint'
// One definition of a fact about people. It was briefly declared twice and the
// compiler was right to complain.
import { REACTION_S } from './dodge'

export interface Enemy {
  readonly at: Point3
  readonly radius: number
  /** Seconds of continuous exposure before it fires. */
  readonly fuseS: number
}

export type EnemyReject =
  | 'not-shootable' // no reachable position sees it
  | 'no-cover'      // every reachable position is exposed to it
  | 'cannot-retreat' // cover exists but not within the fuse
  | 'exposed-at-rest' // it can already shoot you where you sit
  | 'window-too-tight'

export interface EnemyAssessment {
  readonly enemy: Enemy
  /** |V(e)|: positions that can shoot it — and in which it can shoot you. */
  readonly exposedCells: number
  /** Positions that cannot see it, and therefore cannot be seen by it. */
  readonly coveredCells: number
  /** cm from rest to the nearest firing position. */
  readonly leanCm: number
  /** cm, how precisely that position must be held. */
  readonly windowCm: number
  /** cm from the nearest firing position back to the nearest safe one. */
  readonly retreatCm: number
  /** cm the player can travel within the fuse, after reaction and latency. */
  readonly retreatBudgetCm: number
  readonly fair: boolean
  readonly reject: EnemyReject | null
}

/**
 * The complement of the footprint inside the envelope: where the player is safe.
 *
 * Not simply `!mask`, because cells outside the envelope are not safe — they are
 * unreachable, and a retreat to somewhere the body cannot go is not a retreat.
 */
export function coverMask(lat: Lattice, exposed: Uint8Array): Uint8Array {
  const out = new Uint8Array(exposed.length)
  for (let i = 0; i < out.length; i++) {
    if (lat.inside[i] && !exposed[i]) out[i] = 1
  }
  return out
}

/** Shortest distance between two lattice sets, in cm. Infinity if either is empty. */
export function gapCm(lat: Lattice, a: Uint8Array, b: Uint8Array): number {
  const from: Point3[] = []
  for (let k = 0; k < lat.nz; k++)
    for (let j = 0; j < lat.ny; j++)
      for (let i = 0; i < lat.nx; i++) {
        if (a[cellIndex(lat, i, j, k)]) from.push(cellCentre(lat, i, j, k))
      }
  if (from.length === 0) return Infinity

  let best = Infinity
  for (let k = 0; k < lat.nz; k++)
    for (let j = 0; j < lat.ny; j++)
      for (let i = 0; i < lat.nx; i++) {
        if (!b[cellIndex(lat, i, j, k)]) continue
        const c = cellCentre(lat, i, j, k)
        for (const p of from) {
          const d = dist(p, c)
          if (d < best) best = d
        }
      }
  return best
}

export interface AssessEnemyOptions {
  readonly jitterK?: number
  readonly leanFraction?: number
  /** Set by the caller from reachCm(lattice, rest); avoids recomputing per enemy. */
  readonly reachCm: number
}

/**
 * Judge one enemy against one body.
 *
 * Precedence is fixed and the first failure is reported: not-shootable, no-cover,
 * exposed-at-rest, window-too-tight, cannot-retreat.
 */
export function assessEnemy(
  lat: Lattice,
  enemy: Enemy,
  env: Envelope,
  exposed: Uint8Array,
  restExposed: boolean,
  opts: AssessEnemyOptions,
): EnemyAssessment {
  const jitterK = opts.jitterK ?? 2
  const leanFraction = opts.leanFraction ?? 0.3
  const cover = coverMask(lat, exposed)
  const exposedCells = maskCount(exposed)
  const coveredCells = maskCount(cover)

  const base = { enemy, exposedCells, coveredCells }

  if (exposedCells === 0) {
    return {
      ...base, leanCm: Infinity, windowCm: 0, retreatCm: Infinity, retreatBudgetCm: 0,
      fair: false, reject: 'not-shootable',
    }
  }
  if (coveredCells === 0) {
    // Every position the body can reach is in this enemy's line of fire. There
    // is no such thing as playing well against it.
    return {
      ...base, leanCm: 0, windowCm: 0, retreatCm: Infinity, retreatBudgetCm: 0,
      fair: false, reject: 'no-cover',
    }
  }

  let leanCm = Infinity
  for (let k = 0; k < lat.nz; k++)
    for (let j = 0; j < lat.ny; j++)
      for (let i = 0; i < lat.nx; i++) {
        if (!exposed[cellIndex(lat, i, j, k)]) continue
        const d = dist(cellCentre(lat, i, j, k), env.rest)
        if (d < leanCm) leanCm = d
      }
  const windowCm = inradiusCm(lat, exposed)
  const retreatCm = gapCm(lat, exposed, cover)
  const usableS = Math.max(0, enemy.fuseS - REACTION_S - env.latency)
  const retreatBudgetCm = env.vmax * usableS
  const full = { ...base, leanCm, windowCm, retreatCm, retreatBudgetCm }

  // Sitting still must not be lethal. An enemy that can already shoot you where
  // you rest is not a decision about exposure, it is a punishment for existing.
  if (restExposed) return { ...full, fair: false, reject: 'exposed-at-rest' }
  if (leanCm < leanFraction * opts.reachCm) {
    return { ...full, fair: false, reject: 'exposed-at-rest' }
  }
  if (windowCm <= jitterK * env.jitter) {
    return { ...full, fair: false, reject: 'window-too-tight' }
  }
  // The retreat has to be makeable. Note which way this cuts: a slower tracker
  // or a slower body means fewer enemies, never less time to escape one.
  if (retreatCm > retreatBudgetCm) {
    return { ...full, fair: false, reject: 'cannot-retreat' }
  }
  return { ...full, fair: true, reject: null }
}
