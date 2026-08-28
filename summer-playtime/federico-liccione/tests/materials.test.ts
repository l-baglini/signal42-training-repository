/**
 * Materials, and the rule the art is not allowed to break.
 *
 * Every tile fills its rectangle and is fully opaque. The sightline solver reasons
 * about rectangles, so a silhouette with transparent corners would show a gap the
 * engine believes is solid — the point-versus-extent fault that has already cost
 * this project three bugs. The picture may stylise the rectangle; it may not
 * shrink it.
 */
import { describe, expect, it } from 'vitest'
import { ATLAS, MATERIALS, materialFor, materialUv } from '../src/render/materials'
import type { MaterialName } from '../src/render/materials'

describe('the atlas layout', () => {
  it('gives every material a distinct patch', () => {
    const seen = new Set<string>()
    for (const m of MATERIALS) {
      const uv = materialUv(m)
      seen.add(`${uv.u0.toFixed(4)},${uv.v0.toFixed(4)}`)
    }
    expect(seen.size).toBe(MATERIALS.length)
  })

  it('keeps every patch inside the texture, and the right way up', () => {
    for (const m of MATERIALS) {
      const uv = materialUv(m)
      expect(uv.u0).toBeGreaterThanOrEqual(0)
      expect(uv.v0).toBeGreaterThanOrEqual(0)
      expect(uv.u1).toBeLessThanOrEqual(1)
      expect(uv.v1).toBeLessThanOrEqual(1)
      expect(uv.u1).toBeGreaterThan(uv.u0)
      expect(uv.v1).toBeGreaterThan(uv.v0)
    }
  })

  it('insets each patch, so filtering cannot bleed between tiles', () => {
    const uv = materialUv(MATERIALS[1]!)
    const width = uv.u1 - uv.u0
    expect(width).toBeLessThan(1 / ATLAS.cols)
    expect(width).toBeGreaterThan(1 / ATLAS.cols - 0.01)
  })

  it('never falls outside the atlas for an unknown name', () => {
    const uv = materialUv('not a material' as MaterialName)
    expect(uv.u0).toBeGreaterThanOrEqual(0)
    expect(uv.u1).toBeLessThanOrEqual(1)
  })
})

describe('names choose materials', () => {
  /**
   * This is where the semantic layer becomes art direction. The labels come from
   * three places — hand-authored levels, the vision model naming a scanned room,
   * and the language model laying one out — and all three feed the same mapping.
   */
  const cases: ReadonlyArray<readonly [string, MaterialName]> = [
    ['left jamb', 'wood'],
    ['a wooden door', 'wood'],
    ['porta di legno', 'wood'],
    ['support pillar', 'stone'],
    ['colonna di supporto lontana', 'stone'],
    ['una grande roccia', 'stone'],
    ['low wall', 'brick'],
    ['muretto basso', 'brick'],
    ['parapet', 'brick'],
    ['backlit window', 'glass'],
    ['finestra in controluce', 'glass'],
    ['monitor', 'glass'],
    ['a tree on the left', 'moss'],
    ['albero', 'moss'],
    ['wooden crate', 'wood'],
    ['cassa', 'crate'],
    ['metal locker', 'metal'],
    ['radiatore', 'metal'],
    ['concrete lintel', 'concrete'],
  ]
  for (const [label, expected] of cases) {
    it(`${label} -> ${expected}`, () => {
      expect(materialFor(label)).toBe(expected)
    })
  }

  it('falls back rather than guessing wildly', () => {
    expect(materialFor('band-3')).toBe('concrete')
    expect(materialFor('')).toBe('concrete')
    expect(materialFor('zqxjw', 'stone')).toBe('stone')
  })

  it('is case-insensitive, because the labels come from three different writers', () => {
    expect(materialFor('COLONNA DI SUPPORTO')).toBe('stone')
    expect(materialFor('Finestra')).toBe('glass')
  })
})
