/**
 * Person segmentation. SPEC §7.2 and §7.6.
 *
 * Used to *exclude* the player when fitting room geometry — and never to mask
 * them out of the frame before inference. The backbone is a ViT with global
 * attention over patches, so a punched-out region is out of distribution and
 * perturbs the depth field outside the hole as well. Depth on the unmodified
 * frame, then exclude.
 */
import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'
import type { PersonMask } from './roomGeometry'
import { assetUrl } from './assets'

export interface SegmenterOptions {
  readonly wasmPath?: string
  readonly modelPath?: string
}

export interface PersonSegmenter {
  /** Mask at the requested resolution, resampled if the model's differs. */
  run(canvas: HTMLCanvasElement, width: number, height: number): PersonMask
  close(): void
}

export async function loadSegmenter(opts: SegmenterOptions = {}): Promise<PersonSegmenter> {
  const fileset = await FilesetResolver.forVisionTasks(opts.wasmPath ?? assetUrl('mediapipe'))
  const segmenter = await ImageSegmenter.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: opts.modelPath ?? assetUrl('models/selfie_segmenter.tflite'),
      delegate: 'GPU',
    },
    runningMode: 'IMAGE',
    outputConfidenceMasks: true,
    outputCategoryMask: false,
  })

  return {
    run(canvas, width, height): PersonMask {
      const result = segmenter.segment(canvas)
      const mask = result.confidenceMasks?.[0]
      if (!mask) {
        result.close?.()
        return { width, height, values: new Float32Array(width * height) }
      }
      const src = mask.getAsFloat32Array()
      const sw = mask.width
      const sh = mask.height

      // The mask's resolution is not documented as matching the input — the model
      // runs at 256x256 internally — so it is resampled rather than assumed to
      // align. Nearest neighbour is enough for a threshold.
      const out = new Float32Array(width * height)
      for (let v = 0; v < height; v++) {
        const sv = Math.min(sh - 1, Math.floor((v * sh) / height))
        for (let u = 0; u < width; u++) {
          const su = Math.min(sw - 1, Math.floor((u * sw) / width))
          out[v * width + u] = src[sv * sw + su] ?? 0
        }
      }
      result.close?.()

      /**
       * The single-class selfie model documents one mask, and the sane reading is
       * that it is the person. If more than four fifths of the frame comes back
       * "person" that reading is wrong, and inverting is far better than treating
       * the whole room as a body and finding no furniture at all.
       */
      let sum = 0
      for (const v of out) sum += v
      if (sum / out.length > 0.8) for (let i = 0; i < out.length; i++) out[i] = 1 - out[i]!

      return { width, height, values: out }
    },
    close(): void {
      segmenter.close()
    },
  }
}
