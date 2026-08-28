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
import { edtSquared, footprintMask } from './footprint'
import { visible } from './sightline'
import { DEFAULT_VIEWPORT, onScreen, type Viewport } from './viewport'
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

/**
 * How the player answers this enemy.
 *
 * `peek` is the original verb: it cannot see you where you sit, so seeing it — and
 * therefore shooting it — costs a lean, and the lean is what exposes you.
 *
 * `duck` is the same rule read from the other end. Exposure has no direction, so
 * an enemy whose engagement footprint already contains the rest position is one
 * you can shoot **without moving at all** — and one that is already aiming at you.
 * Shoot fast or get out of the way. It needs no new mechanic, only permission:
 * these were being rejected wholesale as `exposed-at-rest`, which was right for the
 * hunt this began as (nothing to find) and wrong for a cover shooter, where being
 * already seen is half the game.
 */
export type EnemyVerb = 'peek' | 'duck'

export type EnemyReject =
  | 'not-shootable' // no reachable position sees it, or sees it on screen
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
  readonly verb: EnemyVerb
  readonly fair: boolean
  readonly reject: EnemyReject | null
}

/**
 * Where the player can both see the enemy and have it on screen.
 *
 * The engagement footprint, and the only one the game should ever use. An eye
 * position with a clear sightline to something off the edge of the glass is not a
 * firing position, and by the symmetry that runs through this whole design it is
 * not a position the enemy may fire from either. A playtester was being shot by
 * enemies they could not see, which is what that gap looks like from the chair.
 */
