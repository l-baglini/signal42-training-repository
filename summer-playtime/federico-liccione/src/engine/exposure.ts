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
import type { Envelope, Point3, RoomScan } from './types'
import { cellCentre, cellIndex, latticeOf, reachCm, type Lattice } from './lattice'
import { footprintMask } from './footprint'
import { visible } from './sightline'
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
 * How long this enemy must wait before firing, for the retreat to be possible.
 *
 * Derived rather than tuned: reaction time, plus the *measured* perception
 * latency, plus the time to cross the gap from the firing position back into
 * cover at the *measured* speed of this body, plus a margin. So fairness holds
 * by construction — an enemy is never given a fuse this player cannot beat — and
 * the margin is the only number anyone gets to tune.
 *
 * The direction of the consequence is the usual one: a slower body, or a noisier
 * tracker, is given more time rather than a worse game.
 */
export function fuseForFairRetreat(env: Envelope, retreatCm: number, marginS = 0.55): number {
  if (!(env.vmax > 0) || !Number.isFinite(retreatCm)) return Infinity
  return REACTION_S + env.latency + retreatCm / env.vmax + marginS
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

  /**
   * A non-finite fuse is not a generous enemy: it is the signal that
   * `fuseForFairRetreat` found no retreat. Letting it through made
   * `retreatBudgetCm` come out as `0 * Infinity` — NaN — and every comparison
   * against NaN is false, so the retreat check silently passed and a motionless
   * body was handed enemies. A test caught it.
   *
   * Checked *after* shootability and cover, so the more fundamental reasons keep
   * their precedence — an enemy nobody can shoot says so, rather than blaming
   * the retreat.
   */
  if (!Number.isFinite(enemy.fuseS)) {
    return {
      ...base, leanCm: Infinity, windowCm: 0, retreatCm: Infinity, retreatBudgetCm: 0,
      fair: false, reject: 'cannot-retreat',
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

export interface EnemyLineupOptions {
  readonly pitch?: number
  readonly jitterK?: number
  readonly leanFraction?: number
  readonly fuseMarginS?: number
  readonly radius?: number
}

export interface EnemyLineup {
  readonly assessments: readonly EnemyAssessment[]
  readonly lattice: Lattice
}

/**
 * Judge every candidate position in a scan as a possible enemy.
 *
 * The enemy analogue of `assess` in level.ts, and the same division of labour:
 * perception proposed these positions and has no say in which survive.
 */
export function assessEnemies(
  scan: RoomScan,
  env: Envelope,
  opts: EnemyLineupOptions = {},
): EnemyLineup {
  const lattice = latticeOf(env, opts.pitch ?? 2)
  const reach = reachCm(lattice, env.rest)
  const radius = opts.radius ?? 9
  const assessments: EnemyAssessment[] = []

  for (const at of scan.anchors) {
    const exposed = footprintMask(lattice, scan.occluders, at)
    const cover = coverMask(lattice, exposed)
    const retreat = gapCm(lattice, exposed, cover)
    const fuseS = fuseForFairRetreat(env, retreat, opts.fuseMarginS)
    assessments.push(
      assessEnemy(
        lattice,
        { at, radius, fuseS },
        env,
        exposed,
        visible(env.rest, at, scan.occluders),
        {
          reachCm: reach,
          ...(opts.jitterK === undefined ? {} : { jitterK: opts.jitterK }),
          ...(opts.leanFraction === undefined ? {} : { leanFraction: opts.leanFraction }),
        },
      ),
    )
  }
  return { assessments, lattice }
}
