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
 * Is the thing at `at`, of the given radius, wholly on the display from `eye`?
 *
 * The window plane is pinned by the off-axis projection, so this is exactly the
 * condition for appearing on the glass: find where the ray crosses `z = 0` and
 * ask whether that lands inside the screen rectangle — **shrunk by the object's
 * own projected radius**, so that the whole of it is in frame and not only its
 * middle.
 *
 * That shrink is the third appearance of one mistake in this project: a
 * point-sized test standing in for something with extent. First an occluder's
 * centre deciding whether a rectangle was hidden, then an enemy's centre
 * deciding whether it was drawn, and now its centre deciding whether it is in
 * frame — a playtester was being shot by an enemy sitting just above the bottom
 * edge with nine tenths of its body below the glass. Passing `radiusCm` is what
 * makes "you see it exactly when you can shoot it" hold at the edges too.
 */
export function onScreen(
  eye: Point3,
  at: Point3,
  view: Viewport,
  radiusCm = 0,
): boolean {
  const dz = eye.z - at.z
  // Behind the eye, or in its plane: not on screen in any useful sense.
  if (dz <= 1e-6 || eye.z <= 0) return false
  const s = eye.z / dz
  const u = eye.x + (at.x - eye.x) * s
  const v = eye.y + (at.y - eye.y) * s
  // A world offset of r at this depth covers r * s on the screen plane.
  const pad = Math.max(0, radiusCm) * s
  const halfW = view.widthCm / 2 - pad
  const halfH = view.heightCm / 2 - pad
  if (halfW <= 0 || halfH <= 0) return false
  return Math.abs(u) <= halfW && Math.abs(v) <= halfH
}
