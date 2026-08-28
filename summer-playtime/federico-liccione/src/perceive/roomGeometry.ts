/**
 * From a monocular depth field to the room, in centimetres. SPEC §7.2.
 *
 * Pure by design: everything here takes plain arrays and returns plain data, so
 * the arithmetic that decides where the furniture is can be tested against
 * synthetic scenes without a camera, a model or a browser. The model plumbing
 * that produces the arrays is glue and lives elsewhere.
 *
 * The frame of reference needs stating, because it is not obvious. The webcam
 * sits at the screen and looks *at* the player, so the room it sees is the room
 * **behind** them — while the game's scene lives beyond the screen, in front of
 * them. The mapping therefore reflects the room through the player: something
 * 40 cm behind your head becomes an occluder 40 cm beyond the screen. That is a
 * conceit to state rather than a bug to hide, and it lands the geometry in
 * exactly the depth range the hand-authored fixture uses.
 */
import type { Billboard, Point3, RoomScan } from '../engine'

export interface DepthField {
  readonly width: number
  readonly height: number
  /** Raw model output: affine-invariant inverse depth. Larger means nearer. */
  readonly values: Float32Array
}

export interface PersonMask {
  readonly width: number
  readonly height: number
  /** Probability in 0..1 that the pixel is the player. */
  readonly values: Float32Array
}

export interface CameraModel {
  readonly fovDeg: number
  /** Where the player's eye is, from the tracker. cm. */
  readonly playerZcm: number
  /** How far the webcam sits above the centre of the drawing area. cm. */
  readonly aboveCentreCm: number
  readonly flipX: boolean
}

export const DEFAULT_CAMERA: CameraModel = {
  fovDeg: 60,
  playerZcm: 60,
  aboveCentreCm: 12,
  flipX: false,
}

/* ----------------------------------------------------------------- mask ---- */

/**
 * Make sure the mask marks the person and not the background.
 *
 * A playtester scanned a room and got their own face, three metres tall, as the
 * level. The segmenter had returned the mask the other way round: the background
 * was marked "person", so the room was excluded and the player kept — and a
 * near-field billboard textured with a face is both unplayable and very funny.
 *
 * The fix is not to guess which convention the model uses. It is to check the
 * mask against the one thing that is certainly true of a webcam pointed at
 * somebody: **the person is the nearest thing in the frame.** Depth is the model
 * output, where larger means nearer, so whichever side of the mask is nearer is
 * the person, and the mask is flipped when it disagrees.
 *
 * The earlier guard — invert when more than four fifths of the frame reads as
 * person — could not catch this, because a face fills perhaps half a frame and
 * the background the rest. It is kept in the segmenter as a cheap second line.
 */
export function orientMask(depth: DepthField, mask: PersonMask, threshold = 0.6): PersonMask {
  if (depth.width !== mask.width || depth.height !== mask.height) return mask
  let inSum = 0
  let inCount = 0
  let outSum = 0
  let outCount = 0
  for (let i = 0; i < depth.values.length; i += 4) {
    const d = depth.values[i]!
    if (!Number.isFinite(d)) continue
    if ((mask.values[i] ?? 0) >= threshold) {
      inSum += d
      inCount++
    } else {
      outSum += d
      outCount++
    }
  }
  // Not enough of either side to judge: leave it alone rather than gamble.
  if (inCount < 32 || outCount < 32) return mask
  if (inSum / inCount >= outSum / outCount) return mask

  const flipped = new Float32Array(mask.values.length)
  for (let i = 0; i < flipped.length; i++) flipped[i] = 1 - (mask.values[i] ?? 0)
  return { width: mask.width, height: mask.height, values: flipped }
}

/**
 * Smear the player out of the frame before it becomes level art.
 *
 * Excluding the person from the depth fitting is not enough, and a playtester
 * found out why: an occluder is a **bounding box**, and the wall behind a seated
 * person is one connected region that *surrounds* them — so its box spans the
 * whole frame, and its texture is the whole frame, face and all. The geometry was
 * right the entire time; the picture was not.
 *
 * The fill is a horizontal smear from the nearest non-person pixel on each row.
 * Crude, and far better than the alternatives: a black hole reads as a bug, and
 * anything cleverer is an inpainting model to solve a problem that is one row of
 * pixels wide.
 */
