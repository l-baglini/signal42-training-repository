/**
 * Which of the fair positions actually stand in the room.
 *
 * The engine already answers "is this position fair" one candidate at a time.
 * That turned out not to be enough. A playtest of the standing lineup found the
 * room *emptier* than the drip-feed it replaced, and the cause was selection: the
 * fair positions were sorted by lean and a rotating slice was taken, so a round
 * could easily stand five enemies that all require a long lean to the same side.
 * Every one of them fair. Peek the other way and the room is empty, and an empty
 * room reads as a broken game.
 *
 * The complaint, in the playtester's words, is also the specification:
 * *"affacciandosi ci deve già essere una minaccia e dobbiamo essere pronti a
 * colpire o a rintanarci"*. So the quantity to maximise is not the count of
 * enemies — it is **how much of the space the body can move through has a threat
 * visible from it**. That is a maximum-coverage problem over the same lattice and
 * the same masks the fairness solver already uses, and greedy is within
 * 1 - 1/e of optimal on it, which at five enemies is better than any ordering by
 * eye.
 *
 * One correction, and it is the interesting part. Plain maximum coverage counts
 * cells, so it prefers the candidates with the **largest** footprints — and those
 * are the long-lean ones, whose exposure region is a wide swathe at the edge of
 * the envelope. Measured by distance from rest, the first version of this file
 * produced levels where a full commit found a threat essentially always (93-100%
 * of cells at the far edge) and a half-committed lean found one a third of the
 * time. Which is the emptiness the playtester was reporting, now with a number on
 * it: the algorithm was biased against exactly the enemies that make a modest
 * peek worth making.
 *
 * So the coverage is **weighted by where the body actually spends its time**,
 * which is near rest. A cell at a third of the reach counts for about four of a
 * cell at full stretch. Cells inside the cover pocket carry the highest weight of
 * all and no candidate can reach them, which is not a waste — it is the invariant
 * being inert, exactly as it should be.
 *
 * Two things this deliberately does not do. It does not try to cover the whole
 * envelope: the safe pocket has to survive, and it does, because I2 guarantees no
 * shipped enemy can engage from the rest position — so the complement of the
 * union always contains it, whatever the lineup. And it does not touch fairness:
 * every candidate handed to it has already been judged one at a time, and
 * ordering fair things cannot make them unfair.
 *
 * Pure, deterministic, and inside the engine, because it decides what the player
 * faces. Perception proposed these positions; it has no say in which ones stand.
 */
import type { Billboard, Envelope, Point3 } from './types'
import { cellCentre, cellIndex, reachCm, type Lattice } from './lattice'
import { engageableMask } from './exposure'
import { DEFAULT_VIEWPORT, type Viewport } from './viewport'

export interface LineupCandidate {
  readonly at: Point3
  readonly radius: number
  /**
   * How hard this one is, in whatever unit the caller thinks in. Lower is
   * preferred, and it is only ever consulted to break a tie in coverage.
   *
   * Supplied from outside rather than computed here, and the reason is worth
   * stating: difficulty is a *game* judgement — the game already has one, in
   * `pointsFor`, which weighs how far you must lean against how precisely you
   * must hold it — while coverage is a geometric one. The engine owns the
   * geometry and declines to own the taste. A caller with no opinion can pass
   * `leanCm` and get sensible behaviour.
   */
  readonly cost: number
}

export interface LineupOptions {
  readonly viewport?: Viewport
  /**
   * Varies the choice between rounds without weakening it. It only ever breaks a
   * tie in preference, never the coverage decision itself.
   */
  readonly seed?: number
}

/** A hash, not a generator: same index and seed, same number, no state. */
function jitter(i: number, seed: number): number {
  let h = (i * 0x27d4eb2d + seed * 0x165667b1) >>> 0
  h = Math.imul(h ^ (h >>> 15), h | 1)
  h ^= h + Math.imul(h ^ (h >>> 7), h | 61)
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296
}

