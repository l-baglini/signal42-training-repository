/**
 * If you cannot see it, it cannot shoot you.
 *
 * The rule exists because a playtester was being shot by enemies that were not on
 * screen. `visible` answers "is anything in the way", and nothing was asking "is
 * it in frame" — so an enemy off the side of the glass had a clear sightline, a
 * full fuse, and no way to be answered.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VIEWPORT,
  engageableMask,
  footprintMask,
  latticeOf,
  maskCount,
  onScreen,
} from '../src/engine'
import type { Point3 } from '../src/engine'
import { seated } from '../fixtures/envelopes'
import raw from '../fixtures/desk.room.json'
import type { RoomScan } from '../src/engine'

const room = raw as RoomScan
const env = seated()
const EYE: Point3 = { x: 0, y: 0, z: 60 }
const view = DEFAULT_VIEWPORT

describe('onScreen', () => {
  it('accepts something dead ahead', () => {
    expect(onScreen(EYE, { x: 0, y: 0, z: -200 }, view)).toBe(true)
  })

  it('rejects something off the side, however clear the sightline', () => {
    expect(onScreen(EYE, { x: 200, y: 0, z: -200 }, view)).toBe(false)
    expect(onScreen(EYE, { x: 0, y: 200, z: -200 }, view)).toBe(false)
  })

  it('has a cone that widens with depth', () => {
    // The window is pinned, so what is in frame grows the further back it is. The
    // half-width is (screen/2) * (eyeZ - z) / eyeZ: about 31 cm at z = -50 and
    // about 88 cm at z = -250. The first version of this test used 30 cm for both
    // and was simply wrong about the near one.
    expect(onScreen(EYE, { x: 40, y: 0, z: -50 }, view)).toBe(false)
    expect(onScreen(EYE, { x: 40, y: 0, z: -250 }, view)).toBe(true)
  })

  it('moves with the eye, in the direction the parallax says it should', () => {
    /**
     * Leaning *right* pushes something on the right *off* the right edge, which is
     * the opposite of the intuition and the same fact the projection tests already
     * assert: the window is pinned, so distant things slide in the same direction
     * as the head. This test had the sign backwards on the first attempt.
     */
    const at: Point3 = { x: 40, y: 0, z: -150 }
    expect(onScreen({ x: 18, y: 0, z: 60 }, at, view)).toBe(false)
    expect(onScreen({ x: -18, y: 0, z: 60 }, at, view)).toBe(true)
  })

  it('a wider screen frames more', () => {
    // At z = -150 the crossing point of a target at x = 60 lands at u = 17 cm, so
    // it clears a 60 cm window and misses a 24 cm one. The first attempt used
    // x = 34, whose crossing point is under 10 cm and fits in both.
    const at: Point3 = { x: 60, y: 0, z: -150 }
    expect(onScreen(EYE, at, { widthCm: 24, heightCm: 15 })).toBe(false)
    expect(onScreen(EYE, at, { widthCm: 60, heightCm: 37 })).toBe(true)
  })

  it('refuses degenerate eyes rather than dividing by zero', () => {
    expect(onScreen({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -100 }, view)).toBe(false)
    expect(onScreen(EYE, { x: 0, y: 0, z: 60 }, view)).toBe(false)
    expect(onScreen(EYE, { x: 0, y: 0, z: 200 }, view)).toBe(false)
  })
})

describe('the engagement footprint', () => {
  const lat = latticeOf(env)

  it('is never larger than the sightline footprint', () => {
    for (const at of room.anchors) {
      const sightline = maskCount(footprintMask(lat, room.occluders, at))
      const engageable = maskCount(engageableMask(lat, room.occluders, at, view))
      expect(engageable).toBeLessThanOrEqual(sightline)
    }
  })

  it('is empty for an enemy nobody could ever have in frame', () => {
    const far: Point3 = { x: 400, y: 0, z: -150 }
    expect(maskCount(footprintMask(lat, room.occluders, far))).toBeGreaterThan(0)
    expect(maskCount(engageableMask(lat, room.occluders, far, view))).toBe(0)
  })

  it('and every cell it keeps really does have it in frame', () => {
    // Finds an anchor with a non-empty footprint rather than trusting an index:
    // the fixture's anchor list has been rewritten twice by measurement tools, and
    // a test pinned to anchors[0] silently stopped checking anything.
    const usable = room.anchors.find(
      (a) => maskCount(engageableMask(lat, room.occluders, a, view)) > 0,
    )
    expect(usable, 'no anchor in the fixture is engageable at all').toBeDefined()
    const mask = engageableMask(lat, room.occluders, usable!, view)

    let checked = 0
    for (let k = 0; k < lat.nz; k++)
      for (let j = 0; j < lat.ny; j++)
        for (let i = 0; i < lat.nx; i++) {
          const n = i + lat.nx * (j + lat.ny * k)
          if (!mask[n]) continue
          const centre = {
            x: lat.origin.x + i * lat.pitch,
            y: lat.origin.y + j * lat.pitch,
            z: lat.origin.z + k * lat.pitch,
          }
          expect(onScreen(centre, usable!, view)).toBe(true)
          checked++
        }
    expect(checked).toBeGreaterThan(0)
  })

  it('a bigger screen can only ever add firing positions', () => {
    const at = room.anchors.find(
      (a) => maskCount(footprintMask(lat, room.occluders, a)) > 0,
    ) ?? room.anchors[0]!
    const small = maskCount(engageableMask(lat, room.occluders, at, { widthCm: 24, heightCm: 15 }))
    const big = maskCount(engageableMask(lat, room.occluders, at, { widthCm: 55, heightCm: 34 }))
    expect(big).toBeGreaterThanOrEqual(small)
  })
})
