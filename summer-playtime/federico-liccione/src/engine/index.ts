/**
 * Blind Spot — engine.
 *
 * Deterministic, dependency-free, and the only thing in the codebase allowed to
 * decide whether the game is fair. Perception says what is in the room; this
 * says what the player's body can reach. SPEC §4.
 */
export * from './types'
export * from './vec'
export * from './envelope'
export * from './lattice'
export * from './sightline'
export * from './footprint'
export * from './level'
