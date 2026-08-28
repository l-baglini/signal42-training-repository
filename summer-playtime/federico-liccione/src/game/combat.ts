/**
 * Cover combat. Ninety seconds.
 *
 * The head decides where you are; the mouse decides where you are aiming. That
 * split is not a convenience — it is the answer to the one piece of evidence
 * that has shadowed this design from the start. Kulshreshth and LaViola measured
 * head tracking degrading performance in fast-paced tasks, and the conclusion is
 * not "do not make a fast game": it is **do not give the head the fast job.**
 * Slow positional work to the neck, fast precision to the pointer.
 *
 * The mechanic is a single decision made over and over. Leaning out is the only
 * way to see an enemy, and by the symmetry in `engine/exposure.ts` it is also
 * the only way for the enemy to see you. So exposure is simultaneously your
 * opportunity and your risk, and the question every second is how long you dare
 * stay out.
 *
 * Pure: `step` takes a state and a tick and returns a new state plus events. No
 * DOM, no renderer, no clock.
 */
import type { Point3 } from '../engine'

export type Phase = 'ready' | 'playing' | 'over'

export interface CombatConfig {
  readonly durationS: number
  /** How long an enemy waits before it gives up and leaves. */
  readonly enemyLifeS: number
  readonly maxConcurrent: number
  /** What being shot costs. Time, because time is the resource. */
  readonly hitPenaltyS: number
  readonly spawnGapS: number
  /** How fast the fuse drains once you are back behind cover, as a multiple. */
  readonly coverDrain: number
  readonly seed: number
}

export const DEFAULT_COMBAT: CombatConfig = {
  durationS: 90,
  enemyLifeS: 11,
  maxConcurrent: 2,
  hitPenaltyS: 6,
  spawnGapS: 1.1,
  // Forgiving on purpose: ducking should feel like safety, and a tracker flicker
  // must not hand the player a free reset either.
  coverDrain: 3,
  seed: 1,
}

/** What the engine measured about an enemy, as the game needs it. */
export interface EnemySpec {
  readonly leanCm: number
  readonly windowCm: number
  /** How long the player may be exposed before the shot lands. */
  readonly fuseS: number
}

export interface ActiveEnemy {
  readonly index: number
  readonly bornS: number
  readonly deadlineS: number
  /** Seconds of accumulated exposure. Drains in cover. */
  readonly exposedS: number
}

export type CombatEvent =
  | { readonly kind: 'killed'; readonly index: number; readonly points: number }
  | { readonly kind: 'escaped'; readonly index: number }
  | { readonly kind: 'shot'; readonly index: number; readonly penaltyS: number }
  | { readonly kind: 'miss' }
  | { readonly kind: 'spawned'; readonly index: number }
  | { readonly kind: 'over' }

export interface CombatState {
  readonly phase: Phase
  readonly tS: number
  readonly endsAtS: number
  readonly score: number
  readonly killed: number
  readonly escaped: number
  readonly timesShot: number
  readonly shotsFired: number
  readonly active: readonly ActiveEnemy[]
  readonly nextSpawnAtS: number
  readonly cursor: number
  readonly events: readonly CombatEvent[]
}

export interface CombatTick {
  readonly tS: number
  readonly eye: Point3
  /** Per enemy index: is the player exposed to it — which is also can-shoot-it. */
  readonly exposed: readonly boolean[]
  /** Enemy indices the crosshair is currently over. */
  readonly aimedAt: readonly number[]
  /** True on the frame the trigger was pulled. */
  readonly firing: boolean
}

/**
 * What a kill is worth. The engine's two difficulty measures, kept apart: how
 * far you had to lean out, and how precisely you had to hold it there.
 */
export function pointsFor(spec: EnemySpec): number {
  return Math.max(10, Math.round(14 * spec.leanCm + 180 / Math.max(spec.windowCm, 0.5)))
}

export function newCombat(cfg: CombatConfig = DEFAULT_COMBAT): CombatState {
  return {
    phase: 'ready',
    tS: 0,
    endsAtS: cfg.durationS,
    score: 0,
    killed: 0,
    escaped: 0,
    timesShot: 0,
    shotsFired: 0,
    active: [],
    nextSpawnAtS: 0,
    cursor: 0,
    events: [],
  }
}

