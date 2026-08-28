/**
 * The room pipeline, tested against synthetic scenes.
 *
 * No camera, no model, no browser: the arithmetic that decides where the
 * furniture is has to be checkable on its own, because the model that feeds it
 * never will be. These tests prove the geometry is right and that a bad frame
 * produces a stated refusal — they prove nothing about whether a real depth
 * model finds a real chair, which is stated openly in SPEC §7.5.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CAMERA,
  maskCoverage,
  orientMask,
  removePerson,
  brightRegions,
  buildRoomScan,
  connectedComponents,
  depthToCm,
  fitBillboards,
  isFit,
  proposeAnchors,
  solveScale,
  unproject,
} from '../src/perceive/roomGeometry'
import type { DepthField, PersonMask } from '../src/perceive/roomGeometry'
import { generate } from '../src/engine'
import { validateScan } from '../src/boundary/validate'
import { seated } from '../fixtures/envelopes'

const W = 160
const H = 120
const HEAD_Z = 60
const FAR_WALL = 320

/** A person in the middle, a chair back beside them, a wall behind everything. */
function scene(
  opts: { chair?: boolean; person?: boolean; bright?: boolean } = {},
): { depth: DepthField; mask: PersonMask; rgba: Uint8ClampedArray } {
  const values = new Float32Array(W * H).fill(0.08) // the wall
  const person = new Float32Array(W * H)
  const rgba = new Uint8ClampedArray(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    rgba[i * 4] = 40
    rgba[i * 4 + 1] = 44
    rgba[i * 4 + 2] = 52
    rgba[i * 4 + 3] = 255
  }

  const box = (
    u0: number, u1: number, v0: number, v1: number,
    f: (i: number, u: number, v: number) => void,
  ) => {
    for (let v = v0; v < v1; v++) for (let u = u0; u < u1; u++) f(v * W + u, u, v)
  }

  if (opts.person !== false) {
    box(64, 96, 40, 120, (i) => { values[i] = 0.9; person[i] = 1 })
  }
  if (opts.chair !== false) {
    box(16, 56, 30, 100, (i) => { values[i] = 0.45 })
  }
  if (opts.bright) {
    box(120, 156, 8, 48, (i) => {
      rgba[i * 4] = 253
      rgba[i * 4 + 1] = 252
      rgba[i * 4 + 2] = 250
    })
  }
  return {
    depth: { width: W, height: H, values },
    mask: { width: W, height: H, values: person },
    rgba,
  }
}

describe('the affine scale', () => {
  it('maps the head and the far wall to the numbers it was told', () => {
    const { depth, mask } = scene()
    const fit = solveScale(depth, mask, { headZcm: HEAD_Z, farWallCm: FAR_WALL })
    expect(isFit(fit)).toBe(true)
    if (!isFit(fit)) return
    expect(depthToCm(fit, fit.headD)).toBeCloseTo(HEAD_Z, 3)
    expect(depthToCm(fit, fit.farD)).toBeCloseTo(FAR_WALL, 3)
    expect(fit.a).toBeGreaterThan(0)
  })

  it('puts intermediate depths in between, monotonically', () => {
    const { depth, mask } = scene()
    const fit = solveScale(depth, mask, { headZcm: HEAD_Z, farWallCm: FAR_WALL })
    if (!isFit(fit)) throw new Error('expected a fit')
    const near = depthToCm(fit, 0.7)
    const mid = depthToCm(fit, 0.45)
    const far = depthToCm(fit, 0.2)
    expect(near).toBeLessThan(mid)
    expect(mid).toBeLessThan(far)
    expect(mid).toBeGreaterThan(HEAD_Z)
    expect(mid).toBeLessThan(FAR_WALL)
  })

  it('refuses a frame with no person in it', () => {
    const { depth, mask } = scene({ person: false })
    const fit = solveScale(depth, mask, { headZcm: HEAD_Z, farWallCm: FAR_WALL })
    expect(isFit(fit)).toBe(false)
    if (!isFit(fit)) expect(fit.error).toMatch(/no person/)
  })

  it('refuses when the person is not the nearest thing', () => {
    const values = new Float32Array(W * H).fill(0.9)
    const person = new Float32Array(W * H)
    for (let v = 40; v < 120; v++) for (let u = 64; u < 96; u++) person[v * W + u] = 1
    const fit = solveScale(
      { width: W, height: H, values },
      { width: W, height: H, values: person },
      { headZcm: HEAD_Z, farWallCm: FAR_WALL },
    )
    expect(isFit(fit)).toBe(false)
  })

  it('refuses mismatched inputs rather than reading past the end', () => {
    const { depth } = scene()
    const fit = solveScale(depth, { width: 8, height: 8, values: new Float32Array(64) }, {
      headZcm: HEAD_Z,
      farWallCm: FAR_WALL,
    })
    expect(isFit(fit)).toBe(false)
  })
})

