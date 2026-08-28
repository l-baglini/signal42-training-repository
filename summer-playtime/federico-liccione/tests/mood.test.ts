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
        m.skyLow, m.skyHigh, m.haze, m.floorNear, m.floorFar, m.wallNear, m.wallFar,
        m.ceilingNear, m.ceilingFar, m.coverTop, m.coverBottom, m.coverRim, m.skyline, m.fog,
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
      expect(m.shafts).toBeGreaterThanOrEqual(0)
      expect(m.shafts).toBeLessThanOrEqual(1)
    })

    it(`${m.name} is backlit: the far end is brighter than the near one`, () => {
      // The gradient that does the work of a lighting rig. A mood that got this
      // backwards would make cover read as a lit card rather than a silhouette.
      const lum = (t: readonly number[]) => t[0]! + t[1]! + t[2]!
      expect(lum(m.floorFar)).toBeGreaterThan(lum(m.floorNear))
      expect(lum(m.wallFar)).toBeGreaterThan(lum(m.wallNear))
      expect(lum(m.coverRim)).toBeGreaterThan(lum(m.coverTop))
      expect(lum(m.coverTop)).toBeGreaterThan(lum(m.coverBottom))
    })
  }
})

describe('the words choose the palette', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ['A rainy night on the roof', 'night'],
    ['Una notte di pioggia', 'night'],
    ['temporale sopra la città', 'night'],
    ['Sunset over the dunes', 'sunset'],
    ['Tramonto sul cortile', 'sunset'],
    ['golden hour', 'sunset'],
    ['An industrial warehouse', 'industrial'],
    ['magazzino con tubi di metallo', 'industrial'],
    ['a concrete bunker', 'industrial'],
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
    expect(moodFor('una notte di pioggia').rain).toBe(1)
    expect(moodFor('Doorway').rain).toBe(0)
  })
})
