/**
 * The boundary. SPEC §7.4.
 *
 * Everything a model produces passes through here before the engine sees it, and
 * this code assumes its input is hostile. Not because a model is malicious, but
 * because the engine makes guarantees to the player and a guarantee that trusts
 * an unchecked number is not a guarantee.
 *
 * This module lives outside `src/engine/` deliberately: the engine may not import
 * it (invariant I6), and it may import the engine's vocabulary. The arrow points
 * inward.
 */
import type { Billboard, Point3, RoomScan, ScanSource } from '../engine'

/** Limits are stated here, once, and are the only place clamping happens. */
export const LIMITS = {
  maxOccluders: 24,
  maxAnchors: 64,
  maxNoSpawn: 12,
  /** cm behind the window. Nothing usable sits closer than 5 cm or past 6 m. */
  zNear: -5,
  zFar: -600,
  /** cm from the centre line, laterally and vertically. */
  xyLimit: 400,
} as const

const SOURCES: readonly ScanSource[] = ['fixture', 'depth', 'depth+vlm']

export interface ValidationReport {
  readonly scan: RoomScan
  readonly dropped: { occluders: number; anchors: number; noSpawn: number }
  readonly clamped: number
  readonly typeErrors: number
  readonly truncated: boolean
}

interface Counters {
  clamped: number
  typeErrors: number
}

function num(v: unknown, fallback: number, c: Counters): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    c.typeErrors++
    return fallback
  }
  return v
}

function clamp(v: number, lo: number, hi: number, c: Counters): number {
  if (v < lo) { c.clamped++; return lo }
  if (v > hi) { c.clamped++; return hi }
  return v
}

function str(v: unknown, fallback: string, c: Counters): string {
  if (typeof v !== 'string') { c.typeErrors++; return fallback }
  return v
}

function billboard(raw: unknown, c: Counters): Billboard | null {
  if (typeof raw !== 'object' || raw === null) { c.typeErrors++; return null }
  const r = raw as Record<string, unknown>
  const z = clamp(num(r.z, LIMITS.zNear, c), LIMITS.zFar, LIMITS.zNear, c)
  const lim = LIMITS.xyLimit
  const x0 = clamp(num(r.x0, 0, c), -lim, lim, c)
  const x1 = clamp(num(r.x1, 0, c), -lim, lim, c)
  const y0 = clamp(num(r.y0, 0, c), -lim, lim, c)
  const y1 = clamp(num(r.y1, 0, c), -lim, lim, c)
  // A degenerate or inverted rectangle is dropped rather than repaired: nobody
  // knows what an occluder of negative width was supposed to mean.
  if (!(x1 > x0) || !(y1 > y0)) return null
  return { z, x0, x1, y0, y1, label: str(r.label, 'unlabelled', c) }
}

function point(raw: unknown, c: Counters): Point3 | null {
  if (typeof raw !== 'object' || raw === null) { c.typeErrors++; return null }
  const r = raw as Record<string, unknown>
  const lim = LIMITS.xyLimit
  const z = num(r.z, 0, c)
  // An anchor outside the usable depth band is dropped, not clamped: pulling it
  // to the boundary would invent a target position the scan never proposed.
  if (z > LIMITS.zNear || z < LIMITS.zFar) return null
  return {
    x: clamp(num(r.x, 0, c), -lim, lim, c),
    y: clamp(num(r.y, 0, c), -lim, lim, c),
    z,
  }
}

function list<T>(raw: unknown, cap: number, f: (v: unknown) => T | null): {
  kept: T[]
  dropped: number
  truncated: boolean
} {
  if (!Array.isArray(raw)) return { kept: [], dropped: 0, truncated: false }
  const truncated = raw.length > cap
  const slice = raw.slice(0, cap)
  const kept: T[] = []
  let dropped = truncated ? raw.length - cap : 0
  for (const v of slice) {
    const out = f(v)
    if (out === null) dropped++
    else kept.push(out)
  }
  return { kept, dropped, truncated }
}

/**
 * Validate and clamp an untrusted scan into one the engine may consume.
 *
 * Never throws. A scan this bad produces an empty one, and an empty scan makes
 * the generator refuse — which is the correct outcome and a tested one (I8),
 * not a crash to be handled somewhere else.
 */
export function validateScan(raw: unknown): ValidationReport {
  const c: Counters = { clamped: 0, typeErrors: 0 }
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>

  const occ = list(r.occluders, LIMITS.maxOccluders, (v) => billboard(v, c))
  const anc = list(r.anchors, LIMITS.maxAnchors, (v) => point(v, c))
  const nos = list(r.noSpawn, LIMITS.maxNoSpawn, (v) => billboard(v, c))

  const sourceRaw = r.source
  const source: ScanSource = SOURCES.includes(sourceRaw as ScanSource)
    ? (sourceRaw as ScanSource)
    : ((): ScanSource => { c.typeErrors++; return 'fixture' })()

  const prov = (typeof r.provenance === 'object' && r.provenance !== null
    ? r.provenance
    : {}) as Record<string, unknown>

  return {
    scan: {
      source,
      occluders: occ.kept,
      anchors: anc.kept,
      noSpawn: nos.kept,
      provenance: {
        model: str(prov.model, 'unknown', c),
        atISO: str(prov.atISO, '', c),
        costCents: Math.max(0, num(prov.costCents, 0, c)),
      },
    },
    dropped: { occluders: occ.dropped, anchors: anc.dropped, noSpawn: nos.dropped },
    clamped: c.clamped,
    typeErrors: c.typeErrors,
    truncated: occ.truncated || anc.truncated || nos.truncated,
  }
}