describe('unprojection', () => {
  it('puts the centre of the frame on the centre line', () => {
    const p = unproject(W / 2, H / 2, 200, W, H, DEFAULT_CAMERA)
    expect(p.x).toBeCloseTo(0, 6)
  })

  it('puts something at the player’s own distance on the screen plane', () => {
    expect(unproject(0, 0, DEFAULT_CAMERA.playerZcm, W, H).z).toBe(0)
    // And no negative zero leaks out, whatever the inputs.
    expect(Object.is(unproject(0, 0, 10, W, H).z, -0)).toBe(false)
  })

  it('puts something further away deeper into the scene', () => {
    const near = unproject(0, 0, 120, W, H).z
    const far = unproject(0, 0, 300, W, H).z
    expect(far).toBeLessThan(near)
  })

  it('flips laterally when told to, and consistently with the tracker', () => {
    const a = unproject(0, H / 2, 200, W, H, { ...DEFAULT_CAMERA, flipX: false })
    const b = unproject(0, H / 2, 200, W, H, { ...DEFAULT_CAMERA, flipX: true })
    expect(Math.sign(a.x)).toBe(-Math.sign(b.x))
  })
})

describe('connected components', () => {
  const blob = (w: number, h: number, boxes: number[][]) => {
    const b = new Uint8Array(w * h)
    for (const [u0, u1, v0, v1] of boxes) {
      for (let v = v0!; v < v1!; v++) for (let u = u0!; u < u1!; u++) b[v * w + u] = 1
    }
    return b
  }

  it('separates two blobs and bounds each one', () => {
    const found = connectedComponents(blob(40, 40, [[2, 10, 2, 10], [24, 34, 24, 34]]), 40, 40, 4)
    expect(found).toHaveLength(2)
    const sorted = [...found].sort((a, b) => a.u0 - b.u0)
    expect(sorted[0]).toMatchObject({ u0: 2, u1: 9, v0: 2, v1: 9 })
    expect(sorted[1]).toMatchObject({ u0: 24, u1: 33, v0: 24, v1: 33 })
  })

  it('drops anything under the minimum size', () => {
    expect(connectedComponents(blob(40, 40, [[0, 2, 0, 2]]), 40, 40, 100)).toHaveLength(0)
  })

  it('survives a region covering the entire frame', () => {
    // Iterative rather than recursive for exactly this: 640x480 recursion would
    // blow the stack on the first large wall.
    const w = 640
    const h = 480
    const found = connectedComponents(new Uint8Array(w * h).fill(1), w, h, 1)
    expect(found).toHaveLength(1)
    expect(found[0]!.pixels).toBe(w * h)
  })

  it('finds nothing in an empty frame', () => {
    expect(connectedComponents(new Uint8Array(400), 20, 20, 1)).toHaveLength(0)
  })
})

