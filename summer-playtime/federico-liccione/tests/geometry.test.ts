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
  contactShadowMesh,
  coverMesh,
  enemyMesh,
  environmentMesh,
  merge,
  cloudMesh,
  quad,
  quad3,
  targetMesh,
} from '../src/render/geometry'
import type { EnemyView } from '../src/render/geometry'
import { DEFAULT_MOOD } from '../src/render/mood'
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

  /** Vertices on one layer, selected by depth. */
  const layer = (m: ReturnType<typeof enemyMesh>, n: number) => {
    const z = base.at.z + n * 0.3
    const out: Array<{ x: number; y: number }> = []
    for (let i = 0; i < m.positions.length; i += 3) {
      if (Math.abs(m.positions[i + 2]! - z) < 1e-4) {
        out.push({ x: m.positions[i]!, y: m.positions[i + 1]! })
      }
    }
    return out
  }

  it('draws absolutely nothing when it cannot see you', () => {
    /**
     * It used to draw a dark socket with a closed slit, and a playtester hit that
     * from both sides: an enemy whose centre was occluded showed the edge of its
     * socket, so it looked visible while being unshootable, and one whose centre
     * had just cleared was firing while nearly all of it was still behind cover.
     * The engagement test is on a point and the drawing was a rectangle; drawing
     * nothing is what reconciles them.
     */
    const shut = enemyMesh(base)
    expect(shut.indices.length).toBe(0)
    expect(shut.positions.length).toBe(0)
    expect(enemyMesh({ ...base, exposed: true }).indices.length).toBeGreaterThan(0)
  })

  it('the eye is wider than it is tall, or it reads as a square', () => {
    const m = enemyMesh({ ...base, exposed: true, fuse: 0 })
    const sclera = layer(m, 2)
    expect(sclera.length).toBeGreaterThan(0)
    const halfW = Math.max(...sclera.map((p) => Math.abs(p.x - base.at.x)))
    const halfH = Math.max(...sclera.map((p) => Math.abs(p.y - base.at.y)))
    expect(halfW).toBeGreaterThan(halfH * 1.25)
  })

  it('the body stays inside the radius the crosshair tests against', () => {
    // Everything except the outer ring: the hit box is built from `radius`, so a
    // *body* wider than that would let a shot look like a hit and miss.
    const m = enemyMesh({ ...base, exposed: true, fuse: 0.4 })
    for (let n = 1; n <= 4; n++) {
      for (const p of layer(m, n)) {
        expect(Math.abs(p.x - base.at.x)).toBeLessThanOrEqual(base.radius + 1e-6)
        expect(Math.abs(p.y - base.at.y)).toBeLessThanOrEqual(base.radius + 1e-6)
      }
    }
  })

  it('and the ring outside it is a cue, deliberately larger', () => {
    // Its job is to be noticed at the edge of vision rather than to be clicked.
    const ring = layer(enemyMesh({ ...base, exposed: true, fuse: 0 }), 0)
    expect(ring.length).toBeGreaterThan(0)
    const reach = Math.max(...ring.map((p) => Math.abs(p.x - base.at.x)))
    expect(reach).toBeGreaterThan(base.radius)
    expect(reach).toBeLessThan(base.radius * 2)
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
      const m = enemyMesh({ ...base, radius, exposed: true, fuse: 0.7 })
      for (let i = 0; i < m.positions.length; i += 12) {
        expect(m.positions[i + 3]!).toBeGreaterThanOrEqual(m.positions[i]!)
      }
      expect(m.indices.length).toBeGreaterThan(0)
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

  it('the sky is its own draw mode, and there is exactly one of it', () => {
    const m = buildScene({ occluders: room.occluders, targets: [] })
    expect([...m.textured].filter((v) => v === 2).length).toBe(4)
    const flat = buildScene({ occluders: room.occluders, targets: [], sky: false })
    expect([...flat.textured].filter((v) => v === 2).length).toBe(0)
  })

  it('a short or missing uv array is not an error', () => {
    // The array is built from a scan and the scan can be replaced at any moment;
    // a mismatch must degrade to flat colour rather than throw mid-frame.
    for (const uvs of [undefined, [], [undefined, uv]]) {
      const m = buildScene({ occluders: room.occluders, targets: [], occluderUvs: uvs })
      expect(m.indices.length).toBeGreaterThan(0)
      // 0 flat, 1 textured, 2 sky: a mode rather than a boolean.
      for (const v of m.textured) expect([0, 1, 2]).toContain(v)
    }
  })
})

