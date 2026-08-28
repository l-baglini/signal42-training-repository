/**
 * Instrument. Runs plausible model replies through the whole designed-level path
 * and reports what the engine makes of them — so "the level was not built" can be
 * reproduced without an API key or a guess.
 */
import { it } from 'vitest'
import { levelFromRects } from '../src/perceive/levelDesign'
import { validateScan } from '../src/boundary/validate'
import { assessEnemies } from '../src/engine'
import { seated } from '../fixtures/envelopes'

const at = '2026-08-29T00:00:00.000Z'

const replies: Array<{ name: string; cover: Array<Record<string, unknown>> }> = [
  {
    name: 'corridor with pillars and a low wall',
    cover: [
      { label: 'left wall', z: -60, x0: -120, x1: -60, y0: -50, y1: 50 },
      { label: 'right wall', z: -60, x0: 60, x1: 120, y0: -50, y1: 50 },
      { label: 'pillar', z: -45, x0: -15, x1: 15, y0: -40, y1: 40 },
      { label: 'low wall', z: -35, x0: 30, x1: 100, y0: -45, y1: -5 },
    ],
  },
  {
    name: 'two crates and a doorway',
    cover: [
      { label: 'crate left', z: -50, x0: -70, x1: -20, y0: -45, y1: 5 },
      { label: 'crate right', z: -50, x0: 20, x1: 70, y0: -45, y1: 5 },
      { label: 'lintel', z: -70, x0: -40, x1: 40, y0: 20, y1: 55 },
    ],
  },
  {
    name: 'a single tall pillar',
    cover: [{ label: 'pillar', z: -55, x0: -20, x1: 20, y0: -50, y1: 50 }],
  },
  {
    name: 'everything at the far edge of the band',
    cover: [
      { label: 'wall a', z: -95, x0: -100, x1: -30, y0: -40, y1: 40 },
      { label: 'wall b', z: -95, x0: 30, x1: 100, y0: -40, y1: 40 },
    ],
  },
]

it('designed', () => {
  const env = seated()
  for (const reply of replies) {
    const report = levelFromRects(reply.cover, reply.name, 'sim', at)
    const validated = validateScan(report.scan)
    const { assessments } = assessEnemies(validated.scan, env)
    const fair = assessments.filter((a) => a.fair)
    const rejects: Record<string, number> = {}
    for (const a of assessments) if (a.reject) rejects[a.reject] = (rejects[a.reject] ?? 0) + 1
    const zs = report.scan.anchors.map((a) => a.z)
    console.log(
      `\n${reply.name}\n` +
      `  walls ${report.kept}/${report.proposed}  clamped ${report.clamped}  dropped ${report.dropped}\n` +
      `  anchors ${report.scan.anchors.length} at depths ${[...new Set(zs)].join(', ')}\n` +
      `  FAIR ${fair.length}   ${Object.entries(rejects).map(([k, n]) => `${n} ${k}`).join(', ')}`,
    )
  }
})
