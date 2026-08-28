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
import { oneEuro3 } from './oneEuro'
import {
  DEFAULT_LIMITS, deadReckon, inFrame, midpointFromOneEye, type DeadReckonLimits,
} from './reacquire'

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
  /** One Euro: how hard a held head is filtered. Hz. */
  readonly minCutoff?: number
  /** One Euro: how quickly the filter gets out of the way when you move. */
  readonly beta?: number
  readonly flipX?: boolean
  /** How far, and for how long, to carry a lost head forward. See `reacquire.ts`. */
  readonly limits?: DeadReckonLimits
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
  minCutoff: 0.4,
  beta: 0.04,
  flipX: false,
  limits: DEFAULT_LIMITS,
  mount: null,
} as const

type State =
  | 'idle'
  | 'loading'
  | 'tracking'
  /** One eye out of frame. Lateral position still measured, depth held. */
  | 'one-eye'
  /** Head gone. Carrying the last velocity forward, then holding. */
  | 'reacquiring'
  | 'no-face'
  | 'failed'

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

  /**
   * One Euro rather than a fixed average with forward prediction. The first
   * version used the latter and it was reported as jerky in poor light, which is
   * exactly what that pair does: too slow to hide jitter, and the prediction
   * multiplies whatever jitter is left.
   */
  const filter = oneEuro3({ minCutoff: o.minCutoff, beta: o.beta })
  let smoothed: Point3 | null = null
  /**
   * What is needed to keep going when the head leaves the frame: the last good
   * separation between the eyes in pixels (which carries the depth estimate), the
   * last measured velocity, and when the measurement stopped.
   *
   * A fast sideways snap took one eye out of frame and the viewpoint **froze**
   * until both came back — reported from a chair, and it happens at exactly the
   * moment the player is moving fastest. `reacquire.ts` holds the decisions; these
   * are the measurements they need.
   */
  let lastHalfPx: { x: number; y: number } | null = null
  let lastZ = 0
  let velocity: Point3 = { x: 0, y: 0, z: 0 }
  let lastMeasuredAt = 0
  let lastMeasured: Point3 | null = null
  /** Reported position while extrapolating. Kept out of the filter's state. */
  let carried: Point3 | null = null
  let detectMsEma = 0
  let frameSEma = 1 / 60
  /** True camera frame rate, which is what collapses in low light. */
  let cameraFps = 0
  let lastVideoTime = -1
  let lastCameraFrameT = 0
  let running = false

  function measure(): void {
    if (!landmarker || video.readyState < 2) return
    // Auto-exposure lengthens in poor light and the sensor slows down. Counting
    // distinct video timestamps measures that directly, so the HUD can say so
    // instead of leaving the player to wonder why it feels bad.
    if (video.currentTime !== lastVideoTime) {
      const now = performance.now() / 1000
      if (lastCameraFrameT) {
        const gap = now - lastCameraFrameT
        if (gap > 0) cameraFps += (1 / gap - cameraFps) * 0.1
      }
      lastCameraFrameT = now
      lastVideoTime = video.currentTime
    }

    const t0 = performance.now()
    let result
    try {
      result = landmarker.detectForVideo(video, t0)
    } catch {
      return
    }
    const dt = performance.now() - t0
    detectMsEma += (dt - detectMsEma) * 0.2

    const now0 = performance.now() / 1000
    const lms = result?.faceLandmarks?.[0]
    if (!lms || lms.length < 264) {
      carryOn(now0)
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
    const fpx = vw / 2 / Math.tan((o.fovDeg * Math.PI) / 360)

    /**
     * One eye out of frame is still a usable measurement.
     *
     * The separation between the eyes is what gives this pipeline its scale, so
     * losing one loses the *depth* — but not the lateral position, which is what
     * the game is played with. Carrying the last known separation forward keeps
     * the head tracked at a held depth, which beats a frozen frame by a distance.
     */
    const aIn = inFrame(a)
    const bIn = inFrame(b)
    if (!aIn && !bIn) {
      carryOn(now0)
      return
    }

    let um: number
    let vm: number
    let z: number
    if (aIn && bIn) {
      const ax = a.x * vw
      const ay = a.y * vh
      const bx = b.x * vw
      const by = b.y * vh
      const dpx = Math.hypot(bx - ax, by - ay)
      if (dpx < 4) {
        carryOn(now0)
        return
      }
      z = (fpx * separationCm) / dpx
      um = (ax + bx) / 2
      vm = (ay + by) / 2
      lastHalfPx = { x: (bx - ax) / 2, y: (by - ay) / 2 }
      lastZ = z
      state = 'tracking'
    } else {
      if (!lastHalfPx || lastZ <= 0) {
        carryOn(now0)
        return
      }
      const seen = aIn ? a : b
      const mid = midpointFromOneEye(
        { x: seen.x * vw, y: seen.y * vh }, lastHalfPx, aIn,
      )
      um = mid.x
      vm = mid.y
      z = lastZ
      state = 'one-eye'
    }
    const raw: Point3 = {
      // A front-facing camera images the player unmirrored, so their right is
      // the image's left. The flip is exposed because it depends on the device.
      x: (o.flipX ? 1 : -1) * (((um - vw / 2) * z) / fpx),
      y: -(((vm - vh / 2) * z) / fpx) + o.cameraAboveCentreCm,
      z,
    }

    const now = performance.now() / 1000
    frameSEma += (Math.min(0.1, 1 / Math.max(cameraFps, 10)) - frameSEma) * 0.1

    /**
     * Coming back from a gap, snap rather than ease.
     *
     * The filter's whole job is to lag a noisy signal, and after a gap its state
     * describes where the head *was*. Feeding it the truth would rubber-band the
     * viewpoint back into place, which is a second complaint waiting to be made,
     * so the filter is reset when the gap was long enough to matter.
     */
    if (carried && now - lastMeasuredAt > 0.12) filter.reset()
    carried = null

    const before = smoothed
    const beforeAt = lastMeasuredAt
    smoothed = filter.filter(raw, now)
    if (before && now > beforeAt) {
      const dt = Math.max(1e-3, now - beforeAt)
      // Measured from the filtered signal, because that is what the game sees and
      // therefore what an extrapolation of it has to continue.
      velocity = {
        x: (smoothed.x - before.x) / dt,
        y: (smoothed.y - before.y) / dt,
        z: (smoothed.z - before.z) / dt,
      }
    }
    lastMeasured = smoothed
    lastMeasuredAt = now
    detail = degraded ? ' · degraded (no iris)' : ''
  }

  /**
   * The head is gone. Carry it forward, bounded, then hold.
   *
   * Bounded twice and then stopped, rather than jumping to an extreme: exposure in
   * this game is symmetric, so guessing *further out* is as likely to walk into a
   * sightline as out of one, and a tracker is not entitled to a guess it cannot
   * justify. Continuing the measured motion is — and when the snap was fast, which
   * is the case that produced this, it arrives at almost the same place.
   */
  function carryOn(now: number): void {
    if (!lastMeasured) {
      state = 'no-face'
      return
    }
    const out = deadReckon(lastMeasured, velocity, now - lastMeasuredAt, o.limits)
    carried = out.at
    state = out.holding ? 'no-face' : 'reacquiring'
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
      /**
       * While the head is out of frame this is an extrapolation, and once the
       * extrapolation runs out it is the last measured position held. Both are
       * better than dropping to null, which would snap the viewpoint to the rest
       * position — the one place the player was trying to leave. `status()` says
       * which of the three it is, every time.
       */
      return carried ?? smoothed
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
      const fps = cameraFps > 0 ? ` · ${cameraFps.toFixed(0)} fps` : ''
      const dark = cameraFps > 0 && cameraFps < 18 ? ' · LOW LIGHT' : ''
      switch (state) {
        case 'idle':
          return 'camera off'
        case 'loading':
          return 'loading model…'
        case 'failed':
          return `camera failed: ${detail}`
        case 'no-face':
          return `NO FACE, holding · ${ms} ms${fps}${dark}`
        case 'one-eye':
          return `tracking on one eye, depth held · ${ms} ms${fps}${dark}`
        case 'reacquiring':
          return `head out of frame, carrying · ${ms} ms${fps}${dark}`
        case 'tracking':
          return `tracking · ${ms} ms${fps}${dark}${detail}`
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
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 60, min: 15 },
            facingMode: 'user',
          },
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
      carried = null
      lastMeasured = null
      lastHalfPx = null
      filter.reset()
    },
  }
}
