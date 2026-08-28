/**
 * Three difficulties, and a rule about what a difficulty is allowed to touch.
 *
 * This project's central commitment is that **fairness is derived from
 * measurements of the player, not tuned**: the minimum lean is a fraction of the
 * measured reach, the minimum peek window is a multiple of the measured tracker
 * jitter, and an enemy's fuse is reaction time plus *measured* latency plus the
 * time to cross back into cover at the *measured* speed. A difficulty setting that
 * reached into any of those would not be making the game harder, it would be
 * making the guarantees false — and then "every enemy can be escaped" would depend
 * on which radio button was selected.
 *
 * So the knobs below are exactly the ones that are not fairness:
 *
 * - **how many stand at once** — the room is loud or quiet. Every lineup, at every
 *   size, still has to pass I11's escapability guard, so eleven enemies are eleven
 *   times the pressure and no times the unfairness;
 * - **the fuse margin** — and this is the interesting one. `fuseForFairRetreat`
 *   *derives* the minimum fuse and then adds a margin, so the margin is slack over
 *   a floor rather than a number in place of one. Shrinking it takes away comfort;
 *   it cannot take away the escape, because the floor is still there underneath.
 *   SPEC §6.5 calls it "the only number anyone gets to turn", which is precisely
 *   what a difficulty setting should be turning;
 * - **what a hit costs** — time, because time is the resource;
 * - **how long an enemy holds a position** before moving to another one the solver
 *   has already judged;
 * - **which end of the range the round opens with.** `chooseLineup` breaks ties in
 *   coverage by the caller's `cost`, and the caller is the game — so advanced can
 *   ask for the long leans held to a centimetre first, while easy opens with the
 *   short ones held loosely. Same positions, all of them already proved fair,
 *   presented in the opposite order.
 *
 * Scores are **not** multiplied per difficulty. `pointsFor` already pays for how
 * far you leaned and how precisely you held it, and a global multiplier on top
 * would be a fudge factor pretending the three modes are comparable. They are not:
 * easy gives you longer to shoot more things. The end screen names the difficulty
 * instead, which is the honest version of the same information.
 */
import { DEFAULT_COMBAT, type CombatConfig } from './combat'

export type DifficultyId = 'easy' | 'standard' | 'advanced'

export interface Difficulty {
  readonly id: DifficultyId
  readonly name: string
  /** One line, shown where the round starts. */
  readonly blurb: string
  /** How many enemies stand in the room at once. */
  readonly waveSize: number
  /**
   * Seconds of slack added to the *derived* minimum fuse. Never the fuse itself:
   * see the note above, and `fuseForFairRetreat` in `engine/exposure.ts`.
   */
  readonly fuseMarginS: number
  /** What being shot costs, in seconds off the clock. */
  readonly hitPenaltyS: number
  /** How long an unobserved enemy holds a position before taking another. */
  readonly repositionAfterS: number
  /**
   * Which end of the difficulty range the lineup opens with. `1` means the
   * shortest leans and loosest windows come first; `-1` inverts it.
   */
  readonly costSign: 1 | -1
}

/**
 * Roomy on every axis: half as many enemies, a full second of slack over the
 * derived fuse, a cheap hit, and the easiest positions first.
 */
export const EASY: Difficulty = {
  id: 'easy',
  name: 'Easy',
  blurb: 'Five of them, and a full second of slack before any shot lands.',
  waveSize: 5,
  fuseMarginS: 0.95,
  hitPenaltyS: 4,
  repositionAfterS: 9,
  costSign: 1,
}

/** The numbers the game was playtested and tuned at. */
export const STANDARD: Difficulty = {
  id: 'standard',
  name: 'Standard',
  blurb: 'Eight of them. Lean out, take one, be back before its shot lands.',
  waveSize: DEFAULT_COMBAT.waveSize,
  fuseMarginS: 0.55,
  hitPenaltyS: DEFAULT_COMBAT.hitPenaltyS,
  repositionAfterS: DEFAULT_COMBAT.repositionAfterS,
  costSign: 1,
}

/**
 * Eleven standing, a third of a second of slack, and the hardest positions
 * first — the long reaches held to a centimetre, which the other two modes save
 * for later in the round or never reach at all.
 */
export const ADVANCED: Difficulty = {
  id: 'advanced',
  name: 'Advanced',
  blurb: 'Eleven, the awkward positions first, and barely a third of a second.',
  waveSize: 11,
  fuseMarginS: 0.32,
  hitPenaltyS: 8,
  repositionAfterS: 4,
  costSign: -1,
}

export const DIFFICULTIES: readonly Difficulty[] = [EASY, STANDARD, ADVANCED]
export const DEFAULT_DIFFICULTY = STANDARD

export function difficultyById(id: string): Difficulty {
  return DIFFICULTIES.find((d) => d.id === id) ?? DEFAULT_DIFFICULTY
}

/** The round's own settings. Everything else about a difficulty is the level's. */
export function combatConfigFor(d: Difficulty): CombatConfig {
  return {
    ...DEFAULT_COMBAT,
    waveSize: d.waveSize,
    hitPenaltyS: d.hitPenaltyS,
    repositionAfterS: d.repositionAfterS,
  }
}
