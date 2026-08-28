/**
 * A level from a sentence — the pure half.
 *
 * The room scan asked a depth model where the surfaces were. This asks a language
 * model where the *walls should go*, which is a design question rather than a
 * measurement, and it is the one thing here that neither geometry nor a camera can
 * answer. Nothing about the boundary changes: the model produces the same typed
 * `RoomScan` the camera did, the same validator treats it as hostile, and the same
 * engine judges it afterwards. The architecture was built to be indifferent to
 * *who proposes*, and this is the test of that claim.
 *
 * One line is worth being explicit about: **the model never proposes where an
 * enemy goes.** It proposes cover. The candidate positions come from the same
 * deterministic grid the scan used, and the engine alone decides which of them a
 * body can fairly fight from. A model that could place enemies could place an
 * unfair one; a model that places walls cannot.
 */
import { proposeAnchors } from './roomGeometry'
import type { Billboard, RoomScan } from '../engine'

/**
 * Where cover may sit, in cm beyond the screen.
 *
 * Not taste. The player's leverage over where a sightline crosses an occluder is
 * `(1 - s)` (SPEC §6.3), so cover far from the window cannot be leaned around by
 * anybody. This band is the range in which leaning works, and the model is told
 * about it rather than left to discover it.
 */
export const COVER_BAND = { nearest: -30, furthest: -96 } as const
export const EXTENT = { x: 130, y: 70 } as const
export const MAX_COVER = 7

/** Whatever the model sent, before anything is believed about it. */
export interface ProposedRect {
  readonly label?: unknown
  readonly z?: unknown
  readonly x0?: unknown
  readonly x1?: unknown
  readonly y0?: unknown
  readonly y1?: unknown
}

export interface DesignReport {
  readonly scan: RoomScan
  readonly proposed: number
  readonly kept: number
  readonly clamped: number
  readonly dropped: number
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

/**
 * Turn whatever the model said into a level, assuming it said something wrong.
 *
 * Depths are clamped into the band because a rectangle at the wrong depth is
 * still a rectangle and the intent survives the clamp. Inverted and degenerate
 * rectangles are dropped instead, because nobody knows what a wall of negative
 * width was meant to be.
 */
export function levelFromRects(
  rects: readonly ProposedRect[],
  name: string,
  model: string,
  atISO: string,
): DesignReport {
  let clamped = 0
  let dropped = 0
  const occluders: Billboard[] = []

  const clamp = (v: number, lo: number, hi: number): number => {
    if (v < lo) { clamped++; return lo }
    if (v > hi) { clamped++; return hi }
    return v
  }

  for (const raw of rects.slice(0, MAX_COVER)) {
    // Not an object at all: a test handed this `[null]` and it threw.
    if (typeof raw !== 'object' || raw === null) {
      dropped++
      continue
    }
    const r = raw as ProposedRect
    const z = num(r.z)
    const x0 = num(r.x0)
    const x1 = num(r.x1)
    const y0 = num(r.y0)
    const y1 = num(r.y1)
    if (z === null || x0 === null || x1 === null || y0 === null || y1 === null) {
      dropped++
      continue
    }
    const lo = Math.min(x0, x1)
    const hi = Math.max(x0, x1)
    const bot = Math.min(y0, y1)
    const top = Math.max(y0, y1)
    // Too thin to hide behind, or zero area: not a wall.
    if (hi - lo < 6 || top - bot < 6) {
      dropped++
      continue
    }
    occluders.push({
      z: clamp(z, COVER_BAND.furthest, COVER_BAND.nearest),
      x0: clamp(lo, -EXTENT.x, EXTENT.x),
      x1: clamp(hi, -EXTENT.x, EXTENT.x),
      y0: clamp(bot, -EXTENT.y, EXTENT.y),
      y1: clamp(top, -EXTENT.y, EXTENT.y),
      label: typeof r.label === 'string' && r.label.trim() ? r.label.trim().slice(0, 40) : 'wall',
    })
  }
  if (rects.length > MAX_COVER) dropped += rects.length - MAX_COVER

  return {
    proposed: rects.length,
    kept: occluders.length,
    clamped,
    dropped,
    scan: {
      source: 'depth+vlm',
      occluders,
      // The grid, not the model. See the note at the top of this file.
      // Below the boundary validator's own cap, so a level never arrives already
      // truncated — the number of candidates is a fact about the level, not an
      // artefact of two limits disagreeing.
      anchors: proposeAnchors(occluders, { pitchCm: 9, maxAnchors: 240 }),
      noSpawn: [],
      provenance: { model, atISO, costCents: 0 },
    },
  }
}
