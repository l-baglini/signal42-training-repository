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
  /**
   * How many enemies stand in the room at once.
   *
   * The room starts **full**. This replaced a drip-feed — two at a time, spawning
   * on a timer, leaving after eleven seconds — and the playtest verdict on that
   * was exact: *"prima quando ti affacciavi vedevi già presenti i nemici ed era
   * tutto più dinamico"*. With a timer, leaning out mostly found an empty
   * corridor, so the loop degenerated into move-and-wait-and-shoot. With a
   * standing lineup, leaning out finds a **situation**, and the question becomes
   * which of the things looking back at you you can afford to take.
   */
  readonly waveSize: number
  /** What being shot costs. Time, because time is the resource. */
  readonly hitPenaltyS: number
  /** The beat before a killed enemy is replaced, so the kill reads. */
  readonly waveGapS: number
  /** How fast the fuse drains once you are back behind cover, as a multiple. */
  readonly coverDrain: number
  readonly seed: number
}

export const DEFAULT_COMBAT: CombatConfig = {
  durationS: 90,
  waveSize: 5,
  hitPenaltyS: 6,
  waveGapS: 0.8,
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
  /** Seconds of accumulated exposure. Drains in cover. */
  readonly exposedS: number
}

export type CombatEvent =
  | { readonly kind: 'killed'; readonly index: number; readonly points: number }
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
  readonly timesShot: number
  readonly shotsFired: number
  readonly active: readonly ActiveEnemy[]
  readonly nextWaveAtS: number
  /** How many times the room has been topped up. Seeds the choice of who stands. */
  readonly wave: number
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
    timesShot: 0,
    shotsFired: 0,
    active: [],
    nextWaveAtS: 0,
    wave: 0,
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
  let { score, killed, timesShot, shotsFired, wave, nextWaveAtS, endsAtS } = state

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
      nextWaveAtS = Math.min(nextWaveAtS, tS + cfg.waveGapS)
    }
  }

  /**
   * The fuses. Charging only while you are out, draining faster than they charge
   * once you are back in — so reaching the end of one means you were still out,
   * and the engine has already proved that ducking was possible in the time it
   * allowed.
   */
  const advanced: ActiveEnemy[] = []
  for (const a of state.active) {
    if (shotDead.has(a.index)) continue
    advanced.push({
      ...a,
      exposedS: tick.exposed[a.index]
        ? a.exposedS + dtS
        : Math.max(0, a.exposedS - dtS * cfg.coverDrain),
    })
  }

  /**
   * One hit per tick, and it resets **every** fuse.
   *
   * With a standing lineup a lean can open three sightlines at once, and without
   * this a single moment of over-exposure would cascade into three penalties in
   * three consecutive frames. Resetting all of them says the obvious thing
   * instead: you were hit, everyone who had a shot took it, and now they are all
   * starting over — which also buys the player one fuse of grace to get back
   * behind cover.
   */
  const hitBy = advanced.find((a) => a.exposedS >= specs[a.index]!.fuseS)
  let active: ActiveEnemy[]
  if (hitBy) {
    timesShot++
    endsAtS -= cfg.hitPenaltyS
    events.push({ kind: 'shot', index: hitBy.index, penaltyS: cfg.hitPenaltyS })
    active = advanced.map((a) => ({ ...a, exposedS: 0 }))
  } else {
    active = advanced
  }

  /**
   * Top the room up.
   *
   * At the start of a round it fills all at once — that is the whole point, and it
   * is why leaning out finds a situation rather than a timer. Afterwards it
   * replaces the dead one at a time, so a kill is visibly a kill before the next
   * body arrives.
   *
   * An enemy is only ever *shipped* by the engine if a lean is needed to see it,
   * so at the rest position none of them can see the player however many are
   * standing there. The safe pocket behind cover survives the whole lineup, which
   * is what makes a full room fair rather than merely loud.
   */
  if (active.length < cfg.waveSize && tS >= nextWaveAtS) {
    const standing = new Set(active.map((a) => a.index))
    const candidates: number[] = []
    for (let i = 0; i < specs.length; i++) if (!standing.has(i)) candidates.push(i)
    // Fisher-Yates, seeded. Striding a list to spread a selection out is what
    // aliased three times in `proposeAnchors`; a shuffle cannot alias.
    const rng = mulberry32(cfg.seed + wave)
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      const tmp = candidates[i]!
      candidates[i] = candidates[j]!
      candidates[j] = tmp
    }
    const want = active.length === 0 ? cfg.waveSize : 1
    for (const index of candidates.slice(0, Math.max(0, want))) {
      active.push({ index, bornS: tS, exposedS: 0 })
      events.push({ kind: 'spawned', index })
    }
    if (candidates.length > 0) {
      wave++
      nextWaveAtS = tS + cfg.waveGapS
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
    timesShot,
    shotsFired,
    active: phase === 'over' ? [] : active,
    nextWaveAtS,
    wave,
    events,
  }
}

/** Accuracy for the end screen. Zero shots is 0, not NaN. */
export const accuracy = (s: CombatState): number =>
  s.shotsFired === 0 ? 0 : s.killed / s.shotsFired
