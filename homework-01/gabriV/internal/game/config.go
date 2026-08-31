// Package game holds the game rules (damage, death, respawn, scoring) as plain
// functions on plain structs, called only from a room's goroutine.
package game

import "time"

// SPEC §5 constants — the single server-side source of truth.
// Keep in sync with web/js/config.js.
const (
	MaxPlayers   = 8
	TickInterval = 50 * time.Millisecond // 20 Hz snapshot broadcast
	PlayerHP     = 100
	HitDamage    = 34 // 3 shots to kill
	RespawnDelay = 2 * time.Second

	// SpawnProtect is the invulnerability window after (re)spawn (SPEC §9.5).
	// Matches spawnProtectMs in web/js/config.js.
	SpawnProtect = 1 * time.Second

	// Match rules (SPEC stretch: timed deathmatch). A match starts once MinPlayers
	// are present, ends at MatchDuration or when someone reaches KillTarget, then
	// the final scoreboard shows for PostMatchDelay before the room closes.
	MinPlayers     = 2
	MatchDuration  = 5 * time.Minute
	KillTarget     = 20
	PostMatchDelay = 8 * time.Second

	// MaxWeaponRange backs the trivial hit-claim sanity check (SPEC §6.3) —
	// the entire "anti-cheat". Matches weaponRange in web/js/config.js.
	MaxWeaponRange = 60.0
)

// Palette is cycled to colour players as they join a room (SPEC §6.3).
var Palette = []string{
	"#e6194b", "#3cb44b", "#ffe119", "#4363d8",
	"#f58231", "#911eb4", "#46f0f0", "#f032e6",
}