describe('fitting billboards', () => {
  const { depth, mask } = scene()
  const fit = solveScale(depth, mask, { headZcm: HEAD_Z, farWallCm: FAR_WALL })
  if (!isFit(fit)) throw new Error('expected a fit')

  it('finds the chair and the wall, at different depths', () => {
    const bills = fitBillboards(depth, mask, fit, { minPixels: 300 })
    expect(bills.length).toBeGreaterThanOrEqual(2)
    const depths = bills.map((b) => b.z).sort((a, b) => b - a)
    // The chair is nearer than the wall, and both are beyond the screen.
    expect(depths[0]!).toBeGreaterThan(depths[depths.length - 1]!)
    for (const b of bills) expect(b.z).toBeLessThan(0)
  })

  it('never emits an inverted or empty rectangle', () => {
    for (const b of fitBillboards(depth, mask, fit, { minPixels: 300 })) {
      expect(b.x1).toBeGreaterThan(b.x0)
      expect(b.y1).toBeGreaterThan(b.y0)
      expect(Number.isFinite(b.z)).toBe(true)
    }
  })

  it('excludes the player from the furniture', () => {
    // The person occupies u 64..96; nothing at the head's depth may survive.
    for (const b of fitBillboards(depth, mask, fit, { minPixels: 300 })) {
      expect(-b.z).toBeGreaterThan(10)
    }
  })

  it('respects the cap', () => {
    expect(
      fitBillboards(depth, mask, fit, { minPixels: 100, maxOccluders: 2 }).length,
    ).toBeLessThanOrEqual(2)
  })

  it('fits a distant room into the playable band, preserving the order', () => {
    /**
     * The test for the failure that produced the compression. A real scan of a
     * real room refused with 129 of 180 candidates unreachable, because the room
     * put its nearest surface metres behind the player's head while the mechanic
     * needs cover near the window: leverage over a sightline is (1 - s), and
     * cover two and a half metres away cannot be leaned around by anybody.
     *
     * So a room whose every surface is far must still come out playable, and the
     * ordering — what is in front of what, which is all occlusion depends on —
     * must survive exactly.
     */
    const values = new Float32Array(W * H).fill(0.05) // a wall a long way off
    const person = new Float32Array(W * H)
    for (let v = 40; v < 120; v++) for (let u = 64; u < 96; u++) {
      values[v * W + u] = 0.9
      person[v * W + u] = 1
    }
    // A shelf, still far away, but nearer than the wall.
    for (let v = 20; v < 90; v++) for (let u = 8; u < 50; u++) values[v * W + u] = 0.14

    const far = { width: W, height: H, values }
    const mask2 = { width: W, height: H, values: person }
    const fit2 = solveScale(far, mask2, { headZcm: HEAD_Z, farWallCm: 520 })
    if (!isFit(fit2)) throw new Error('expected a fit')

    // True distances: both surfaces are metres away.
    expect(depthToCm(fit2, 0.14)).toBeGreaterThan(200)
    expect(depthToCm(fit2, 0.05)).toBeGreaterThan(400)

    const bills = fitBillboards(far, mask2, fit2, { minPixels: 300 })
    expect(bills.length).toBeGreaterThanOrEqual(2)
    for (const b of bills) {
      expect(-b.z).toBeGreaterThanOrEqual(30)
      expect(-b.z).toBeLessThanOrEqual(300)
    }
    // The shelf is still in front of the wall.
    const shallowest = Math.max(...bills.map((b) => b.z))
    const deepest = Math.min(...bills.map((b) => b.z))
    expect(shallowest).toBeGreaterThan(deepest)

    // And it is now actually playable rather than refused.
    const out = buildRoomScan({
      depth: far, mask: mask2,
      headZcm: HEAD_Z, farWallCm: 520,
      model: 'synthetic', atISO: '2026-08-28T00:00:00.000Z',
    })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(generate(validateScan(out.scan).scan, seated()).kind).toBe('level')
  })

  it('finds nothing in a frame that is all one distance', () => {
    const flat = new Float32Array(W * H).fill(0.5)
    const bills = fitBillboards(
      { width: W, height: H, values: flat },
      mask,
      fit,
      { minPixels: 300, bands: 6 },
    )
    // One band at most: a flat frame is a wall, not a room with cover in it.
    expect(bills.length).toBeLessThanOrEqual(1)
  })
})

describe('blown-out regions become no-spawn', () => {
  it('finds a bright window and places it', () => {
    const { rgba } = scene({ bright: true })
    const regions = brightRegions(rgba, W, H, { minPixels: 200 })
    expect(regions).toHaveLength(1)
    expect(regions[0]!.x1).toBeGreaterThan(regions[0]!.x0)
    expect(regions[0]!.z).toBeLessThan(0)
  })

  it('finds nothing in an evenly lit frame', () => {
    const { rgba } = scene()
    expect(brightRegions(rgba, W, H, { minPixels: 200 })).toHaveLength(0)
  })
})

