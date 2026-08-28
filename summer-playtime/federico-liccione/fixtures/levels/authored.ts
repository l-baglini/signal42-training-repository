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
import type { RoomScan } from '../../src/engine'
import doorwayRoom from './doorway.room.json'
import shelvesRoom from './shelves.room.json'
import parapetRoom from './parapet.room.json'
import deskRoom from './desk.room.json'

export interface AuthoredLevel {
  readonly id: string
  readonly name: string
  /** One line, shown when the level starts. */
  readonly blurb: string
  readonly scan: RoomScan
}

/**
 * The geometry lives in JSON next to this file and is **generated**, by
 * `npm run author`. What the room looks like is still hand-designed — the layouts
 * are written out in `tools/author.test.ts` — but where an enemy may stand is
 * swept and measured, because the one level whose anchors were placed by hand
 * turned out to have four usable positions out of twenty-one and a playtester
 * found it before any test did.
 *
 * What stays here is what only a person can write: the name and the sentence. The
 * sentence is not decoration either — `moodFor` reads it for the palette and the
 * weather, so "a rainy night" is both the blurb and the lighting.
 */
const level = (
  id: string, name: string, blurb: string, scan: unknown,
): AuthoredLevel => ({ id, name, blurb, scan: scan as RoomScan })

/**
 * Two slabs with a gap between them, close to the window. The purest statement of
 * the mechanic and deliberately the simplest level: one axis, one idea.
 */
const doorway = level(
  'doorway',
  'Doorway',
  'Two walls and a gap on a clear afternoon. The only way to look down the ' +
    'corridor is to stand in it.',
  doorwayRoom,
)

/**
 * A lattice: seven narrow uprights crossed by three shelves. The best threat
 * profile in the set, and the only layout that makes the neck work in both
 * directions — edges turned out to matter far more than area.
 */
const shelves = level(
  'shelves',
  'Shelves',
  'A neon arcade: uprights at four depths crossed by three shelves, and every ' +
    'one of them hides a different sliver of the room.',
  shelvesRoom,
)

/**
 * Vertical first: a low wall to rise above, pillars to lean past, a rail overhead.
 * A neck has roughly half the vertical range it has lateral, so these windows are
 * narrower by nature and worth more.
 */
const parapet = level(
  'parapet',
  'Parapet',
  'A rainy night on a low wall you have to rise above, and pillars you have to ' +
    'lean past. The weather and the palette both come from those words — see ' +
    '`moodFor` in src/render/mood.ts.',
  parapetRoom,
)

/**
 * A room of furniture rather than a designed layout, which is what the scan
 * pipeline produces. It is in the set to keep that case honest, and it is the level
 * a playtester caught presenting its targets in one specific spot.
 */
const desk = level(
  'desk',
  'The desk',
  'A desk at dusk: a monitor, a chair back, a lamp and a shelf, which is what a ' +
    'real room offers instead of a level.',
  deskRoom,
)

export const LEVELS: readonly AuthoredLevel[] = [doorway, shelves, parapet, desk]
