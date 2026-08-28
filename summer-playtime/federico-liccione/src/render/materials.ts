/**
 * Procedural materials. No asset files, one texture.
 *
 * Every material fills its rectangle completely and is fully opaque. That is not
 * an aesthetic choice, it is the one rule the art is not allowed to break: the
 * sightline solver reasons about rectangles, so a rock silhouette with
 * transparent corners would show the player a gap the engine believes is solid —
 * which is the point-versus-extent fault that has already cost this project three
 * bugs. The picture may stylise the rectangle; it may not shrink it.
 *
 * The style follows from that constraint rather than fighting it: chiselled blocks,
 * jambs, panels and slabs, lit from above, layered by depth. A paper theatre made
 * of stone.
 */

export type MaterialName =
  | 'stone'
  | 'wood'
  | 'brick'
  | 'metal'
  | 'moss'
  | 'concrete'
  | 'crate'
  | 'glass'

export const MATERIALS: readonly MaterialName[] = [
  'stone', 'wood', 'brick', 'metal', 'moss', 'concrete', 'crate', 'glass',
]

/** 4x2 tiles of 256 px. One texture, one sampler, no atlas bookkeeping beyond this. */
export const ATLAS = { cols: 4, rows: 2, tile: 256 } as const

export interface UvRectLike {
  readonly u0: number
  readonly v0: number
  readonly u1: number
  readonly v1: number
}

/** Where a material lives in the atlas, in normalised coordinates. */
export function materialUv(name: MaterialName): UvRectLike {
  const i = Math.max(0, MATERIALS.indexOf(name))
  const col = i % ATLAS.cols
  const row = Math.floor(i / ATLAS.cols)
  // Inset by half a pixel so bilinear filtering cannot bleed between tiles.
  const eps = 0.5 / (ATLAS.cols * ATLAS.tile)
  return {
    u0: col / ATLAS.cols + eps,
    v0: row / ATLAS.rows + eps,
    u1: (col + 1) / ATLAS.cols - eps,
    v1: (row + 1) / ATLAS.rows - eps,
  }
}

/**
 * Guess a material from whatever the thing is called.
 *
 * The labels come from three places — hand-authored levels, the vision model
 * naming a scanned room, and the language model laying one out — and this is where
 * that naming turns into art direction. Both English and Italian, because the
 * playtesting has been in Italian and a model asked in Italian answers in it.
 */
const KEYWORDS: ReadonlyArray<readonly [MaterialName, readonly string[]]> = [
  ['glass', ['window', 'finestra', 'glass', 'vetro', 'screen', 'schermo', 'monitor', 'mirror', 'specchio']],
  ['wood', ['door', 'porta', 'jamb', 'stipite', 'wood', 'legno', 'shelf', 'scaffale', 'desk', 'scrivania', 'table', 'tavolo', 'chair', 'sedia', 'frame', 'cornice']],
  ['moss', ['tree', 'albero', 'bush', 'cespuglio', 'plant', 'pianta', 'hedge', 'siepe', 'moss', 'muschio', 'foliage', 'fogliame']],
  ['brick', ['brick', 'mattone', 'wall', 'muro', 'muretto', 'parapet', 'parapetto', 'partition', 'parete']],
  ['metal', ['metal', 'metallo', 'locker', 'armadietto', 'pipe', 'tubo', 'machine', 'macchina', 'appliance', 'radiator', 'radiatore']],
  ['crate', ['crate', 'cassa', 'box', 'scatola', 'container', 'baule', 'chest']],
  ['stone', ['rock', 'roccia', 'sasso', 'stone', 'pietra', 'pillar', 'pilastro', 'colonna', 'column', 'boulder', 'masso', 'statue', 'statua']],
  ['concrete', ['concrete', 'cemento', 'block', 'blocco', 'slab', 'lastra', 'barrier', 'barriera', 'lintel', 'architrave']],
]

export function materialFor(label: string, fallback: MaterialName = 'concrete'): MaterialName {
  const l = label.toLowerCase()
  for (const [name, words] of KEYWORDS) {
    for (const w of words) if (l.includes(w)) return name
  }
  return fallback
}

/* ------------------------------------------------------- generating them ---- */

/** Deterministic value noise. Same texture every run, which keeps screenshots honest. */
function makeNoise(seed: number): (x: number, y: number) => number {
  const size = 256
  const grid = new Float32Array(size * size)
  let s = seed >>> 0
  for (let i = 0; i < grid.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0
    grid[i] = s / 4294967296
  }
  const at = (x: number, y: number) => grid[(y & 255) * size + (x & 255)]!
  return (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const tx = x - xi
    const ty = y - yi
    const sx = tx * tx * (3 - 2 * tx)
    const sy = ty * ty * (3 - 2 * ty)
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * sx
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * sx
    return a + (b - a) * sy
  }
}