/**
 * The engagement masks, one per candidate.
 *
 * Recomputed here rather than threaded out of `assessEnemies`, which throws them
 * away. It is the same sweep, over a third as many positions — only the fair ones
 * reach this far — and keeping it local means the fairness pass has one output
 * and one meaning.
 */
function masksFor(
  lat: Lattice,
  occluders: readonly Billboard[],
  candidates: readonly LineupCandidate[],
  view: Viewport,
): readonly Uint8Array[] {
  return candidates.map((c) => engageableMask(lat, occluders, c.at, view, c.radius))
}

/**
 * Order the candidates so that each successive block of them threatens as much of
 * the body's range as possible.
 *
 * Greedy maximum coverage, run **repeatedly**: enemies are taken one at a time,
 * each the one that adds the most newly-threatened positions, until nothing adds
 * anything; then the union is forgotten and it starts again with what is left. So
 * the front of the list is a good covering set — that is what stands at the start
 * of a round — and the replacements that arrive after a kill are, in order, the
 * next best covering set rather than whatever happened to be left over.
 *
 * Ties go to the cheaper candidate, perturbed by a seeded few per cent so two
 * rounds of the same level are not the same round. Cheaper first, and with the
 * game passing `pointsFor` as the cost this gives a difficulty curve for free:
 * the enemies you meet at the start of a round are the ones asking for the
 * shortest lean and the loosest hold, and the ones that ask for a long reach held
 * to a centimetre arrive as replacements later, once the room has thinned out.
 */
export function chooseLineup(
  lat: Lattice,
  env: Envelope,
  occluders: readonly Billboard[],
  candidates: readonly LineupCandidate[],
  opts: LineupOptions = {},
): readonly number[] {
  const view = opts.viewport ?? DEFAULT_VIEWPORT
  const seed = opts.seed ?? 1
  const masks = masksFor(lat, occluders, candidates, view)
  const weight = occupancyWeights(lat, env)
  // A few per cent of jitter on the preference, so two rounds of the same level
  // are not the same round. It cannot change a coverage decision.
  const spread = candidates.reduce((m, c) => Math.max(m, Math.abs(c.cost)), 0)
  const cost = candidates.map((c, i) => c.cost + jitter(i, seed) * spread * 0.12)

  const order: number[] = []
  const taken = new Set<number>()
  const union = new Uint8Array(lat.inside.length)

  for (;;) {
    union.fill(0)
    let added = 0
    for (;;) {
      let best = -1
      let bestGain = 0
      for (let i = 0; i < candidates.length; i++) {
        if (taken.has(i)) continue
        const m = masks[i]!
        let gain = 0
        for (let n = 0; n < m.length; n++) if (m[n] && !union[n]) gain += weight[n]!
        if (gain <= 0) continue
        if (gain > bestGain || (gain === bestGain && best >= 0 && cost[i]! < cost[best]!)) {
          best = i
          bestGain = gain
        }
      }
      if (best < 0) break
      taken.add(best)
      order.push(best)
      added++
      const m = masks[best]!
      for (let n = 0; n < m.length; n++) if (m[n]) union[n] = 1
    }
    if (added === 0) break
  }

  // Anything whose footprint is empty — the engine called it fair on a mask that
  // has since been recomputed identically, so this should be nobody, and if it is
  // somebody they belong last rather than dropped.
  const leftover = candidates
    .map((_, i) => i)
    .filter((i) => !taken.has(i))
    .sort((a, b) => cost[a]! - cost[b]!)
  return [...order, ...leftover]
}

/**
 * What fraction of the positions this body can reach has a threat visible from it,
 * given the first `n` of an order.
 *
 * The measurement the selection exists to move, exposed so a tool can print it
 * and a test can assert it. It cannot reach 1 and should not: the part that stays
 * uncovered is the cover, and the game is played by moving between the two.
 */
