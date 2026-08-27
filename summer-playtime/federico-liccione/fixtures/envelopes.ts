/**
 * Synthetic envelopes. Fixtures, not engine — the engine never constructs a
 * body, it only measures one that perception handed it.
 *
 * Every one of these is a case the invariants of SPEC §6.7 are checked against,
 * including the ones that must produce a refusal.
 */
import { envelopeFrom } from '../src/engine'
import type { Envelope, Point3 } from '../src/engine'

const REST: Point3 = { x: 0, y: 0, z: 60 }

/** A person in a desk chair who leans comfortably. The default case. */
const SEATED: Point3[] = [
  { x: 20, y: 0, z: 60 }, { x: -20, y: 0, z: 60 },
  { x: 0, y: 12, z: 60 }, { x: 0, y: -10, z: 60 },
  { x: 0, y: 0, z: 72 }, { x: 0, y: 0, z: 45 },
  { x: 14, y: 8, z: 60 }, { x: -14, y: 8, z: 60 },
  { x: 14, y: -7, z: 60 }, { x: -14, y: -7, z: 60 },
  { x: 14, y: 0, z: 67 }, { x: -14, y: 0, z: 67 },
  { x: 0, y: 8, z: 67 }, { x: 0, y: -7, z: 67 },
]

export const seated = (): Envelope =>
  envelopeFrom({ samples: SEATED, rest: REST, vmax: 60, jitter: 0.4, latency: 0.06 })

/** Someone standing, with room to move. Used by I3's monotonicity check. */
export const roomy = (): Envelope =>
  envelopeFrom({
    samples: SEATED.map((p) => ({
      x: p.x * 1.8,
      y: p.y * 1.8,
      z: REST.z + (p.z - REST.z) * 1.8,
    })),
    rest: REST,
    vmax: 90,
    jitter: 0.4,
    latency: 0.06,
  })

/**
 * A body that can barely move — a 2 cm ball. This is the accessibility case and
 * invariant I9: the engine must refuse rather than ship a level nobody in this
 * envelope could play.
 */
export const frozen = (): Envelope =>
  envelopeFrom({
    samples: [
      { x: 1, y: 0, z: 60 }, { x: -1, y: 0, z: 60 },
      { x: 0, y: 1, z: 60 }, { x: 0, y: -1, z: 60 },
      { x: 0, y: 0, z: 61 }, { x: 0, y: 0, z: 59 },
    ],
    rest: REST,
    vmax: 8,
    jitter: 0.4,
    latency: 0.06,
  })

/** A tracker having a bad day: same body, ten times the noise. */
export const noisy = (): Envelope => ({ ...seated(), jitter: 4 })

export const all = (): ReadonlyArray<readonly [string, Envelope]> => [
  ['seated', seated()],
  ['roomy', roomy()],
  ['frozen', frozen()],
  ['noisy', noisy()],
]
