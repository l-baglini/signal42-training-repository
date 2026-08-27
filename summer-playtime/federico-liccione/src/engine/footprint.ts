import type { Billboard, Point3 } from './types'
import { cellCentre, cellIndex, type Lattice } from './lattice'
import { visible } from './sightline'
import { dist } from './vec'

/**
 * V(t) — the set of eye positions in the envelope from which the target is
 * visible. SPEC §6.3, and the central object of the whole game: every predicate
 * the player experiences is a property of this mask.
 *
 * Brute force on purpose. |E| × |occluders| exact segment tests is a few tens of
 * thousands of trivial operations, so the footprint is computed rather than
 * estimated, and every downstream predicate is a fact about the level instead of
 * a guess.
 */
export function footprintMask(
  lat: Lattice,
  occluders: readonly Billboard[],
  target: Point3,
): Uint8Array {
  const mask = new Uint8Array(lat.inside.length)
  for (let k = 0; k < lat.nz; k++) {
    for (let j = 0; j < lat.ny; j++) {
      for (let i = 0; i < lat.nx; i++) {
        const n = cellIndex(lat, i, j, k)
        if (!lat.inside[n]) continue
        if (visible(cellCentre(lat, i, j, k), target, occluders)) mask[n] = 1
      }
    }
  }
  return mask
}

export function maskCount(mask: Uint8Array): number {
  let c = 0
  for (let i = 0; i < mask.length; i++) if (mask[i]) c++
  return c
}

const INF = 1e20

/**
 * Felzenszwalb & Huttenlocher's exact 1D squared-distance transform, the lower
 * envelope of a set of parabolas. INF is deliberately a large finite number
 * rather than Infinity: the arithmetic below would produce NaN otherwise.
 */
function dt1d(
  f: Float64Array,
  n: number,
  out: Float64Array,
  v: Int32Array,
  z: Float64Array,
): void {
  let k = 0
  v[0] = 0
  z[0] = -INF
  z[1] = INF
  for (let q = 1; q < n; q++) {
    let s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!)
    while (s <= z[k]!) {
      k--
      s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!)
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = INF
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++
    const d = q - v[k]!
    out[q] = d * d + f[v[k]!]!
  }
}

/**
 * For every cell, the squared distance in cell units to the nearest cell that
 * is NOT in the mask. Three separable passes, exact Euclidean, linear time.
 *
 * This is why the lattice carries a margin of non-member cells: without it a
 * mask touching the array edge would have no source to measure against.
 */
export function edtSquared(mask: Uint8Array, nx: number, ny: number, nz: number): Float64Array {
  const f = new Float64Array(mask.length)
  for (let i = 0; i < mask.length; i++) f[i] = mask[i] ? INF : 0

  const maxDim = Math.max(nx, ny, nz)
  const line = new Float64Array(maxDim)
  const out = new Float64Array(maxDim)
  const v = new Int32Array(maxDim)
  const z = new Float64Array(maxDim + 1)

  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++) {
      const base = nx * (j + ny * k)
      for (let i = 0; i < nx; i++) line[i] = f[base + i]!
      dt1d(line, nx, out, v, z)
      for (let i = 0; i < nx; i++) f[base + i] = out[i]!
    }

  for (let k = 0; k < nz; k++)
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) line[j] = f[i + nx * (j + ny * k)]!
      dt1d(line, ny, out, v, z)
      for (let j = 0; j < ny; j++) f[i + nx * (j + ny * k)] = out[j]!
    }

  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      for (let k = 0; k < nz; k++) line[k] = f[i + nx * (j + ny * k)]!
      dt1d(line, nz, out, v, z)
      for (let k = 0; k < nz; k++) f[i + nx * (j + ny * k)] = out[k]!
    }

  return f
}

/**
 * How wide the peek window is, in centimetres — the radius of the largest ball
 * that fits inside V(t). This is what `fair` compares against the tracker's own
 * measured jitter, so it is deliberately **conservative**: half a cell is
 * subtracted, because a cell at distance d from the outside only guarantees a
 * ball of about (d - 0.5) cells. Under-reporting makes `fair` stricter, which
 * makes the game easier rather than unfair — the same failure direction as
 * everywhere else in this engine.
 */
export function inradiusCm(lat: Lattice, mask: Uint8Array): number {
  const d2 = edtSquared(mask, lat.nx, lat.ny, lat.nz)
  let best = 0
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue
    const d = Math.sqrt(d2[i]!)
    if (d > best) best = d
  }
  return Math.max(0, best - 0.5) * lat.pitch
}

/** Distance from the rest position to the nearest cell of V(t), in cm. */
export function nearestLeanCm(lat: Lattice, mask: Uint8Array, rest: Point3): number {
  let best = Infinity
  for (let k = 0; k < lat.nz; k++)
    for (let j = 0; j < lat.ny; j++)
      for (let i = 0; i < lat.nx; i++) {
        if (!mask[cellIndex(lat, i, j, k)]) continue
        const d = dist(cellCentre(lat, i, j, k), rest)
        if (d < best) best = d
      }
  return best
}
