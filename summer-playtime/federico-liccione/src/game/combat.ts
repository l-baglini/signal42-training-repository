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
  /**
   * Kept, and deliberately unused by `step`.
   *
   * Choosing *who* stands moved into `chooseLineup` in the engine, because it is
   * a geometric decision — which set of enemies covers every way this body can
   * peek — and the engine is where geometric decisions live. This field stays so
   * a round is still addressable by a seed from the outside, and so that nobody
   * reintroduces a shuffle here and calls it variety.
   */
  readonly seed: number
}

export const DEFAULT_COMBAT: CombatConfig = {
  durationS: 90,
  waveSize: 8,
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
  /**
   * Indices already killed this round. They do not come back.
   *
   * This was the bug behind *"una volta uccisi, rinascono sempre nella stessa
   * posizione"*. The specs arrive in the engine's coverage order, best first, and
   * the room stands the front of that order — so the moment index 3 died, index 3
   * was again the best available candidate and walked straight back into the same
   * spot. Correct by the old rule and absurd on screen.
   */
  readonly dead: readonly number[]
  /** How many times the room has been topped up. */
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
    dead: [],
    wave: 0,
    events: [],
  }
}

export const startCombat = (cfg: CombatConfig = DEFAULT_COMBAT): CombatState => ({
  ...newCombat(cfg),
  phase: 'playing',
})

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
  let dead = state.dead

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
      dead = [...dead, hit]
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
    const buried = new Set(dead)
    const fresh: number[] = []
    for (let i = 0; i < specs.length; i++) if (!standing.has(i) && !buried.has(i)) fresh.push(i)
    /**
     * A cleared room refills from the start rather than ending the round early.
     * Ninety seconds is the contract; running out of bodies with thirty left would
     * be a worse answer than a second pass through a room the player has proved
     * they can read.
     */
    if (fresh.length === 0) {
      dead = []
      for (let i = 0; i < specs.length; i++) if (!standing.has(i)) fresh.push(i)
    }
    const candidates = fresh
    /**
     * **In the order given.** There used to be a seeded shuffle here, and it was
     * wrong for a reason worth keeping: the order the specs arrive in is not
     * arbitrary. `chooseLineup` in the engine has already ordered them so that
     * each successive block covers every direction this body can peek, and
     * shuffling threw exactly that away — which is how the room came out feeling
     * emptier than the timer it replaced. Variety is the engine's business too:
     * it seeds its own tie-breaks.
     */
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
    dead,
    wave,
    events,
  }
}

/** Accuracy for the end screen. Zero shots is 0, not NaN. */
export const accuracy = (s: CombatState): number =>
  s.shotsFired === 0 ? 0 : s.killed / s.shotsFired
