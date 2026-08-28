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
  /** uv per vertex. Meaningless where `textured` is 0. */
  readonly uvs: Float32Array
  /**
   * Draw mode per vertex: 0 flat colour, 1 sample the texture, 2 procedural sky.
   *
   * A mode rather than a boolean, and stored in the same buffer, because a third
   * vertex attribute for something with three states is a lot of plumbing to
   * avoid one comparison in a shader.
   */
  readonly textured: Float32Array
  readonly indices: Uint32Array
}

/** A rectangle in texture space, 0..1, v measured downwards as images are. */
export interface UvRect {
  readonly u0: number
  readonly v0: number
  readonly u1: number
  readonly v1: number
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
  uv?: UvRect,
  mode = uv ? 1 : 0,
): Mesh {
  const positions = new Float32Array([
    x0, y0, z,
    x1, y0, z,
    x0, y1, z,
    x1, y1, z,
  ])
  const colors = new Float32Array(12)
  for (let i = 0; i < 4; i++) colors.set(colour, i * 3)
  // Image v runs downwards while world y runs up, so the rows are swapped here
  // rather than at every call site.
  const uvs = uv
    ? new Float32Array([uv.u0, uv.v1, uv.u1, uv.v1, uv.u0, uv.v0, uv.u1, uv.v0])
    : new Float32Array(8)
  const textured = new Float32Array(4).fill(mode)
  return { positions, colors, uvs, textured, indices: new Uint32Array(QUAD_INDICES) }
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
  const uvs = new Float32Array(nv * 2)
  const textured = new Float32Array(nv)
  const indices = new Uint32Array(ni)
  let vo = 0
  let io = 0
  for (const m of meshes) {
    positions.set(m.positions, vo * 3)
    colors.set(m.colors, vo * 3)
    uvs.set(m.uvs, vo * 2)
    textured.set(m.textured, vo)
    for (let i = 0; i < m.indices.length; i++) indices[io + i] = m.indices[i]! + vo
    vo += m.positions.length / 3
    io += m.indices.length
  }
  return { positions, colors, uvs, textured, indices }
}

export const occluderMesh = (b: Billboard, colour: Rgb, uv?: UvRect): Mesh =>
  quad(b.z, b.x0, b.x1, b.y0, b.y1, colour, uv)

/** A target, drawn as a square facing the window at its own depth. */
export const targetMesh = (t: Target, colour: Rgb): Mesh =>
  quad(t.at.z, t.at.x - t.radius, t.at.x + t.radius, t.at.y - t.radius, t.at.y + t.radius, colour)

/**
 * The sky: one quad, shaded procedurally in the fragment shader.
 *
 * It replaced a checkerboard whose only job was to give the eye something to
 * measure parallax against. The sky does that better — a horizon and drifting
 * cloud give the parallax something *meaningful* to move against — and it costs
 * nothing to occlusion, because everything behind the cover band occludes
 * nothing by definition.
 */
export function skyMesh(z: number, halfW: number, halfH: number): Mesh {
  return quad(z, -halfW, halfW, -halfH, halfH, [0, 0, 0],
    { u0: 0, v0: 0, u1: 1, v1: 1 }, 2)
}

/**
 * A checkered wall. Kept because the parallax and projection tests measure against
 * it, and because it is the honest fallback when the sky is switched off.
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

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

export const PALETTE = {
  occluder: [0.16, 0.18, 0.24] as Rgb,
  target: [0.32, 0.88, 0.68] as Rgb,
  targetIdle: [0.14, 0.28, 0.26] as Rgb,
  targetRevealed: [1.0, 0.86, 0.35] as Rgb,
  threat: [0.95, 0.32, 0.35] as Rgb,
  threatMarker: [1.0, 0.45, 0.28] as Rgb,
  hiding: [0.42, 0.95, 0.78] as Rgb,
  enemySocket: [0.22, 0.07, 0.10] as Rgb,
  enemyLid: [0.52, 0.16, 0.19] as Rgb,
  enemySclera: [0.97, 0.93, 0.88] as Rgb,
  enemyIris: [0.90, 0.20, 0.24] as Rgb,
  enemyPupil: [0.04, 0.02, 0.03] as Rgb,
  enemyFiring: [1.0, 0.92, 0.55] as Rgb,
  enemyAimed: [1.0, 0.62, 0.30] as Rgb,
  hidingCold: [0.18, 0.34, 0.32] as Rgb,
  backdropA: [0.05, 0.07, 0.12] as Rgb,
  backdropB: [0.08, 0.11, 0.17] as Rgb,
} as const

/**
 * An enemy as the renderer needs it. `exposed` is the same boolean the game uses
 * to decide whether it may be shot and whether it may shoot — one fact, drawn
 * once, so the picture can never disagree with the rules.
 */