export const startCombat = (cfg: CombatConfig = DEFAULT_COMBAT): CombatState => ({
  ...newCombat(cfg),
  phase: 'playing',
})

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function step(
  state: CombatState,
  cfg: CombatConfig,
  specs: readonly EnemySpec[],
  tick: CombatTick,
): CombatState {
  if (state.phase !== 'playing') return { ...state, events: [] }
  if (specs.length === 0) return { ...state, phase: 'over', events: [{ kind: 'over' }] }

  const events: CombatEvent[] = []
  const dtS = Math.max(0, Math.min(0.25, tick.tS - state.tS))
  const tS = tick.tS
  let { score, killed, escaped, timesShot, shotsFired, cursor, nextSpawnAtS, endsAtS } = state

  /**
   * The trigger resolves before the fuses. A player who fires and ducks on the
   * same frame has earned the kill — the shot left first.
   */
  const shotDead = new Set<number>()
  if (tick.firing) {
    shotsFired++
    // You can only shoot what you can see, which by the symmetry is only what can
    // see you. There is no shooting through cover.
    const hit = tick.aimedAt.find(
      (i) => tick.exposed[i] === true && state.active.some((a) => a.index === i),
    )
    if (hit === undefined) {
      events.push({ kind: 'miss' })
    } else {
      shotDead.add(hit)
      const points = pointsFor(specs[hit]!)
      score += points
      killed++
      events.push({ kind: 'killed', index: hit, points })
      nextSpawnAtS = Math.min(nextSpawnAtS, tS + cfg.spawnGapS)
    }
  }

  const active: ActiveEnemy[] = []
  for (const a of state.active) {
    if (shotDead.has(a.index)) continue

    const exposedS = tick.exposed[a.index]
      ? a.exposedS + dtS
      : Math.max(0, a.exposedS - dtS * cfg.coverDrain)

    // The fuse only charges while you are out, so reaching the end means you were
    // still out. Ducking is the whole defence, and the engine has already proved
    // that ducking is possible in the time the fuse allows.
    if (exposedS >= specs[a.index]!.fuseS) {
      timesShot++
      endsAtS -= cfg.hitPenaltyS
      events.push({ kind: 'shot', index: a.index, penaltyS: cfg.hitPenaltyS })
      nextSpawnAtS = Math.min(nextSpawnAtS, tS + cfg.spawnGapS)
      continue
    }
    if (tS >= a.deadlineS) {
      escaped++
      events.push({ kind: 'escaped', index: a.index })
      nextSpawnAtS = Math.min(nextSpawnAtS, tS + cfg.spawnGapS)
      continue
    }
    active.push({ ...a, exposedS })
  }

  if (active.length < cfg.maxConcurrent && tS >= nextSpawnAtS) {
    const rng = mulberry32(cfg.seed + state.cursor)
    const offset = Math.floor(rng() * specs.length)
    for (let attempt = 0; attempt < specs.length; attempt++) {
      const index = (cursor + offset + attempt) % specs.length
      if (active.some((a) => a.index === index)) continue
      active.push({ index, bornS: tS, deadlineS: tS + cfg.enemyLifeS, exposedS: 0 })
      events.push({ kind: 'spawned', index })
      cursor = index + 1
      nextSpawnAtS = tS + cfg.spawnGapS
      break
    }
  }

  const phase: Phase = tS >= endsAtS ? 'over' : 'playing'
  if (phase === 'over') events.push({ kind: 'over' })

  return {
    phase,
    tS,
    endsAtS,
    score,
    killed,
    escaped,
    timesShot,
    shotsFired,
    active: phase === 'over' ? [] : active,
    nextSpawnAtS,
    cursor,
    events,
  }
}

/** Accuracy for the end screen. Zero shots is 0, not NaN. */
export const accuracy = (s: CombatState): number =>
  s.shotsFired === 0 ? 0 : s.killed / s.shotsFired
