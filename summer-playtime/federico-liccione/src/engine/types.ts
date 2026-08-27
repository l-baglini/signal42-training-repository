/**
 * The engine's vocabulary.
 *
 * These types live *inside* the engine on purpose. The dependency arrow points
 * inward (SPEC §12) and invariant I6 enforces it: the engine imports nothing
 * from outside this directory, so everything else imports its vocabulary from
 * here.
 *
 * Units are centimetres and seconds, everywhere, without exception. The screen
 * plane is z = 0, x right, y up; the player sits at z > 0 and the scene lives
 * at z < 0. There are no pixels below the renderer.
 */

export interface Point3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

/**
 * An occluder: a rectangle parallel to the screen plane. This restriction is a
 * decision, not a shortcut awaiting removal — it is what a one-shot monocular
 * depth scan can honestly support, and it makes segment intersection exact
 * rather than approximate. SPEC §5, accepted weakness 2.
 */
export interface Billboard {
  readonly z: number
  readonly x0: number
  readonly x1: number
  readonly y0: number
  readonly y1: number
  /** Provenance only. Never read by a game rule. */
  readonly label: string
}

/**
 * What THIS player's body can actually do, measured rather than assumed.
 * SPEC §6.1.
 */
export interface Envelope {
  /** Fixed support basis. Two envelopes are comparable only by sharing it. */
  readonly dirs: readonly Point3[]
  /** max over samples of dot(dirs[i], sample), in cm. Monotone in the samples. */
  readonly support: readonly number[]
  readonly rest: Point3
  /** cm/s, 95th percentile of measured speed — not the maximum. */
  readonly vmax: number
  /** cm, tracker noise radius while still. Becomes the fairness floor. */
  readonly jitter: number
  /** s, measured end-to-end perception latency. */
  readonly latency: number
}

export type ScanSource = 'fixture' | 'depth' | 'depth+vlm'
export type Suitability = 'cover' | 'target' | 'hazard'

/** The only thing perception is allowed to hand the engine. SPEC §4, §7.4. */
export interface RoomScan {
  readonly source: ScanSource
  readonly occluders: readonly Billboard[]
  readonly anchors: readonly Point3[]
  readonly noSpawn: readonly Billboard[]
  readonly provenance: {
    readonly model: string
    readonly atISO: string
    readonly costCents: number
  }
}

export interface Target {
  readonly at: Point3
  readonly radius: number
}

/**
 * Something arriving at the player. It travels from `from` to `to` between
 * `tSpawn` and `tImpact`; `to` is where it lands, and an eye within `radius` of
 * that point at impact has been hit. SPEC §6.5.
 */
export interface Threat {
  readonly from: Point3
  readonly to: Point3
  readonly tSpawn: number
  readonly tImpact: number
  readonly radius: number
}

export interface DodgeVerdict {
  readonly dodgeable: boolean
  /** cm the player may travel in the time they actually have. */
  readonly budgetCm: number
  /** cm to the nearest safe position they can reach. Infinity if none exists. */
  readonly needCm: number
  /** How many cells of the envelope are outside the impact. */
  readonly safeCells: number
  /** Seconds left after reaction time and measured latency are subtracted. */
  readonly usableS: number
}

/** Why a candidate was discarded. Counted, and shown on the refusal screen. */
export type RejectReason =
  | 'no-spawn-zone'    // the scan marked this region unusable
  | 'unreachable'      // V(t) is empty: no eye position in E can see it
  | 'visible-at-rest'  // no lean required at all — I2
  | 'lean-too-small'   // the lean it asks for is not a movement, it is a twitch
  | 'window-too-tight' // the peek window is narrower than the tracker's jitter

export const REJECT_REASONS: readonly RejectReason[] = [
  'no-spawn-zone',
  'unreachable',
  'visible-at-rest',
  'lean-too-small',
  'window-too-tight',
]

/** Everything the engine can say about one candidate target. */
export interface Assessment {
  readonly target: Target
  /** |V(t)| in lattice cells. */
  readonly seen: number
  /** cm from rest to the nearest cell of V(t). Infinity when unreachable. */
  readonly leanCm: number
  /** cm, inradius of V(t) — how precisely the position must be held. */
  readonly windowCm: number
  readonly fair: boolean
  readonly reject: RejectReason | null
}

export interface LevelStats {
  readonly candidates: number
  readonly fair: number
  readonly rejected: Readonly<Record<RejectReason, number>>
  readonly latticeCells: number
}

export interface Level {
  readonly kind: 'level'
  readonly targets: readonly Target[]
  readonly assessments: readonly Assessment[]
  readonly stats: LevelStats
}

/**
 * Refusal is a first-class outcome, not an error. A game that declines to
 * generate an unfair level and shows its working says more about the engine
 * than a working level does. SPEC §10, invariant I8.
 */
export interface Refusal {
  readonly kind: 'refusal'
  readonly reason: string
  readonly stats: LevelStats
}

export type Generated = Level | Refusal
