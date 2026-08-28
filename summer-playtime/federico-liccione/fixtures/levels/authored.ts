/**
 * Hand-authored levels.
 *
 * A playtester made the sharpest point in the project: generating the level from
 * the player's own room makes the quality of the experience hostage to their
 * furniture. Someone in a bare room gets a bare level, and a showcase happens in
 * a meeting room with a table and a wall. The scan stays as a capability; it is
 * no longer the game.
 *
 * These layouts are designed, and then **verified** — `npm run levels` runs every
 * one through the engine against the reference body and reports the distribution
 * of leans, windows and rejections. The geometry below was iterated against that
 * output, not guessed at, and the leverage identity of SPEC §6.3 decides where
 * cover may sit: the player's control over a sightline is `(1 - s)`, so cover
 * belongs near the window and targets well behind it.
 */
import type { Billboard, Point3, RoomScan } from '../../src/engine'

export interface AuthoredLevel {
  readonly id: string
  readonly name: string
  /** One line, shown when the level starts. */
  readonly blurb: string
  readonly scan: RoomScan
}

const bill = (
  z: number, x0: number, x1: number, y0: number, y1: number, label: string,
): Billboard => ({ z, x0, x1, y0, y1, label })

/** A grid of candidate positions. The engine keeps what it can prove is fair. */
function candidates(
  depths: readonly number[],
  xs: { from: number; to: number; step: number },
  ys: readonly number[],
): Point3[] {
  const out: Point3[] = []
  for (const z of depths) {
    for (const y of ys) {
      for (let x = xs.from; x <= xs.to; x += xs.step) out.push({ x, y, z })
    }
  }
  return out
}

const provenance = (name: string) => ({
  model: `authored:${name}`,
  atISO: '2026-08-29T00:00:00.000Z',
  costCents: 0,
})

/**
 * Two slabs with a gap between them. The purest statement of the mechanic: the
 * only way to see down the corridor is to put your head in the doorway.
 */
const doorway: AuthoredLevel = {
  id: 'doorway',
  name: 'Doorway',
  blurb:
    'Two walls and a gap at dusk. The only way to look down the corridor is to ' +
    'stand in it.',
  scan: {
    source: 'fixture',
    occluders: [
      bill(-46, -96, -13, -40, 44, 'left jamb'),
      bill(-46, 13, 96, -40, 44, 'right jamb'),
      bill(-92, -30, 30, 16, 50, 'lintel'),
    ],
    anchors: candidates([-155, -205, -255], { from: -78, to: 78, step: 9 }, [-16, -2, 12, 26]),
    noSpawn: [],
    provenance: provenance('doorway'),
  },
}

/**
 * Vertical slabs at staggered depths. Lots of narrow lateral windows, and the
 * near ones give the most leverage, so the shallow enemies are the easy ones.
 */
const shelves: AuthoredLevel = {
  id: 'shelves',
  name: 'Shelves',
  blurb:
    'An industrial warehouse: uprights at four depths, and every one of them hides ' +
    'a different sliver of the room.',
  scan: {
    source: 'fixture',
    occluders: [
      bill(-38, -58, -40, -34, 40, 'upright A'),
      bill(-52, -8, 12, -34, 46, 'upright B'),
      bill(-66, 40, 62, -34, 40, 'upright C'),
      bill(-80, -100, -74, -30, 36, 'upright D'),
      bill(-58, -74, 74, -44, -30, 'low shelf'),
    ],
    anchors: candidates([-145, -190, -240], { from: -90, to: 90, step: 9 }, [-14, 0, 14, 28]),
    noSpawn: [],
    provenance: provenance('shelves'),
  },
}

/**
 * A wide low wall with two pillars. The low wall is here to force vertical
 * peeking, which the axis measurement showed the room fixture had none of — and
 * a neck has roughly half the vertical range it has lateral, so these windows are
 * narrower by nature and worth more.
 */
const parapet: AuthoredLevel = {
  id: 'parapet',
  name: 'Parapet',
  blurb:
    'A rainy night on a low wall you have to rise above, and two pillars you have ' +
    'to lean past. The weather and the palette both come from those words — see ' +
    '`moodFor` in src/render/mood.ts.',
  scan: {
    source: 'fixture',
    occluders: [
      bill(-44, -110, 110, -46, 6, 'parapet'),
      bill(-58, -46, -28, 4, 48, 'pillar left'),
      bill(-58, 28, 46, 4, 48, 'pillar right'),
    ],
    anchors: candidates([-150, -200, -250], { from: -84, to: 84, step: 9 }, [-26, -10, 4, 18, 32]),
    noSpawn: [],
    provenance: provenance('parapet'),
  },
}

export const LEVELS: readonly AuthoredLevel[] = [doorway, shelves, parapet]