export function engageableMask(
  lat: Lattice,
  occluders: Parameters<typeof footprintMask>[1],
  at: Point3,
  view: Viewport = DEFAULT_VIEWPORT,
  radiusCm = 0,
): Uint8Array {
  const mask = footprintMask(lat, occluders, at)
  for (let k = 0; k < lat.nz; k++)
    for (let j = 0; j < lat.ny; j++)
      for (let i = 0; i < lat.nx; i++) {
        const n = cellIndex(lat, i, j, k)
        if (!mask[n]) continue
        if (!onScreen(cellCentre(lat, i, j, k), at, view, radiusCm)) mask[n] = 0
      }
  return mask
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
/**
 * cm from the rest position to the nearest position safe from this enemy.
 *
 * Distinct from `retreatCm`, which is the distance from the *nearest* exposed cell
 * to cover. For an enemy that can already see you where you sit, the retreat that
 * matters is the one starting where you actually are, and it can be much longer.
 * Deriving the fuse from the other number would hand out fuses too short to beat.
 */
export function retreatFromRestCm(lat: Lattice, cover: Uint8Array, rest: Point3): number {
  let best = Infinity
  for (let k = 0; k < lat.nz; k++)
    for (let j = 0; j < lat.ny; j++)
      for (let i = 0; i < lat.nx; i++) {
        if (!cover[cellIndex(lat, i, j, k)]) continue
        const d = dist(cellCentre(lat, i, j, k), rest)
        if (d < best) best = d
      }
  return best
}

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

/**
 * Shortest distance between two lattice sets, in cm. Infinity if either is empty.
 *
 * Via the distance transform rather than pairwise. The first version compared
 * every exposed cell against every covered one, which is up to a million
 * distances per enemy — fine for the eight anchors a hand-written fixture had,
 * and a two-minute timeout the moment a level offered four hundred candidates.
 * The transform answers "how far to the nearest cover" for every cell at once, in
 * linear time, and the gap is the minimum of that over the exposed set.
 */
export function gapCm(lat: Lattice, a: Uint8Array, b: Uint8Array): number {
  let hasA = false
  let hasB = false
  for (let i = 0; i < a.length; i++) {
    if (a[i]) hasA = true
    if (b[i]) hasB = true
    if (hasA && hasB) break
  }
  if (!hasA || !hasB) return Infinity

  // edtSquared measures from cells that are 1 to the nearest cell that is 0, so
  // the sources are the members of `b`.
  const from = new Uint8Array(b.length)
  for (let i = 0; i < b.length; i++) from[i] = b[i] ? 0 : 1
  const d2 = edtSquared(from, lat.nx, lat.ny, lat.nz)

  let best = Infinity
  for (let i = 0; i < a.length; i++) {
    if (!a[i]) continue
    const d = d2[i]!
    if (d < best) best = d
  }
  return best === Infinity ? Infinity : Math.sqrt(best) * lat.pitch
}

export interface AssessEnemyOptions {
  readonly jitterK?: number
  readonly leanFraction?: number
  /** Set by the caller from reachCm(lattice, rest); avoids recomputing per enemy. */
  readonly reachCm: number
  /**
   * Whether an enemy that can already see the rest position may ship. Off by
   * default, so I2 and every test written against it hold unchanged; the game
   * turns it on deliberately. See the `restExposed` branch of `assessEnemy`.
   */
  readonly allowInTheOpen?: boolean
  /** cm from rest to the nearest cell safe from this enemy. Only read when it can see rest. */
  readonly restRetreatCm?: number
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
  const inTheOpen = opts.allowInTheOpen ?? false
  const cover = coverMask(lat, exposed)
  const exposedCells = maskCount(exposed)
  const coveredCells = maskCount(cover)

  const base = { enemy, exposedCells, coveredCells }

  if (exposedCells === 0) {
    return {
      ...base, leanCm: Infinity, windowCm: 0, retreatCm: Infinity, retreatBudgetCm: 0,
      verb: 'peek', fair: false, reject: 'not-shootable',
    }
  }
  if (coveredCells === 0) {
    // Every position the body can reach is in this enemy's line of fire. There
    // is no such thing as playing well against it.
    return {
      ...base, leanCm: 0, windowCm: 0, retreatCm: Infinity, retreatBudgetCm: 0,
      verb: 'peek', fair: false, reject: 'no-cover',
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
      verb: 'peek', fair: false, reject: 'cannot-retreat',
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
  const full = { ...base, leanCm, windowCm, retreatCm, retreatBudgetCm, verb: 'peek' as const }

  /**
   * An enemy that can already shoot you where you sit.
   *
   * The original rule refused these outright — *sitting still must not be lethal* —
   * and that was the right rule for the hunt this project began as, where an
   * already-visible target left nothing to find. In a cover shooter it threw away
   * the larger half of every room, and with it the other half of the verb. Because
   * exposure is symmetric, an enemy that can see you at rest is one you can shoot
   * at rest: the decision is *shoot it now or get out of the way*, and it is a real
   * decision rather than a punishment.
   *
   * What makes it fair is the retreat, measured from **rest** rather than from the
   * nearest exposed cell, and required to fit the budget the fuse allows. The
   * window criterion does not apply: you are not being asked to find and hold a
   * position, you are being asked to leave one.
   */
  if (restExposed) {
    if (!inTheOpen) return { ...full, fair: false, reject: 'exposed-at-rest' }
    const fromRest = opts.restRetreatCm ?? Infinity
    if (!Number.isFinite(fromRest) || fromRest > retreatBudgetCm) {
      return { ...full, retreatCm: fromRest, fair: false, reject: 'cannot-retreat' }
    }
    return {
      ...full, leanCm: 0, retreatCm: fromRest, verb: 'duck', fair: true, reject: null,
    }
  }
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
  readonly allowInTheOpen?: boolean
  readonly pitch?: number
  readonly viewport?: Viewport
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

  const view = opts.viewport ?? DEFAULT_VIEWPORT
  for (const at of scan.anchors) {
    const exposed = engageableMask(lattice, scan.occluders, at, view, radius)
    const cover = coverMask(lattice, exposed)
    const retreat = gapCm(lattice, exposed, cover)
    const restExposed =
      visible(env.rest, at, scan.occluders) && onScreen(env.rest, at, view, radius)
    /**
     * For an enemy that can see the rest position, the retreat that has to fit the
     * fuse starts where the player actually is. `retreat` is the distance from the
     * *nearest* exposed cell to cover, which for one of these is typically much
     * shorter and would hand out a fuse nobody can beat.
     */
    const restRetreat = restExposed ? retreatFromRestCm(lattice, cover, env.rest) : 0
    const fuseS = fuseForFairRetreat(env, Math.max(retreat, restRetreat), opts.fuseMarginS)
    assessments.push(
      assessEnemy(
        lattice,
        { at, radius, fuseS },
        env,
        exposed,
        restExposed,
        {
          reachCm: reach,
          restRetreatCm: restRetreat,
          ...(opts.allowInTheOpen === undefined ? {} : { allowInTheOpen: opts.allowInTheOpen }),
          ...(opts.jitterK === undefined ? {} : { jitterK: opts.jitterK }),
          ...(opts.leanFraction === undefined ? {} : { leanFraction: opts.leanFraction }),
        },
      ),
    )
  }
  return { assessments, lattice }
}
