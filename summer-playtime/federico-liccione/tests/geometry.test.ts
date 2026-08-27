/**
 * The scene geometry is pure, so it is tested. The GL layer that consumes it is
 * not, which is exactly why this file exists — a bug in the arithmetic must not
 * be able to hide behind a graphics context.
 */
import { describe, expect, it } from 'vitest'
import { backdropHalfExtent, backdropMesh, buildScene, merge, quad, targetMesh } from '../src/render/geometry'
import type { Billboard, Target } from '../src/engine'
import raw from '../fixtures/desk.room.json'
import type { RoomScan } from '../src/engine'

const room = raw as RoomScan

describe('quad', () => {
  it('sits entirely on its own depth plane', () => {
    const m = quad(-50, -1, 1, -2, 2, [1, 0, 0])
    for (let i = 2; i < m.positions.length; i += 3) expect(m.positions[i]).toBe(-50)
  })

  it('spans exactly the rectangle it was given', () => {
    const m = quad(-50, -3, 7, -2, 4, [0, 1, 0])
    const xs = [...m.positions].filter((_, i) => i % 3 === 0)
    const ys = [...m.positions].filter((_, i) => i % 3 === 1)
    expect(Math.min(...xs)).toBe(-3)
    expect(Math.max(...xs)).toBe(7)
    expect(Math.min(...ys)).toBe(-2)
    expect(Math.max(...ys)).toBe(4)
  })

  it('has one colour per vertex', () => {
    const m = quad(-1, 0, 1, 0, 1, [0.25, 0.5, 0.75])
    expect(m.colors.length).toBe(m.positions.length)
    expect([...m.colors.slice(9, 12)]).toEqual([0.25, 0.5, 0.75])
  })
})

describe('merge', () => {
  it('offsets indices so the second mesh does not draw the first', () => {
    const a = quad(-10, 0, 1, 0, 1, [1, 0, 0])
    const b = quad(-20, 5, 6, 5, 6, [0, 1, 0])
    const m = merge([a, b])
    expect(m.positions.length).toBe(a.positions.length + b.positions.length)
    expect(m.indices.length).toBe(12)
    // Every index in the second half must point into the second mesh.
    for (let i = 6; i < 12; i++) expect(m.indices[i]!).toBeGreaterThanOrEqual(4)
  })

  it('never emits an index outside the vertex range', () => {
    const m = merge([
      backdropMesh(-300, 200, 120, 9, 7, [0, 0, 0], [1, 1, 1]),
      ...room.occluders.map((o: Billboard) => quad(o.z, o.x0, o.x1, o.y0, o.y1, [1, 0, 0])),
    ])
    const vertices = m.positions.length / 3
    for (const i of m.indices) expect(i).toBeLessThan(vertices)
  })

  it('merging nothing is empty, not broken', () => {
    const m = merge([])
    expect(m.positions.length).toBe(0)
    expect(m.indices.length).toBe(0)
  })
})

describe('the backdrop covers what the eye can actually see', () => {
  it('grows with depth and never shrinks below the screen', () => {
    const near = backdropHalfExtent(-50, 17, 60)
    const far = backdropHalfExtent(-400, 17, 60)
    expect(far).toBeGreaterThan(near)
    expect(near).toBeGreaterThan(17)
  })

  it('the shipped backdrop covers the frustum for every plausible eye', () => {
    for (const eyeZ of [45, 60, 75]) {
      expect(backdropHalfExtent(-320, 17, eyeZ)).toBeLessThan(260)
    }
  })

  it('is a checkerboard, so parallax has something to read against', () => {
    const m = backdropMesh(-300, 100, 100, 4, 4, [0, 0, 0], [1, 1, 1])
    const shades = new Set<string>()
    for (let i = 0; i < m.colors.length; i += 3) shades.add(m.colors.slice(i, i + 3).join())
    expect(shades.size).toBe(2)
  })
})

describe('buildScene', () => {
  const targets: Target[] = room.anchors.slice(0, 3).map((at) => ({ at, radius: 6 }))

  it('draws the backdrop, every occluder and every target', () => {
    const m = buildScene({ occluders: room.occluders, targets })
    const depths = new Set<number>()
    for (let i = 2; i < m.positions.length; i += 3) depths.add(m.positions[i]!)
    for (const o of room.occluders) expect(depths.has(o.z)).toBe(true)
    for (const t of targets) expect(depths.has(t.at.z)).toBe(true)
  })

  it('a revealed target is coloured differently from a hidden one', () => {
    const hidden = buildScene({ occluders: room.occluders, targets, revealed: [false, false, false] })
    const shown = buildScene({ occluders: room.occluders, targets, revealed: [true, false, false] })
    expect(hidden.colors).not.toEqual(shown.colors)
    expect(hidden.positions).toEqual(shown.positions)
  })

  it('an empty room still produces a drawable scene', () => {
    const m = buildScene({ occluders: [], targets: [] })
    expect(m.indices.length).toBeGreaterThan(0)
    for (const i of m.indices) expect(i).toBeLessThan(m.positions.length / 3)
  })

  it('a target is a square of the radius it was given', () => {
    const m = targetMesh({ at: { x: 10, y: -4, z: -100 }, radius: 6 }, [1, 1, 1])
    const xs = [...m.positions].filter((_, i) => i % 3 === 0)
    expect(Math.max(...xs) - Math.min(...xs)).toBe(12)
  })
})
