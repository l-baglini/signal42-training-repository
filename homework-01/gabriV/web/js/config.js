// Client-side game constants — single source of truth (SPEC §5).
// Keep in sync with the Go const block in internal/game/config.go.
export const CONFIG = {
  maxPlayers: 8,
  tickRate: 20, // server snapshot Hz
  sendRateHz: 30, // local pose send Hz (Step 5)
  playerHP: 100,
  hitDamage: 34,
  fireCooldownMs: 150,
  respawnDelayMs: 2000,
  roomListRefreshMs: 2000,

  weaponRange: 60, // hitscan + tracer reach; server mirrors it for the Step 7 sanity check
  eyeHeight: 1.7,
  moveSpeed: 7,
  jumpVelocity: 6,
  gravity: 18,
  mouseSensitivity: 0.002,
  playerRadius: 0.4, // half-extent of the player's collision AABB
  playerHeight: 1.8,

  // Stretch goals (SPEC §9).
  interpDelayMs: 100, // §9.1: render remotes this far in the past so two snapshots always bracket the frame
  spawnProtectMs: 1000, // §9.5: invuln window after (re)spawn; server is the source of truth, this is for visuals

  // Player colour palette — must match game.Palette in internal/game/config.go.
  // The lobby offers these; the server assigns one per player, unique per room.
  palette: [
    '#e6194b', '#3cb44b', '#ffe119', '#4363d8',
    '#f58231', '#911eb4', '#46f0f0', '#f032e6',
  ],

  // Mouse sensitivity slider bounds (settings.js clamps to this range).
  sensMin: 0.0004,
  sensMax: 0.006,
};
