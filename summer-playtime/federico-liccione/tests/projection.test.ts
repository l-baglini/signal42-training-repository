/**
 * I10 — the window is a window.
 *
 * The spec stated this as "the four screen corners map to the four viewport
 * corners". Deriving it turned out to give something stronger and worth
 * asserting instead: **the entire screen plane is invariant under eye motion.**
 * A point on z = 0 projects to the same place whatever the player does, which is
 * exactly what it means for the screen to be a hole in the wall.
 */
import { describe, expect, it } from 'vitest'
import { cellCentre, cellIndex, latticeOf } from '../src/engine'
import type { Point3 } from '../src/engine'
import { corners, offAxis, project, symmetric } from '../src/render/projection'
import { seated } from '../fixtures/envelopes'

const screen = { widthCm: 34, heightCm: 21 }
const env = seated()

/** Every eye position the player can actually occupy, not a random sample. */
function eyes(): Point3[] {
  const lat = latticeOf(env, 3)
  const out: Point3[] = []
  for (let k = 0; k < lat.nz; k++)
    for (let j = 0; j < lat.ny; j++)
      for (let i = 0; i < lat.nx; i++)
        if (lat.inside[cellIndex(lat, i, j, k)]) out.push(cellCentre(lat, i, j, k))
  return out
}

const EYES = eyes()

describe('I10 — off-axis pins the window', () => {
  it('there are eye positions to test', () => {
    expect(EYES.length).toBeGreaterThan(100)
  })

  it('the four screen corners land on the viewport corners, for every eye', () => {
    for (const eye of EYES) {
      const m = offAxis(eye, screen)
      for (const c of corners(screen)) {
        const p = project(m, c)
        expect(Math.abs(p.x)).toBeCloseTo(1, 4)
        expect(Math.abs(p.y)).toBeCloseTo(1, 4)
        expect(Math.sign(p.x)).toBe(Math.sign(c.x))
        expect(Math.sign(p.y)).toBe(Math.sign(c.y))
      }
    }
  })

  it('the whole screen plane is invariant, not only its corners', () => {
    const onPlane: Point3[] = []
    for (let x = -17; x <= 17; x += 4.25) for (let y = -10.5; y <= 10.5; y += 3.5) onPlane.push({ x, y, z: 0 })

    const reference = offAxis({ x: 0, y: 0, z: 60 }, screen)
    const expected = onPlane.map((p) => project(reference, p))

    for (const eye of EYES) {
      const m = offAxis(eye, screen)
      onPlane.forEach((p, i) => {
        const got = project(m, p)
        expect(got.x).toBeCloseTo(expected[i]!.x, 4)
        expect(got.y).toBeCloseTo(expected[i]!.y, 4)
      })
    }
  })
})

describe('the parallax has the sign and the ordering the design claims', () => {
  /**
   * Relative to the frame, distant things slide MORE than near ones, and in the
   * same direction as the head. This is the fact that is easy to get backwards
   * in code, so it is asserted rather than remembered.
   */
  const centred = offAxis({ x: 0, y: 0, z: 60 }, screen)
  const leaned = offAxis({ x: 10, y: 0, z: 60 }, screen)

  it('a point behind the window moves the same way as the head', () => {
    const p: Point3 = { x: 0, y: 0, z: -100 }
    expect(project(centred, p).x).toBeCloseTo(0, 6)
    expect(project(leaned, p).x).toBeGreaterThan(0)
  })

  it('and a farther point moves more', () => {
    const shifts = [-25, -100, -400, -1600].map(
      (z) => project(leaned, { x: 0, y: 0, z }).x - project(centred, { x: 0, y: 0, z }).x,
    )
    for (let i = 1; i < shifts.length; i++) {
      expect(shifts[i]!).toBeGreaterThan(shifts[i - 1]!)
    }
  })

  it('a point stuck to the glass does not move at all', () => {
    const onGlass: Point3 = { x: 5, y: -3, z: 0 }
    expect(project(leaned, onGlass).x).toBeCloseTo(project(centred, onGlass).x, 6)
  })
})

describe('the debug toggle really is a different thing', () => {
  it('the symmetric frustum does NOT pin the window', () => {
    const eye: Point3 = { x: 12, y: 6, z: 60 }
    const off = offAxis(eye, screen)
    const sym = symmetric(eye, screen)
    const c = corners(screen)[3]!
    expect(Math.abs(project(off, c).x)).toBeCloseTo(1, 4)
    // A dolly slides the corner off the viewport edge; that is the whole point.
    expect(Math.abs(project(sym, c).x - project(off, c).x)).toBeGreaterThan(0.1)
  })

  it('but agrees exactly when the eye is centred', () => {
    const eye: Point3 = { x: 0, y: 0, z: 60 }
    const off = offAxis(eye, screen)
    const sym = symmetric(eye, screen)
    for (const c of corners(screen)) {
      expect(project(sym, c).x).toBeCloseTo(project(off, c).x, 5)
      expect(project(sym, c).y).toBeCloseTo(project(off, c).y, 5)
    }
  })
})
