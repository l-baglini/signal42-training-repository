/**
 * The display, as a game rule. SPEC §6.
 *
 * The engine has no business knowing about pixels, but it does need to know how
 * big the window is, for the same reason it needs to know how far a neck reaches:
 * both bound what the player can engage. A playtester found the gap — enemies
 * that shot at them from off the side of the screen, invisible and unanswerable —
 * because `visible` answers "is anything in the way" and nothing was asking "is
 * it in frame".
 *
 * So the rule, stated once: **if you cannot see it, it cannot shoot you.** It is
 * the same symmetry the whole design rests on, extended to the edge of the glass.
 */
import type { Point3 } from './types'

export interface Viewport {
  /** Physical width of the drawing area, cm. Calibrated, not guessed. */
  readonly widthCm: number
  readonly heightCm: number
}

export const DEFAULT_VIEWPORT: Viewport = { widthCm: 34, heightCm: 21 }

/**
 * Does the sightline from `eye` to `at` pass through the screen rectangle?
 *
 * The window plane is pinned by the off-axis projection, so this is exactly the
 * condition for the point to appear on the display: find where the ray crosses
 * `z = 0` and ask whether that lands inside the glass.
 */
export function onScreen(eye: Point3, at: Point3, view: Viewport): boolean {
  const dz = eye.z - at.z
  // Behind the eye, or in its plane: not on screen in any useful sense.
  if (dz <= 1e-6 || eye.z <= 0) return false
  const s = eye.z / dz
  const u = eye.x + (at.x - eye.x) * s
  const v = eye.y + (at.y - eye.y) * s
  return Math.abs(u) <= view.widthCm / 2 && Math.abs(v) <= view.heightCm / 2
}