export interface EnemyView {
  readonly at: Point3
  readonly radius: number
  readonly exposed: boolean
  /** Fraction of its fuse charged, 0..1. */
  readonly fuse: number
  readonly aimed: boolean
}

/**
 * An enemy, drawn as an eye that opens when it can see you.
 *
 * Not decoration: exposure in this game *is* mutual sight, so an eye is the
 * literal statement of the rule. And it is built from concentric rectangles
 * rather than a texture, which keeps it inside the one hard constraint of the
 * whole project — screen-parallel quads, the reason the sightline solver is exact
 * rather than approximate.
 *
 * Closed and dark when it cannot see you. Open, with the pupil heating towards
 * its shot, when it can. The state that must read in a glance is "it is about to
 * fire and I am still out", so that is the loudest one.
 */
export function enemyMesh(e: EnemyView): Mesh {
  const r = e.radius
  const cx = e.at.x
  const cy = e.at.y
  const f = Number.isFinite(e.fuse) ? Math.max(0, Math.min(1, e.fuse)) : 0

  /**
   * A covered enemy draws **nothing at all**.
   *
   * It used to draw a dark socket with a closed slit, and a playtester hit the
   * consequence from both sides: an enemy whose *centre* was occluded showed the
   * edge of its socket, so it looked visible while being unshootable; and one
   * whose centre had just cleared was firing while almost all of it was still
   * behind cover, so the shot seemed to come from nothing.
   *
   * The engagement test is on the centre point and the drawing was a rectangle,
   * and no amount of colour reconciles those. Drawing nothing does: **you see it
   * exactly when you can shoot it, and it can shoot you exactly when you see
   * it** — which is the symmetry the whole design already rests on, applied to
   * the pixels as well as to the rules.
   */
  if (!e.exposed) return { positions: new Float32Array(0), colors: new Float32Array(0),
    uvs: new Float32Array(0), textured: new Float32Array(0), indices: new Uint32Array(0) }

  /**
   * Nudges go towards the viewer, which in this frame means **larger** z: the
   * scene sits at z < 0 and the player at z > 0. An earlier version subtracted,
   * so every part of the eye was drawn behind its own socket and the depth test
   * hid all of it. There is a test on the ordering.
   */
  const layer = (n: number) => e.at.z + n * 0.3

  const parts: Mesh[] = [
    // A ring wider than the eye, so an enemy at the edge of vision is noticed
    // peripherally rather than found by being shot.
    frameMesh(layer(0), cx - r * 1.7, cx + r * 1.7, cy - r * 1.7, cy + r * 1.7, 1.4,
      mix(PALETTE.enemyIris, PALETTE.enemyFiring, f)),
    quad(layer(1), cx - r, cx + r, cy - r, cy + r, PALETTE.enemySocket),
  ]

  /**
   * The lens shape, as three stacked bands. An eye has to be wider than it is
   * tall or it reads as a square, and three rectangles of decreasing width say
   * "lens" while staying inside the one hard constraint of the project:
   * screen-parallel quads, the reason the sightline solver is exact.
   */
  const bands: Array<[number, number, number]> = [
    [0.52, 0.30, 0.42],
    [0.94, 0.00, 0.30],
    [0.52, -0.30, 0.42],
  ]
  for (const [halfW, offY, halfH] of bands) {
    parts.push(quad(
      layer(2),
      cx - r * halfW, cx + r * halfW,
      cy + r * offY - r * halfH, cy + r * offY + r * halfH,
      PALETTE.enemySclera,
    ))
  }

  const ir = r * (0.34 - 0.05 * f)
  parts.push(quad(layer(3), cx - ir, cx + ir, cy - ir, cy + ir,
    mix(PALETTE.enemyIris, PALETTE.enemyFiring, f)))
  const pr = r * (0.15 + 0.06 * f)
  parts.push(quad(layer(4), cx - pr, cx + pr, cy - pr, cy + pr,
    mix(PALETTE.enemyPupil, PALETTE.enemyFiring, f * f)))

  return merge(parts)
}