describe('the place the cover stands in', () => {
  const env = environmentMesh()

  it('is real 3D, not screen-parallel', () => {
    /**
     * The point of it. The rectangle constraint applies to the *solver*, and only
     * to cover — I had been applying it to the whole renderer, which is why the
     * levels looked like floating cards for so long. A floor whose vertices all
     * shared one z would mean nothing had changed.
     */
    const zs = new Set<number>()
    for (let i = 2; i < env.positions.length; i += 3) zs.add(Math.round(env.positions[i]!))
    expect(zs.size).toBeGreaterThan(8)
  })

  it('encloses the play space on four sides', () => {
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (let i = 0; i < env.positions.length; i += 3) {
      minX = Math.min(minX, env.positions[i]!)
      maxX = Math.max(maxX, env.positions[i]!)
      minY = Math.min(minY, env.positions[i + 1]!)
      maxY = Math.max(maxY, env.positions[i + 1]!)
    }
    expect(minX).toBeLessThan(-80)
    expect(maxX).toBeGreaterThan(80)
    expect(minY).toBeLessThan(-40)
    // Low walls now, so the sky shows above them.
    expect(maxY).toBeGreaterThan(20)
  })

  it('does NOT grade brightness with distance', () => {
    /**
     * This test used to assert the opposite, and the reversal is the whole point
     * of the current look. Grading the room from near-black to bright was doing
     * the depth cue by *destroying contrast* in the far half of the corridor —
     * which is exactly the half where deciding whether an enemy is exposed is
     * hardest. Perspective and the tiles carry distance now; brightness carries
     * nothing, so the same tone must be found at both ends.
     */
    const key = (v: number) =>
      `${env.colors[v * 3]!.toFixed(3)},${env.colors[v * 3 + 1]!.toFixed(3)},` +
      `${env.colors[v * 3 + 2]!.toFixed(3)}`
    const near = new Set<string>()
    const far = new Set<string>()
    for (let v = 0; v < env.positions.length / 3; v++) {
      ;(env.positions[v * 3 + 2]! > -200 ? near : far).add(key(v))
    }
    const shared = [...near].filter((k) => far.has(k))
    expect(shared.length).toBeGreaterThanOrEqual(4)
    // And only a handful of tones in the whole room, not a continuum.
    expect(new Set([...near, ...far]).size).toBeLessThan(12)
  })

  it('every index points at a vertex it has', () => {
    const vertices = env.positions.length / 3
    for (const i of env.indices) expect(i).toBeLessThan(vertices)
  })

  it('quad3 accepts four arbitrary points', () => {
    const m = quad3(
      { x: 0, y: 0, z: -10 }, { x: 5, y: 0, z: -20 },
      { x: 0, y: 5, z: -30 }, { x: 5, y: 5, z: -40 },
      [1, 0, 0],
    )
    expect(m.positions.length).toBe(12)
    expect(m.indices.length).toBe(6)
    expect([...new Set([...m.positions].filter((_, i) => i % 3 === 2))].length).toBe(4)
  })
})