export function removePerson(
  rgba: Uint8ClampedArray | Uint8Array,
  mask: PersonMask,
  threshold = 0.55,
): Uint8ClampedArray {
  const { width, height, values } = mask
  const out = new Uint8ClampedArray(rgba.length)
  out.set(rgba)

  for (let v = 0; v < height; v++) {
    const row = v * width
    let u = 0
    while (u < width) {
      if ((values[row + u] ?? 0) < threshold) {
        u++
        continue
      }
      // Found a run of person pixels: [start, end).
      const start = u
      while (u < width && (values[row + u] ?? 0) >= threshold) u++
      const end = u

      const leftIdx = start - 1
      const rightIdx = end
      const hasLeft = leftIdx >= 0
      const hasRight = rightIdx < width
      for (let x = start; x < end; x++) {
        // Nearer edge wins, so a wall on one side does not stretch across a face.
        const from =
          hasLeft && (!hasRight || x - leftIdx <= rightIdx - x) ? leftIdx
          : hasRight ? rightIdx
          : hasLeft ? leftIdx
          : -1
        const dst = (row + x) * 4
        if (from < 0) {
          out[dst] = 12
          out[dst + 1] = 14
          out[dst + 2] = 20
          out[dst + 3] = 255
          continue
        }
        const src = (row + from) * 4
        out[dst] = rgba[src]!
        out[dst + 1] = rgba[src + 1]!
        out[dst + 2] = rgba[src + 2]!
        out[dst + 3] = 255
      }
    }
  }
  return out
}

/** How much of the frame the mask claims, for the diagnostics panel. */
export function maskCoverage(mask: PersonMask, threshold = 0.55): number {
  let n = 0
  for (const v of mask.values) if (v >= threshold) n++
  return mask.values.length === 0 ? 0 : n / mask.values.length
}

/* ---------------------------------------------------------------- scale ---- */

export interface ScaleFit {
  /** 1/Z = a*D + b, with Z in cm. */
  readonly a: number
  readonly b: number
  readonly headD: number
  readonly farD: number
}

export type ScaleResult = ScaleFit | { readonly error: string }

export const isFit = (r: ScaleResult): r is ScaleFit => !('error' in r)

/** Percentile of a subsampled array. Deterministic; no allocation storms. */
function percentileOf(values: Float32Array, keep: (i: number) => boolean, p: number): number | null {
  const sample: number[] = []
  for (let i = 0; i < values.length; i += 4) {
    if (!keep(i)) continue
    const v = values[i]!
    if (Number.isFinite(v)) sample.push(v)
  }
  if (sample.length < 16) return null
  sample.sort((x, y) => x - y)
  const k = Math.min(sample.length - 1, Math.max(0, Math.round(p * (sample.length - 1))))
  return sample[k]!
}

export interface ScaleOptions {
  /** Metric distance of the head, from the tracker's inter-pupillary estimate. */
  readonly headZcm: number
  /**
   * Assumed distance of the furthest surface. A **prior**, and the honest weak
   * point of this pipeline — see the note below.
   */
  readonly farWallCm: number
  /** Probability above which a pixel counts as the player. */
  readonly personThreshold?: number
}

/**
 * Solve the affine map from model output to centimetres.
 *
 * The spec planned to get the two correspondences this needs from two frames at
 * different head distances, using the calibration that already asks the player
 * to lean towards the camera. **That does not work**, and finding out why was the
 * most useful thing this module taught: the model's affine transform is unknown
 * *per image*, so two frames give two different unknown transforms rather than
 * two constraints on one. The correspondences have to come from a single frame.
 *
 * So: the head supplies one, measured, from the inter-pupillary distance. The
 * second is a stated prior about the furthest surface. What that costs is worth
 * being precise about — **it moves difficulty, not fairness.** Get the far wall
 * wrong and the room comes out shallower or deeper than it is, so the peek
 * windows are wider or narrower than intended; but the engine computes fairness
 * on whatever geometry it is handed, so every target it ships is still reachable
 * and still requires a real lean. The prior is exposed to the player for exactly
 * this reason.
 */
