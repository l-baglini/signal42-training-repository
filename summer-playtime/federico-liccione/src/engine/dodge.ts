import type { DodgeVerdict, Envelope, Point3, Threat } from './types'
import { cellCentre, cellIndex, type Lattice } from './lattice'
import { dist } from './vec'

/**
 * Distance in the window plane. Safety is lateral (see `Threat`); travel is not,
 * because moving your head back still costs you the same neck.
 */
const lateral = (a: Point3, b: Point3): number => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * Human visual reaction time. A stated constant rather than a tuned one — this
 * is a fact about people, not a difficulty knob, and calling it a knob would
 * invite somebody to turn it.
 */
export const REACTION_S = 0.25

/**
 * Can this threat be dodged from `from`?
 *
 * The fairness guarantee consumes the perception layer's own measured
 * performance: the time the player really has is the flight time minus human
 * reaction time minus the **measured** end-to-end latency. If tracking gets
 * slower, fewer threats qualify. That is the intended direction — the game gets
 * quieter rather than unfair. SPEC §6.5.
 */
export function dodgeVerdict(
  lat: Lattice,
  threat: Threat,
  env: Envelope,
  from: Point3,
): DodgeVerdict {
  const usableS = Math.max(0, threat.tImpact - threat.tSpawn - REACTION_S - env.latency)
  const budgetCm = env.vmax * usableS

  let needCm = Infinity
  let safeCells = 0
  for (let k = 0; k < lat.nz; k++)
    for (let j = 0; j < lat.ny; j++)
      for (let i = 0; i < lat.nx; i++) {
        if (!lat.inside[cellIndex(lat, i, j, k)]) continue
        const c = cellCentre(lat, i, j, k)
        if (lateral(c, threat.to) <= threat.radius) continue // in its path
        safeCells++
        const d = dist(c, from)
        if (d < needCm) needCm = d
      }

  return { dodgeable: needCm <= budgetCm, budgetCm, needCm, safeCells, usableS }
}

/**
 * The spawn gate. A threat that this player cannot dodge from where they are
 * right now is not spawned — the one place the game silently protects the
 * player, and I7 tests that the guard actually bites.
 */
export function shouldSpawn(
  lat: Lattice,
  threat: Threat,
  env: Envelope,
  livePosition: Point3,
): boolean {
  return dodgeVerdict(lat, threat, env, livePosition).dodgeable
}

/**
 * Worst case over the whole envelope: could a player *anywhere* in their range
 * have dodged this? Used to validate a wave offline, before it ships, where
 * there is no live position to ask about.
 */
export function dodgeableFromAnywhere(lat: Lattice, threat: Threat, env: Envelope): boolean {
  for (let k = 0; k < lat.nz; k++)
    for (let j = 0; j < lat.ny; j++)
      for (let i = 0; i < lat.nx; i++) {
        if (!lat.inside[cellIndex(lat, i, j, k)]) continue
        if (!dodgeVerdict(lat, threat, env, cellCentre(lat, i, j, k)).dodgeable) return false
      }
  return true
}