export function threatCoverage(
  lat: Lattice,
  occluders: readonly Billboard[],
  candidates: readonly LineupCandidate[],
  order: readonly number[],
  n: number,
  opts: LineupOptions = {},
): number {
  if (lat.count === 0) return 0
  let hit = 0
  const union = threatUnion(lat, occluders, candidates, order, n, opts)
  for (let k = 0; k < union.length; k++) if (union[k] && lat.inside[k]) hit++
  return hit / lat.count
}

/** Where at least one of the first `n` enemies can be engaged from. */
export function threatUnion(
  lat: Lattice,
  occluders: readonly Billboard[],
  candidates: readonly LineupCandidate[],
  order: readonly number[],
  n: number,
  opts: LineupOptions = {},
): Uint8Array {
  const view = opts.viewport ?? DEFAULT_VIEWPORT
  const union = new Uint8Array(lat.inside.length)
  for (const i of order.slice(0, Math.max(0, n))) {
    const c = candidates[i]
    if (!c) continue
    const m = engageableMask(lat, occluders, c.at, view, c.radius)
    for (let k = 0; k < union.length; k++) if (m[k]) union[k] = 1
  }
  return union
}

/**
 * Threat coverage split by how far from rest the position is, as a fraction of
 * this body's reach.
 *
 * The aggregate number hid the whole problem, because the lattice has far more
 * cells in the middle of the envelope than at its edge, so a metric averaged over
 * cells is dominated by the middle and says nothing about either end. Reported in
 * bands, the shape of the level is immediately legible: the first band must be
 * near zero — that is the cover, and the game needs it — the last should be near
 * one, and the middle is the number worth arguing about.
 */
export function threatByReach(
  lat: Lattice,
  env: Envelope,
  occluders: readonly Billboard[],
  candidates: readonly LineupCandidate[],
  order: readonly number[],
  n: number,
  bands: readonly number[] = [0.25, 0.5, 0.75, 1.0001],
  opts: LineupOptions = {},
): ReadonlyArray<{ readonly upTo: number; readonly cells: number; readonly threatened: number }> {
  const union = threatUnion(lat, occluders, candidates, order, n, opts)
  const reach = reachCm(lat, env.rest) || 1
  const cells = bands.map(() => 0)
  const threatened = bands.map(() => 0)
  for (let k = 0; k < lat.nz; k++)
    for (let j = 0; j < lat.ny; j++)
      for (let i = 0; i < lat.nx; i++) {
        const idx = cellIndex(lat, i, j, k)
        if (!lat.inside[idx]) continue
        const c = cellCentre(lat, i, j, k)
        const f = Math.hypot(c.x - env.rest.x, c.y - env.rest.y, c.z - env.rest.z) / reach
        const b = bands.findIndex((t) => f < t)
        if (b < 0) continue
        cells[b]!++
        if (union[idx]) threatened[b]!++
      }
  return bands.map((upTo, b) => ({ upTo, cells: cells[b]!, threatened: threatened[b]! }))
}

/**
 * How much each reachable position is worth covering.
 *
 * A model of where the body spends its time: a Cauchy kernel on distance from
 * rest, at half weight by a third of the reach. Deliberately crude — what matters
 * is only that near counts for more than far, because that is the bias the plain
 * cell count had backwards.
 */
export function occupancyWeights(lat: Lattice, env: Envelope): Float64Array {
  const w = new Float64Array(lat.inside.length)
  const scale = 0.35 * (reachCm(lat, env.rest) || 1)
  for (let k = 0; k < lat.nz; k++)
    for (let j = 0; j < lat.ny; j++)
      for (let i = 0; i < lat.nx; i++) {
        const idx = cellIndex(lat, i, j, k)
        if (!lat.inside[idx]) continue
        const c = cellCentre(lat, i, j, k)
        const d = Math.hypot(c.x - env.rest.x, c.y - env.rest.y, c.z - env.rest.z) / scale
        w[idx] = 1 / (1 + d * d)
      }
  return w
}
