/**
 * The semantic pass, on the pure side of the boundary.
 *
 * The claim being tested is narrow and it is the important one: a vision model
 * may name and classify the regions the depth pass already found, and it may
 * *remove* places a target could go. It may never authorise anything.
 */
import { describe, expect, it } from 'vitest'
import { applyInventory, costOf, validateInventory } from '../src/perceive/inventory'
import type { Inventory } from '../src/perceive/inventory'
import { assessEnemies } from '../src/engine'
import type { RoomScan } from '../src/engine'
import { validateScan } from '../src/boundary/validate'
import raw from '../fixtures/desk.room.json'
import { seated } from '../fixtures/envelopes'

const room = raw as RoomScan
const env = seated()

describe('validating what the model returned', () => {
  it('keeps a well-formed inventory', () => {
    const r = validateInventory(
      { regions: [{ index: 0, label: 'chair back', class: 'furniture', use: 'cover' }] },
      3,
    )
    expect(r.inventory.regions).toHaveLength(1)
    expect(r.typeErrors).toBe(0)
    expect(r.dropped).toBe(0)
  })

  it('drops an index that does not exist rather than guessing', () => {
    // Nobody knows what "region 47 of 3" was supposed to mean.
    const r = validateInventory({ regions: [{ index: 47, label: 'x', class: 'decor', use: 'cover' }] }, 3)
    expect(r.inventory.regions).toHaveLength(0)
    expect(r.dropped).toBe(1)
  })

  it('drops duplicates', () => {
    const r = validateInventory({
      regions: [
        { index: 1, label: 'a', class: 'decor', use: 'cover' },
        { index: 1, label: 'b', class: 'decor', use: 'cover' },
      ],
    }, 3)
    expect(r.inventory.regions).toHaveLength(1)
    expect(r.dropped).toBe(1)
  })

  it('falls back on an unknown class or use, and counts it', () => {
    const r = validateInventory({
      regions: [{ index: 0, label: 'thing', class: 'spaceship', use: 'teleport' }],
    }, 2)
    expect(r.inventory.regions[0]).toMatchObject({ class: 'other', use: 'cover' })
    expect(r.typeErrors).toBeGreaterThan(1)
  })

  it('never throws, whatever it is handed', () => {
    for (const nasty of [undefined, null, 0, 'text', [], {}, { regions: 'no' }, { regions: [1, 'a'] }]) {
      expect(() => validateInventory(nasty, 3)).not.toThrow()
      expect(validateInventory(nasty, 3).inventory.regions.length).toBeGreaterThanOrEqual(0)
    }
  })

  it('bounds a runaway label', () => {
    const r = validateInventory({
      regions: [{ index: 0, label: 'x'.repeat(5000), class: 'decor', use: 'cover' }],
    }, 1)
    expect(r.inventory.regions[0]!.label.length).toBeLessThanOrEqual(48)
  })
})

describe('folding it into a scan', () => {
  const inv = (regions: Inventory['regions']): Inventory => ({ regions })

  it('labels cover, and says the pass happened', () => {
    const out = applyInventory(room, inv([
      { index: 0, label: 'monitor', class: 'appliance', use: 'cover' },
    ]))
    expect(out.source).toBe('depth+vlm')
    expect(out.occluders[0]!.label).toContain('monitor')
    expect(out.occluders).toHaveLength(room.occluders.length)
  })

  it('turns a hazard into a no-spawn area, which only ever removes options', () => {
    const before = assessEnemies(room, env).assessments.filter((a) => a.fair).length
    const out = applyInventory(room, inv([
      { index: 0, label: 'window', class: 'window', use: 'hazard' },
    ]))
    expect(out.noSpawn.length).toBe(room.noSpawn.length + 1)
    expect(out.occluders.length).toBe(room.occluders.length - 1)
    const after = assessEnemies(out, env).assessments.filter((a) => a.fair).length
    expect(after).toBeLessThanOrEqual(before)
  })

  it('drops what the model says to ignore', () => {
    const out = applyInventory(room, inv([
      { index: 1, label: 'a poster', class: 'decor', use: 'ignore' },
    ]))
    expect(out.occluders.length).toBe(room.occluders.length - 1)
  })

  it('leaves unlabelled regions exactly as they were', () => {
    const out = applyInventory(room, inv([]))
    expect(out.occluders).toEqual(room.occluders)
    expect(out.noSpawn).toEqual(room.noSpawn)
  })

  it('cannot add an anchor, move a rectangle, or authorise a position', () => {
    /**
     * The load-bearing test of the whole semantic pass. Whatever the model says,
     * the set of candidate positions is untouched and every rectangle keeps its
     * geometry — so nothing it says can make a position playable. Only the engine
     * does that, afterwards, unchanged.
     */
    const out = applyInventory(room, inv([
      { index: 0, label: 'definitely cover', class: 'furniture', use: 'cover' },
      { index: 1, label: 'also cover', class: 'furniture', use: 'cover' },
      { index: 2, label: 'more cover', class: 'furniture', use: 'cover' },
    ]))
    expect(out.anchors).toEqual(room.anchors)
    out.occluders.forEach((o, i) => {
      const original = room.occluders[i]!
      expect([o.z, o.x0, o.x1, o.y0, o.y1]).toEqual([
        original.z, original.x0, original.x1, original.y0, original.y1,
      ])
    })
    // And it still has to survive the boundary and the engine.
    const validatedOut = validateScan(out)
    expect(validatedOut.typeErrors).toBe(0)
    const fair = assessEnemies(validatedOut.scan, env).assessments.filter((a) => a.fair)
    const fairBefore = assessEnemies(room, env).assessments.filter((a) => a.fair)
    expect(fair.length).toBe(fairBefore.length)
  })
})

describe('the visible cost', () => {
  it('comes from the response usage, not an estimate', () => {
    const c = costOf('claude-sonnet-5', 714, 500, { input: 2, output: 10 })
    expect(c.inputTokens).toBe(714)
    expect(c.cents).toBeCloseTo((714 / 1e6) * 2 * 100 + (500 / 1e6) * 10 * 100, 9)
    expect(c.cents).toBeLessThan(1)
  })

  it('is zero for a call that never happened', () => {
    expect(costOf('m', 0, 0, { input: 2, output: 10 }).cents).toBe(0)
  })
})
