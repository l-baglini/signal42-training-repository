/**
 * The scene geometry is pure, so it is tested. The GL layer that consumes it is
 * not, which is exactly why this file exists — a bug in the arithmetic must not
 * be able to hide behind a graphics context.
 */
import { describe, expect, it } from 'vitest'
import {
  backdropHalfExtent,
  backdropMesh,
  buildScene,
  enemyMesh,
  merge,
  quad,
  targetMesh,
} from '../src/render/geometry'
import type { EnemyView } from '../src/render/geometry'
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

  it('a target fills towards the scoring colour as it is held', () => {
    /**
     * The colour tracks the hold, not mere visibility — and that is the point.
     * A hidden target's colour is irrelevant because it cannot be seen; the only
     * moment the player is looking at one, what matters is whether the position
     * is *counting*.
     */
    const none = buildScene({ occluders: room.occluders, targets, hold: [0, 0, 0] })
    const half = buildScene({ occluders: room.occluders, targets, hold: [0.5, 0, 0] })
    const full = buildScene({ occluders: room.occluders, targets, hold: [1, 0, 0] })
    expect(none.colors).not.toEqual(half.colors)
    expect(half.colors).not.toEqual(full.colors)
    expect(none.positions).toEqual(half.positions)

    // Monotone: partway through must sit between the two ends on every channel.
    const at = (m: typeof none, i: number) => m.colors[m.colors.length - targets.length * 12 + i]!
    for (let c = 0; c < 3; c++) {
      const lo = Math.min(at(none, c), at(full, c))
      const hi = Math.max(at(none, c), at(full, c))
      expect(at(half, c)).toBeGreaterThanOrEqual(lo - 1e-6)
      expect(at(half, c)).toBeLessThanOrEqual(hi + 1e-6)
    }
  })

  it('a hold value out of range cannot produce a colour out of range', () => {
    for (const h of [-5, 2, NaN]) {
      const m = buildScene({ occluders: room.occluders, targets, hold: [h, h, h] })
      for (const v of m.colors) {
        expect(Number.isFinite(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
    }
  })

  it('a target not in play is drawn dim, but is still drawn', () => {
    // It must still occlude and still be there, or the room stops making sense
    // between rounds.
    const all = buildScene({ occluders: room.occluders, targets })
    const one = buildScene({ occluders: room.occluders, targets, active: [1] })
    expect(one.positions).toEqual(all.positions)
    expect(one.colors).not.toEqual(all.colors)
  })

  it('a threat adds geometry at its own position', () => {
    const without = buildScene({ occluders: room.occluders, targets })
    const with_ = buildScene({
      occluders: room.occluders,
      targets,
      threat: { at: { x: 4, y: -2, z: -140 }, radius: 13 },
    })
    expect(with_.positions.length).toBe(without.positions.length + 12)
    const depths = []
    for (let i = 2; i < with_.positions.length; i += 3) depths.push(with_.positions[i]!)
    expect(depths).toContain(-140)
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

describe('an enemy is an eye', () => {
  const base: EnemyView = {
    at: { x: 10, y: -4, z: -120 },
    radius: 9,
    exposed: false,
    fuse: 0,
    aimed: false,
  }

  it('is a closed slit when it cannot see you, and an open eye when it can', () => {
    const shut = enemyMesh(base)
    const open = enemyMesh({ ...base, exposed: true })
    // Open adds the sclera, the iris and the pupil; shut has one lid.
    expect(open.positions.length).toBeGreaterThan(shut.positions.length)
    expect(shut.indices.length).toBeGreaterThan(0)
  })

  it('draws every part of the eye nearer the viewer than its socket', () => {
    /**
     * The exact bug a playtester found: the nudges went the wrong way, so sclera,
     * iris and pupil were drawn *behind* the socket and the depth test hid all of
     * them. In this frame the scene is at z < 0 and the player at z > 0, so
     * "towards the viewer" is **larger** z.
     */
    const m = enemyMesh({ ...base, exposed: true, fuse: 0.5 })
    const zs: number[] = []
    for (let i = 2; i < m.positions.length; i += 3) zs.push(m.positions[i]!)
    const socketZ = Math.min(...zs)
    expect(socketZ).toBe(base.at.z)
    // Something must sit in front of it, or there is nothing to see.
    expect(Math.max(...zs)).toBeGreaterThan(socketZ)
    for (const z of zs) expect(z).toBeGreaterThanOrEqual(socketZ)
  })

  it('is wider than it is tall, or it reads as a square', () => {
    const m = enemyMesh({ ...base, exposed: true, fuse: 0 })
    // Measure only the sclera layer, the widest thing in front of the socket.
    let maxHalfW = 0
    let maxHalfH = 0
    for (let i = 0; i < m.positions.length; i += 3) {
      const z = m.positions[i + 2]!
      if (z <= base.at.z + 1e-6) continue
      maxHalfW = Math.max(maxHalfW, Math.abs(m.positions[i]! - base.at.x))
      maxHalfH = Math.max(maxHalfH, Math.abs(m.positions[i + 1]! - base.at.y))
    }
    expect(maxHalfW).toBeGreaterThan(maxHalfH * 1.3)
  })

  it('heats towards its shot as the fuse charges', () => {
    const cold = enemyMesh({ ...base, exposed: true, fuse: 0 })
    const hot = enemyMesh({ ...base, exposed: true, fuse: 1 })
    expect(cold.colors).not.toEqual(hot.colors)
    expect(cold.positions.length).toBe(hot.positions.length)
  })

  it('never emits a colour outside 0..1, whatever the fuse says', () => {
    for (const fuse of [-3, 0.5, 2, NaN]) {
      const m = enemyMesh({ ...base, exposed: true, fuse })
      for (const v of m.colors) {
        expect(Number.isFinite(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
    }
  })

  it('never emits an inverted rectangle, at any radius', () => {
    for (const radius of [1, 9, 40]) {
      for (const exposed of [true, false]) {
        const m = enemyMesh({ ...base, radius, exposed, fuse: 0.7 })
        for (let i = 0; i < m.positions.length; i += 12) {
          const xs = [m.positions[i]!, m.positions[i + 3]!]
          expect(xs[1]).toBeGreaterThanOrEqual(xs[0]!)
        }
        expect(m.indices.length).toBeGreaterThan(0)
      }
    }
  })

  it('stays inside its own radius, so the hit box matches the picture', () => {
    const m = enemyMesh({ ...base, exposed: true, fuse: 0.4 })
    for (let i = 0; i < m.positions.length; i += 3) {
      expect(Math.abs(m.positions[i]! - base.at.x)).toBeLessThanOrEqual(base.radius + 1e-6)
      expect(Math.abs(m.positions[i + 1]! - base.at.y)).toBeLessThanOrEqual(base.radius + 1e-6)
    }
  })
})

describe('room texturing', () => {
  const uv = { u0: 0.25, v0: 0.1, u1: 0.75, v1: 0.6 }

  it('a quad without a uv rect is flat-coloured', () => {
    const m = quad(-50, -1, 1, -1, 1, [1, 0, 0])
    expect([...m.textured]).toEqual([0, 0, 0, 0])
    expect(m.uvs.length).toBe(8)
  })

  it('a quad with one is textured, with v flipped for image order', () => {
    // Image v runs downwards and world y runs up, so the bottom of the rectangle
    // takes the *larger* v. Getting this backwards flips the furniture.
    const m = quad(-50, -1, 1, -1, 1, [1, 0, 0], uv)
    expect([...m.textured]).toEqual([1, 1, 1, 1])
    const ys = [m.positions[1]!, m.positions[4]!, m.positions[7]!, m.positions[10]!]
    const vs = [m.uvs[1]!, m.uvs[3]!, m.uvs[5]!, m.uvs[7]!]
    for (let i = 0; i < 4; i++) {
      // toBeCloseTo, not toBe: these live in a Float32Array, so 0.6 comes back
      // as 0.60000002.
      expect(vs[i]).toBeCloseTo(ys[i]! < 0 ? uv.v1 : uv.v0, 6)
    }
  })

  it('merge keeps uvs and flags aligned with their vertices', () => {
    const flat = quad(-10, 0, 1, 0, 1, [1, 0, 0])
    const tex = quad(-20, 0, 1, 0, 1, [0, 1, 0], uv)
    const m = merge([flat, tex])
    expect([...m.textured]).toEqual([0, 0, 0, 0, 1, 1, 1, 1])
    expect(m.uvs.length).toBe(m.positions.length / 3 * 2)
  })

  it('buildScene textures only the occluders it was given a rect for', () => {
    const uvs = [uv, undefined, undefined]
    const m = buildScene({ occluders: room.occluders, targets: [], occluderUvs: uvs })
    const flagged = [...m.textured].filter((v) => v === 1).length
    expect(flagged).toBe(4) // exactly one quad
  })

  it('a short or missing uv array is not an error', () => {
    // The array is built from a scan and the scan can be replaced at any moment;
    // a mismatch must degrade to flat colour rather than throw mid-frame.
    for (const uvs of [undefined, [], [undefined, uv]]) {
      const m = buildScene({ occluders: room.occluders, targets: [], occluderUvs: uvs })
      expect(m.indices.length).toBeGreaterThan(0)
      for (const v of m.textured) expect(v === 0 || v === 1).toBe(true)
    }
  })
})
