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
 *
 * **The look is flat and bright on purpose.** An earlier version of this file was
 * a backlit palette: near-black cover against a hazy sky, with light shafts,
 * grain and heavy aerial perspective. It photographed well and played badly — a
 * playtester's verdict was "confonde e basta". Depth cues that work by *washing
 * colour out* fight the one thing this game asks the eye to do, which is decide
 * in a glance whether an enemy is exposed. So distance is now carried by a hard
 * checkered floor and by perspective alone, and every surface is a flat,
 * saturated tone with a hard edge — the Minecraft/Geometry Dash reading, where
 * a face is one colour and the shading is which face you are looking at.
 */

export type Tone = readonly [number, number, number]

export interface Mood {
  readonly name: string
  /** Sky below and above the band change. Two flat tones, hard-ish horizon. */
  readonly skyLow: Tone
  readonly skyHigh: Tone
  /** Blocky clouds standing in the sky. */
  readonly cloud: Tone
  /** The two tones of the checkered floor. Distance comes from these. */
  readonly floorA: Tone
  readonly floorB: Tone
  /** Side walls: a flat body and a brighter cap along the top. */
  readonly wall: Tone
  readonly wallCap: Tone
  /**
   * The four tones of a block. Ordered by which way a face points, the way a
   * voxel game shades: top brightest, front in the middle, side dark, plus one
   * bright line around the outline so the block has an edge.
   */
  readonly blockTop: Tone
  readonly blockFace: Tone
  readonly blockSide: Tone
  readonly blockEdge: Tone
  /** The dark patch where a block meets the floor. Flat, hard-edged. */
  readonly shadow: Tone
  /** Colour distance pulls towards. Kept weak — it is a hint, not a wash. */
  readonly fog: Tone
  /** 0 to 1. */
  readonly rain: number
}

const DAY: Mood = {
  name: 'day',
  skyLow: [0.62, 0.82, 0.97],
  skyHigh: [0.29, 0.57, 0.92],
  cloud: [0.97, 0.98, 1.0],
  floorA: [0.42, 0.66, 0.33],
  floorB: [0.34, 0.57, 0.28],
  wall: [0.78, 0.68, 0.48],
  wallCap: [0.92, 0.84, 0.62],
  blockTop: [0.68, 0.74, 0.82],
  blockFace: [0.44, 0.50, 0.60],
  blockSide: [0.24, 0.28, 0.36],
  blockEdge: [0.88, 0.93, 1.0],
  shadow: [0.20, 0.32, 0.18],
  fog: [0.68, 0.80, 0.94],
  rain: 0,
}

const DUSK: Mood = {
  name: 'dusk',
  skyLow: [0.98, 0.62, 0.36],
  skyHigh: [0.32, 0.26, 0.56],
  cloud: [0.86, 0.58, 0.62],
  floorA: [0.30, 0.28, 0.42],
  floorB: [0.24, 0.22, 0.35],
  wall: [0.46, 0.32, 0.42],
  wallCap: [0.86, 0.52, 0.44],
  blockTop: [0.74, 0.60, 0.52],
  blockFace: [0.46, 0.36, 0.36],
  blockSide: [0.24, 0.19, 0.22],
  blockEdge: [1.0, 0.82, 0.58],
  shadow: [0.15, 0.13, 0.22],
  fog: [0.52, 0.40, 0.46],
  rain: 0,
}

/**
 * The Geometry Dash reading: a black playfield, saturated edges, everything
 * legible by outline rather than by light.
 */
const NEON: Mood = {
  name: 'neon',
  skyLow: [0.42, 0.10, 0.52],
  skyHigh: [0.09, 0.06, 0.22],
  cloud: [0.62, 0.24, 0.66],
  floorA: [0.13, 0.11, 0.22],
  floorB: [0.09, 0.08, 0.17],
  wall: [0.16, 0.13, 0.26],
  wallCap: [0.20, 0.90, 0.92],
  blockTop: [0.34, 0.32, 0.50],
  blockFace: [0.19, 0.18, 0.32],
  blockSide: [0.10, 0.09, 0.18],
  blockEdge: [0.30, 0.98, 0.98],
  shadow: [0.05, 0.04, 0.10],
  fog: [0.18, 0.10, 0.28],
  rain: 0,
}

const NIGHT: Mood = {
  name: 'night',
  skyLow: [0.20, 0.28, 0.44],
  skyHigh: [0.06, 0.09, 0.20],
  cloud: [0.34, 0.40, 0.55],
  floorA: [0.20, 0.24, 0.32],
  floorB: [0.16, 0.19, 0.27],
  wall: [0.22, 0.26, 0.36],
  wallCap: [0.52, 0.62, 0.80],
  blockTop: [0.52, 0.60, 0.72],
  blockFace: [0.30, 0.36, 0.46],
  blockSide: [0.15, 0.18, 0.25],
  blockEdge: [0.74, 0.86, 1.0],
  shadow: [0.09, 0.11, 0.16],
  fog: [0.22, 0.28, 0.40],
  rain: 0.7,
}

const INDUSTRIAL: Mood = {
  name: 'industrial',
  skyLow: [0.74, 0.76, 0.70],
  skyHigh: [0.42, 0.48, 0.50],
  cloud: [0.88, 0.89, 0.86],
  floorA: [0.36, 0.37, 0.36],
  floorB: [0.29, 0.30, 0.30],
  wall: [0.52, 0.50, 0.44],
  wallCap: [0.86, 0.72, 0.24],
  blockTop: [0.72, 0.70, 0.62],
  blockFace: [0.46, 0.45, 0.41],
  blockSide: [0.24, 0.24, 0.23],
  blockEdge: [0.98, 0.84, 0.34],
  shadow: [0.17, 0.17, 0.17],
  fog: [0.60, 0.62, 0.60],
  rain: 0,
}

export const MOODS: readonly Mood[] = [DAY, DUSK, NEON, NIGHT, INDUSTRIAL]
export const DEFAULT_MOOD = DAY

const KEYWORDS: ReadonlyArray<readonly [Mood, readonly string[]]> = [
  [NEON, ['neon', 'cyber', 'arcade', 'synth', 'laser', 'grid', 'griglia', 'viola', 'purple', 'club', 'disco']],
  [NIGHT, ['night', 'notte', 'notturn', 'rain', 'pioggia', 'storm', 'tempesta', 'temporale', 'dark', 'buio', 'moon', 'luna']],
  [DUSK, ['sunset', 'tramonto', 'dusk', 'crepuscol', 'golden', 'dorat', 'evening', 'sera', 'alba', 'dawn', 'desert', 'deserto']],
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
