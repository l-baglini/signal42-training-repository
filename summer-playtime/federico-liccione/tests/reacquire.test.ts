/**
 * What the tracker reports when it stops being able to see the head.
 *
 * The complaint: a fast sideways snap takes one eye out of frame, the detector
 * loses the face, and the viewpoint freezes until both eyes come back — at
 * exactly the moment the player is moving fastest. These are the decisions that
 * answer it, tested here rather than in `camera.ts` for the same reason
 * `isTypingIn` was split out of its event handler: the decision can be tested,
 * and the thing holding a video element cannot.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LIMITS,
  deadReckon,
  inFrame,
  midpointFromOneEye,
} from '../src/perceive/reacquire'
import type { Point3 } from '../src/engine'

describe('inFrame', () => {
  it('accepts the middle of the picture and rejects past either edge', () => {
    expect(inFrame({ x: 0.5, y: 0.5 })).toBe(true)
    expect(inFrame({ x: -0.05, y: 0.5 })).toBe(false)
    expect(inFrame({ x: 1.2, y: 0.5 })).toBe(false)
    expect(inFrame({ x: 0.5, y: -0.01 })).toBe(false)
  })

  it('rejects a landmark that is merely *at* the edge, and the margin is why', () => {
    /**
     * MediaPipe keeps emitting coordinates for a landmark that has left the frame,
     * extrapolated and increasingly wrong. So the useful question is not "is it
     * outside" but "is it close enough to the edge that I should stop believing
     * it", and that needs a margin rather than a bound.
     */
    expect(inFrame({ x: 0.005, y: 0.5 })).toBe(false)
    expect(inFrame({ x: 0.005, y: 0.5 }, 0)).toBe(true)
  })
})

describe('midpointFromOneEye', () => {
  const half = { x: 20, y: 4 }

  it('reconstructs the midpoint from either eye', () => {
    // The first of the pair sits behind the midpoint by `half`; the second ahead.
    expect(midpointFromOneEye({ x: 100, y: 50 }, half, true)).toEqual({ x: 120, y: 54 })
    expect(midpointFromOneEye({ x: 140, y: 58 }, half, false)).toEqual({ x: 120, y: 54 })
  })

  it('agrees with the two-eye midpoint it is standing in for', () => {
    // The property that makes this a continuation rather than a different
    // measurement: fed the same geometry, it lands where the real midpoint was.
    const a = { x: 100, y: 50 }
    const b = { x: 140, y: 58 }
    const trueHalf = { x: (b.x - a.x) / 2, y: (b.y - a.y) / 2 }
    const trueMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    expect(midpointFromOneEye(a, trueHalf, true)).toEqual(trueMid)
    expect(midpointFromOneEye(b, trueHalf, false)).toEqual(trueMid)
  })
})

describe('deadReckon', () => {
  const at: Point3 = { x: 6, y: 1, z: 60 }
  const right: Point3 = { x: 60, y: 0, z: 0 }

  it('continues the motion it had, in the direction it had', () => {
    const out = deadReckon(at, right, 0.1)
    expect(out.at.x).toBeCloseTo(12, 6)
    expect(out.at.y).toBeCloseTo(1, 6)
    expect(out.holding).toBe(false)
  })

  it('stops after maxS and says it is holding', () => {
    const out = deadReckon(at, { x: 10, y: 0, z: 0 }, 5)
    expect(out.holding).toBe(true)
    // Frozen at whatever the time bound allowed, not still creeping.
    expect(out.at.x).toBeCloseTo(at.x + 10 * DEFAULT_LIMITS.maxS, 6)
  })

  it('never extrapolates further than maxCm, whatever the speed', () => {
    // A head at 200 cm/s vanishing for a third of a second has plausibly gone
    // 60 cm, and reporting that would be a guess rather than a measurement.
    const out = deadReckon(at, { x: 200, y: 0, z: 0 }, 0.3)
    expect(out.at.x - at.x).toBeCloseTo(DEFAULT_LIMITS.maxCm, 6)
    expect(out.holding).toBe(true)
  })

  it('bounds the distance without bending the direction', () => {
    /**
     * Scaled as a vector rather than clamped per axis. Clamping x and y separately
     * would turn a diagonal snap into an axis-aligned one, which is a lie about
     * which way the head went — and which way it went is the only thing this
     * function actually knows.
     */
    const diagonal: Point3 = { x: 300, y: 300, z: 0 }
    const out = deadReckon(at, diagonal, 0.3)
    const dx = out.at.x - at.x
    const dy = out.at.y - at.y
    expect(dx).toBeCloseTo(dy, 6)
    expect(Math.hypot(dx, dy)).toBeCloseTo(DEFAULT_LIMITS.maxCm, 6)
  })

  it('holds still for a head that was not moving', () => {
    const out = deadReckon(at, { x: 0, y: 0, z: 0 }, 0.1)
    expect(out.at).toEqual(at)
    expect(out.holding).toBe(false)
  })

  it('reports the last position for a gap of zero, not a jump', () => {
    // The first frame of a loss must be continuous with the last frame of
    // tracking, or every brief dropout would read as a flick.
    expect(deadReckon(at, right, 0).at).toEqual(at)
  })

  it('treats a negative gap as no gap rather than reversing', () => {
    // Timestamps come from a clock this module does not own.
    expect(deadReckon(at, right, -1).at).toEqual(at)
  })
})