describe('anchors are proposed, never judged', () => {
  it('proposes nothing when there is no cover', () => {
    expect(proposeAnchors([])).toEqual([])
  })

  it('proposes candidates behind the cover, and bounded in number', () => {
    const anchors = proposeAnchors([
      { z: -50, x0: -20, x1: 20, y0: -15, y1: 15, label: 'chair' },
    ])
    expect(anchors.length).toBeGreaterThan(10)
    expect(anchors.length).toBeLessThanOrEqual(256)
    for (const a of anchors) expect(a.z).toBeLessThan(-50)
  })

  it('uses every depth it was given, not just the first', () => {
    // The cap used to be spent inside the first depth loop, so every candidate in
    // a wide room sat on one plane — and depth is one of the two things that make
    // peek windows differ.
    const anchors = proposeAnchors(
      [{ z: -44, x0: -110, x1: 110, y0: -45, y1: 45, label: 'wide wall' }],
      { pitchCm: 8, maxAnchors: 90 },
    )
    expect(new Set(anchors.map((a) => a.z)).size).toBeGreaterThanOrEqual(3)
    // Slightly over is fine: the budget is divided per depth and each one rounds
    // its own grid. Well under the boundary validator's cap is what matters.
    expect(anchors.length).toBeLessThanOrEqual(Math.round(90 * 1.2))
  })

  it('subsamples the grid evenly rather than cutting it short', () => {
    /**
     * Truncating in scan order biases the sample into one corner, because the
     * loops start at the bottom left — and that quietly refused a room the engine
     * had been playing.
     *
     * The property is *balance*, not span: with a stride, the ends of the range
     * can be clipped by a fraction of a step, so comparing extents makes a
     * brittle test. Comparing centroids asks the question that matters.
     */
    const wall = { z: -44, x0: -120, x1: 120, y0: -50, y1: 50, label: 'wall' }
    const capped = proposeAnchors([wall], { pitchCm: 6, maxAnchors: 60 })
    const uncapped = proposeAnchors([wall], { pitchCm: 6, maxAnchors: 100000 })
    expect(capped.length).toBeLessThan(uncapped.length)
    expect(capped.length).toBeGreaterThan(10)

    const centroid = (ps: { x: number; y: number }[]) => ({
      x: ps.reduce((a, p) => a + p.x, 0) / ps.length,
      y: ps.reduce((a, p) => a + p.y, 0) / ps.length,
    })
    for (const z of new Set(capped.map((a) => a.z))) {
      const mine = centroid(capped.filter((a) => a.z === z))
      const all = centroid(uncapped.filter((a) => a.z === z))
      // A corner-biased sample would be tens of centimetres off centre. With a
      // centred grid both centroids land on the middle of the range exactly.
      expect(Math.abs(mine.x - all.x)).toBeLessThan(4)
      expect(Math.abs(mine.y - all.y)).toBeLessThan(4)
    }
  })
})

describe('the whole pipeline', () => {
  it('produces a scan the boundary validator accepts unharmed', () => {
    const { depth, mask, rgba } = scene({ bright: true })
    const out = buildRoomScan({
      depth, mask, rgba,
      headZcm: HEAD_Z,
      farWallCm: FAR_WALL,
      model: 'synthetic',
      atISO: '2026-08-28T00:00:00.000Z',
    })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    const report = validateScan(out.scan)
    expect(report.typeErrors).toBe(0)
    expect(report.dropped).toEqual({ occluders: 0, anchors: 0, noSpawn: 0 })
    expect(report.scan.source).toBe('depth')
  })

  it('and the engine judges it — every shipped target is fair, or it refuses', () => {
    const { depth, mask } = scene()
    const out = buildRoomScan({
      depth, mask,
      headZcm: HEAD_Z,
      farWallCm: FAR_WALL,
      model: 'synthetic',
      atISO: '2026-08-28T00:00:00.000Z',
    })
    if (!out.ok) throw new Error(out.reason)
    const level = generate(validateScan(out.scan).scan, seated())
    if (level.kind === 'refusal') {
      expect(level.stats.fair).toBe(0)
      return
    }
    const byKey = new Map(
      level.assessments.map((a) => [`${a.target.at.x},${a.target.at.y},${a.target.at.z}`, a]),
    )
    for (const t of level.targets) {
      expect(byKey.get(`${t.at.x},${t.at.y},${t.at.z}`)?.fair).toBe(true)
    }
  })

  it('hands over a bare wall without judging it, and lets the engine decide', () => {
    /**
     * Two wrong premises died here, and the second is the interesting one.
     *
     * First: perception should not refuse a flat wall. A wall *is* geometry, and
     * whether a level can be built from it is not perception's question.
     *
     * Second — and I expected the engine to refuse it, and it did not, and it was
     * right. A wall of finite extent **has edges, and an edge is cover.** You can
     * lean until you see past it. That is a legitimate level, and it is precisely
     * why the perception layer must not pre-judge: it would have thrown away a
     * playable room on the strength of my intuition about what cover looks like.
     */
    const flat = new Float32Array(W * H).fill(0.08)
    const person = new Float32Array(W * H)
    for (let v = 40; v < 120; v++) for (let u = 64; u < 96; u++) {
      flat[v * W + u] = 0.9
      person[v * W + u] = 1
    }
    const out = buildRoomScan({
      depth: { width: W, height: H, values: flat },
      mask: { width: W, height: H, values: person },
      headZcm: HEAD_Z,
      farWallCm: FAR_WALL,
      model: 'synthetic',
      atISO: '2026-08-28T00:00:00.000Z',
    })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.scan.occluders.length).toBeGreaterThan(0)

    // Whatever the engine decides, it must be self-consistent.
    const level = generate(validateScan(out.scan).scan, seated())
    if (level.kind === 'refusal') {
      expect(level.stats.fair).toBe(0)
      return
    }
    const byKey = new Map(
      level.assessments.map((a) => [`${a.target.at.x},${a.target.at.y},${a.target.at.z}`, a]),
    )
    for (const t of level.targets) {
      expect(byKey.get(`${t.at.x},${t.at.y},${t.at.z}`)?.fair).toBe(true)
    }
  })

  it('refuses only when it genuinely cannot produce geometry', () => {
    const empty = new Float32Array(W * H)
    const out = buildRoomScan({
      depth: { width: W, height: H, values: empty },
      mask: { width: W, height: H, values: new Float32Array(W * H) },
      headZcm: HEAD_Z,
      farWallCm: FAR_WALL,
      model: 'synthetic',
      atISO: '2026-08-28T00:00:00.000Z',
    })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toMatch(/no person/)
  })
})

