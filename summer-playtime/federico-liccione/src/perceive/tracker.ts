/**
 * What the game needs from a way of knowing where the player's head is.
 *
 * Deliberately small, so that the mouse stand-in and the real camera tracker are
 * interchangeable and the game never learns which one it has. Swapping one for
 * the other must not touch a line of game code.
 */
import type { Point3 } from '../engine'

export interface Tracker {
  /**
   * Which stand-in, or the real thing.
   *
   * It used to be `'mouse' | 'camera'` with the keyboard reporting `'mouse'`, and
   * the comment saying the taxonomy only distinguished "stand-in" from "camera".
   * That stopped being true when the webcam became the default and `c` became a
   * toggle: the app has to know which stand-in it would be going back to.
   */
  readonly kind: 'keyboard' | 'pointer' | 'camera'
  /** Current eye position in cm, or null when the tracker has nothing. */
  position(): Point3 | null
  /** Measured end-to-end latency in seconds. Feeds the dodge guarantee. */
  latencyS(): number
  /** Human-readable state for the HUD — including failure, which is not hidden. */
  status(): string
  start(): Promise<void>
  stop(): void
}
