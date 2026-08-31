/**
 * Ninety seconds. SPEC §14 step 3.
 *
 * A pure state machine: `step` takes a state, a tick, and returns a new state
 * plus the events that happened. It knows nothing about the DOM, the renderer or
 * the clock — the caller supplies the time and the eye, and the caller renders
 * the result. That is what makes a game loop testable, and this one is.
 *
 * It also knows nothing about *fairness*. Whether a target is reachable and
 * whether a threat is dodgeable are decided in `src/engine/`; this file only
 * asks, through the `maySpawn` gate. SPEC §4.
 */
import type { Point3, Threat } from '../engine'

export type Phase = 'ready' | 'playing' | 'over'

export interface RoundConfig {
  readonly durationS: number
  /** How long a target stays live before it counts as missed. */
  readonly targetLifeS: number
  /**
   * How long the target must be held in view to score.
   *
   * The single most important number in the game. With an instantaneous reveal,
   * a peek window 1.8 cm wide and one 5 cm wide play identically — you sweep
   * through both — so the difficulty the engine measures is never felt. Holding
   * makes narrowness physical.
   */
  readonly holdS: number
  /** How fast progress drains when the target is lost, as a multiple of real time. */
  readonly holdDecay: number
  readonly threatEveryS: number
  readonly threatFlightS: number
  readonly threatRadiusCm: number
  /** What a hit costs. The currency is time, because time is the resource. */
  readonly hitPenaltyS: number
  readonly seed: number
}

export const DEFAULT_CONFIG: RoundConfig = {
  durationS: 90,
  targetLifeS: 9,
  holdS: 1.0,
  // Draining rather than resetting: a flicker from the tracker must not wipe a
  // second of held position, and in poor light flickers happen.
  holdDecay: 1.6,
  threatEveryS: 11,
  threatFlightS: 1.8,
  threatRadiusCm: 8,
  hitPenaltyS: 5,
  seed: 1,
}

/** What the engine measured about a target, as the score needs it. */
export interface TargetSpec {
  readonly leanCm: number
  readonly windowCm: number
}

export interface ActiveTarget {
  readonly index: number
  readonly bornS: number
  readonly deadlineS: number
  /** Seconds of continuous sight accumulated, drained when sight is lost. */
  readonly heldS: number
}

export type RoundEvent =
  | { readonly kind: 'revealed'; readonly index: number; readonly points: number }
  | { readonly kind: 'missed'; readonly index: number }
  | { readonly kind: 'threat' }
  | { readonly kind: 'dodged' }
  | { readonly kind: 'hit'; readonly penaltyS: number }
  | { readonly kind: 'over' }

export interface RoundState {
  readonly phase: Phase
  readonly tS: number
  /** When the round ends. Falls as hits are taken. */
  readonly endsAtS: number
  readonly score: number
  readonly revealed: number
  readonly missed: number
  readonly hits: number
  readonly dodged: number
  readonly active: readonly ActiveTarget[]
  readonly threat: Threat | null
  readonly nextTargetAtS: number
  readonly nextThreatAtS: number
  readonly cursor: number
  readonly events: readonly RoundEvent[]
}

export interface Tick {
  readonly tS: number
  /**
   * Where a threat should be aimed, when the game wants it aimed somewhere other
   * than the player. The app passes the viewpoint that reveals the current
   * target, which is what makes holding a position a decision rather than a
   * formality — the safe place and the scoring place stop being the same place.
   */
  readonly aimAt?: Point3 | null
  readonly eye: Point3
  /** Per target index: is it visible from the eye right now. */
  readonly visible: readonly boolean[]
  /** The dodge solver's gate. A threat it refuses is never spawned. */
  readonly maySpawn: (threat: Threat) => boolean
}

/**
 * What a reveal is worth.
 *
 * The two halves of the engine's difficulty pair, kept apart rather than
 * collapsed: how far you had to go, and how precisely you had to hold it. Both
 * raise the score, which is the only sense in which this game has an opinion
 * about what is hard.
 */
export function pointsFor(spec: TargetSpec): number {
  return Math.max(10, Math.round(12 * spec.leanCm + 150 / Math.max(spec.windowCm, 0.5)))
}

export function newRound(cfg: RoundConfig = DEFAULT_CONFIG): RoundState {
  return {
    phase: 'ready',
    tS: 0,
    endsAtS: cfg.durationS,
    score: 0,
    revealed: 0,
    missed: 0,
    hits: 0,
    dodged: 0,
    active: [],
    threat: null,
    nextTargetAtS: 0,
    nextThreatAtS: cfg.threatEveryS,
    cursor: 0,
    events: [],
  }
}

export function start(state: RoundState, cfg: RoundConfig = DEFAULT_CONFIG): RoundState {
  return { ...newRound(cfg), phase: 'playing' }
}