export interface SceneInput {
  readonly occluders: readonly Billboard[]
  readonly targets: readonly Target[]
  /** Parallel to `targets`: whether each is currently visible from the eye. */
  readonly revealed?: readonly boolean[]
  /** Parallel to `targets`: how much of the required hold is accumulated, 0..1. */
  readonly hold?: readonly number[] | undefined
  /**
   * Which targets are in play. Everything else is drawn dim: a target that is
   * not being hunted must still occlude and still be *there*, or the room stops
   * making sense between rounds.
   */
  readonly active?: readonly number[] | undefined
  readonly threat?: { readonly at: Point3; readonly radius: number } | undefined
  /** Where the threat will cross the window. The tell — drawn from spawn. */
  readonly threatMarker?: { readonly at: Point3; readonly radius: number } | undefined
  /**
   * Occluders currently hiding the target being hunted. Outlined, so the player
   * knows what to peek around. Without this the hunt has no visible subject at
   * all — which is exactly how the first playtest read.
   */
  readonly hiding?: readonly Billboard[] | undefined
  /**
   * How close the player is to a viewpoint that reveals the target, 0..1. The
   * outline brightens with it, so the search has a *gradient* — the complaint
   * that the objective could not be found was really that the signal was binary:
   * invisible, then suddenly visible, with nothing in between to home in on.
   */
  readonly hidingGlow?: number | undefined
  /**
   * Where each occluder came from in the scan's frame, so the cover can be drawn
   * with the pixels it was measured from. Parallel to `occluders`.
   *
   * This is the whole point of the scan being visible rather than merely used:
   * the furniture you are hiding behind is your furniture, with its own image on
   * it, and nobody has to be told that the level came from the room.
   */
  readonly occluderUvs?: readonly (UvRect | undefined)[] | undefined
  /** False falls back to the checkerboard, which is what the geometry tests use. */
  readonly sky?: boolean | undefined
  readonly enemies?: readonly EnemyView[] | undefined
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
  const backdropZ = input.backdropZ ?? -420
  const parts: Mesh[] = [
    input.sky === false
      ? backdropMesh(backdropZ, 420, 280, 16, 11, PALETTE.backdropA, PALETTE.backdropB)
      : skyMesh(backdropZ, 420, 280),
  ]
  input.occluders.forEach((o, i) =>
    parts.push(occluderMesh(o, PALETTE.occluder, input.occluderUvs?.[i])),
  )
  for (const o of input.hiding ?? []) {
    const g = Number.isFinite(input.hidingGlow ?? 0)
      ? Math.max(0, Math.min(1, input.hidingGlow ?? 0))
      : 0
    // Nudged towards the viewer so it wins the depth test against its own face.
    parts.push(
      frameMesh(o.z + 0.4, o.x0, o.x1, o.y0, o.y1, 2.2, mix(PALETTE.hidingCold, PALETTE.hiding, g)),
    )
  }
  input.targets.forEach((t, i) => {
    const on = input.revealed?.[i] ?? false
    const inPlay = input.active ? input.active.includes(i) : true
    const base = on ? PALETTE.target : inPlay ? PALETTE.target : PALETTE.targetIdle
    // Filling towards the scoring colour as the hold accumulates: the player has
    // to know the position is *counting*, not merely correct.
    //
    // Number.isFinite first, because Math.max(0, Math.min(1, NaN)) is NaN and a
    // NaN channel silently paints nothing at all. A test found this.
    const raw = input.hold?.[i] ?? 0
    const f = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0
    parts.push(targetMesh(t, mix(base, PALETTE.targetRevealed, f)))
  })
  for (const e of input.enemies ?? []) {
    parts.push(enemyMesh(e))
    if (e.aimed && e.exposed) {
      parts.push(
        frameMesh(
          // In front of every layer of the eye, or it z-fights with the sclera.
          e.at.z + 1.6,
          e.at.x - e.radius - 3, e.at.x + e.radius + 3,
          e.at.y - e.radius - 3, e.at.y + e.radius + 3,
          1.8,
          PALETTE.enemyAimed,
        ),
      )
    }
  }
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
