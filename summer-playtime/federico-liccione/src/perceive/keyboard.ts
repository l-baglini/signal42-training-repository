/**
 * The keyboard standing in for a head.
 *
 * It exists because the mouse now has a job: aiming. The mouse tracker was the
 * cleaner control while the game had one input, and with two it would lock
 * leaning and aiming together, which is degenerate. So the no-webcam path moves
 * the head with the left hand and aims with the right, exactly like the real
 * thing.
 *
 * **A key sets a velocity and releasing stops the head.** That is the whole of it,
 * and the first version got it wrong in a way that made the game unwinnable on the
 * keyboard — reported as *"non è possibile muovere la visuale e contestualmente il
 * mouse, il che rende praticamente impossibile eliminare i nemici"*, which was
 * exactly right and was not a mistake by the player.
 *
 * The arithmetic, because it is the kind of thing that hides in a plausible design.
 * The old version moved at 70 cm/s while held and sprang back to rest at 56 cm/s
 * when released, so the *only* positions it could hold were rest and the extremes:
 * everywhere in between, you were either travelling outwards or travelling back.
 * The levels ask for a lean of 4 to 12 cm held inside a window 1 to 3.5 cm wide —
 * and at 70 cm/s a 2 cm window is crossed in **twenty-nine milliseconds**. There
 * was no version of aiming inside that.
 *
 * A real head stops where you put it, so this one does too. What survives of the
 * spring is a slow drift back to rest when nothing is held — slow enough to be an
 * afterthought rather than a fight — and `shift`, which is the retreat: cover is
 * the thing you need to reach *fast* in this game, and on a keyboard that deserves
 * its own key rather than being the absence of another.
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
  /**
   * cm per second while a key is held.
   *
   * Chosen against the levels rather than by feel: the tightest peek window the
   * solver will ship is a centimetre, and it has to be possible to notice you are
   * in one and stop. At 26 cm/s a two-centimetre window takes 77 ms to cross and
   * eight centimetres of lean takes a third of a second, which is about what a
   * neck does anyway.
   */
  readonly speedCmS?: number
  /** cm per second of drift back to rest when nothing is held. */
  readonly driftCmS?: number
  /** cm per second back to rest while the retreat key is held. */
  readonly retreatCmS?: number
}

const DEFAULTS = {
  xRangeCm: 20,
  yRangeCm: 11,
  zRestCm: 60,
  zRangeCm: 12,
  speedCmS: 26,
  driftCmS: 3.5,
  retreatCmS: 85,
} as const

const KEYS: Record<string, keyof typeof AXES> = {
  a: 'left', arrowleft: 'left',
  d: 'right', arrowright: 'right',
  w: 'up', arrowup: 'up',
  s: 'down', arrowdown: 'down',
  q: 'in', e: 'out',
  shift: 'duck',
}
const AXES = { left: 0, right: 0, up: 0, down: 0, in: 0, out: 0, duck: 0 }

export type Held = Set<keyof typeof AXES>

/**
 * One step of the head, given what is held and how much time passed.
 *
 * Pure and exported so it can be tested, which is this project's standing rule
 * about decisions that would otherwise live inside an event handler — and the bug
 * this replaced was a decision of exactly that kind: it was arithmetic, it was
 * wrong, and no test could see it because it was three lines inside a closure.
 */
export function step(
  at: Point3,
  held: Held,
  dtS: number,
  o: Required<KeyboardTrackerOptions>,
): Point3 {
  const dt = Math.max(0, Math.min(0.05, dtS))
  const out = o.speedCmS * dt
  // Retreat overrides everything: it is the one movement the game asks for under
  // time pressure, and having it fight a key the player forgot to release would be
  // the worst possible moment to be clever.
  const home = (held.has('duck') ? o.retreatCmS : o.driftCmS) * dt

  const axis = (v: number, neg: boolean, pos: boolean, limit: number, centre: number) => {
    if (held.has('duck') || (neg === pos)) {
      // Nothing pushing, or both directions at once: ease home. Slowly, unless the
      // retreat key says otherwise.
      return v > centre ? Math.max(centre, v - home) : Math.min(centre, v + home)
    }
    // Held: move, and **stop where you let go**. A head does not spring back.
    return neg
      ? Math.max(centre - limit, v - out)
      : Math.min(centre + limit, v + out)
  }

  return {
    x: axis(at.x, held.has('left'), held.has('right'), o.xRangeCm, 0),
    y: axis(at.y, held.has('down'), held.has('up'), o.yRangeCm, 0),
    z: axis(at.z, held.has('in'), held.has('out'), o.zRangeCm, o.zRestCm),
  }
}

export function keyboardTracker(opts: KeyboardTrackerOptions = {}): Tracker {
  const o: Required<KeyboardTrackerOptions> = { ...DEFAULTS, ...opts }
  const held: Held = new Set()
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
    const dt = lastT ? now - lastT : 0
    lastT = now
    const next = step(at, held, dt, o)
    at.x = next.x
    at.y = next.y
    at.z = next.z
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
        : 'keyboard · WASD to lean and it stays there · shift ducks back',
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
