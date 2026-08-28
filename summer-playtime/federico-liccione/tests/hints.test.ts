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
