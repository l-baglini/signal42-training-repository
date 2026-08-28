/**
 * Scene geometry, as pure data. SPEC §8.
 *
 * Kept separate from the GL layer so that the part with arithmetic in it can be
 * tested and the part with a graphics context in it cannot hide a bug in that
 * arithmetic. Everything here is centimetres in the world frame of
 * `src/engine/types.ts` — the renderer is the only place pixels exist, and even
 * there they arrive via the projection matrix.
 */
import type { Billboard, Point3, Target } from '../engine'

export interface Mesh {
  /** xyz per vertex, cm. */
  readonly positions: Float32Array
  /** rgb per vertex, 0..1. */
  readonly colors: Float32Array
  readonly indices: Uint32Array
}

export type Rgb = readonly [number, number, number]

const QUAD_INDICES = [0, 1, 2, 2, 1, 3]

/** A rectangle parallel to the screen plane, at depth z. */
export function quad(
  z: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  colour: Rgb,
): Mesh {
  const positions = new Float32Array([
    x0, y0, z,
    x1, y0, z,
    x0, y1, z,
    x1, y1, z,
  ])
  const colors = new Float32Array(12)
  for (let i = 0; i < 4; i++) colors.set(colour, i * 3)
  return { positions, colors, indices: new Uint32Array(QUAD_INDICES) }
}

export function merge(meshes: readonly Mesh[]): Mesh {
  let nv = 0
  let ni = 0
  for (const m of meshes) {
    nv += m.positions.length / 3
    ni += m.indices.length
  }
  const positions = new Float32Array(nv * 3)
  const colors = new Float32Array(nv * 3)
  const indices = new Uint32Array(ni)
  let vo = 0
  let io = 0
  for (const m of meshes) {
    positions.set(m.positions, vo * 3)
    colors.set(m.colors, vo * 3)
    for (let i = 0; i < m.indices.length; i++) indices[io + i] = m.indices[i]! + vo
    vo += m.positions.length / 3
    io += m.indices.length
  }
  return { positions, colors, indices }
}

export const occluderMesh = (b: Billboard, colour: Rgb): Mesh =>
  quad(b.z, b.x0, b.x1, b.y0, b.y1, colour)

/** A target, drawn as a square facing the window at its own depth. */
export const targetMesh = (t: Target, colour: Rgb): Mesh =>
  quad(t.at.z, t.at.x - t.radius, t.at.x + t.radius, t.at.y - t.radius, t.at.y + t.radius, colour)

/**
 * A checkered wall at the back. Its only job is to give the eye something to
 * measure parallax against — a floating shape over a void reads as flat however
 * correct the projection is.
 */
export function backdropMesh(
  z: number,
  halfW: number,
  halfH: number,
  cols: number,
  rows: number,
  a: Rgb,
  b: Rgb,
): Mesh {
  const parts: Mesh[] = []
  const dw = (halfW * 2) / cols
  const dh = (halfH * 2) / rows
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x0 = -halfW + i * dw
      const y0 = -halfH + j * dh
      parts.push(quad(z, x0, x0 + dw, y0, y0 + dh, (i + j) % 2 === 0 ? a : b))
    }
  }
  return merge(parts)
}

/**
 * A hollow rectangle: four thin quads. Used for the landing marker, which has to
 * be readable without hiding what is behind it — the player needs to know where
 * NOT to be, while still seeing the room they are leaning through.
 */
export function frameMesh(
  z: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  thickness: number,
  colour: Rgb,
): Mesh {
  const t = thickness
  return merge([
    quad(z, x0, x1, y0, y0 + t, colour),
    quad(z, x0, x1, y1 - t, y1, colour),
    quad(z, x0, x0 + t, y0 + t, y1 - t, colour),
    quad(z, x1 - t, x1, y0 + t, y1 - t, colour),
  ])
}

export const PALETTE = {
  occluder: [0.16, 0.18, 0.24] as Rgb,
  target: [0.32, 0.88, 0.68] as Rgb,
  targetIdle: [0.14, 0.28, 0.26] as Rgb,
  targetRevealed: [1.0, 0.86, 0.35] as Rgb,
  threat: [0.95, 0.32, 0.35] as Rgb,
  threatMarker: [1.0, 0.45, 0.28] as Rgb,
  backdropA: [0.05, 0.07, 0.12] as Rgb,
  backdropB: [0.08, 0.11, 0.17] as Rgb,
} as const

export interface SceneInput {
  readonly occluders: readonly Billboard[]
  readonly targets: readonly Target[]
  /** Parallel to `targets`: whether each is currently visible from the eye. */
  readonly revealed?: readonly boolean[]
  /**
   * Which targets are in play. Everything else is drawn dim: a target that is
   * not being hunted must still occlude and still be *there*, or the room stops
   * making sense between rounds.
   */
  readonly active?: readonly number[] | undefined
  readonly threat?: { readonly at: Point3; readonly radius: number } | undefined
  /** Where the threat will cross the window. The tell — drawn from spawn. */
  readonly threatMarker?: { readonly at: Point3; readonly radius: number } | undefined
  readonly backdropZ?: number
}

/**
 * The backdrop has to cover the frustum at its own depth, not just the screen —
 * an eye leaning 20 cm sees well past the screen's own width by the time the
 * cone reaches the back wall.
 */
export function backdropHalfExtent(backdropZ: number, screenHalf: number, eyeZ: number): number {
  return screenHalf * ((eyeZ - backdropZ) / Math.max(eyeZ, 1)) + 60
}

export function buildScene(input: SceneInput): Mesh {
  const backdropZ = input.backdropZ ?? -320
  const parts: Mesh[] = [
    backdropMesh(backdropZ, 260, 170, 16, 11, PALETTE.backdropA, PALETTE.backdropB),
  ]
  for (const o of input.occluders) parts.push(occluderMesh(o, PALETTE.occluder))
  input.targets.forEach((t, i) => {
    const on = input.revealed?.[i] ?? false
    const inPlay = input.active ? input.active.includes(i) : true
    parts.push(
      targetMesh(t, on ? PALETTE.targetRevealed : inPlay ? PALETTE.target : PALETTE.targetIdle),
    )
  })
  if (input.threatMarker) {
    const { at, radius } = input.threatMarker
    parts.push(
      frameMesh(at.z, at.x - radius, at.x + radius, at.y - radius, at.y + radius, 1.6,
        PALETTE.threatMarker),
    )
  }
  if (input.threat) {
    const { at, radius } = input.threat
    parts.push(quad(at.z, at.x - radius, at.x + radius, at.y - radius, at.y + radius, PALETTE.threat))
  }
  return merge(parts)
}
