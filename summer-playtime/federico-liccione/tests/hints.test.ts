/**
 * The two things the game needs in order to be legible: what to peek around, and
 * which way to lean. Both are answered by the engine rather than by the UI, so
 * a hint can never disagree with the rules it is hinting about.
 */
import { describe, expect, it } from 'vitest'
import {
  blockingOccluders,
  footprintMask,
  latticeOf,
  nearestBreak,
  nearestRevealing,
  visible,
} from '../src/engine'
import type { Billboard, Point3, RoomScan } from '../src/engine'
import raw from '../fixtures/desk.room.json'
import { seated } from '../fixtures/envelopes'

const room = raw as RoomScan
const env = seated()
const lat = latticeOf(env)

describe('what is hiding it', () => {
  it('names an occluder exactly when the target is hidden', () => {
    for (const anchor of room.anchors) {
      const blocking = blockingOccluders(env.rest, anchor, room.occluders)
      expect(blocking.length > 0).toBe(!visible(env.rest, anchor, room.occluders))
    }
  })

  it('names nothing when there is nothing in the way', () => {
    expect(blockingOccluders(env.rest, { x: 0, y: 0, z: -25 }, room.occluders)).toEqual([])
  })

  it('every occluder it names really is in the way on its own', () => {
    const anchor = room.anchors.find((a) => !visible(env.rest, a, room.occluders))!
    for (const o of blockingOccluders(env.rest, anchor, room.occluders)) {
      expect(visible(env.rest, anchor, [o])).toBe(false)
    }
  })

  it('an occluder behind the target is never blamed', () => {
    const behind: Billboard = { z: -290, x0: -200, x1: 200, y0: -200, y1: 200, label: 'wall' }
    expect(blockingOccluders(env.rest, { x: 0, y: 0, z: -100 }, [behind])).toEqual([])
  })
})

describe('which way to lean', () => {
  const anchor = room.anchors.find(
    (a) => !visible(env.rest, a, room.occluders) && footprintMask(lat, room.occluders, a).some((v) => v),
  )!
  const mask = footprintMask(lat, room.occluders, anchor)

  it('points at a place that actually reveals it', () => {
    const hint = nearestRevealing(lat, mask, env.rest)
    expect(hint).not.toBeNull()
    expect(visible(hint!.at, anchor, room.occluders)).toBe(true)
  })

  it('agrees with the distance the assessment reported', () => {
    const hint = nearestRevealing(lat, mask, env.rest)!
    // Same footprint, same metric — the hint cannot contradict the rules.
    let brute = Infinity
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue
      const k = Math.floor(i / (lat.nx * lat.ny))
      const j = Math.floor((i - k * lat.nx * lat.ny) / lat.nx)
      const x = i - k * lat.nx * lat.ny - j * lat.nx
      const c: Point3 = {
        x: lat.origin.x + x * lat.pitch,
        y: lat.origin.y + j * lat.pitch,
        z: lat.origin.z + k * lat.pitch,
      }
      brute = Math.min(brute, Math.hypot(c.x - env.rest.x, c.y - env.rest.y, c.z - env.rest.z))
    }
    expect(hint.distCm).toBeCloseTo(brute, 6)
  })

  it('gets closer as the player moves towards it', () => {
    const far = nearestRevealing(lat, mask, env.rest)!
    const halfway: Point3 = {
      x: (env.rest.x + far.at.x) / 2,
      y: (env.rest.y + far.at.y) / 2,
      z: (env.rest.z + far.at.z) / 2,
    }
    expect(nearestRevealing(lat, mask, halfway)!.distCm).toBeLessThan(far.distCm)
  })

  it('says nothing at all when nothing reveals it', () => {
    expect(nearestRevealing(lat, new Uint8Array(lat.inside.length), env.rest)).toBeNull()
  })
})

describe('nearestBreak — which way to get out of the way', () => {
  /**
   * The dual of `nearestRevealing`, and needed for the same reason: without it the
   * instruction "move" has no direction in it, and an enemy that can see you where
   * you sit is unanswerable rather than urgent.
   */
  // Straight ahead and visible from rest; a block just off to the right, close
  // enough to the window that a lean of a few centimetres puts it in the way.
  const occluders: Billboard[] = [
    { z: -60, x0: 4, x1: 40, y0: -20, y1: 20, label: 'right block' },
  ]
  const at: Point3 = { x: 0, y: 0, z: -200 }
  const eye: Point3 = { x: 0, y: 0, z: 60 }

  it('returns somewhere that actually breaks the sightline', () => {
    // Asserted by re-running the same predicate the rule uses, which is the only
    // check worth having: a hint that points somewhere `visible` disagrees with
    // would be worse than no hint.
    expect(visible(eye, at, occluders)).toBe(true)
    const to = nearestBreak(eye, at, occluders, 14)
    expect(to).not.toBeNull()
    expect(visible(to!, at, occluders)).toBe(false)
    expect(to!.z).toBe(eye.z)
  })

  it('says nothing when nothing can see you', () => {
    const hidden: Point3 = { x: 0, y: 0, z: -200 }
    const wall: Billboard[] = [
      { z: -60, x0: -60, x1: 60, y0: -40, y1: 40, label: 'wall' },
    ]
    expect(nearestBreak(eye, hidden, wall, 14)).toBeNull()
  })

  it('says nothing rather than guessing when the ring finds no answer', () => {
    // Honest failure. A body that cannot move far enough to break a sightline gets
    // told nothing, and the game shows nothing, instead of an arrow that does not
    // work.
    expect(nearestBreak(eye, at, occluders, 0.4)).toBeNull()
  })

  it('offers the shortest move that works', () => {
    const near = nearestBreak(eye, at, occluders, 14, 6)
    const coarse = nearestBreak(eye, at, occluders, 14, 1)
    expect(near).not.toBeNull()
    const d = (p: Point3) => Math.hypot(p.x - eye.x, p.y - eye.y)
    if (coarse) expect(d(near!)).toBeLessThanOrEqual(d(coarse) + 1e-9)
  })
})
