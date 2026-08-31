import type {
  Assessment,
  Billboard,
  Envelope,
  Generated,
  LevelStats,
  Point3,
  RejectReason,
  RoomScan,
  Target,
} from './types'
import { REJECT_REASONS } from './types'
import { latticeOf, reachCm, type Lattice } from './lattice'
import { visible } from './sightline'
import { footprintMask, inradiusCm, maskCount, nearestLeanCm } from './footprint'

export interface GenerateOptions {
  /** Lattice pitch in cm. Bounds the narrowest window the solver can resolve. */
  readonly pitch?: number
  /** Multiplier on measured jitter that a peek window must exceed to be fair. */
  readonly jitterK?: number
  /**
   * Minimum lean, as a fraction of the envelope's measured reach. Guards against
   * targets that are technically hidden at rest but revealed by a twitch — the
   * sweep found 179 such "fair" candidates before this existed.
   */
  readonly leanFraction?: number
  readonly maxTargets?: number
  readonly seed?: number
  readonly targetRadius?: number
  /** How far in front of a no-spawn plane the exclusion still applies, in cm. */
  readonly noSpawnBand?: number
}

const DEFAULTS = {
  pitch: 2,
  jitterK: 2,
  leanFraction: 0.3,
  maxTargets: 6,
  seed: 1,
  targetRadius: 6,
  noSpawnBand: 120,
} as const

/**
 * Seeded PRNG. Determinism is invariant I5, so the engine may not reach for
 * Math.random — but it may absolutely be random, as long as the seed decides.
 */
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

function inNoSpawn(p: Point3, noSpawn: readonly Billboard[], band: number): boolean {
  for (const o of noSpawn) {
    if (p.x < o.x0 || p.x > o.x1 || p.y < o.y0 || p.y > o.y1) continue
    if (p.z <= o.z + band) return true
  }
  return false
}

const emptyRejects = (): Record<RejectReason, number> => ({
  'no-spawn-zone': 0,
  unreachable: 0,
  'visible-at-rest': 0,
  'lean-too-small': 0,
  'window-too-tight': 0,
})

/**
 * Assess every anchor the scan offered. Nothing is selected here and nothing is
 * hidden: a rejected candidate keeps its numbers, because the refusal screen in
 * SPEC §10 has to be able to show its working.
 *
 * Precedence is fixed and reported as the *first* failing reason, in this order:
 * no-spawn-zone, unreachable, visible-at-rest, lean-too-small, window-too-tight.
 */
export function assess(
  scan: RoomScan,
  env: Envelope,
  opts: GenerateOptions = {},
): { assessments: Assessment[]; lattice: Lattice } {
  const o = { ...DEFAULTS, ...opts }
  const lattice = latticeOf(env, o.pitch)
  const minLean = o.leanFraction * reachCm(lattice, env.rest)
  const assessments: Assessment[] = []

  for (const anchor of scan.anchors) {
    const target: Target = { at: anchor, radius: o.targetRadius }

    if (inNoSpawn(anchor, scan.noSpawn, o.noSpawnBand)) {
      assessments.push({
        target, seen: 0, leanCm: Infinity, windowCm: 0, fair: false, reject: 'no-spawn-zone',
      })
      continue
    }

    const mask = footprintMask(lattice, scan.occluders, anchor)
    const seen = maskCount(mask)
    if (seen === 0) {
      assessments.push({
        target, seen: 0, leanCm: Infinity, windowCm: 0, fair: false, reject: 'unreachable',
      })
      continue
    }

    const leanCm = nearestLeanCm(lattice, mask, env.rest)
    const windowCm = inradiusCm(lattice, mask)

    // I2: a target visible without moving turns the game into a staring contest.
    // Tested against the true rest position, not its nearest lattice cell.
    if (visible(env.rest, anchor, scan.occluders)) {
      assessments.push({ target, seen, leanCm, windowCm, fair: false, reject: 'visible-at-rest' })
      continue
    }

    // Hidden at rest is not enough — the lean has to be a movement. The floor
    // scales with what this body can do, so the demand is effort, not distance.
    if (leanCm < minLean) {
      assessments.push({ target, seen, leanCm, windowCm, fair: false, reject: 'lean-too-small' })
      continue
    }

    // The fairness floor is the tracker's own measured noise: a window narrower
    // than the jitter is not a challenge, it is a lottery.
    if (windowCm <= o.jitterK * env.jitter) {
      assessments.push({ target, seen, leanCm, windowCm, fair: false, reject: 'window-too-tight' })
      continue
    }

    assessments.push({ target, seen, leanCm, windowCm, fair: true, reject: null })
  }

  return { assessments, lattice }
}

function statsOf(assessments: readonly Assessment[], latticeCells: number): LevelStats {
  const rejected = emptyRejects()
  let fair = 0
  for (const a of assessments) {
    if (a.fair) fair++
    else if (a.reject) rejected[a.reject]++
  }
  return { candidates: assessments.length, fair, rejected, latticeCells }
}

const PHRASE: Record<RejectReason, string> = {
  'no-spawn-zone': 'in a region the scan marked unusable',
  unreachable: 'unreachable from anywhere your body can go',
  'visible-at-rest': 'visible without leaning',
  'lean-too-small': 'revealed by a twitch rather than a lean',
  'window-too-tight': 'behind a peek window narrower than the tracker can resolve',
}

function refusalReason(stats: LevelStats): string {
  const parts = REJECT_REASONS.filter((r) => stats.rejected[r] > 0).map(
    (r) => `${stats.rejected[r]} ${PHRASE[r]}`,
  )
  const detail = parts.length ? ` — ${parts.join(', ')}` : ''
  return `This room yields 0 fair targets out of ${stats.candidates} candidates${detail}.`
}

/**
 * Generate a level, or refuse to.
 *
 * Refusal is a first-class outcome (invariant I8). A room with nothing to hide
 * behind, or a body that cannot move far enough, produces a typed refusal with
 * the counts that explain it — never an empty level that pretends to be valid.
 */
export function generate(
  scan: RoomScan,
  env: Envelope,
  opts: GenerateOptions = {},
): Generated {
  const o = { ...DEFAULTS, ...opts }
  const { assessments, lattice } = assess(scan, env, opts)
  const stats = statsOf(assessments, lattice.count)

  const fair = assessments.filter((a) => a.fair)
  if (fair.length === 0) {
    return { kind: 'refusal', reason: refusalReason(stats), stats }
  }

  // Shuffle under the seed, then stable-sort by required lean. Variety across
  // levels from one room scan comes from the seed; the difficulty ramp does not.
  const rng = mulberry32(o.seed)
  const pool = fair.slice()
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const a = pool[i]!
    pool[i] = pool[j]!
    pool[j] = a
  }
  pool.sort((a, b) => a.leanCm - b.leanCm)

  return {
    kind: 'level',
    targets: pool.slice(0, o.maxTargets).map((a) => a.target),
    assessments,
    stats,
  }
}
