/**
 * The fairness theorem for cover combat.
 *
 * An enemy is fair only if it is shootable, survivable, and the trip between
 * those two places is makeable in the time it gives you — at the speed this
 * player was measured moving. All three fall out of one footprint and one
 * envelope, because a sightline has no direction: the set of positions from
 * which you can shoot it is the set in which it can shoot you.
 */
import { describe, expect, it } from 'vitest'
import {
  assessEnemies,
  assessEnemy,
  cellCentre,
  fuseForFairRetreat,
  coverMask,
  footprintMask,
  gapCm,
  latticeOf,
  maskCount,
  reachCm,
  onScreen,
  DEFAULT_VIEWPORT,
  visible,
} from '../src/engine'
import type { Billboard, Enemy, Envelope, Point3 } from '../src/engine'
import raw from '../fixtures/desk.room.json'
import type { RoomScan } from '../src/engine'
import { seated } from '../fixtures/envelopes'

const room = raw as RoomScan
const env = seated()
const lat = latticeOf(env)
const REACH = reachCm(lat, env.rest)

const enemyAt = (at: Point3, fuseS = 1.2): Enemy => ({ at, radius: 8, fuseS })

function judge(at: Point3, occluders: readonly Billboard[] = room.occluders, e: Envelope = env) {
  const l = latticeOf(e)
  const exposed = footprintMask(l, occluders, at)
  return assessEnemy(l, enemyAt(at), e, exposed, visible(e.rest, at, occluders), {
    reachCm: reachCm(l, e.rest),
  })
}

describe('the symmetry', () => {
  it('exposure and firing position are the same set', () => {
    const at = room.anchors[0]!
    const mask = footprintMask(lat, room.occluders, at)
    // Not two computations that happen to agree — literally one mask, used for
    // both questions. This test exists to stop anyone "fixing" that.
    const cover = coverMask(lat, mask)
    for (let i = 0; i < mask.length; i++) {
      if (!lat.inside[i]) {
        expect(cover[i]).toBe(0)
        continue
      }
      expect(cover[i]).toBe(mask[i] ? 0 : 1)
    }
    expect(maskCount(mask) + maskCount(cover)).toBe(lat.count)
  })

  it('cover never includes a position the body cannot reach', () => {
    const cover = coverMask(lat, footprintMask(lat, room.occluders, room.anchors[0]!))
    for (let i = 0; i < cover.length; i++) if (cover[i]) expect(lat.inside[i]).toBe(1)
  })
})

describe('the gap between exposure and cover', () => {
  it('agrees with brute force, which is what it replaced', () => {
    /**
     * gapCm used to compare every exposed cell against every covered one — up to
     * a million distances per enemy, which was fine for eight anchors and a
     * two-minute timeout for four hundred. It now goes through the distance
     * transform in linear time, so it is worth proving the two agree.
     */
    const small = latticeOf(env, 6)
    const brute = (a: Uint8Array, b: Uint8Array): number => {
      let best = Infinity
      for (let i = 0; i < a.length; i++) {
        if (!a[i]) continue
        const ki = Math.floor(i / (small.nx * small.ny))
        const ji = Math.floor((i - ki * small.nx * small.ny) / small.nx)
        const ii = i - ki * small.nx * small.ny - ji * small.nx
        const p = cellCentre(small, ii, ji, ki)
        for (let j = 0; j < b.length; j++) {
          if (!b[j]) continue
          const kj = Math.floor(j / (small.nx * small.ny))
          const jj = Math.floor((j - kj * small.nx * small.ny) / small.nx)
          const ij = j - kj * small.nx * small.ny - jj * small.nx
          const q = cellCentre(small, ij, jj, kj)
          const d = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)
          if (d < best) best = d
        }
      }
      return best
    }

    let compared = 0
    for (const at of room.anchors.slice(0, 6)) {
      const exposed = footprintMask(small, room.occluders, at)
      const cover = coverMask(small, exposed)
      const fast = gapCm(small, exposed, cover)
      const slow = brute(exposed, cover)
      if (!Number.isFinite(slow)) {
        expect(fast).toBe(Infinity)
        continue
      }
      expect(fast).toBeCloseTo(slow, 6)
      compared++
    }
    expect(compared).toBeGreaterThan(2)
  })

  it('is zero when the two sets touch, and they always touch here', () => {
    // On a 2 cm lattice an exposed cell and a covered cell are neighbours at the
    // silhouette edge, so the retreat is one cell. That is the mechanic working:
    // stepping back behind cover is meant to be cheap; staying out is not.
    const at = room.anchors[0]!
    const exposed = footprintMask(lat, room.occluders, at)
    const gap = gapCm(lat, exposed, coverMask(lat, exposed))
    expect(gap).toBeLessThanOrEqual(lat.pitch * 2)
  })

  it('is infinite when one side is empty', () => {
    const empty = new Uint8Array(lat.inside.length)
    const full = new Uint8Array(lat.inside.length).fill(1)
    expect(gapCm(lat, empty, full)).toBe(Infinity)
    expect(gapCm(lat, full, empty)).toBe(Infinity)
  })
})