/** Seeded, because I5 applies to the whole product and not only the solver. */
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
  state: RoundState,
  cfg: RoundConfig,
  specs: readonly TargetSpec[],
  tick: Tick,
): RoundState {
  if (state.phase !== 'playing') return { ...state, events: [] }
  if (specs.length === 0) return { ...state, phase: 'over', events: [{ kind: 'over' }] }

  const events: RoundEvent[] = []
  const dtS = Math.max(0, Math.min(0.25, tick.tS - state.tS))
  let { score, revealed, missed, hits, dodged, cursor, nextTargetAtS, nextThreatAtS, endsAtS } = state
  let threat = state.threat
  const tS = tick.tS

  // --- targets: revealed, or expired
  const active: ActiveTarget[] = []
  for (const a of state.active) {
    const heldS = tick.visible[a.index]
      ? a.heldS + dtS
      : Math.max(0, a.heldS - dtS * cfg.holdDecay)

    if (heldS >= cfg.holdS) {
      // Promptness bonus: finding it in the first second is worth half again as
      // much as finding it on the last. It rewards committing to a lean instead
      // of sweeping the room.
      const remaining = Math.max(0, a.deadlineS - tS) / cfg.targetLifeS
      const points = Math.round(pointsFor(specs[a.index]!) * (1 + 0.5 * remaining))
      score += points
      revealed++
      events.push({ kind: 'revealed', index: a.index, points })
      nextTargetAtS = tS + 0.4
      continue
    }
    if (tS >= a.deadlineS) {
      missed++
      events.push({ kind: 'missed', index: a.index })
      nextTargetAtS = tS + 0.4
      continue
    }
    active.push({ ...a, heldS })
  }

  // --- introduce the next target, skipping any already visible from here:
  // it would score itself the instant it appeared.
  if (active.length === 0 && tS >= nextTargetAtS) {
    for (let attempt = 0; attempt < specs.length; attempt++) {
      const index = (cursor + attempt) % specs.length
      if (tick.visible[index]) continue
      active.push({ index, bornS: tS, deadlineS: tS + cfg.targetLifeS, heldS: 0 })
      cursor = index + 1
      break
    }
  }

  // --- threats
  if (threat && tS >= threat.tImpact) {
    // Lateral only, matching the engine: depth does not save you, and the dodge
    // is therefore a sideways lean rather than a guess.
    if (Math.hypot(tick.eye.x - threat.to.x, tick.eye.y - threat.to.y) <= threat.radius) {
      hits++
      endsAtS -= cfg.hitPenaltyS
      events.push({ kind: 'hit', penaltyS: cfg.hitPenaltyS })
    } else {
      dodged++
      events.push({ kind: 'dodged' })
    }
    threat = null
    nextThreatAtS = tS + cfg.threatEveryS
  }

  if (!threat && tS >= nextThreatAtS) {
    const r = mulberry32(cfg.seed + Math.floor(tS * 1000))
    const candidate: Threat = {
      // Aimed at where you are now, from somewhere across the room.
      from: { x: (r() - 0.5) * 160, y: (r() - 0.5) * 80, z: -300 },
      // Aimed at where you are now, and it stops at the glass. Travelling all
      // the way to the eye is what made it fill the screen and become
      // unreadable — at the window plane its size is bounded by the screen.
      // Aimed at where the player NEEDS to be when the game supplies it, and at
      // where they are otherwise. Either way it stops at the glass, and either
      // way the gate below decides whether it may exist at all.
      to: { x: (tick.aimAt ?? tick.eye).x, y: (tick.aimAt ?? tick.eye).y, z: 0 },
      tSpawn: tS,
      tImpact: tS + cfg.threatFlightS,
      radius: cfg.threatRadiusCm,
    }
    if (tick.maySpawn(candidate)) {
      threat = candidate
      events.push({ kind: 'threat' })
    } else {
      // Refused by the dodge gate. Try again shortly rather than dropping the
      // pacing on the floor — and never by relaxing the gate.
      nextThreatAtS = tS + 1.5
    }
  }

  const phase: Phase = tS >= endsAtS ? 'over' : 'playing'
  if (phase === 'over') events.push({ kind: 'over' })

  return {
    phase,
    tS,
    endsAtS,
    score,
    revealed,
    missed,
    hits,
    dodged,
    active,
    threat: phase === 'over' ? null : threat,
    nextTargetAtS,
    nextThreatAtS,
    cursor,
    events,
  }
}

/** Where the threat is right now, for drawing. Linear in time. */
export function threatPosition(threat: Threat, tS: number): Point3 {
  const u = Math.min(1, Math.max(0, (tS - threat.tSpawn) / (threat.tImpact - threat.tSpawn)))
  return {
    x: threat.from.x + (threat.to.x - threat.from.x) * u,
    y: threat.from.y + (threat.to.y - threat.from.y) * u,
    z: threat.from.z + (threat.to.z - threat.from.z) * u,
  }
}
