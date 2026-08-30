/**
 * The keyboard standing in for a head.
 *
 * It exists because the mouse now has a job: aiming. The mouse tracker was the
 * cleaner control while the game had one input, and with two it would lock
 * leaning and aiming together, which is degenerate. So the no-webcam path moves
 * the head with the left hand and aims with the right, exactly like the real
 * thing.
 *
 * Implements `Tracker`, so nothing downstream knows which one it has.
 */
import type { Point3 } from '../engine'
import type { Tracker } from './tracker'
import { isTyping } from './typing'

export interface KeyboardTrackerOptions {
  readonly xRangeCm?: number
  readonly yRangeCm?: number
  readonly zRestCm?: number
  readonly zRangeCm?: number
  /** cm per second of head travel. Roughly a real neck at full tilt. */
  readonly speedCmS?: number
}

const DEFAULTS = {
  xRangeCm: 20,
  yRangeCm: 11,
  zRestCm: 60,
  zRangeCm: 12,
  speedCmS: 70,
} as const

const KEYS: Record<string, keyof typeof AXES> = {
  a: 'left', arrowleft: 'left',
  d: 'right', arrowright: 'right',
  w: 'up', arrowup: 'up',
  s: 'down', arrowdown: 'down',
  q: 'in', e: 'out',
}
const AXES = { left: 0, right: 0, up: 0, down: 0, in: 0, out: 0 }

export function keyboardTracker(opts: KeyboardTrackerOptions = {}): Tracker {
  const o = { ...DEFAULTS, ...opts }
  const held = new Set<string>()
  const at: { x: number; y: number; z: number } = { x: 0, y: 0, z: o.zRestCm }
  let lastT = 0

  const down = (e: KeyboardEvent) => {
    if (isTyping()) return
    const k = e.key.toLowerCase()
    if (KEYS[k]) {
      held.add(KEYS[k]!)
      e.preventDefault()
    }
  }
  const up = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase()
    if (KEYS[k]) held.delete(KEYS[k]!)
  }
  // Focus can move while a key is held: release everything rather than leaving
  // the head drifting into a wall while somebody types.
  const focusIn = () => {
    if (isTyping()) held.clear()
  }
  const blur = () => held.clear()

  function integrate(): void {
    const now = performance.now() / 1000
    const dt = lastT ? Math.min(0.05, now - lastT) : 0
    lastT = now
    const step = o.speedCmS * dt
    // Springs back to rest when nothing is held, so the resting position is
    // genuinely rest and not wherever the last key left you.
    const pull = (v: number, neg: boolean, pos: boolean, limit: number, centre: number) => {
      if (neg && !pos) return Math.max(centre - limit, v - step)
      if (pos && !neg) return Math.min(centre + limit, v + step)
      const back = step * 0.8
      return v > centre ? Math.max(centre, v - back) : Math.min(centre, v + back)
    }
    at.x = pull(at.x, held.has('left'), held.has('right'), o.xRangeCm, 0)
    at.y = pull(at.y, held.has('down'), held.has('up'), o.yRangeCm, 0)
    at.z = pull(at.z, held.has('in'), held.has('out'), o.zRangeCm, o.zRestCm)
  }

  return {
    kind: 'keyboard',
    position(): Point3 | null {
      integrate()
      return { ...at }
    },
    latencyS: () => 1 / 60,
    status: () =>
      held.size > 0
        ? `keyboard · ${[...held].join('+')}`
        : 'keyboard · WASD or arrows to lean, Q/E for depth',
    async start() {
      addEventListener('keydown', down)
      addEventListener('keyup', up)
      addEventListener('blur', blur)
      addEventListener('focusin', focusIn)
    },
    stop() {
      removeEventListener('keydown', down)
      removeEventListener('keyup', up)
      removeEventListener('blur', blur)
      removeEventListener('focusin', focusIn)
    },
  }
}