describe('cover as a silhouette', () => {
  const b = { z: -50, x0: -30, x1: 10, y0: -25, y1: 35, label: 'a wall' }

  it('never draws outside the rectangle the solver reasons about', () => {
    /**
     * The rule the art is not allowed to break, and the reason there is no rock
     * silhouette with transparent corners anywhere in this project: the solver
     * treats the rectangle as solid, so anything drawn outside it — or any gap
     * left inside it — is the picture lying about the rules.
     */
    for (const mesh of [
      coverMesh(b),
      coverMesh(b, undefined, { u0: 0, v0: 0, u1: 1, v1: 1 }),
    ]) {
      for (let i = 0; i < mesh.positions.length; i += 3) {
        expect(mesh.positions[i]!).toBeGreaterThanOrEqual(b.x0 - 1e-6)
        expect(mesh.positions[i]!).toBeLessThanOrEqual(b.x1 + 1e-6)
        expect(mesh.positions[i + 1]!).toBeGreaterThanOrEqual(b.y0 - 1e-6)
        expect(mesh.positions[i + 1]!).toBeLessThanOrEqual(b.y1 + 1e-6)
        expect(mesh.positions[i + 2]!).toBe(b.z)
      }
    }
  })

  it('covers the rectangle completely, top to bottom', () => {
    const m = coverMesh(b)
    const ys = [...m.positions].filter((_, i) => i % 3 === 1)
    expect(Math.min(...ys)).toBeCloseTo(b.y0, 6)
    expect(Math.max(...ys)).toBeCloseTo(b.y1, 6)
  })

  it('is bevelled inwards, which is how it reads as a block without being one', () => {
    /**
     * The whole trick. A box with real depth has a silhouette wider than its own
     * front face, so drawing one would promise cover the sightline test does not
     * grant. Bevelling *inwards* buys the block for free: the lit face sits above
     * the middle and the dark one below it, and the eye reconstructs a solid out
     * of five coplanar quads.
     */
    const m = coverMesh(b)
    const mid = (b.y0 + b.y1) / 2
    const meanYOf = (tone: readonly number[]) => {
      let sum = 0
      let n = 0
      for (let v = 0; v < m.positions.length / 3; v++) {
        const same =
          Math.abs(m.colors[v * 3]! - tone[0]!) < 1e-6 &&
          Math.abs(m.colors[v * 3 + 1]! - tone[1]!) < 1e-6 &&
          Math.abs(m.colors[v * 3 + 2]! - tone[2]!) < 1e-6
        if (!same) continue
        sum += m.positions[v * 3 + 1]!
        n++
      }
      expect(n).toBeGreaterThan(0)
      return sum / n
    }
    expect(meanYOf(DEFAULT_MOOD.blockTop)).toBeGreaterThan(mid)
    expect(meanYOf(DEFAULT_MOOD.blockSide)).toBeLessThan(mid)
  })

  it('draws its outline on the rectangle itself, not outside it', () => {
    // The bright line is what stops a block reading as a card, and it is also the
    // one part of the drawing that touches the boundary the solver knows about —
    // so it has to sit exactly on it and never past it.
    const m = coverMesh(b)
    let touching = 0
    for (let v = 0; v < m.positions.length / 3; v++) {
      const isEdge =
        Math.abs(m.colors[v * 3]! - DEFAULT_MOOD.blockEdge[0]) < 1e-6 &&
        Math.abs(m.colors[v * 3 + 1]! - DEFAULT_MOOD.blockEdge[1]) < 1e-6 &&
        Math.abs(m.colors[v * 3 + 2]! - DEFAULT_MOOD.blockEdge[2]) < 1e-6
      if (!isEdge) continue
      const x = m.positions[v * 3]!
      const y = m.positions[v * 3 + 1]!
      if (
        Math.abs(x - b.x0) < 1e-6 || Math.abs(x - b.x1) < 1e-6 ||
        Math.abs(y - b.y0) < 1e-6 || Math.abs(y - b.y1) < 1e-6
      ) touching++
    }
    expect(touching).toBeGreaterThanOrEqual(8)
  })

  it('drops the gradient when given a texture, because a photo fights it', () => {
    const plain = coverMesh(b)
    const textured = coverMesh(b, undefined, { u0: 0, v0: 0, u1: 1, v1: 1 })
    expect([...textured.textured].every((v) => v === 1)).toBe(true)
    expect([...plain.textured].every((v) => v === 0)).toBe(true)
  })
})