export function solveScale(
  depth: DepthField,
  mask: PersonMask,
  opts: ScaleOptions,
): ScaleResult {
  if (depth.width !== mask.width || depth.height !== mask.height) {
    return { error: 'depth and mask are different sizes' }
  }
  const threshold = opts.personThreshold ?? 0.6
  const isPerson = (i: number) => (mask.values[i] ?? 0) >= threshold

  // The head is the nearest part of the person, so the top of the mask is a
  // better sample than its median — a torso leaning back would bias it.
  const headD = percentileOf(depth.values, (i) => isPerson(i), 0.85)
  const farD = percentileOf(depth.values, (i) => !isPerson(i), 0.02)
  if (headD === null) return { error: 'no person found in the frame' }
  if (farD === null) return { error: 'no room found behind the person' }
  if (!(headD > farD)) return { error: 'the person is not nearer than the room' }

  const invHead = 1 / opts.headZcm
  const invFar = 1 / opts.farWallCm
  const a = (invHead - invFar) / (headD - farD)
  if (!(a > 0) || !Number.isFinite(a)) return { error: 'degenerate depth range' }
  const b = invHead - a * headD
  return { a, b, headD, farD }
}

/** Model output to centimetres from the camera. Infinity where it degenerates. */
export function depthToCm(fit: ScaleFit, d: number): number {
  const inv = fit.a * d + fit.b
  return inv > 1e-6 ? 1 / inv : Infinity
}

/* ------------------------------------------------------------ geometry ---- */

/** Pixel plus camera distance to a point in the game's world frame. */
export function unproject(
  u: number,
  v: number,
  cameraZcm: number,
  width: number,
  height: number,
  cam: CameraModel = DEFAULT_CAMERA,
): Point3 {
  const fpx = width / 2 / Math.tan((cam.fovDeg * Math.PI) / 360)
  return {
    x: (cam.flipX ? 1 : -1) * (((u - width / 2) * cameraZcm) / fpx),
    y: -(((v - height / 2) * cameraZcm) / fpx) + cam.aboveCentreCm,
    // Behind the player becomes beyond the screen. See the header. Normalised
    // away from negative zero, which is not 0 to Object.is and surprises
    // anything that compares geometry.
    z: cameraZcm > cam.playerZcm ? -(cameraZcm - cam.playerZcm) : 0,
  }
}

export interface Component {
  readonly pixels: number
  readonly u0: number
  readonly u1: number
  readonly v0: number
  readonly v1: number
}

/**
 * Connected components of a binary image, four-connected, iterative.
 *
 * Iterative rather than recursive on purpose: a 640x480 region is 300 000
 * pixels, and a recursive flood fill blows the stack on the first large wall it
 * meets.
 */
export function connectedComponents(
  binary: Uint8Array,
  width: number,
  height: number,
  minPixels = 200,
): Component[] {
  const seen = new Uint8Array(binary.length)
  const out: Component[] = []
  const stack: number[] = []

  for (let start = 0; start < binary.length; start++) {
    if (!binary[start] || seen[start]) continue
    let pixels = 0
    let u0 = width
    let u1 = -1
    let v0 = height
    let v1 = -1
    stack.length = 0
    stack.push(start)
    seen[start] = 1

    while (stack.length) {
      const i = stack.pop()!
      const u = i % width
      const v = (i - u) / width
      pixels++
      if (u < u0) u0 = u
      if (u > u1) u1 = u
      if (v < v0) v0 = v
      if (v > v1) v1 = v

      if (u > 0 && binary[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1) }
      if (u + 1 < width && binary[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1) }
      if (v > 0 && binary[i - width] && !seen[i - width]) { seen[i - width] = 1; stack.push(i - width) }
      if (v + 1 < height && binary[i + width] && !seen[i + width]) {
        seen[i + width] = 1
        stack.push(i + width)
      }
    }
    if (pixels >= minPixels) out.push({ pixels, u0, u1, v0, v1 })
  }
  return out
}

export interface FitOptions {
  readonly camera?: CameraModel
  /** How many depth bands the room is quantised into. */
  readonly bands?: number
  readonly maxOccluders?: number
  readonly minPixels?: number
  readonly personThreshold?: number
  /**
   * The playable depth band, in cm beyond the screen. The room's observed range
   * is fitted into this rather than used at true scale — see `fitBillboards`.
   */
  readonly nearestCm?: number
  readonly furthestCm?: number
  /** Set false to use true metric depth and accept that most rooms refuse. */
  readonly compressToBand?: boolean
}

const FIT_DEFAULTS = {
  bands: 6,
  maxOccluders: 12,
  minPixels: 900,
  personThreshold: 0.6,
  nearestCm: 34,
  furthestCm: 290,
  compressToBand: true,
} as const

