/**
 * A palette per level, chosen by the level's own words.
 *
 * Same principle as the weather: a level that calls itself a rainy night should
 * look like one without anybody adding a field for it, and all three of the
 * writers who produce level text — the hand-authored fixtures, the vision model
 * naming a scanned room, the language model laying one out — write those words
 * already.
 *
 * Everything here is behind or around the cover, so none of it is constrained by
 * the solver. Colour is where this project can be generous.
 */

export type Tone = readonly [number, number, number]

export interface Mood {
  readonly name: string
  /** Sky, bottom to top, plus the haze band that sells distance. */
  readonly skyLow: Tone
  readonly skyHigh: Tone
  readonly haze: Tone
  readonly floorNear: Tone
  readonly floorFar: Tone
  readonly wallNear: Tone
  readonly wallFar: Tone
  readonly ceilingNear: Tone
  readonly ceilingFar: Tone
  readonly coverTop: Tone
  readonly coverBottom: Tone
  readonly coverRim: Tone
  readonly skyline: Tone
  /** Colour the fog pulls everything towards with distance. */
  readonly fog: Tone
  /** 0 to 1. */
  readonly rain: number
  /** Strength of the light shafts from the far opening, 0 to 1. */
  readonly shafts: number
}

const DUSK: Mood = {
  name: 'dusk',
  skyLow: [0.42, 0.34, 0.32],
  skyHigh: [0.13, 0.18, 0.30],
  haze: [0.52, 0.40, 0.34],
  floorNear: [0.050, 0.055, 0.070],
  floorFar: [0.20, 0.19, 0.22],
  wallNear: [0.034, 0.038, 0.052],
  wallFar: [0.15, 0.15, 0.19],
  ceilingNear: [0.024, 0.028, 0.040],
  ceilingFar: [0.10, 0.11, 0.15],
  coverTop: [0.085, 0.085, 0.105],
  coverBottom: [0.018, 0.020, 0.030],
  coverRim: [0.62, 0.52, 0.44],
  skyline: [0.055, 0.058, 0.080],
  fog: [0.16, 0.14, 0.16],
  rain: 0,
  shafts: 0.45,
}

const NIGHT: Mood = {
  name: 'night',
  skyLow: [0.10, 0.14, 0.22],
  skyHigh: [0.03, 0.05, 0.11],
  haze: [0.16, 0.22, 0.32],
  floorNear: [0.030, 0.038, 0.056],
  floorFar: [0.10, 0.13, 0.19],
  wallNear: [0.022, 0.028, 0.042],
  wallFar: [0.075, 0.095, 0.140],
  ceilingNear: [0.016, 0.020, 0.032],
  ceilingFar: [0.055, 0.070, 0.105],
  coverTop: [0.050, 0.060, 0.082],
  coverBottom: [0.010, 0.013, 0.022],
  coverRim: [0.38, 0.52, 0.68],
  skyline: [0.030, 0.038, 0.058],
  fog: [0.05, 0.07, 0.12],
  rain: 1,
  shafts: 0.18,
}

const SUNSET: Mood = {
  name: 'sunset',
  skyLow: [0.72, 0.42, 0.26],
  skyHigh: [0.18, 0.20, 0.34],
  haze: [0.86, 0.52, 0.30],
  floorNear: [0.060, 0.052, 0.056],
  floorFar: [0.28, 0.21, 0.20],
  wallNear: [0.042, 0.036, 0.042],
  wallFar: [0.21, 0.16, 0.17],
  ceilingNear: [0.030, 0.026, 0.034],
  ceilingFar: [0.14, 0.11, 0.13],
  coverTop: [0.10, 0.082, 0.086],
  coverBottom: [0.022, 0.018, 0.022],
  coverRim: [0.92, 0.62, 0.36],
  skyline: [0.070, 0.055, 0.062],
  fog: [0.26, 0.17, 0.16],
  rain: 0,
  shafts: 0.8,
}

const INDUSTRIAL: Mood = {
  name: 'industrial',
  skyLow: [0.30, 0.34, 0.30],
  skyHigh: [0.10, 0.13, 0.14],
  haze: [0.40, 0.44, 0.38],
  floorNear: [0.044, 0.050, 0.048],
  floorFar: [0.17, 0.19, 0.17],
  wallNear: [0.030, 0.036, 0.034],
  wallFar: [0.13, 0.15, 0.13],
  ceilingNear: [0.022, 0.026, 0.026],
  ceilingFar: [0.090, 0.100, 0.095],
  coverTop: [0.078, 0.086, 0.080],
  coverBottom: [0.016, 0.019, 0.018],
  coverRim: [0.56, 0.66, 0.52],
  skyline: [0.048, 0.054, 0.050],
  fog: [0.13, 0.15, 0.13],
  rain: 0,
  shafts: 0.6,
}

export const MOODS: readonly Mood[] = [DUSK, NIGHT, SUNSET, INDUSTRIAL]
export const DEFAULT_MOOD = DUSK

const KEYWORDS: ReadonlyArray<readonly [Mood, readonly string[]]> = [
  [NIGHT, ['night', 'notte', 'notturn', 'rain', 'pioggia', 'storm', 'tempesta', 'temporale', 'dark', 'buio', 'moon', 'luna']],
  [SUNSET, ['sunset', 'tramonto', 'dusk light', 'golden', 'dorat', 'evening', 'sera', 'alba', 'dawn', 'desert', 'deserto']],
  [INDUSTRIAL, ['industrial', 'industriale', 'factory', 'fabbrica', 'warehouse', 'magazzino', 'metal', 'metallo', 'pipe', 'tubo', 'concrete', 'cemento', 'bunker']],
]

/** First match wins, and the order above is the priority. */
export function moodFor(text: string): Mood {
  const t = text.toLowerCase()
  for (const [mood, words] of KEYWORDS) {
    for (const w of words) if (t.includes(w)) return mood
  }
  return DEFAULT_MOOD
}
