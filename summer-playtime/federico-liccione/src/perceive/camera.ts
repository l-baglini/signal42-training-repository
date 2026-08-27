/**
 * Head position from a plain webcam. SPEC §7.1.
 *
 * The only model that runs per frame. It produces the one signal the whole game
 * is built on, and it produces it in centimetres — the metric scale comes from
 * the inter-pupillary distance, which is ~6.3 cm in adults with small variance,
 * so pixels between the irises and a focal length give a distance.
 *
 * That same metric estimate is load-bearing twice: it positions the camera for
 * the renderer, and it is the anchor that will give the room scan a scale
 * (SPEC §7.2). Nothing else in the pipeline knows a centimetre from a pixel.
 *
 * Implements `Tracker`, so the app swaps it for the mouse without noticing.
 */
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import type { Point3 } from '../engine'
import type { Tracker } from './tracker'

export interface CameraTrackerOptions {
  /** Where the copied MediaPipe WASM lives. Local, never a CDN — see setup-assets. */
  readonly wasmPath?: string
  readonly modelPath?: string
  /** Assumed horizontal field of view. Scales the distance estimate directly. */
  readonly fovDeg?: number
  /** Adult inter-pupillary distance. The one anthropometric constant here. */
  readonly ipdCm?: number
  /** Outer eye-corner separation, used only when irises are unavailable. */
  readonly canthalCm?: number
  /** How far the webcam sits above the centre of the drawing area. */
  readonly cameraAboveCentreCm?: number
  readonly smoothing?: number
  readonly predictS?: number
  readonly flipX?: boolean
  /** Optional element to attach the video preview to. */
  readonly mount?: HTMLElement | null
}

const DEFAULTS = {
  wasmPath: '/mediapipe',
  modelPath: '/models/face_landmarker.task',
  fovDeg: 60,
  ipdCm: 6.3,
  canthalCm: 9.0,
  cameraAboveCentreCm: 12,
  smoothing: 0.45,
  predictS: 0.04,
  flipX: false,
  mount: null,
} as const

type State = 'idle' | 'loading' | 'tracking' | 'no-face' | 'failed'

export function cameraTracker(opts: CameraTrackerOptions = {}): Tracker & {
  readonly video: HTMLVideoElement
} {
  const o = { ...DEFAULTS, ...opts }

  const video = document.createElement('video')
  video.playsInline = true
  video.muted = true

  let landmarker: FaceLandmarker | null = null
  let stream: MediaStream | null = null
  let state: State = 'idle'
  let detail = ''
  /** True while falling back to eye corners — worse metric accuracy, recorded. */
  let degraded = false

  let smoothed: Point3 | null = null
  const velocity = { x: 0, y: 0, z: 0 }
  let lastT = 0
  let detectMsEma = 0
  let frameSEma = 1 / 60
  let running = false

  function measure(): void {
    if (!landmarker || video.readyState < 2) return
    const t0 = performance.now()
    let result
    try {
      result = landmarker.detectForVideo(video, t0)
    } catch {
      return
    }
    const dt = performance.now() - t0
    detectMsEma += (dt - detectMsEma) * 0.2

    const lms = result?.faceLandmarks?.[0]
    if (!lms || lms.length < 264) {
      state = 'no-face'
      return
    }

    // Iris centres when the model gives them; outer eye corners when spectacles
    // or lighting take the irises away. The fallback is worse and says so.
    let a, b, separationCm
    if (lms.length >= 478) {
      a = lms[468]!
      b = lms[473]!
      separationCm = o.ipdCm
      degraded = false
    } else {
      a = lms[33]!
      b = lms[263]!
      separationCm = o.canthalCm
      degraded = true
    }

    const vw = video.videoWidth
    const vh = video.videoHeight
    const ax = a.x * vw
    const ay = a.y * vh
    const bx = b.x * vw
    const by = b.y * vh
    const dpx = Math.hypot(bx - ax, by - ay)
    if (dpx < 4) {
      state = 'no-face'
      return
    }

    const fpx = vw / 2 / Math.tan((o.fovDeg * Math.PI) / 360)
    const z = (fpx * separationCm) / dpx
    const um = (ax + bx) / 2
    const vm = (ay + by) / 2
    const raw: Point3 = {
      // A front-facing camera images the player unmirrored, so their right is
      // the image's left. The flip is exposed because it depends on the device.
      x: (o.flipX ? 1 : -1) * (((um - vw / 2) * z) / fpx),
      y: -(((vm - vh / 2) * z) / fpx) + o.cameraAboveCentreCm,
      z,
    }

    const now = performance.now() / 1000
    const step = lastT ? Math.min(0.1, now - lastT) : 1 / 60
    lastT = now
    frameSEma += (step - frameSEma) * 0.1

    if (!smoothed) {
      smoothed = raw
    } else {
      const next = { ...smoothed }
      for (const k of ['x', 'y', 'z'] as const) {
        const previous = next[k]
        next[k] = previous + (raw[k] - previous) * o.smoothing
        velocity[k] += ((next[k] - previous) / step - velocity[k]) * 0.3
      }
      smoothed = next
    }
    state = 'tracking'
    detail = degraded ? ' · degraded (no iris)' : ''
  }

  function loop(): void {
    if (!running) return
    measure()
    requestAnimationFrame(loop)
  }

  return {
    kind: 'camera',
    video,

    position(): Point3 | null {
      if (!smoothed) return null
      // Forward prediction hides some of the latency. When the face is lost the
      // last good position is held rather than dropped: snapping the viewpoint
      // to nothing is worse than a stale frame, and status() tells the truth.
      const p = o.predictS
      return {
        x: smoothed.x + velocity.x * p,
        y: smoothed.y + velocity.y * p,
        z: smoothed.z + velocity.z * p,
      }
    },

    /**
     * Measured, not assumed: inference wall-clock plus one frame interval. The
     * dodge guarantee subtracts this, so a slow machine gets fewer threats
     * rather than unfair ones (SPEC §6.5).
     */
    latencyS(): number {
      return detectMsEma / 1000 + frameSEma
    },

    status(): string {
      const ms = (this.latencyS() * 1000).toFixed(0)
      switch (state) {
        case 'idle':
          return 'camera off'
        case 'loading':
          return 'loading model…'
        case 'failed':
          return `camera failed: ${detail}`
        case 'no-face':
          return `NO FACE · ${ms} ms`
        case 'tracking':
          return `tracking · ${ms} ms${detail}`
      }
    },

    async start(): Promise<void> {
      state = 'loading'
      try {
        const fileset = await FilesetResolver.forVisionTasks(o.wasmPath)
        landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: o.modelPath, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numFaces: 1,
        })
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        })
        video.srcObject = stream
        if (o.mount) o.mount.append(video)
        await video.play()
        running = true
        requestAnimationFrame(loop)
      } catch (err) {
        state = 'failed'
        detail = err instanceof Error ? err.message : String(err)
        throw err
      }
    },

    stop(): void {
      running = false
      stream?.getTracks().forEach((t) => t.stop())
      stream = null
      video.srcObject = null
      video.remove()
      landmarker?.close()
      landmarker = null
      state = 'idle'
      smoothed = null
    },
  }
}
