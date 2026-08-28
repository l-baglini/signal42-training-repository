/**
 * A level from a sentence, on the pure side.
 *
 * The claim under test is the same one the semantic pass had to prove, in a
 * stronger form: a language model may lay out the walls, and it still cannot make
 * anything playable. The candidate positions come from a deterministic grid and
 * the engine judges them afterwards, unchanged.
 */
import { describe, expect, it } from 'vitest'
import { COVER_BAND, EXTENT, MAX_COVER, levelFromRects } from '../src/perceive/levelDesign'
import type { ProposedRect } from '../src/perceive/levelDesign'
import { assessEnemies } from '../src/engine'
import { validateScan } from '../src/boundary/validate'
import { seated } from '../fixtures/envelopes'

const at = '2026-08-29T00:00:00.000Z'
const design = (rects: readonly unknown[]) =>
  levelFromRects(rects as readonly ProposedRect[], 'test', 'test-model', at)

const wall = (over: Record<string, unknown> = {}) => ({
  label: 'a wall', z: -50, x0: -40, x1: -10, y0: -20, y1: 30, ...over,
})

describe('taking the model at less than its word', () => {
  it('keeps a sane rectangle', () => {
    const r = design([wall()])
    expect(r.kept).toBe(1)
    expect(r.clamped).toBe(0)
    expect(r.dropped).toBe(0)
    expect(r.scan.occluders[0]!.label).toBe('a wall')
  })

  it('clamps a depth outside the band rather than dropping it', () => {
    // A rectangle at the wrong depth is still a rectangle: the intent survives.
    const deep = design([wall({ z: -900 })])
    expect(deep.scan.occluders[0]!.z).toBe(COVER_BAND.furthest)
    const shallow = design([wall({ z: 40 })])
    expect(shallow.scan.occluders[0]!.z).toBe(COVER_BAND.nearest)
    expect(deep.clamped + shallow.clamped).toBeGreaterThan(1)
  })

  it('repairs a rectangle given back to front', () => {
    const r = design([wall({ x0: 20, x1: -20, y0: 30, y1: -30 })])
    expect(r.kept).toBe(1)
    expect(r.scan.occluders[0]!.x1).toBeGreaterThan(r.scan.occluders[0]!.x0)
    expect(r.scan.occluders[0]!.y1).toBeGreaterThan(r.scan.occluders[0]!.y0)
  })

  it('drops one too thin to hide behind', () => {
    expect(design([wall({ x0: 0, x1: 2 })]).kept).toBe(0)
    expect(design([wall({ y0: 0, y1: 1 })]).kept).toBe(0)
  })

  it('drops one with a missing or non-numeric field', () => {
    expect(design([wall({ z: 'near' })]).kept).toBe(0)
    expect(design([wall({ x1: undefined })]).kept).toBe(0)
    expect(design([wall({ y0: NaN })]).kept).toBe(0)
  })

  it('caps the count and says how many it threw away', () => {
    const many = Array.from({ length: 40 }, (_, i) => wall({ z: -40 - i, label: `w${i}` }))
    const r = design(many)
    expect(r.kept).toBeLessThanOrEqual(MAX_COVER)
    expect(r.dropped).toBeGreaterThan(30)
    expect(r.proposed).toBe(40)
  })

  it('bounds the extent, so no wall escapes the world', () => {
    const r = design([wall({ x0: -9000, x1: 9000, y0: -9000, y1: 9000 })])
    expect(r.scan.occluders[0]!.x0).toBe(-EXTENT.x)
    expect(r.scan.occluders[0]!.y1).toBe(EXTENT.y)
  })

  it('never throws, whatever it is handed', () => {
    for (const nasty of [[], [null], [42], ['wall'], [{}], [{ z: {} }]]) {
      expect(() => design(nasty)).not.toThrow()
    }
  })
})

describe('the model lays out walls and still cannot authorise anything', () => {
  it('proposes no enemy positions of its own', () => {
    /**
     * The load-bearing test. Candidate positions come from the deterministic grid
     * and depend only on the geometry, so two different descriptions that produce
     * the same walls produce the same candidates — the model has no channel
     * through which to suggest where an enemy should be.
     */
    const a = design([wall(), wall({ z: -70, x0: 20, x1: 60 })])
    const b = levelFromRects(
      [wall({ label: 'quite a different name' }), wall({ z: -70, x0: 20, x1: 60, label: 'also' })],
      'other', 'other-model', at,
    )
    expect(b.scan.anchors).toEqual(a.scan.anchors)
    expect(a.scan.anchors.length).toBeGreaterThan(10)
  })

  it('hands the engine something it can judge, and the engine does judge it', () => {
    const r = design([
      wall({ label: 'left jamb', z: -46, x0: -90, x1: -14, y0: -40, y1: 44 }),
      wall({ label: 'right jamb', z: -46, x0: 14, x1: 90, y0: -40, y1: 44 }),
    ])
    const validated = validateScan(r.scan)
    expect(validated.typeErrors).toBe(0)
    expect(validated.dropped).toEqual({ occluders: 0, anchors: 0, noSpawn: 0 })

    const { assessments } = assessEnemies(validated.scan, seated())
    expect(assessments.length).toBe(r.scan.anchors.length)
    // Some fair, some not: a level, judged, rather than a level asserted.
    expect(assessments.some((a) => a.fair)).toBe(true)
    expect(assessments.some((a) => !a.fair)).toBe(true)
  })

  it('an empty description yields no level, and the engine refuses it', () => {
    const r = design([])
    expect(r.scan.occluders).toHaveLength(0)
    expect(r.scan.anchors).toHaveLength(0)
    expect(assessEnemies(r.scan, seated()).assessments).toHaveLength(0)
  })
})
