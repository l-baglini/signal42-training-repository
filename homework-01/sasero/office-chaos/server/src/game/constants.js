export const C = {
  // Free movement: the server runs an authoritative physics tick and broadcasts
  // float positions; clients send an input vector and lightly predict locally.
  SIM_TICK_MS: 50, // 20 Hz simulation + broadcast (FR-8.1 / FR-8.2)
  PLAYER_SPEED: 4.2, // tiles (world units) per second
  PLAYER_RADIUS: 0.34, // collision radius against walls / desks
  KNOCKBACK_DECAY: 0.82, // per-tick falloff of a knockback impulse

  // Sprint (hold Left Shift): faster movement, limited by a stamina bar
  SPRINT_SPEED_MULT: 1.6,
  SPRINT_MAX: 100, // stamina units
  SPRINT_DRAIN_PER_SEC: 25, // ~4 s of continuous sprint from full
  SPRINT_REGEN_PER_SEC: 16, // ~6 s to fully recharge
  SPRINT_REGEN_DELAY_MS: 700, // pause before stamina starts recovering
  SPRINT_MIN_TO_START: 15, // after fully draining, must recover this much to sprint again

  STRESS_MAX: 100,
  STRESS_PASSIVE_PER_MIN: 1, // FR-3.2
  STRESS_MEETING: 10, // FR-3.3
  STRESS_RELIEF_PER_ACTION: 5, // FR-3.6 (fire / extinguish)
  STRESS_RELIEF_PER_HIT: 2, // each desk whack chips away at stress

  // Multi-hit desk destruction (FR-5.1)
  DESK_MAX_HP: 4,
  DESK_DAMAGE: 1,
  RAGE_DESK_DAMAGE: 2,

  RAGE_DURATION_MS: 30_000, // FR-3.5
  RAGE_SPEED_MULT: 1.5, // +50% movement speed
  RAGE_DAMAGE_MULT: 2, // doubles weapon damage (1-hit KO with heavier weapons)
  RAGE_COOLDOWN_MULT: 0.6, // faster swings

  MAX_HP: 3, // FR-6.3
  RESPAWN_MS: 5_000, // FR-6.5
  WANTED_KO_THRESHOLD: 3, // FR-6.11
  ACTION_RANGE: 2.2, // euclidean range for desk / fire actions (world units)
  ATTACK_ARC_COS: Math.cos(Math.PI / 3), // melee swing connects within ±60° of facing

  AFK_MS: 5 * 60_000, // S5-7
  AFK_CHECK_MS: 10_000,

  COMBO_WINDOW_MS: 10_000, // FR-5.5
  COMBO_MIN_ACTIONS: 3,
  COMBO_MULTIPLIER: 2,

  FIRE_TICK_MS: 2_500,
  FIRE_SPREAD_CHANCE: 0.35,
  FIRE_BURNOUT_MS: 40_000,

  WEAPON_RESPAWN_MS: 15_000, // a picked-up weapon respawns at its station after this
  PICKUP_RADIUS: 0.7, // walk this close to a weapon / station to grab it

  MAX_PLAYERS_PER_ROOM: 20, // FR-8.4

  SCORE: { deskHit: 3, destruction: 10, fire: 15, combo: 15, rage: 5, extinguish: 5 },
};

// Office objects you can pick up and fight with (FR-6 combat rework). Each is a
// melee weapon with its own reach, swing speed, damage, and knockback feel.
export const WEAPONS = {
  fists: { name: 'Bare Hands', emoji: '👊', damage: 1, range: 1.3, cooldownMs: 470, knockback: 0.9, labels: ['BONK!', 'SLAP!', 'POW!'] },
  keyboard: { name: 'Keyboard', emoji: '⌨️', damage: 1, range: 1.5, cooldownMs: 330, knockback: 1.1, labels: ['CLACK!', 'TYPE-FU!', 'BONK!'] },
  stapler: { name: 'Stapler', emoji: '📎', damage: 2, range: 1.4, cooldownMs: 560, knockback: 1.3, labels: ['CHUNK!', 'STAPLED!'] },
  chair: { name: 'Office Chair', emoji: '🪑', damage: 2, range: 2.0, cooldownMs: 820, knockback: 2.6, labels: ['CRASH!', 'WHAM!'] },
  monitor: { name: 'Monitor', emoji: '🖥️', damage: 3, range: 1.7, cooldownMs: 1050, knockback: 3.0, labels: ['SMASH!', 'KRRRT!'] },
};
export const DEFAULT_WEAPON = 'fists';