describe('the mask has to mark the person, not the room', () => {
  /**
   * The bug a playtester hit: the segmenter returned the mask inverted, so the
   * room was excluded and the player kept — and the level became a face three
   * metres tall, textured with that face.
   *
   * The check does not guess the model's convention. It uses the one thing
   * certainly true of a webcam pointed at somebody: the person is nearest.
   */
  it('leaves a correct mask alone', () => {
    const { depth, mask } = scene()
    expect(orientMask(depth, mask).values).toBe(mask.values)
  })

  it('flips an inverted one', () => {
    const { depth, mask } = scene()
    const inverted = {
      width: W, height: H,
      values: Float32Array.from(mask.values, (v) => 1 - v),
    }
    const fixed = orientMask(depth, inverted)
    expect(fixed.values).not.toBe(inverted.values)
    // And it comes back agreeing with the original.
    let agree = 0
    for (let i = 0; i < mask.values.length; i++) {
      if ((fixed.values[i]! >= 0.5) === (mask.values[i]! >= 0.5)) agree++
    }
    expect(agree / mask.values.length).toBeGreaterThan(0.99)
  })

  it('does not gamble when there is not enough of one side to judge', () => {
    const { depth } = scene()
    const empty = { width: W, height: H, values: new Float32Array(W * H) }
    expect(orientMask(depth, empty).values).toBe(empty.values)
  })

  it('and the whole pipeline recovers from an inverted mask', () => {
    const { depth, mask, rgba } = scene()
    const inverted = {
      width: W, height: H,
      values: Float32Array.from(mask.values, (v) => 1 - v),
    }
    const out = buildRoomScan({
      depth, mask: inverted, rgba,
      headZcm: HEAD_Z, farWallCm: FAR_WALL,
      model: 'synthetic', atISO: '2026-08-28T00:00:00.000Z',
    })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    // The player's own depth band must not become furniture.
    for (const o of out.scan.occluders) expect(-o.z).toBeGreaterThan(10)
  })
})

