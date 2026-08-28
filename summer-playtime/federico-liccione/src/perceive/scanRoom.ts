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
  /** Grid the depth model and the geometry work on. */
  readonly width?: number
  readonly height?: number
  /**
   * Grid the level art is captured on, independent of the one above.
   *
   * They used to be the same number, which was a mistake: each occluder's texture
   * is a sub-rectangle of the frame — often barely a hundred pixels across —
   * stretched over a large part of the screen. Depth needs no more than 320; the
   * picture needs everything the camera will give.
   */
  readonly textureWidth?: number
  readonly textureHeight?: number
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
  const texW = input.textureWidth ?? Math.max(width, input.video.videoWidth || 640)
  const texH = input.textureHeight ?? Math.max(height, input.video.videoHeight || 480)
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

  // A second, larger capture purely for the level art.
  const fullCanvas = document.createElement('canvas')
  fullCanvas.width = texW
  fullCanvas.height = texH
  const fullCtx = fullCanvas.getContext('2d', { willReadFrequently: true })
  fullCtx?.drawImage(input.video, 0, 0, texW, texH)

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
  textureCanvas.width = texW
  textureCanvas.height = texH
  const tctx = textureCanvas.getContext('2d')
  if (tctx && fullCtx) {
    // The mask is resampled up to the art's resolution: UV rects are normalised,
    // so the two grids only have to agree in proportion, not in pixels.
    const maskFull = segmenter.run(fullCanvas, texW, texH)
    const orientedFull = orientMask(
      { width: texW, height: texH, values: upsample(oriented.values, oriented.width, oriented.height, texW, texH) },
      maskFull,
    )
    const source = fullCtx.getImageData(0, 0, texW, texH).data
    const cleaned = removePerson(source, orientedFull)
    tctx.putImageData(new ImageData(cleaned, texW, texH), 0, 0)
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

/** Nearest-neighbour upsample of a single-channel field. */
function upsample(
  src: Float32Array,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): Float32Array {
  const out = new Float32Array(dw * dh)
  for (let v = 0; v < dh; v++) {
    const sv = Math.min(sh - 1, Math.floor((v * sh) / dh))
    for (let u = 0; u < dw; u++) {
      const su = Math.min(sw - 1, Math.floor((u * sw) / dw))
      out[v * dw + u] = src[sv * sw + su] ?? 0
    }
  }
  return out
}