describe('contact shadows', () => {
  const b = { z: -50, x0: -20, x1: 20, y0: -10, y1: 30, label: 'block' }

  it('lie on the floor and reach away from the viewer', () => {
    const m = contactShadowMesh(b, -64)
    const ys = [...m.positions].filter((_, i) => i % 3 === 1)
    for (const y of ys) expect(y).toBeCloseTo(-63.6, 5)
    const zs = [...m.positions].filter((_, i) => i % 3 === 2)
    expect(Math.min(...zs)).toBeLessThan(b.z)
    expect(Math.max(...zs)).toBe(b.z)
  })

  it('are one flat tone with a hard edge, like everything else here', () => {
    // A shadow that fades is a shadow the eye has to interpret. This one is a
    // shape: it says where the block's foot is and nothing else.
    const m = contactShadowMesh(b, -64)
    const first = [m.colors[0]!, m.colors[1]!, m.colors[2]!]
    for (let v = 0; v < m.colors.length / 3; v++) {
      expect(m.colors[v * 3]!).toBeCloseTo(first[0]!, 6)
      expect(m.colors[v * 3 + 1]!).toBeCloseTo(first[1]!, 6)
      expect(m.colors[v * 3 + 2]!).toBeCloseTo(first[2]!, 6)
    }
  })

  it('sit under the block rather than spilling out from it', () => {
    const m = contactShadowMesh(b, -64)
    const xs = [...m.positions].filter((_, i) => i % 3 === 0)
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(b.x0)
    expect(Math.max(...xs)).toBeLessThanOrEqual(b.x1)
  })
})

describe('clouds, as flat blocks in the sky', () => {
  it('is deterministic for a seed, so a level looks the same twice', () => {
    expect(cloudMesh(undefined, 7).positions).toEqual(cloudMesh(undefined, 7).positions)
  })

  it('and different for a different seed', () => {
    expect(cloudMesh(undefined, 7).positions).not.toEqual(cloudMesh(undefined, 8).positions)
  })

  it('stands beyond the corridor and above its walls', () => {
    // Above the wall caps, or a cloud could be mistaken for something to hide
    // behind — which is the one misreading the picture must never invite.
    const m = cloudMesh(undefined, 3)
    for (let i = 2; i < m.positions.length; i += 3) {
      expect(m.positions[i]!).toBeLessThan(-430)
      expect(m.positions[i]!).toBeGreaterThan(-540)
    }
    const ys = [...m.positions].filter((_, i) => i % 3 === 1)
    expect(Math.min(...ys)).toBeGreaterThan(26)
  })

  it('spans the opening rather than a corner of it', () => {
    const xs = [...cloudMesh(undefined, 5).positions].filter((_, i) => i % 3 === 0)
    expect(Math.min(...xs)).toBeLessThan(-300)
    expect(Math.max(...xs)).toBeGreaterThan(200)
  })

  it('occludes nothing, so it is allowed to be any shape it likes', () => {
    // Stated as a test because it is the licence the whole environment relies on:
    // the solver only ever sees `scan.occluders`, and none of this is in there.
    const m = cloudMesh(undefined, 1)
    expect(m.indices.length).toBeGreaterThan(30)
  })
})

describe('the checkered floor', () => {
  it('alternates two tones, which is the only depth cue left', () => {
    /**
     * The fog and the gradients came out because a playtester could not read the
     * picture through them. What replaced them is this: tiles in perspective get
     * smaller, and that is the whole statement about distance. A floor drawn in
     * one tone would have removed the cue rather than replacing it.
     */
    const m = environmentMesh()
    const tones = new Set<string>()
    for (let v = 0; v < m.colors.length / 3; v++) {
      tones.add(
        `${m.colors[v * 3]!.toFixed(4)},${m.colors[v * 3 + 1]!.toFixed(4)},` +
          `${m.colors[v * 3 + 2]!.toFixed(4)}`,
      )
    }
    expect(tones.size).toBeGreaterThan(3)
  })

  it('is open to the sky rather than a closed tube', () => {
    // The walls stop low so a block always has something bright behind its top
    // edge. A ceiling would take that away and the outline with it.
    const m = environmentMesh()
    const ys = [...m.positions].filter((_, i) => i % 3 === 1)
    expect(Math.max(...ys)).toBeLessThan(40)
  })
})
