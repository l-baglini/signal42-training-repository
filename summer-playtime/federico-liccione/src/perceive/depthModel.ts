/**
 * Monocular depth, client-side, once per room. SPEC §7.2 and §7.6.
 *
 * Everything here is plumbing. The arithmetic that turns the output into
 * furniture lives in `roomGeometry.ts`, which is pure and tested; this file only
 * loads a model and hands over a Float32Array.
 *
 * Served entirely from disk: `tools/setup-assets.mjs` puts the weights in
 * `public/`, and remote models are switched off, so a room scan works with the
 * venue's wifi unplugged.
 */
import { env, pipeline } from '@huggingface/transformers'
import type { DepthField } from './roomGeometry'

const MODEL_ID = 'onnx-community/depth-anything-v2-small'

env.allowRemoteModels = false
env.allowLocalModels = true
env.localModelPath = '/models/transformers/'

export type DepthDevice = 'webgpu' | 'wasm'
export type DepthDtype = 'fp16' | 'q8'

export interface DepthEstimator {
  readonly device: DepthDevice
  readonly dtype: DepthDtype
  /** Runs the model. The returned field is at the canvas's own resolution. */
  run(canvas: HTMLCanvasElement): Promise<DepthField>
}

/**
 * Pick a backend. WebGPU when it exists and reports `shader-f16`; WASM
 * otherwise, with the uint8 weights that path is built for.
 *
 * The fallback is not a courtesy. WebGPU ships by default in Chrome, Edge and
 * Safari 26, and in Firefox only on Windows and Apple Silicon — not on Linux,
 * which is the development machine for this project.
 */
export async function pickBackend(): Promise<{ device: DepthDevice; dtype: DepthDtype }> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
  if (!gpu) return { device: 'wasm', dtype: 'q8' }
  try {
    const adapter = (await gpu.requestAdapter()) as { features?: Set<string> } | null
    if (!adapter) return { device: 'wasm', dtype: 'q8' }
    if (!adapter.features?.has('shader-f16')) return { device: 'wasm', dtype: 'q8' }
    return { device: 'webgpu', dtype: 'fp16' }
  } catch {
    return { device: 'wasm', dtype: 'q8' }
  }
}

export async function loadDepthEstimator(): Promise<DepthEstimator> {
  const { device, dtype } = await pickBackend()
  const pipe = await pipeline('depth-estimation', MODEL_ID, { device, dtype })

  return {
    device,
    dtype,
    async run(canvas: HTMLCanvasElement): Promise<DepthField> {
      const result = (await pipe(canvas)) as unknown
      const first = Array.isArray(result) ? result[0] : result
      const tensor = (first as { predicted_depth?: { data: unknown; dims: number[] } })
        ?.predicted_depth
      if (!tensor) throw new Error('the depth model returned no predicted_depth')

      // Raw predicted_depth, never the library's convenience image: that one is
      // min-max normalised per frame across the whole frame, so a face 40 cm from
      // the lens owns the top of the range and compresses the room into a sliver.
      const data = tensor.data as Float32Array
      const dims = tensor.dims
      const height = dims[dims.length - 2] ?? canvas.height
      const width = dims[dims.length - 1] ?? canvas.width
      if (data.length < width * height) {
        throw new Error(`depth tensor is ${data.length} for ${width}x${height}`)
      }
      return { width, height, values: data instanceof Float32Array ? data : new Float32Array(data) }
    },
  }
}