function fbm(noise: (x: number, y: number) => number, x: number, y: number, octaves = 4): number {
  let v = 0
  let amp = 0.5
  let f = 1
  for (let i = 0; i < octaves; i++) {
    v += noise(x * f, y * f) * amp
    f *= 2
    amp *= 0.5
  }
  return v
}

type Rgb = [number, number, number]
const lerp = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

interface Recipe {
  readonly dark: Rgb
  readonly light: Rgb
  /** Noise frequency: low is broad and cloudy, high is grainy. */
  readonly grain: number
  /** How strongly to draw horizontal courses, as for brick or planks. */
  readonly courses: number
  readonly courseHeight: number
  /** Vertical joints per course. 0 for none, as in planks. */
  readonly joints: number
  readonly seed: number
}

const RECIPES: Record<MaterialName, Recipe> = {
  stone:    { dark: [58, 60, 66],  light: [128, 130, 136], grain: 5,  courses: 0.35, courseHeight: 64, joints: 3, seed: 11 },
  wood:     { dark: [74, 48, 30],  light: [150, 102, 58],  grain: 22, courses: 0.55, courseHeight: 42, joints: 0, seed: 23 },
  brick:    { dark: [78, 40, 36],  light: [146, 78, 62],   grain: 8,  courses: 0.7,  courseHeight: 32, joints: 4, seed: 37 },
  metal:    { dark: [52, 58, 66],  light: [126, 138, 150], grain: 30, courses: 0.25, courseHeight: 86, joints: 0, seed: 41 },
  moss:     { dark: [30, 52, 34],  light: [86, 122, 66],   grain: 3,  courses: 0,    courseHeight: 1,  joints: 0, seed: 53 },
  concrete: { dark: [70, 72, 76],  light: [122, 124, 128], grain: 4,  courses: 0.18, courseHeight: 110, joints: 2, seed: 67 },
  crate:    { dark: [82, 62, 38],  light: [156, 120, 72],  grain: 14, courses: 0.6,  courseHeight: 52, joints: 2, seed: 71 },
  glass:    { dark: [46, 66, 84],  light: [138, 176, 200], grain: 2,  courses: 0.3,  courseHeight: 96, joints: 3, seed: 83 },
}

/**
 * Draw one tile.
 *
 * A bevel runs round the edge — lighter at the top, darker at the bottom — so a
 * rectangle reads as a solid block lit from above rather than as a flat swatch.
 * That is what turns the constraint into a look: the shape stays a rectangle and
 * announces itself as a *deliberate* one.
 */
function drawTile(ctx: CanvasRenderingContext2D, x0: number, y0: number, size: number, r: Recipe): void {
  const noise = makeNoise(r.seed)
  const img = ctx.createImageData(size, size)
  const d = img.data
  const bevel = Math.max(3, Math.round(size * 0.055))

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(noise, (x / size) * r.grain, (y / size) * r.grain)
      let t = Math.max(0, Math.min(1, n))

      // Courses and joints: the mortar lines that make masonry legible.
      if (r.courses > 0) {
        const row = Math.floor(y / r.courseHeight)
        const inCourse = y % r.courseHeight
        const near = inCourse < 2 || inCourse > r.courseHeight - 3
        let joint = near
        if (r.joints > 0) {
          const stagger = (row % 2) * (size / r.joints / 2)
          const jx = (x + stagger) % (size / r.joints)
          if (jx < 2) joint = true
        }
        if (joint) t *= 1 - r.courses
      }

      let c = lerp(r.dark, r.light, t)

      // The bevel, applied last so it survives the noise.
      const edge = Math.min(x, y, size - 1 - x, size - 1 - y)
      if (edge < bevel) {
        const k = 1 - edge / bevel
        const fromTop = y < bevel && y <= x && y <= size - 1 - x
        const fromBottom = y > size - 1 - bevel && size - 1 - y <= x && size - 1 - y <= size - 1 - x
        const gain = fromTop ? 1 + 0.45 * k : fromBottom ? 1 - 0.5 * k : 1 - 0.22 * k
        c = [c[0] * gain, c[1] * gain, c[2] * gain]
      }

      const i = (y * size + x) * 4
      d[i] = Math.max(0, Math.min(255, c[0]))
      d[i + 1] = Math.max(0, Math.min(255, c[1]))
      d[i + 2] = Math.max(0, Math.min(255, c[2]))
      d[i + 3] = 255
    }
  }
  ctx.putImageData(img, x0, y0)
}

/** Build the atlas. Called once; the canvas is uploaded as the room texture. */
export function buildMaterialAtlas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = ATLAS.cols * ATLAS.tile
  canvas.height = ATLAS.rows * ATLAS.tile
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  MATERIALS.forEach((name, i) => {
    const col = i % ATLAS.cols
    const row = Math.floor(i / ATLAS.cols)
    drawTile(ctx, col * ATLAS.tile, row * ATLAS.tile, ATLAS.tile, RECIPES[name])
  })
  return canvas
}
