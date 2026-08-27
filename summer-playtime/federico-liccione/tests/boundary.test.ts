/**
 * The guard tests of SPEC §7.4.
 *
 * These assume the perception layer is hostile. They do not prove the models are
 * right — nothing here touches a network, and vision accuracy is explicitly
 * unverified. They prove **containment**: that a wrong answer stays harmless,
 * which is a different and much more testable claim.
 */
import { describe, expect, it } from 'vitest'
import { LIMITS, validateScan } from '../src/boundary/validate'
import { generate } from '../src/engine'
import { seated } from '../fixtures/envelopes'
import raw from '../fixtures/desk.room.json'

const good = raw as unknown

describe('the validator never throws, whatever it is handed', () => {
  const nasties: unknown[] = [
    undefined, null, 0, '', 'a string', [], true, NaN,
    {}, { occluders: 'not an array', anchors: 42, noSpawn: null },
    { occluders: [null, undefined, 7, 'x', {}] },
    { anchors: [{ x: 'left', y: {}, z: [] }] },
    { provenance: 'free' },
    { source: 'telepathy' },
  ]
  for (const [i, n] of nasties.entries()) {
    it(`input ${i}`, () => {
      expect(() => validateScan(n)).not.toThrow()
      const r = validateScan(n)
      expect(Array.isArray(r.scan.occluders)).toBe(true)
      expect(Array.isArray(r.scan.anchors)).toBe(true)
    })
  }
})

describe('numbers', () => {
  it('non-finite depths are replaced, not propagated', () => {
    const r = validateScan({
      occluders: [{ z: NaN, x0: -1, x1: 1, y0: -1, y1: 1, label: 'nan' }],
      anchors: [{ x: Infinity, y: 0, z: -100 }],
    })
    for (const o of r.scan.occluders) expect(Number.isFinite(o.z)).toBe(true)
    for (const a of r.scan.anchors) {
      expect(Number.isFinite(a.x)).toBe(true)
      expect(Math.abs(a.x)).toBeLessThanOrEqual(LIMITS.xyLimit)
    }
    expect(r.typeErrors).toBeGreaterThan(0)
  })

  it('depths outside the usable band are clamped for occluders', () => {
    const r = validateScan({
      occluders: [{ z: -99999, x0: -1, x1: 1, y0: -1, y1: 1, label: 'deep' }],
    })
    expect(r.scan.occluders[0]!.z).toBe(LIMITS.zFar)
    expect(r.clamped).toBeGreaterThan(0)
  })

  it('anchors outside the usable band are dropped, not dragged to the edge', () => {
    // Clamping an anchor would invent a target position the scan never proposed.
    const r = validateScan({ anchors: [{ x: 0, y: 0, z: -99999 }, { x: 0, y: 0, z: 500 }] })
    expect(r.scan.anchors).toHaveLength(0)
    expect(r.dropped.anchors).toBe(2)
  })
})

describe('rectangles', () => {
  it('inverted and degenerate rects are dropped', () => {
    const r = validateScan({
      occluders: [
        { z: -50, x0: 10, x1: -10, y0: 0, y1: 5, label: 'inverted-x' },
        { z: -50, x0: 0, x1: 0, y0: 0, y1: 5, label: 'zero-width' },
        { z: -50, x0: 0, x1: 5, y0: 5, y1: 5, label: 'zero-height' },
        { z: -50, x0: 0, x1: 5, y0: 0, y1: 5, label: 'fine' },
      ],
    })
    expect(r.scan.occluders).toHaveLength(1)
    expect(r.scan.occluders[0]!.label).toBe('fine')
    expect(r.dropped.occluders).toBe(3)
  })
})

describe('counts', () => {
  it('ten thousand occluders become the cap, and it is reported', () => {
    const many = Array.from({ length: 10_000 }, (_, i) => ({
      z: -50, x0: -1, x1: 1, y0: -1, y1: 1, label: `o${i}`,
    }))
    const r = validateScan({ occluders: many })
    expect(r.scan.occluders).toHaveLength(LIMITS.maxOccluders)
    expect(r.truncated).toBe(true)
  })
})

describe('enums', () => {
  it('an unknown source falls back and is counted', () => {
    const r = validateScan({ source: 'telepathy' })
    expect(r.scan.source).toBe('fixture')
    expect(r.typeErrors).toBeGreaterThan(0)
  })

  it('a suitability string where a number belongs does not survive', () => {
    const r = validateScan({
      occluders: [{ z: 'cover', x0: -5, x1: 5, y0: -5, y1: 5, label: 'confused' }],
    })
    expect(typeof r.scan.occluders[0]?.z).toBe('number')
    expect(r.typeErrors).toBeGreaterThan(0)
  })

  it('a negative cost cannot be reported to the player', () => {
    const r = validateScan({ provenance: { model: 'x', atISO: '', costCents: -100 } })
    expect(r.scan.provenance.costCents).toBe(0)
  })
})

describe('the containment claim: no hostile scan produces an unfair level', () => {
  const hostile: unknown[] = [
    null,
    {},
    { occluders: [{ z: NaN, x0: NaN, x1: NaN, y0: NaN, y1: NaN, label: 1 }], anchors: [{ x: NaN, y: NaN, z: NaN }] },
    { ...(good as object), occluders: Array.from({ length: 5000 }, () => ({ z: -30, x0: -400, x1: 400, y0: -400, y1: 400, label: 'wall' })) },
    { ...(good as object), anchors: Array.from({ length: 500 }, (_, i) => ({ x: i * 7 - 400, y: 0, z: -120 })) },
    { ...(good as object), source: 42, provenance: null },
  ]

  for (const [i, h] of hostile.entries()) {
    it(`hostile scan ${i} yields a refusal or an all-fair level`, () => {
      const { scan } = validateScan(h)
      const out = generate(scan, seated())
      if (out.kind === 'refusal') {
        expect(out.stats.fair).toBe(0)
        return
      }
      const byKey = new Map(
        out.assessments.map((a) => [`${a.target.at.x},${a.target.at.y},${a.target.at.z}`, a]),
      )
      for (const t of out.targets) {
        expect(byKey.get(`${t.at.x},${t.at.y},${t.at.z}`)?.fair).toBe(true)
      }
    })
  }

  it('a valid scan still survives validation unharmed', () => {
    const r = validateScan(good)
    expect(r.dropped).toEqual({ occluders: 0, anchors: 0, noSpawn: 0 })
    expect(r.typeErrors).toBe(0)
    expect(r.clamped).toBe(0)
    expect(generate(r.scan, seated()).kind).toBe('level')
  })
})