/**
 * Reduce a depth field to a handful of screen-parallel rectangles.
 *
 * Quantise into depth bands, take the connected components of each band, and fit
 * a world-space rectangle to each. The result is a deliberate 2.5D
 * approximation — SPEC §5 and accepted weakness 2 — and the reason the sightline
 * solver can be exact rather than approximate.
 *
 * **The room's depth range is compressed into the playable band, not used at
 * true scale.** This is a decision with a cost and it was forced by a real scan:
 * mapping centimetres one-to-one, a real room refused with 129 of 180 candidates
 * unreachable. The reason is the leverage identity — the player's control over
 * where a sightline crosses an occluder is `(1 - s)`, so cover two and a half
 * metres away cannot be leaned around by any human at all, and a real room puts
 * its nearest surface metres behind the player's head rather than at arm's
 * length like the hand-authored fixture did.
 *
 * The compression is **monotone**, so every occlusion relationship the scan
 * observed is preserved exactly: what is in front of what, and therefore what
 * hides what, is untouched. What is lost is absolute distance — the scanned room
 * is a faithful account of its structure and a deliberate fiction about its
 * size. Fairness is unaffected, because the engine computes it on the geometry it
 * is handed, whatever that geometry means.
 */
export interface FittedRegion {
  readonly bill: Billboard
  /** Where it came from in the frame. Needed to number it for the semantic pass. */
  readonly box: Component
}

export function fitBillboards(
  depth: DepthField,
  mask: PersonMask,
  fit: ScaleFit,
  opts: FitOptions = {},
): Billboard[] {
  return fitRegions(depth, mask, fit, opts).map((r) => r.bill)
}

export function fitRegions(
  depth: DepthField,
  mask: PersonMask,
  fit: ScaleFit,
  opts: FitOptions = {},
): FittedRegion[] {
  const o = { ...FIT_DEFAULTS, ...opts }
  const cam = opts.camera ?? DEFAULT_CAMERA
  const { width, height, values } = depth

  const metric = new Float32Array(values.length)
  const usable = new Uint8Array(values.length)
  for (let i = 0; i < values.length; i++) {
    if ((mask.values[i] ?? 0) >= o.personThreshold) continue
    const zc = depthToCm(fit, values[i]!)
    // Behind the player's own plane, and not absurd. Beyond that, no judgement.
    if (!Number.isFinite(zc) || zc <= cam.playerZcm + 4 || zc > 3000) continue
    metric[i] = zc
    usable[i] = 1
  }

  // Percentiles rather than min and max: one speck of noise at the far end would
  // otherwise squash the whole room into the near half of the band.
  const sample: number[] = []
  for (let i = 0; i < metric.length; i += 4) if (usable[i]) sample.push(metric[i]!)
  if (sample.length < 64) return []
  sample.sort((a, b) => a - b)
  const at = (p: number) => sample[Math.min(sample.length - 1, Math.round(p * (sample.length - 1)))]!
  const nearMetric = at(0.05)
  const farMetric = at(0.95)
  const observedSpread = farMetric - nearMetric
  // A frame at one single distance has no relief to compress. Mapping it to the
  // near edge of the band would put a flat wall at arm's length; the middle is
  // the honest place for a scene with no depth in it.
  const degenerate = observedSpread < 2
  const spread = Math.max(1, observedSpread)

  const gameZ = new Float32Array(values.length)
  for (let i = 0; i < metric.length; i++) {
    if (!usable[i]) continue
    if (o.compressToBand) {
      const t = degenerate
        ? 0.5
        : Math.max(0, Math.min(1, (metric[i]! - nearMetric) / spread))
      gameZ[i] = -(o.nearestCm + t * (o.furthestCm - o.nearestCm))
    } else {
      const zg = -Math.max(0, metric[i]! - cam.playerZcm)
      if (-zg < o.nearestCm || -zg > o.furthestCm) {
        usable[i] = 0
        continue
      }
      gameZ[i] = zg
    }
  }

  const edges: number[] = []
  for (let k = 0; k <= o.bands; k++) {
    edges.push(-(o.nearestCm + ((o.furthestCm - o.nearestCm) * k) / o.bands))
  }

  const found: Array<{ bill: Billboard; box: Component; pixels: number }> = []
  for (let k = 0; k < o.bands; k++) {
    const hi = edges[k]!
    const lo = edges[k + 1]!
    const binary = new Uint8Array(values.length)
    let count = 0
    let zSum = 0
    for (let i = 0; i < values.length; i++) {
      if (!usable[i]) continue
      const z = gameZ[i]!
      // The last band has to include its own far edge, or the deepest pixels —
      // which land exactly on it after the compression — fall through and the
      // back wall of every room disappears. A test caught this.
      const inBand = k === o.bands - 1 ? z <= hi && z >= lo : z <= hi && z > lo
      if (inBand) {
        binary[i] = 1
        zSum += z
        count++
      }
    }
    if (count < o.minPixels) continue
    const bandZ = zSum / count

    for (const c of connectedComponents(binary, width, height, o.minPixels)) {
      // The rectangle is measured in the world, not in pixels: unproject its
      // corners at the band's own depth so the extents are centimetres.
      const cameraZ = cam.playerZcm - bandZ
      const p0 = unproject(c.u0, c.v1, cameraZ, width, height, cam)
      const p1 = unproject(c.u1, c.v0, cameraZ, width, height, cam)
      const x0 = Math.min(p0.x, p1.x)
      const x1 = Math.max(p0.x, p1.x)
      const y0 = Math.min(p0.y, p1.y)
      const y1 = Math.max(p0.y, p1.y)
      if (!(x1 > x0) || !(y1 > y0)) continue
      found.push({
        bill: { z: bandZ, x0, x1, y0, y1, label: `band-${k}` },
        box: c,
        pixels: c.pixels,
      })
    }
  }

  return found
    .sort((p, q) => q.pixels - p.pixels)
    .slice(0, o.maxOccluders)
    .map((f) => ({ bill: f.bill, box: f.box }))
}

