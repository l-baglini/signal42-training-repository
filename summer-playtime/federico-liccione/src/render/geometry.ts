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
import { DEFAULT_MOOD, type Mood } from './mood'

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

/**
 * A quad from four arbitrary points, with a colour each.
 *
 * The constraint that cover must be screen-parallel applies to the *solver*, not
 * to the renderer — and only to cover. Everything that occludes nothing may be
 * any shape at all, which is what makes a floor, side walls and a ceiling
 * possible. Recognising that took embarrassingly long.
 *
 * Winding is a, b, d / a, d, c so that (a,b) is one edge and (c,d) the opposite
 * one; back faces are not culled, so a wall is visible from either side.
 */
export function quad3(
  a: Point3, b: Point3, c: Point3, d: Point3,
  ca: Rgb, cb: Rgb = ca, cc: Rgb = ca, cd: Rgb = cb,
): Mesh {
  return {
    positions: new Float32Array([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z]),
    colors: new Float32Array([...ca, ...cb, ...cc, ...cd]),
    uvs: new Float32Array(8),
    textured: new Float32Array(4),
    indices: new Uint32Array([0, 1, 3, 0, 3, 2]),
  }
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

export interface EnvironmentOptions {
  readonly nearZ?: number
  readonly farZ?: number
  readonly halfWidth?: number
  readonly floorY?: number
  readonly wallTopY?: number
  /** Side of one floor tile, cm. The unit the eye measures distance in. */
  readonly tileCm?: number
}

const ENV_DEFAULTS = {
  nearZ: -14,
  // The corridor stops short of the sky so that the far end is an *opening*.
  farZ: -430,
  halfWidth: 118,
  floorY: -64,
  /**
   * Low walls, not a tube. There used to be a ceiling and the corridor was a
   * closed box graded from near-black to bright; it read as a tunnel of fog. Open
   * it to the sky and every block has something bright to be an outline against,
   * which is the whole reason a voxel game is readable at a glance.
   */
  wallTopY: 26,
  tileCm: 26,
} as const

/**
 * The place the cover stands in: a checkered floor, two low side walls, open sky.
 *
 * None of it occludes anything, so none of it has to be screen-parallel — a
 * constraint I had been applying to the whole renderer when it only ever applied
 * to the solver, and only to cover.
 *
 * **Distance is carried by the tiles, not by colour.** The previous version graded
 * every surface from near-black to bright and leaned on aerial perspective, and a
 * playtester's verdict was that it confused rather than helped. A checkerboard in
 * perspective states depth without touching contrast: the tiles get smaller, and
 * that is the whole cue. It also gives the head-tracked parallax something with
 * hard edges to slide against, which a smooth gradient cannot do.
 */
export function environmentMesh(mood: Mood = DEFAULT_MOOD, opts: EnvironmentOptions = {}): Mesh {
  const o = { ...ENV_DEFAULTS, ...opts }
  const parts: Mesh[] = []
  const tile = Math.max(4, o.tileCm)

  const cols = Math.max(1, Math.round((o.halfWidth * 2) / tile))
  const rows = Math.max(1, Math.round((o.nearZ - o.farZ) / tile))
  const dx = (o.halfWidth * 2) / cols
  const dz = (o.nearZ - o.farZ) / rows

  for (let j = 0; j < rows; j++) {
    const z0 = o.nearZ - dz * j
    const z1 = o.nearZ - dz * (j + 1)
    for (let i = 0; i < cols; i++) {
      const x0 = -o.halfWidth + dx * i
      const x1 = x0 + dx
      const tone = (i + j) % 2 === 0 ? mood.floorA : mood.floorB
      parts.push(quad3(
        { x: x0, y: o.floorY, z: z0 }, { x: x1, y: o.floorY, z: z0 },
        { x: x0, y: o.floorY, z: z1 }, { x: x1, y: o.floorY, z: z1 },
        tone,
      ))
    }

    // The walls take the same courses, so the two surfaces agree about where one
    // step of depth is.
    const shade = j % 2 === 0 ? 1 : 0.88
    const body: Rgb = [mood.wall[0] * shade, mood.wall[1] * shade, mood.wall[2] * shade]
    const capH = Math.min(6, (o.wallTopY - o.floorY) * 0.12)
    for (const sx of [-1, 1]) {
      parts.push(quad3(
        { x: sx * o.halfWidth, y: o.floorY, z: z0 },
        { x: sx * o.halfWidth, y: o.wallTopY - capH, z: z0 },
        { x: sx * o.halfWidth, y: o.floorY, z: z1 },
        { x: sx * o.halfWidth, y: o.wallTopY - capH, z: z1 },
        body,
      ))
      parts.push(quad3(
        { x: sx * o.halfWidth, y: o.wallTopY - capH, z: z0 },
        { x: sx * o.halfWidth, y: o.wallTopY, z: z0 },
        { x: sx * o.halfWidth, y: o.wallTopY - capH, z: z1 },
        { x: sx * o.halfWidth, y: o.wallTopY, z: z1 },
        mood.wallCap,
      ))
    }
  }
  return merge(parts)
}

/**
 * Clouds, as flat blocks in the sky.
 *
 * Literally rectangles, which is what a voxel game's clouds are: no noise, no
 * softness, nothing that has to be sampled. They sit beyond the corridor and
 * above the walls, so they occlude nothing and cannot be mistaken for cover.
 *
 * Seeded, so a level looks the same every time it is played — the seed comes from
 * the level, not from the clock.
 */
export function cloudMesh(mood: Mood = DEFAULT_MOOD, seed = 1): Mesh {
  let s = (seed * 2654435761) >>> 0
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
  const parts: Mesh[] = []
  for (const layer of [
    { z: -466, y: 96, tint: 1.0 },
    { z: -498, y: 168, tint: 0.86 },
  ]) {
    const tone: Rgb = [
      mood.cloud[0] * layer.tint, mood.cloud[1] * layer.tint, mood.cloud[2] * layer.tint,
    ]
    let x = -430
    while (x < 430) {
      const w = 40 + rnd() * 110
      const h = 14 + rnd() * 20
      const y = layer.y + (rnd() - 0.5) * 60
      parts.push(quad(layer.z, x, x + w, y, y + h, tone))
      x += w + 40 + rnd() * 120
    }
  }
  return merge(parts)
}

/**
 * A piece of cover, as a block.
 *
 * Still one screen-parallel rectangle at one depth, because the solver's
 * exactness depends on it — and yet it reads as a solid block, because the
 * constraint never forbade the block. It forbade the **extrusion**: a box with
 * depth has a silhouette wider than its own front face, so drawing one would
 * promise the eye a piece of cover wider than the one the sightline test uses,
 * and the promise would break in the player's favour and then against them.
 *
 * So the extrusion is drawn *inwards*. A bright outline, then four bevel faces
 * shaded as if lit from the upper left — top brightest, left mid, right dark,
 * bottom darkest — then a flat front face. Every vertex is inside the rectangle
 * and at exactly its depth, which `tests/geometry.test.ts` asserts, so the
 * picture cannot promise solidity the engine does not believe in.
 */
export function coverMesh(b: Billboard, mood: Mood = DEFAULT_MOOD, uv?: UvRect): Mesh {
  // With a texture rect it is a plain textured quad: that path exists so the
  // player can see their own room on the cover, and shading over a photograph
  // fights the photograph.
  if (uv) return quad(b.z, b.x0, b.x1, b.y0, b.y1, mood.blockFace as Rgb, uv)

  const w = b.x1 - b.x0
  const h = b.y1 - b.y0
  const edge = Math.max(0.6, Math.min(1.8, w * 0.05, h * 0.05))
  const ix0 = b.x0 + edge
  const ix1 = b.x1 - edge
  const iy0 = b.y0 + edge
  const iy1 = b.y1 - edge
  const parts: Mesh[] = [frameMesh(b.z, b.x0, b.x1, b.y0, b.y1, edge, mood.blockEdge)]

  const bevel = Math.min(7, (ix1 - ix0) * 0.22, (iy1 - iy0) * 0.22)
  const cx0 = ix0 + bevel
  const cx1 = ix1 - bevel
  const cy0 = iy0 + bevel
  const cy1 = iy1 - bevel
  if (!(cx1 > cx0 && cy1 > cy0)) {
    // Too small to bevel. One flat face, which is still a block.
    parts.push(quad(b.z, ix0, ix1, iy0, iy1, mood.blockFace as Rgb))
    return merge(parts)
  }

  const left = mix(mood.blockFace, mood.blockTop, 0.45)
  const right = mix(mood.blockFace, mood.blockSide, 0.55)
  const z = b.z
  // Top, bottom, left, right: the outer edge of each bevel is on the inset
  // rectangle and the inner edge on the face rectangle.
  parts.push(quad3(
    { x: ix0, y: iy1, z }, { x: ix1, y: iy1, z },
    { x: cx0, y: cy1, z }, { x: cx1, y: cy1, z },
    mood.blockTop,
  ))
  parts.push(quad3(
    { x: ix0, y: iy0, z }, { x: ix1, y: iy0, z },
    { x: cx0, y: cy0, z }, { x: cx1, y: cy0, z },
    mood.blockSide,
  ))
  parts.push(quad3(
    { x: ix0, y: iy0, z }, { x: ix0, y: iy1, z },
    { x: cx0, y: cy0, z }, { x: cx0, y: cy1, z },
    left,
  ))
  parts.push(quad3(
    { x: ix1, y: iy0, z }, { x: ix1, y: iy1, z },
    { x: cx1, y: cy0, z }, { x: cx1, y: cy1, z },
    right,
  ))
  parts.push(quad(z, cx0, cx1, cy0, cy1, mood.blockFace as Rgb))
  return merge(parts)
}

/**
 * The dark patch where a piece of cover meets the floor.
 *
 * Flat and hard-edged like everything else — a voxel game's shadow is a shape,
 * not a falloff. It is floor geometry, occludes nothing, and is therefore
 * unconstrained.
 */
export function contactShadowMesh(
  b: Billboard,
  floorY: number,
  mood: Mood = DEFAULT_MOOD,
  depth = 26,
): Mesh {
  const y = floorY + 0.4
  return quad3(
    { x: b.x0, y, z: b.z }, { x: b.x1, y, z: b.z },
    { x: b.x0, y, z: b.z - depth }, { x: b.x1, y, z: b.z - depth },
    mood.shadow,
  )
}

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

/**
 * The colours that are not the level's own.
 *
 * Everything a level chooses — sky, floor, walls, blocks — lives in `mood.ts`.
 * What is left here is what must never change with the level, because the player
 * reads a rule off it: an enemy, a threat, a piece of cover you are safe behind.
 * Those are loud and saturated, and they are the same loud in every mood.
 */
export const PALETTE = {
  target: [0.32, 0.88, 0.68] as Rgb,
  targetIdle: [0.14, 0.28, 0.26] as Rgb,
  targetRevealed: [1.0, 0.86, 0.35] as Rgb,
  enemySocket: [0.05, 0.03, 0.04] as Rgb,
  enemyLid: [0.52, 0.16, 0.19] as Rgb,
  enemySclera: [0.98, 0.95, 0.90] as Rgb,
  enemyIris: [0.94, 0.22, 0.26] as Rgb,
  enemyPupil: [0.03, 0.02, 0.03] as Rgb,
  enemyFiring: [1.0, 0.94, 0.60] as Rgb,
  enemyAimed: [1.0, 0.66, 0.32] as Rgb,
  threat: [0.95, 0.32, 0.35] as Rgb,
  threatMarker: [1.0, 0.45, 0.28] as Rgb,
  /** Cover with something behind it. Amber for one, hot for a crowd. */
  occupied: [1.0, 0.72, 0.24] as Rgb,
  occupiedHot: [1.0, 0.36, 0.30] as Rgb,
  hiding: [0.42, 0.95, 0.78] as Rgb,
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
   * Cover with a live enemy behind it, and how many.
   *
   * The cue that says the room is *occupied*. An enemy that cannot be engaged
   * draws nothing at all — that is the symmetry the whole design rests on, and it
   * is not negotiable — but the **cover** it is standing behind is level geometry,
   * and outlining that says "something is back there" without saying which side of
   * it or how far to lean. The lean stays entirely the player's.
   *
   * This existed for the hunt, was never reconnected when the hunt became combat,
   * and its absence is most of why a playtester reported a room with eight enemies
   * in it as emptier than one with two.
   */
  readonly occupied?: ReadonlyArray<{
    readonly box: Billboard
    readonly count: number
  }> | undefined
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
  /** False leaves out the floor, walls and ceiling. */
  readonly environment?: boolean | undefined
  readonly mood?: Mood | undefined
  /** Seeds the skyline, so a level looks the same every time. */
  readonly skylineSeed?: number | undefined
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
  const backdropZ = input.backdropZ ?? -540
  const floorY = ENV_DEFAULTS.floorY
  const parts: Mesh[] = [
    input.sky === false
      ? backdropMesh(backdropZ, 460, 320, 16, 11, PALETTE.backdropA, PALETTE.backdropB)
      : skyMesh(backdropZ, 460, 320),
  ]
  const mood = input.mood ?? DEFAULT_MOOD
  if (input.environment !== false) {
    parts.push(cloudMesh(mood, input.skylineSeed ?? 1))
    parts.push(environmentMesh(mood))
  }

  // Shadows before the cover, so a piece of cover always wins its own footing.
  for (const o of input.occluders) parts.push(contactShadowMesh(o, floorY, mood))
  input.occluders.forEach((o, i) => parts.push(coverMesh(o, mood, input.occluderUvs?.[i])))

  for (const o of input.hiding ?? []) {
    const g = Number.isFinite(input.hidingGlow ?? 0)
      ? Math.max(0, Math.min(1, input.hidingGlow ?? 0))
      : 0
    // Nudged towards the viewer so it wins the depth test against its own face.
    parts.push(
      frameMesh(o.z + 0.4, o.x0, o.x1, o.y0, o.y1, 2.2, mix(PALETTE.hidingCold, PALETTE.hiding, g)),
    )
  }

  for (const { box, count } of input.occupied ?? []) {
    // Brighter for a busier piece of cover, so the read is not just "something"
    // but "how much". Two enemies behind one block is a different decision.
    const n = Number.isFinite(count) ? Math.max(0, Math.min(3, count)) : 0
    if (n <= 0) continue
    const tone = mix(PALETTE.occupied, PALETTE.occupiedHot, (n - 1) / 2)
    parts.push(frameMesh(box.z + 0.4, box.x0, box.x1, box.y0, box.y1, 2.2, tone))
  }

  input.targets.forEach((t, i) => {
    const on = input.revealed?.[i] ?? false
    const inPlay = input.active ? input.active.includes(i) : true
    const base = on ? PALETTE.target : inPlay ? PALETTE.target : PALETTE.targetIdle
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
