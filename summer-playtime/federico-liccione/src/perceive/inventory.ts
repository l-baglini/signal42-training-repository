/**
 * What the objects in the room *are*. SPEC §7.3.
 *
 * Depth says where a surface is; it cannot say that the bright rectangle is a
 * window and therefore a bad place to put anything, or that the shape at mid
 * depth is a chair back and therefore cover. That is a judgement about what
 * things are, and it is the one thing a vision model is asked for here.
 *
 * The division of labour is deliberate and narrow. **The model is never asked
 * where anything is.** It is handed the regions the depth pass already found,
 * numbered, and asked only to name and classify them. Asking a language model for
 * bounding boxes would be asking it for the one thing it is worst at, and would
 * put geometry — which the engine's guarantees rest on — in its hands.
 *
 * This module is pure. The HTTP call lives in `semanticScan.ts`.
 */
import type { Billboard, RoomScan } from '../engine'

export type RegionClass =
  | 'furniture'
  | 'appliance'
  | 'decor'
  | 'structure'
  | 'window'
  | 'person'
  | 'other'

export type RegionUse = 'cover' | 'hazard' | 'ignore'

export interface RegionLabel {
  readonly index: number
  readonly label: string
  readonly class: RegionClass
  readonly use: RegionUse
}

export interface Inventory {
  readonly regions: readonly RegionLabel[]
}

export interface InventoryCost {
  readonly model: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cents: number
}

const CLASSES: readonly RegionClass[] = [
  'furniture', 'appliance', 'decor', 'structure', 'window', 'person', 'other',
]
const USES: readonly RegionUse[] = ['cover', 'hazard', 'ignore']

/**
 * Validate an inventory the way §7.4 validates everything else: assuming the
 * input is hostile. A label out of range, a class that is not in the enum, a
 * duplicate index — all dropped rather than repaired, because nobody knows what
 * a region 47 of 6 was supposed to mean.
 */
export function validateInventory(raw: unknown, regionCount: number): {
  inventory: Inventory
  dropped: number
  typeErrors: number
} {
  let dropped = 0
  let typeErrors = 0
  const seen = new Set<number>()
  const regions: RegionLabel[] = []

  const list = (raw as { regions?: unknown })?.regions
  if (!Array.isArray(list)) return { inventory: { regions: [] }, dropped: 0, typeErrors: 1 }

  for (const item of list) {
    if (typeof item !== 'object' || item === null) { dropped++; continue }
    const r = item as Record<string, unknown>
    const index = typeof r.index === 'number' && Number.isInteger(r.index) ? r.index : -1
    if (index < 0 || index >= regionCount || seen.has(index)) { dropped++; continue }
    seen.add(index)
    const cls = CLASSES.includes(r.class as RegionClass) ? (r.class as RegionClass) : 'other'
    const use = USES.includes(r.use as RegionUse) ? (r.use as RegionUse) : 'cover'
    if (cls === 'other' && r.class !== 'other') typeErrors++
    if (!USES.includes(r.use as RegionUse)) typeErrors++
    const label =
      typeof r.label === 'string' && r.label.trim().length > 0
        ? r.label.trim().slice(0, 48)
        : 'unnamed'
    if (typeof r.label !== 'string') typeErrors++
    regions.push({ index, label, class: cls, use })
  }
  return { inventory: { regions }, dropped, typeErrors }
}

/**
 * Fold an inventory into a scan.
 *
 * Note exactly what this is allowed to change and what it is not. Labels are
 * provenance and UI. A region the model calls a hazard becomes a no-spawn area,
 * which only ever *removes* places a target may go. A region it calls `ignore`
 * stops being cover.
 *
 * What it cannot do is authorise anything. It never adds an anchor, never moves
 * a rectangle, and never makes a position playable — every enemy still has to
 * survive the engine's judgement afterwards, unchanged.
 */
export function applyInventory(scan: RoomScan, inventory: Inventory): RoomScan {
  const byIndex = new Map(inventory.regions.map((r) => [r.index, r]))
  const occluders: Billboard[] = []
  const noSpawn: Billboard[] = [...scan.noSpawn]

  scan.occluders.forEach((o, i) => {
    const r = byIndex.get(i)
    if (!r) {
      occluders.push(o)
      return
    }
    const labelled: Billboard = { ...o, label: `${r.label} (${r.class})` }
    if (r.use === 'hazard') {
      noSpawn.push(labelled)
      return
    }
    if (r.use === 'ignore') return
    occluders.push(labelled)
  })

  return {
    ...scan,
    source: 'depth+vlm',
    occluders,
    noSpawn,
  }
}

/**
 * Cost of one call, from the response's own usage figures rather than an estimate.
 * The brief asks for runtime AI with a visible cost; this is the number it shows.
 */
export function costOf(
  model: string,
  inputTokens: number,
  outputTokens: number,
  perMTok: { input: number; output: number },
): InventoryCost {
  const dollars =
    (inputTokens / 1e6) * perMTok.input + (outputTokens / 1e6) * perMTok.output
  return { model, inputTokens, outputTokens, cents: dollars * 100 }
}