describe('an enemy is judged on three counts', () => {
  it('refuses one nothing can shoot', () => {
    // Behind the wide chair back: unreachable, as the hunt found too.
    expect(judge({ x: 10, y: -6, z: -180 }).reject).toBe('not-shootable')
  })

  it('refuses one with no cover anywhere', () => {
    // No occluders at all: every position in the envelope is in its line of fire.
    const a = judge({ x: 0, y: 0, z: -200 }, [])
    expect(a.coveredCells).toBe(0)
    expect(a.reject).toBe('no-cover')
  })

  it('refuses one that can already shoot you where you sit', () => {
    // Off to the left of everything: nothing blocks it from the rest position,
    // but leaning right brings the monitor between them, so cover does exist.
    const a = judge({ x: -90, y: 0, z: -200 })
    expect(a.coveredCells).toBeGreaterThan(0)
    expect(a.reject).toBe('exposed-at-rest')
  })

  it('reports the more fundamental reason when two apply', () => {
    // An enemy in front of every occluder is both exposed-at-rest and
    // without-cover. "There is nowhere safe" is the more useful thing to say, so
    // that is the precedence, and it is a decision rather than an accident.
    const a = judge({ x: 0, y: 0, z: -25 })
    expect(a.coveredCells).toBe(0)
    expect(a.reject).toBe('no-cover')
  })

  it('accepts one that is shootable, survivable and escapable', () => {
    const fair = room.anchors.map((at) => judge(at)).filter((a) => a.fair)
    expect(fair.length).toBeGreaterThan(4)
    for (const a of fair) {
      expect(a.exposedCells).toBeGreaterThan(0)
      expect(a.coveredCells).toBeGreaterThan(0)
      expect(a.retreatCm).toBeLessThanOrEqual(a.retreatBudgetCm)
      expect(a.leanCm).toBeGreaterThan(0)
    }
  })
})

describe('the retreat budget spends measured numbers, not assumed ones', () => {
  const at = room.anchors.find((a) => judge(a).fair)!

  it('a short fuse leaves no time to get back into cover', () => {
    const l = latticeOf(env)
    const exposed = footprintMask(l, room.occluders, at)
    const brutal: Enemy = { at, radius: 8, fuseS: 0.26 }
    const a = assessEnemy(l, brutal, env, exposed, visible(env.rest, at, room.occluders), {
      reachCm: REACH,
    })
    expect(a.retreatBudgetCm).toBeLessThan(1)
    expect(a.reject).toBe('cannot-retreat')
  })

  it('a slower tracker makes fewer enemies fair, never harsher ones', () => {
    const slow: Envelope = { ...env, latency: env.latency + 0.6 }
    const fastFair = room.anchors.filter((a) => judge(a, room.occluders, env).fair).length
    const slowFair = room.anchors.filter((a) => judge(a, room.occluders, slow).fair).length
    expect(slowFair).toBeLessThanOrEqual(fastFair)
  })

  it('a body that cannot move cannot be asked to retreat', () => {
    const frozen: Envelope = { ...env, vmax: 0 }
    const l = latticeOf(frozen)
    const exposed = footprintMask(l, room.occluders, at)
    const a = assessEnemy(l, enemyAt(at), frozen, exposed, visible(frozen.rest, at, room.occluders), {
      reachCm: reachCm(l, frozen.rest),
    })
    expect(a.retreatBudgetCm).toBe(0)
    expect(a.fair).toBe(false)
  })
})

describe('the fuse is derived from the body, not tuned', () => {
  it('grants more time for a longer retreat', () => {
    const near = fuseForFairRetreat(env, 4)
    const far = fuseForFairRetreat(env, 40)
    expect(far).toBeGreaterThan(near)
  })

  it('grants more time to a slower body and a slower tracker', () => {
    const base = fuseForFairRetreat(env, 20)
    expect(fuseForFairRetreat({ ...env, vmax: env.vmax / 3 }, 20)).toBeGreaterThan(base)
    expect(fuseForFairRetreat({ ...env, latency: env.latency + 0.2 }, 20)).toBeGreaterThan(base)
  })

  it('never asks a motionless body to retreat', () => {
    expect(fuseForFairRetreat({ ...env, vmax: 0 }, 20)).toBe(Infinity)
  })

  it('makes the retreat check pass by construction', () => {
    // The point of deriving it: no enemy is ever given a fuse this player cannot
    // beat, so `cannot-retreat` becomes unreachable and the other rejections are
    // the ones that carry information.
    const { assessments } = assessEnemies(room, env)
    expect(assessments.length).toBe(room.anchors.length)
    for (const a of assessments) expect(a.reject).not.toBe('cannot-retreat')
  })

  it('and still produces enemies worth fighting', () => {
    const fair = assessEnemies(room, env).assessments.filter((a) => a.fair)
    expect(fair.length).toBeGreaterThan(4)
    for (const a of fair) {
      expect(a.retreatCm).toBeLessThanOrEqual(a.retreatBudgetCm + 1e-6)
      expect(a.coveredCells).toBeGreaterThan(0)
      expect(a.exposedCells).toBeGreaterThan(0)
    }
  })

  it('a body that cannot move gets no enemies at all', () => {
    const still: Envelope = { ...env, vmax: 0 }
    expect(assessEnemies(room, still).assessments.every((a) => !a.fair)).toBe(true)
  })
})