describe('a surface covering the frame is a blindfold only if it hides something', () => {
  /**
   * Depth is the wrong way to tell these apart, and after the band compression it
   * is not even absolute. What separates them is whether anything is behind: a
   * blindfold hides a room, a back wall has nothing left to hide.
   */
  const build = (values: Float32Array, person: Float32Array) =>
    buildRoomScan({
      depth: { width: W, height: H, values },
      mask: { width: W, height: H, values: person },
      headZcm: HEAD_Z, farWallCm: FAR_WALL,
      model: 'synthetic', atISO: '2026-08-28T00:00:00.000Z',
    })

  const personBlob = (): Float32Array => {
    const p = new Float32Array(W * H)
    for (let v = H - 14; v < H; v++) for (let u = 0; u < 10; u++) p[v * W + u] = 1
    return p
  }

  it('drops one that hides a room behind it', () => {
    const values = new Float32Array(W * H).fill(0.07) // the room, far away
    /**
     * A near surface over three quarters of the frame: a hand on the lens, or the
     * player themselves after a mask failure. The far quarter has to be a real
     * quarter — an earlier version of this test left the room only 4 % of the
     * frame, which falls inside the 5th-percentile window, so the scene read as
     * having no depth at all and there was nothing "behind" to detect.
     */
    for (let v = 0; v < H; v++) for (let u = 0; u < 120; u++) values[v * W + u] = 0.6
    const person = personBlob()
    for (let v = H - 14; v < H; v++) for (let u = 0; u < 10; u++) values[v * W + u] = 0.95

    const out = build(values, person)
    if (!out.ok) {
      expect(out.reason).toMatch(/nothing in this frame/)
      return
    }
    // If anything survived, it is not the frame-filling near surface.
    const frameArea = W * H
    for (const r of out.regions) {
      const area = (r.u1 - r.u0 + 1) * (r.v1 - r.v0 + 1)
      expect(area).toBeLessThanOrEqual(frameArea * 0.62)
    }
  })

  it('keeps a back wall, which covers the frame and hides nothing', () => {
    const values = new Float32Array(W * H).fill(0.08)
    const person = personBlob()
    for (let v = H - 14; v < H; v++) for (let u = 0; u < 10; u++) values[v * W + u] = 0.95
    const out = build(values, person)
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.scan.occluders.length).toBeGreaterThan(0)
  })
})

describe('the player is smeared out of the level art', () => {
  /**
   * The bug this exists for: excluding the person from the depth fitting is not
   * enough, because an occluder is a bounding box and the wall behind a seated
   * person surrounds them — so its box spans the frame and its texture was the
   * whole frame, face and all.
   */
  const build = () => {
    const width = 40
    const height = 20
    const rgba = new Uint8ClampedArray(width * height * 4)
    const values = new Float32Array(width * height)
    for (let v = 0; v < height; v++) {
      for (let u = 0; u < width; u++) {
        const i = v * width + u
        const person = u >= 14 && u < 26
        if (person) values[i] = 1
        // Wall is green, person is red, so a leak is visible in one channel.
        rgba[i * 4] = person ? 255 : 0
        rgba[i * 4 + 1] = person ? 0 : 180
        rgba[i * 4 + 2] = 0
        rgba[i * 4 + 3] = 255
      }
    }
    return { rgba, mask: { width, height, values }, width, height }
  }

  it('leaves not one pixel of the person in the texture', () => {
    const { rgba, mask } = build()
    const out = removePerson(rgba, mask)
    for (let i = 0; i < out.length; i += 4) {
      expect(out[i]).toBe(0) // no red survives
      expect(out[i + 1]).toBe(180)
      expect(out[i + 3]).toBe(255)
    }
  })

  it('does not touch anything outside the mask', () => {
    const { rgba, mask } = build()
    const out = removePerson(rgba, mask)
    for (let i = 0; i < mask.values.length; i++) {
      if (mask.values[i]! >= 0.55) continue
      for (let c = 0; c < 4; c++) expect(out[i * 4 + c]).toBe(rgba[i * 4 + c])
    }
  })

  it('fills from the nearer edge, so a wall does not stretch across a face', () => {
    const width = 9
    const height = 1
    const rgba = new Uint8ClampedArray(width * 4)
    const values = new Float32Array(width)
    // left wall = 10, right wall = 200, person in the middle three columns
    for (let u = 0; u < width; u++) {
      rgba[u * 4] = u < 4 ? 10 : u > 6 ? 200 : 99
      rgba[u * 4 + 3] = 255
      if (u >= 4 && u <= 6) values[u] = 1
    }
    const out = removePerson(rgba, { width, height, values })
    expect(out[4 * 4]).toBe(10)  // nearest edge is the left
    expect(out[6 * 4]).toBe(200) // nearest edge is the right
  })

  it('falls back to a flat dark fill when a whole row is the person', () => {
    const width = 4
    const height = 1
    const rgba = new Uint8ClampedArray(width * 4).fill(255)
    const out = removePerson(rgba, { width, height, values: new Float32Array(width).fill(1) })
    for (let u = 0; u < width; u++) {
      expect(out[u * 4]).toBeLessThan(40)
      expect(out[u * 4 + 3]).toBe(255)
    }
  })

  it('reports how much of the frame the mask claims', () => {
    const { mask } = build()
    expect(maskCoverage(mask)).toBeCloseTo(12 / 40, 6)
    expect(maskCoverage({ width: 0, height: 0, values: new Float32Array(0) })).toBe(0)
  })
})