/* -------------------------------------------------------------- bright ---- */

export interface BrightOptions {
  readonly camera?: CameraModel
  /** Luminance above which a pixel counts as blown out, 0..1. */
  readonly threshold?: number
  readonly minPixels?: number
  /** Depth to place the region at, when the depth there is unreliable. */
  readonly assumeCm?: number
}

/**
 * Blown-out regions of the frame, as no-spawn areas.
 *
 * A backlit window is the case that matters and it is doubly bad: the depth
 * model has nothing to work with there, and a player looking into it loses the
 * tracker. Both arguments point the same way, so the region is excluded from
 * play without needing the semantic pass to say so.
 */
export function brightRegions(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  opts: BrightOptions = {},
): Billboard[] {
  const threshold = opts.threshold ?? 0.93
  const minPixels = opts.minPixels ?? 1500
  const cam = opts.camera ?? DEFAULT_CAMERA
  const assumeCm = opts.assumeCm ?? 300

  const binary = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < binary.length; i++, p += 4) {
    const lum = (0.2126 * rgba[p]! + 0.7152 * rgba[p + 1]! + 0.0722 * rgba[p + 2]!) / 255
    if (lum >= threshold) binary[i] = 1
  }

  return connectedComponents(binary, width, height, minPixels).map((c) => {
    const cameraZ = cam.playerZcm + assumeCm
    const p0 = unproject(c.u0, c.v1, cameraZ, width, height, cam)
    const p1 = unproject(c.u1, c.v0, cameraZ, width, height, cam)
    return {
      z: -assumeCm,
      x0: Math.min(p0.x, p1.x),
      x1: Math.max(p0.x, p1.x),
      y0: Math.min(p0.y, p1.y),
      y1: Math.max(p0.y, p1.y),
      label: 'blown-out',
    }
  })
}

/* ------------------------------------------------------------- anchors ---- */

export interface AnchorOptions {
  readonly pitchCm?: number
  readonly depths?: readonly number[]
  readonly maxAnchors?: number
}

/**
 * Candidate target positions, proposed generously and filtered by nobody here.
 *
 * This is the division of labour the whole project rests on: perception proposes
 * where a target *could* go, and the engine alone decides which of those are
 * reachable, require a real lean, and have a window wide enough to hold. A
 * grid is the honest thing to hand over — it has no opinion.
 */