describe('enemies that can already see you', () => {
  /**
   * The other half of the verb, and the largest class the solver used to throw
   * away: 75 to 176 candidates per level rejected as `exposed-at-rest`. That was
   * right for the hunt this project began as — an already-visible target left
   * nothing to find — and wrong for a cover shooter, where being seen is the
   * situation rather than the failure. Because exposure is symmetric, one that can
   * see you sitting still is one you can shoot sitting still.
   */
  const openRoom: RoomScan = {
    source: 'fixture',
    occluders: [{ z: -60, x0: -40, x1: -14, y0: -20, y1: 20, label: 'left block' }],
    // Straight ahead, unobstructed from rest. Off to the left, hidden by the block.
    anchors: [{ x: 0, y: 0, z: -200 }, { x: -60, y: 0, z: -200 }],
    noSpawn: [],
    provenance: { model: 'test', atISO: '2026-08-28T00:00:00.000Z', costCents: 0 },
  }

  it('are refused by default, which is I2 still holding', () => {
    const { assessments } = assessEnemies(openRoom, seated())
    expect(assessments[0]!.fair).toBe(false)
    expect(assessments[0]!.reject).toBe('exposed-at-rest')
  })

  it('ship when asked for, as a different verb rather than a different rule', () => {
    const { assessments } = assessEnemies(openRoom, seated(), { allowInTheOpen: true })
    const a = assessments[0]!
    expect(a.fair).toBe(true)
    expect(a.verb).toBe('duck')
    // Nothing to lean for: it is already looking at you, and you at it.
    expect(a.leanCm).toBe(0)
    // And the retreat it reports is the one that matters — from where you are.
    expect(a.retreatCm).toBeGreaterThan(0)
    expect(a.retreatCm).toBeLessThanOrEqual(a.retreatBudgetCm)
  })

  it('leave the ones that need a lean alone', () => {
    const { assessments } = assessEnemies(openRoom, seated(), { allowInTheOpen: true })
    expect(assessments[1]!.verb).toBe('peek')
  })

  it('give a slower body more time rather than a harder game', () => {
    /**
     * Worth being precise about what this checks, because I wrote the test wrong
     * first. `assessEnemies` *derives* the fuse from the retreat, so the retreat
     * always fits and `cannot-retreat` can never fire from a slow body — it fires
     * when there is no retreat at all. What a slow body gets is a longer fuse, and
     * that is the direction the whole solver cuts.
     */
    const slow = { ...seated(), vmax: seated().vmax / 3 }
    const quick = assessEnemies(openRoom, seated(), { allowInTheOpen: true }).assessments[0]!
    const crawl = assessEnemies(openRoom, slow, { allowInTheOpen: true }).assessments[0]!
    expect(crawl.enemy.fuseS).toBeGreaterThan(quick.enemy.fuseS)
    expect(crawl.fair).toBe(true)
  })

  it('can be shot from the rest position, which is the whole claim', () => {
    /**
     * The feature adds no mechanic, only permission, and this is why: exposure has
     * no direction. If it can shoot you where you sit then you can shoot it where
     * you sit, so *take it now or get out of the way* is a decision the existing
     * rules already resolve. Asserted against the same two predicates the game
     * checks every frame.
     */
    const env = seated()
    const { assessments } = assessEnemies(openRoom, env, { allowInTheOpen: true })
    const a = assessments[0]!
    expect(a.verb).toBe('duck')
    expect(visible(env.rest, a.enemy.at, openRoom.occluders)).toBe(true)
    expect(onScreen(env.rest, a.enemy.at, DEFAULT_VIEWPORT, a.enemy.radius)).toBe(true)
    // And it still has cover somewhere, or it would have been refused as no-cover.
    expect(a.coveredCells).toBeGreaterThan(0)
  })

  it('get a fuse derived from the retreat from rest, not from the shortest one', () => {
    // `retreatCm` in the general case is the gap from the *nearest* exposed cell to
    // cover, which for one of these is typically far shorter than the move the
    // player actually has to make. Deriving the fuse from it would hand out fuses
    // nobody can beat.
    const open = assessEnemies(openRoom, seated(), { allowInTheOpen: true }).assessments[0]!
    const closed = assessEnemies(openRoom, seated()).assessments[0]!
    expect(open.enemy.fuseS).toBeGreaterThanOrEqual(closed.enemy.fuseS)
  })
})
