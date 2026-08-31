/**
 * Head-coupled (off-axis) perspective. SPEC §8.
 *
 * The four physical screen corners are nailed into world space; the camera sits
 * at the measured eye position; the frustum is the pyramid from eye to corners
 * and is therefore asymmetric. Kooima's generalised perspective formulation,
 * simplified because the screen is axis-aligned in this coordinate frame.
 *
 * The camera is **translated, never rotated**. That distinction is the whole
 * mechanic: a rotating camera pans, and a window does not.
 *
 * Matrices are column-major, ready for `uniformMatrix4fv` without transposing.
 */
import type { Point3 } from '../engine'

export interface Screen {
  /** Physical width of the drawing area, cm. Calibrated, not guessed. */
  readonly widthCm: number
  /** Physical height, cm. Derived from the canvas aspect ratio. */
  readonly heightCm: number
}

export const DEFAULT_NEAR = 1
export const DEFAULT_FAR = 4000

function frustum(l: number, r: number, b: number, t: number, n: number, f: number): Float32Array {
  return new Float32Array([
    (2 * n) / (r - l), 0, 0, 0,
    0, (2 * n) / (t - b), 0, 0,
    (r + l) / (r - l), (t + b) / (t - b), -(f + n) / (f - n), -1,
    0, 0, (-2 * f * n) / (f - n), 0,
  ])
}

export function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16)
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += a[k * 4 + r]! * b[c * 4 + k]!
      o[c * 4 + r] = s
    }
  return o
}

const translation = (x: number, y: number, z: number): Float32Array =>
  new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1])

/**
 * The window. The screen plane is invariant under eye motion — that is what
 * makes it read as a hole in the wall rather than as a camera, and it is what
 * I10 asserts.
 */
export function offAxis(
  eye: Point3,
  screen: Screen,
  near = DEFAULT_NEAR,
  far = DEFAULT_FAR,
): Float32Array {
  const d = Math.max(eye.z, near)
  const hw = screen.widthCm / 2
  const hh = screen.heightCm / 2
  const k = near / d
  return multiply(
    frustum((-hw - eye.x) * k, (hw - eye.x) * k, (-hh - eye.y) * k, (hh - eye.y) * k, near, far),
    translation(-eye.x, -eye.y, -eye.z),
  )
}

/**
 * The same camera motion with a symmetric frustum: a dolly, not a window.
 *
 * This ships. Toggling between the two is the fastest way to show a spectator
 * what the mechanic is — the illusion dies on the spot and comes back — and it
 * is the demo beat in SPEC §10.
 */
export function symmetric(
  eye: Point3,
  screen: Screen,
  near = DEFAULT_NEAR,
  far = DEFAULT_FAR,
): Float32Array {
  const d = Math.max(eye.z, near)
  const k = near / d
  const hw = (screen.widthCm / 2) * k
  const hh = (screen.heightCm / 2) * k
  return multiply(
    frustum(-hw, hw, -hh, hh, near, far),
    translation(-eye.x, -eye.y, -eye.z),
  )
}

export interface Ndc {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly w: number
}

/** Project a world point through a column-major matrix, perspective divide included. */
export function project(m: Float32Array, p: Point3): Ndc {
  const x = m[0]! * p.x + m[4]! * p.y + m[8]! * p.z + m[12]!
  const y = m[1]! * p.x + m[5]! * p.y + m[9]! * p.z + m[13]!
  const z = m[2]! * p.x + m[6]! * p.y + m[10]! * p.z + m[14]!
  const w = m[3]! * p.x + m[7]! * p.y + m[11]! * p.z + m[15]!
  return { x: x / w, y: y / w, z: z / w, w }
}

/** The four physical screen corners, in world space. */
export function corners(screen: Screen): readonly Point3[] {
  const hw = screen.widthCm / 2
  const hh = screen.heightCm / 2
  return [
    { x: -hw, y: -hh, z: 0 },
    { x: hw, y: -hh, z: 0 },
    { x: -hw, y: hh, z: 0 },
    { x: hw, y: hh, z: 0 },
  ]
}
