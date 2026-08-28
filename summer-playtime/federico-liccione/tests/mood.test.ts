/**
 * A palette per level, chosen by the level's own words.
 *
 * The same principle as everything else in this project that reads a label: the
 * three writers who produce level text — the hand-authored fixtures, the vision
 * model naming a scanned room, the language model laying one out — already write
 * the words that should decide how it looks, so nothing has to ask them for a
 * palette.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_MOOD, MOODS, moodFor } from '../src/render/mood'

describe('every mood is usable as a palette', () => {
  for (const m of MOODS) {
    it(m.name, () => {
      const tones = [
        m.skyLow, m.skyHigh, m.cloud, m.floorA, m.floorB, m.wall, m.wallCap,
        m.blockTop, m.blockFace, m.blockSide, m.blockEdge, m.shadow, m.fog,
      ]
      for (const t of tones) {
        expect(t).toHaveLength(3)
        for (const c of t) {
          expect(Number.isFinite(c)).toBe(true)
          expect(c).toBeGreaterThanOrEqual(0)
          expect(c).toBeLessThanOrEqual(1)
        }
      }
      expect(m.rain).toBeGreaterThanOrEqual(0)
      expect(m.rain).toBeLessThanOrEqual(1)
    })

    it(`${m.name} shades a block by which way the face points`, () => {
      /**
       * The one rule the palette is not allowed to break. A voxel game's whole
       * lighting model is that a face is one flat colour and the shading is
       * *which* face you are looking at: top brightest, front in the middle, side
       * dark, and one bright line around the outline. A mood that got this
       * ordering wrong would flatten the block back into the card it used to be —
       * which is exactly the complaint that produced this palette.
       */
      const lum = (t: readonly number[]) => t[0]! + t[1]! + t[2]!
      expect(lum(m.blockEdge)).toBeGreaterThan(lum(m.blockTop))
      expect(lum(m.blockTop)).toBeGreaterThan(lum(m.blockFace))
      expect(lum(m.blockFace)).toBeGreaterThan(lum(m.blockSide))
    })

    it(`${m.name} keeps the block readable against its own floor`, () => {
      // Contrast, not brightness, is what makes an enemy findable in a glance.
      // A block the same luminance as the tiles behind it is invisible however
      // pretty either one is.
      const lum = (t: readonly number[]) => t[0]! + t[1]! + t[2]!
      const gap = Math.min(
        Math.abs(lum(m.blockFace) - lum(m.floorA)),
        Math.abs(lum(m.blockFace) - lum(m.floorB)),
      )
      expect(gap).toBeGreaterThan(0.12)
    })

    it(`${m.name} tiles the floor in two distinguishable tones`, () => {
      // The checkerboard is the only depth cue left after the fog came out, so a
      // mood whose two tones matched would have no depth cue at all.
      const lum = (t: readonly number[]) => t[0]! + t[1]! + t[2]!
      expect(Math.abs(lum(m.floorA) - lum(m.floorB))).toBeGreaterThan(0.05)
    })
  }
})

describe('the words choose the palette', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ['A rainy night on the roof', 'night'],
    ['Una notte di pioggia', 'night'],
    ['temporale sopra la città', 'night'],
    ['Sunset over the dunes', 'dusk'],
    ['Tramonto sul cortile', 'dusk'],
    ['golden hour', 'dusk'],
    ['An industrial warehouse', 'industrial'],
    ['magazzino con tubi di metallo', 'industrial'],
    ['a concrete bunker', 'industrial'],
    ['a neon arcade', 'neon'],
    ['corridoio cyber con laser', 'neon'],
  ]
  for (const [text, expected] of cases) {
    it(`${text} -> ${expected}`, () => {
      expect(moodFor(text).name).toBe(expected)
    })
  }

  it('falls back rather than guessing', () => {
    expect(moodFor('Doorway').name).toBe(DEFAULT_MOOD.name)
    expect(moodFor('').name).toBe(DEFAULT_MOOD.name)
  })

  it('is case-insensitive, because three different writers produce these', () => {
    expect(moodFor('NOTTE').name).toBe('night')
    expect(moodFor('Industrial').name).toBe('industrial')
  })

  it('rain comes with the night rather than being a separate switch', () => {
    expect(moodFor('una notte di pioggia').rain).toBeGreaterThan(0)
    expect(moodFor('Doorway').rain).toBe(0)
  })
})
