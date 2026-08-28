/**
 * The mouse standing in for a head.
 *
 * Not a toy: it is the cleaner control for judging the projection, because it
 * takes the tracker's noise and latency out of the picture entirely. When the
 * geometry looks wrong here, the geometry is wrong.
 *
 * It implements the same `Tracker` interface the camera will, so the game code
 * written against it needs no changes when the real one arrives.
 */
import type { Point3 } from '../engine'
import type { Tracker } from './tracker'

export interface MouseTrackerOptions {
  /** Half-range of lateral travel mapped across the element, cm. */
  readonly xRangeCm?: number
  readonly yRangeCm?: number
  readonly zRestCm?: number
  readonly zMinCm?: number
  readonly zMaxCm?: number
}

const DEFAULTS = {
  xRangeCm: 24,
  yRangeCm: 14,
  zRestCm: 60,
  zMinCm: 42,
  zMaxCm: 78,
} as const

export function mouseTracker(el: HTMLElement, opts: MouseTrackerOptions = {}): Tracker {
  const o = { ...DEFAULTS, ...opts }
  let at: Point3 | null = null
  let z = o.zRestCm

  const onMove = (e: PointerEvent) => {
    const r = el.getBoundingClientRect()
    at = {
      x: ((e.clientX - r.left) / r.width - 0.5) * 2 * o.xRangeCm,
      y: -((e.clientY - r.top) / r.height - 0.5) * 2 * o.yRangeCm,
      z,
    }
  }
  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    z = Math.min(o.zMaxCm, Math.max(o.zMinCm, z + Math.sign(e.deltaY) * 1.5))
    if (at) at = { ...at, z }
  }

  return {
    kind: 'pointer',
    position: () => at,
    // The pointer is as immediate as the display allows; one frame is honest.
    latencyS: () => 1 / 60,
    status: () => (at ? `mouse · z ${z.toFixed(0)} cm (wheel)` : 'move the cursor'),
    async start() {
      el.addEventListener('pointermove', onMove)
      el.addEventListener('wheel', onWheel, { passive: false })
    },
    stop() {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('wheel', onWheel)
    },
  }
}
