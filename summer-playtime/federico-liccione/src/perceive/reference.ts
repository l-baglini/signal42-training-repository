/**
 * A reference body, for running the game before a real calibration exists.
 *
 * Deliberately *not* shared with `fixtures/envelopes.ts`: the invariants are
 * tested against their own fixtures, and changing the app's default must not
 * silently change what the test suite is checking. The duplication is fourteen
 * numbers and it buys that independence.
 */
import { envelopeFrom } from '../engine'
import type { Envelope, Point3 } from '../engine'

const REST: Point3 = { x: 0, y: 0, z: 60 }

const SAMPLES: Point3[] = [
  { x: 20, y: 0, z: 60 }, { x: -20, y: 0, z: 60 },
  { x: 0, y: 12, z: 60 }, { x: 0, y: -10, z: 60 },
  { x: 0, y: 0, z: 72 }, { x: 0, y: 0, z: 45 },
  { x: 14, y: 8, z: 60 }, { x: -14, y: 8, z: 60 },
  { x: 14, y: -7, z: 60 }, { x: -14, y: -7, z: 60 },
  { x: 14, y: 0, z: 67 }, { x: -14, y: 0, z: 67 },
  { x: 0, y: 8, z: 67 }, { x: 0, y: -7, z: 67 },
]

export const referenceBody = (latencyS = 0.06): Envelope =>
  envelopeFrom({ samples: SAMPLES, rest: REST, vmax: 60, jitter: 0.4, latency: latencyS })