export function proposeAnchors(
  occluders: readonly Billboard[],
  opts: AnchorOptions = {},
): Point3[] {
  const pitch = opts.pitchCm ?? 12
  const maxAnchors = opts.maxAnchors ?? 180
  if (occluders.length === 0) return []

  let xMin = Infinity
  let xMax = -Infinity
  let yMin = Infinity
  let yMax = -Infinity
  let nearest = -Infinity
  for (const o of occluders) {
    xMin = Math.min(xMin, o.x0)
    xMax = Math.max(xMax, o.x1)
    yMin = Math.min(yMin, o.y0)
    yMax = Math.max(yMax, o.y1)
    nearest = Math.max(nearest, o.z)
  }
  // Widened, because a target has to be able to sit beside the cover as well as
  // behind it, and narrowed vertically to where a seated head can look.
  xMin -= 40
  xMax += 40
  yMin = Math.max(yMin - 20, -60)
  yMax = Math.min(yMax + 20, 60)

  /**
   * Depths chosen from the leverage identity rather than by taste. A target at
   * `z_t` behind cover at `z_o`, seen from `z_e`, leaves the player leverage
   * `1 - (z_o - z_e)/(z_t - z_e)`; solving for a wanted leverage gives
   * `z_t = z_e + (z_o - z_e)/(1 - L)`. These are L = 0.35, 0.5 and 0.62.
   */
  const eyeZ = 60
  const forLeverage = (L: number) => Math.round(eyeZ + (nearest - eyeZ) / (1 - L))
  const depths = opts.depths ?? [forLeverage(0.35), forLeverage(0.5), forLeverage(0.62)]
  const out: Point3[] = []
  for (const z of depths) {
    for (let y = yMin; y <= yMax; y += pitch * 1.6) {
      for (let x = xMin; x <= xMax; x += pitch) {
        out.push({ x: Math.round(x), y: Math.round(y), z: Math.round(z) })
        if (out.length >= maxAnchors) return out
      }
    }
  }
  return out
}

/* ---------------------------------------------------------------- scan ---- */

export interface ScanInput {
  readonly depth: DepthField
  readonly mask: PersonMask
  readonly rgba?: Uint8ClampedArray | Uint8Array
  readonly headZcm: number
  readonly farWallCm: number
  readonly camera?: CameraModel
  readonly model: string
  readonly atISO: string
  readonly costCents?: number
}

export type ScanOutcome =
  | {
      readonly ok: true
      readonly scan: RoomScan
      readonly fit: ScaleFit
      /** Frame boxes for each occluder, in scan order. For the semantic pass. */
      readonly regions: readonly Component[]
      readonly frameWidth: number
      readonly frameHeight: number
    }
  | { readonly ok: false; readonly reason: string }

/**
 * The whole pipeline, as one pure function. Refuses rather than guessing: a
 * frame with no person, no room behind them, or nothing that reads as cover
 * produces a stated reason, which the app shows and the engine never sees.
 */
export function buildRoomScan(input: ScanInput): ScanOutcome {
  // Before anything else: is this mask the person, or the room? See `orientMask`.
  const mask = orientMask(input.depth, input.mask)
  const fit = solveScale(input.depth, mask, {
    headZcm: input.headZcm,
    farWallCm: input.farWallCm,
  })
  if (!isFit(fit)) return { ok: false, reason: fit.error }

  const cam = input.camera ?? DEFAULT_CAMERA
  const all = fitRegions(input.depth, mask, fit, { camera: cam })

  /**
   * A surface covering most of the frame *with the room behind it* is not cover,
   * it is a blindfold: either the mask failed, or there is a hand over the lens.
   * It hides the whole level at once, so it goes here rather than to the engine —
   * the engine judges targets, and has no opinion about an occluder that makes
   * every target invisible simultaneously.
   *
   * The first version of this rule tested depth, and dropped the back wall of an
   * empty room along with the blindfold. Depth is the wrong discriminator, and
   * after the band compression it is not even absolute. What actually separates
   * the two is whether **anything is behind it**: a blindfold hides a room, a back
   * wall has nothing left to hide.
   */
  const frameArea = input.depth.width * input.depth.height
  const fitted = all.filter((f) => {
    const area = (f.box.u1 - f.box.u0 + 1) * (f.box.v1 - f.box.v0 + 1)
    if (area <= frameArea * 0.62) return true
    return !all.some((other) => other.bill.z < f.bill.z - 1)
  })
  if (fitted.length === 0) {
    return { ok: false, reason: 'nothing in this frame reads as cover' }
  }
  const occluders = fitted.map((f) => f.bill)

  const noSpawn = input.rgba
    ? brightRegions(input.rgba, input.depth.width, input.depth.height, { camera: cam })
    : []

  return {
    ok: true,
    fit,
    regions: fitted.map((f) => f.box),
    frameWidth: input.depth.width,
    frameHeight: input.depth.height,
    scan: {
      source: 'depth',
      occluders,
      anchors: proposeAnchors(occluders),
      noSpawn,
      provenance: {
        model: input.model,
        atISO: input.atISO,
        costCents: input.costCents ?? 0,
      },
    },
  }
}
