/**
 * Puts the perception assets on disk so the app never needs a CDN at runtime.
 *
 * This is not tidiness. The demo will be shown in a room whose wifi is unknown,
 * and a level generator that waits on jsdelivr is a level generator that fails
 * in front of an audience. The WASM comes out of the pinned npm package, so it
 * cannot drift from the JS that loads it; the model is downloaded once and left
 * out of git because it is 3.8 MB of weights.
 *
 *   node tools/setup-assets.mjs
 */
import { cp, mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const wasmFrom = join(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const wasmTo = join(root, 'public/mediapipe')
const modelDir = join(root, 'public/models')
const modelTo = join(modelDir, 'face_landmarker.task')

// Pinned to /1/ rather than /latest/ so the build is reproducible, knowing the
// upstream documentation now publishes `latest` and will drift from this.
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const SEGMENTER_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite'

/**
 * Depth Anything V2 small, as ONNX, served locally.
 *
 * fp16 rather than q4f16 despite the 50 MB against 19 MB: whether four-bit
 * quantisation degrades a depth *regression* head is unmeasured, and a wrong
 * depth field moves the furniture. The size is a one-off setup cost; a wrong
 * room is every round.
 */
const DEPTH_REPO = 'onnx-community/depth-anything-v2-small'
const DEPTH_FILES = [
  'config.json',
  'preprocessor_config.json',
  // fp16 for WebGPU, uint8 for the WASM fallback. Both, because transformers.js
  // picks the file from the dtype and a missing file is a hard failure — and the
  // WASM path is a real path here: Firefox on Linux has no WebGPU at all.
  'onnx/model_fp16.onnx',
  'onnx/model_quantized.onnx',
]

const exists = async (p) => stat(p).then(() => true, () => false)

if (!(await exists(wasmFrom))) {
  console.error('MediaPipe is not installed. Run npm install first.')
  process.exit(1)
}
await mkdir(wasmTo, { recursive: true })
await cp(wasmFrom, wasmTo, { recursive: true })
console.log(`wasm  -> public/mediapipe (from the pinned package, not a CDN)`)

await mkdir(modelDir, { recursive: true })
if (await exists(modelTo)) {
  const { size } = await stat(modelTo)
  console.log(`model -> already present (${(size / 1e6).toFixed(2)} MB)`)
} else {
  const res = await fetch(MODEL_URL)
  if (!res.ok) {
    console.error(`model download failed: HTTP ${res.status}`)
    process.exit(1)
  }
  await writeFile(modelTo, Buffer.from(await res.arrayBuffer()))
  const { size } = await stat(modelTo)
  console.log(`model -> public/models/face_landmarker.task (${(size / 1e6).toFixed(2)} MB)`)
}
async function fetchTo(url, dest, label) {
  if (await exists(dest)) {
    const { size } = await stat(dest)
    console.log(`${label} -> already present (${(size / 1e6).toFixed(2)} MB)`)
    return
  }
  await mkdir(dirname(dest), { recursive: true })
  const res = await fetch(url)
  if (!res.ok) {
    console.error(`${label} download failed: HTTP ${res.status}`)
    process.exit(1)
  }
  await writeFile(dest, Buffer.from(await res.arrayBuffer()))
  const { size } = await stat(dest)
  console.log(`${label} -> ${dest.replace(root + '/', '')} (${(size / 1e6).toFixed(2)} MB)`)
}

await fetchTo(SEGMENTER_URL, join(modelDir, 'selfie_segmenter.tflite'), 'segmenter')

// transformers.js resolves a local model id to <localModelPath>/<repo>/<file>.
for (const f of DEPTH_FILES) {
  await fetchTo(
    `https://huggingface.co/${DEPTH_REPO}/resolve/main/${f}`,
    join(root, 'public/models/transformers', DEPTH_REPO, f),
    `depth ${f}`,
  )
}

console.log('Done. The app now runs with no network at all.')
