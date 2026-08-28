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
  assessEnemy,
  coverMask,
  footprintMask,
  gapCm,
  latticeOf,
  maskCount,
  reachCm,
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
