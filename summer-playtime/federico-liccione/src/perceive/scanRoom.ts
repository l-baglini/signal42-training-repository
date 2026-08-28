/**
 * One scan, one room. SPEC §7.2.
 *
 * Two models run here and neither runs again until the furniture moves. That is
 * what makes a pipeline with seconds of latency free: it happens while the player
 * is reading the calibration prompt, not sixty times a second.
 *
 * Both models are lazily loaded and then kept, because the weights are 50 MB and
 * loading them twice would be the only slow thing in the game.
 */
import { buildRoomScan, maskCoverage, orientMask, removePerson } from './roomGeometry'
import type { CameraModel, ScanOutcome } from './roomGeometry'
import { loadDepthEstimator, type DepthEstimator } from './depthModel'
import { loadSegmenter, type PersonSegmenter } from './segmenter'

export interface ScanRoomInput {
  readonly video: HTMLVideoElement
  /** The tracker's metric estimate of the head. The one measured correspondence. */
  readonly headZcm: number
  /** The prior for the far wall. Moves difficulty, not fairness — SPEC §7.2. */
  readonly farWallCm: number
  readonly camera: CameraModel
  readonly width?: number
  readonly height?: number
  readonly onProgress?: (stage: string) => void
}

export interface ScanReport {
  readonly outcome: ScanOutcome
  readonly device: string
  readonly dtype: string
  /** Wall-clock of the scan itself, excluding the one-off model load. */
  readonly ms: number
  /** Wall-clock of loading the weights. Zero on every scan after the first. */
  readonly loadMs: number
  /** The frame it captured, so the semantic pass can annotate the same pixels. */
  readonly canvas: HTMLCanvasElement | null
  /** The same frame with the player smeared out, for use as level art. */
  readonly textureCanvas: HTMLCanvasElement | null
  /** Diagnostics, surfaced in the UI: guessing at these once was enough. */
  readonly maskCoverage: number
  readonly maskFlipped: boolean
}

let estimator: DepthEstimator | null = null
let segmenter: PersonSegmenter | null = null

export async function scanRoom(input: ScanRoomInput): Promise<ScanReport> {
  const width = input.width ?? 320
  const height = input.height ?? 240
  const progress = input.onProgress ?? (() => {})

  let loadMs = 0
  if (!estimator || !segmenter) {
    progress('loading the models')
    const t0 = performance.now()
    const [d, s] = await Promise.all([
      estimator ? Promise.resolve(estimator) : loadDepthEstimator(),
      segmenter ? Promise.resolve(segmenter) : loadSegmenter(),
    ])
    estimator = d
    segmenter = s
    loadMs = performance.now() - t0
  }

  const t1 = performance.now()
  progress('capturing the frame')
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    return {
      outcome: { ok: false, reason: 'no 2d context to capture the frame' },
      device: estimator.device,
      dtype: estimator.dtype,
      ms: 0,
      loadMs,
      canvas: null,
      textureCanvas: null,
      maskCoverage: 0,
      maskFlipped: false,
    }
  }
  ctx.drawImage(input.video, 0, 0, width, height)
  const rgba = ctx.getImageData(0, 0, width, height).data

  progress('finding the person')
  const mask = segmenter.run(canvas, width, height)

  progress('estimating depth')
  const depth = await estimator.run(canvas)

  // The depth field may come back on the model's own grid; the mask is built at
  // the capture grid. Resample rather than silently misaligning them.
  const aligned =
    depth.width === width && depth.height === height
      ? mask
      : segmenter.run(canvas, depth.width, depth.height)
  // Orient before anything reads it, so the texture and the geometry agree about
  // which pixels are the player.
  const oriented = orientMask(depth, aligned)
  const flipped = oriented.values !== aligned.values

  progress('fitting the room')
  const outcome = buildRoomScan({
    depth,
    mask: oriented,
    rgba,
    headZcm: input.headZcm,
    farWallCm: input.farWallCm,
    camera: input.camera,
    model: `depth-anything-v2-small/${estimator.dtype}`,
    atISO: new Date().toISOString(),
    costCents: 0,
  })

  /**
   * The level art is the frame with the player smeared out. Excluding them from
   * the depth fitting was not enough: an occluder is a bounding box, and the wall
   * behind a seated person surrounds them, so its box spans the frame and its
   * texture was the whole frame, face included.
   */
  const textureCanvas = document.createElement('canvas')
  textureCanvas.width = depth.width
  textureCanvas.height = depth.height
  const tctx = textureCanvas.getContext('2d')
  if (tctx) {
    const source =
      depth.width === width && depth.height === height
        ? rgba
        : (() => {
            const scaled = document.createElement('canvas')
            scaled.width = depth.width
            scaled.height = depth.height
            scaled.getContext('2d')?.drawImage(canvas, 0, 0, depth.width, depth.height)
            return scaled.getContext('2d')?.getImageData(0, 0, depth.width, depth.height).data
              ?? rgba
          })()
    const cleaned = removePerson(source, oriented)
    tctx.putImageData(new ImageData(cleaned, depth.width, depth.height), 0, 0)
  }

  return {
    outcome,
    device: estimator.device,
    dtype: estimator.dtype,
    ms: performance.now() - t1,
    loadMs,
    canvas,
    textureCanvas: tctx ? textureCanvas : null,
    maskCoverage: maskCoverage(oriented),
    maskFlipped: flipped,
  }
}
