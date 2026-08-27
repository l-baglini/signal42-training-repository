import type { Envelope, Point3 } from './types'
import { bounds, contains } from './envelope'

/**
 * The solver's domain: the lattice points of `pitch` contained in the envelope,
 * held as a dense grid rather than a point list.
 *
 * Dense matters. Footprints become masks over the same grid, so set operations
 * (I3, I4) are elementwise, and the distance transform behind `inradius` is a
 * linear sweep instead of an O(n^2) pairwise scan.
 *
 * The grid carries a one-cell margin of non-member cells around the envelope.
 * The distance transform depends on it: a mask that touched the array edge
 * would have no source to measure against and would report an infinite window.
 */
export interface Lattice {
  readonly pitch: number
  readonly nx: number
  readonly ny: number
  readonly nz: number
  /** World position of cell (0, 0, 0). */
  readonly origin: Point3
  /** 1 where the cell centre is inside the envelope. */
  readonly inside: Uint8Array
  /** Number of member cells. */
  readonly count: number
}

export const cellIndex = (lat: Lattice, i: number, j: number, k: number): number =>
  i + lat.nx * (j + lat.ny * k)

export const cellCentre = (lat: Lattice, i: number, j: number, k: number): Point3 => ({
  x: lat.origin.x + i * lat.pitch,
  y: lat.origin.y + j * lat.pitch,
  z: lat.origin.z + k * lat.pitch,
})

/**
 * The effective radius of the envelope: how far from rest this body can actually
 * get. Thresholds are scaled by it rather than fixed, so a person with five
 * centimetres of range and a person with twenty-five are asked for the same
 * *effort*, not the same distance.
 */
export function reachCm(lat: Lattice, rest: Point3): number {
  let best = 0
  for (let k = 0; k < lat.nz; k++)
    for (let j = 0; j < lat.ny; j++)
      for (let i = 0; i < lat.nx; i++) {
        if (!lat.inside[cellIndex(lat, i, j, k)]) continue
        const c = cellCentre(lat, i, j, k)
        const d = Math.hypot(c.x - rest.x, c.y - rest.y, c.z - rest.z)
        if (d > best) best = d
      }
  return best
}

export function latticeOf(env: Envelope, pitch = 2): Lattice {
  const b = bounds(env)
  // One cell of margin on every side, so the mask can never touch the boundary.
  const origin: Point3 = {
    x: Math.floor(b.min.x / pitch) * pitch - pitch,
    y: Math.floor(b.min.y / pitch) * pitch - pitch,
    z: Math.floor(b.min.z / pitch) * pitch - pitch,
  }
  const span = (lo: number, hi: number) => Math.ceil((hi - lo) / pitch) + 3
  const nx = span(origin.x, b.max.x)
  const ny = span(origin.y, b.max.y)
  const nz = span(origin.z, b.max.z)

  const inside = new Uint8Array(nx * ny * nz)
  const lat: Lattice = { pitch, nx, ny, nz, origin, inside, count: 0 }
  let count = 0
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (contains(env, cellCentre(lat, i, j, k))) {
          inside[cellIndex(lat, i, j, k)] = 1
          count++
        }
      }
    }
  }
  return { ...lat, count }
}
