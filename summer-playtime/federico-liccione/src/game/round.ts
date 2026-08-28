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
  readonly threatEveryS: number
  readonly threatFlightS: number
  readonly threatRadiusCm: number
  /** What a hit costs. The currency is time, because time is the resource. */
  readonly hitPenaltyS: number
  readonly seed: number
}

export const DEFAULT_CONFIG: RoundConfig = {
  durationS: 90,
  targetLifeS: 7,
  threatEveryS: 11,
  threatFlightS: 1.6,
  threatRadiusCm: 13,
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
  let { score, revealed, missed, hits, dodged, cursor, nextTargetAtS, nextThreatAtS, endsAtS } = state
  let threat = state.threat
  const tS = tick.tS

  // --- targets: revealed, or expired
  const active: ActiveTarget[] = []
  for (const a of state.active) {
    if (tick.visible[a.index]) {
      const points = pointsFor(specs[a.index]!)
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
    active.push(a)
  }

  // --- introduce the next target, skipping any already visible from here:
  // it would score itself the instant it appeared.
  if (active.length === 0 && tS >= nextTargetAtS) {
    for (let attempt = 0; attempt < specs.length; attempt++) {
      const index = (cursor + attempt) % specs.length
      if (tick.visible[index]) continue
      active.push({ index, bornS: tS, deadlineS: tS + cfg.targetLifeS })
      cursor = index + 1
      break
    }
  }

  // --- threats
  if (threat && tS >= threat.tImpact) {
    const dx = tick.eye.x - threat.to.x
    const dy = tick.eye.y - threat.to.y
    const dz = tick.eye.z - threat.to.z
    if (Math.hypot(dx, dy, dz) <= threat.radius) {
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
      to: { ...tick.eye },
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
