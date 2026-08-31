package game

import (
	"math"
	"math/rand/v2"
	"time"

	"quakelite/internal/protocol"
)

// Player is one player's server-side state, owned exclusively by its room's
// goroutine — lock-free by design (CLAUDE.md architecture).
type Player struct {
	ID     string
	Name   string
	Color  string
	Pos    protocol.Vec3
	Yaw    float64
	Pitch  float64
	HP     int
	Kills  int
	Deaths int
	Alive  bool

	// RespawnAt is when a dead player comes back; zero while alive. The room
	// checks it on every tick — no per-player timers.
	RespawnAt time.Time

	// SpawnProtectedUntil is the end of the post-spawn invulnerability window
	// (SPEC §9.5). Hits on a player are ignored while now is before it.
	SpawnProtectedUntil time.Time
}

// NewPlayer spawns a fresh player at a spawn point with full HP and brief
// spawn protection.
func NewPlayer(id, name, color string, spawn protocol.Vec3) *Player {
	return &Player{
		ID: id, Name: name, Color: color, Pos: spawn, HP: PlayerHP, Alive: true,
		SpawnProtectedUntil: time.Now().Add(SpawnProtect),
	}
}

// Wire converts to the SPEC §6 wire shape. now is passed in (not read here) so
// the room stamps every player in a snapshot against one consistent instant.
func (p *Player) Wire(now time.Time) protocol.Player {
	return protocol.Player{
		ID: p.ID, Name: p.Name, Color: p.Color,
		Pos: p.Pos, Yaw: p.Yaw, Pitch: p.Pitch,
		HP: p.HP, Kills: p.Kills, Deaths: p.Deaths, Alive: p.Alive,
		Protected: now.Before(p.SpawnProtectedUntil),
	}
}

// PickSpawn returns a random spawn point from the map.
func PickSpawn(m *Map) protocol.Vec3 {
	return m.Spawns[rand.IntN(len(m.Spawns))]
}

// PickSpawnAway returns the spawn point farthest from the nearest enemy, so you
// don't pop in next to someone (SPEC §9.5). With no enemies it falls back to a
// random spawn to keep some variety. Ties resolve to the first best spawn.
func PickSpawnAway(m *Map, enemies []protocol.Vec3) protocol.Vec3 {
	if len(enemies) == 0 {
		return PickSpawn(m)
	}
	best := m.Spawns[0]
	bestDist := -1.0
	for _, s := range m.Spawns {
		nearest := math.Inf(1)
		for _, e := range enemies {
			dx, dy, dz := s.X-e.X, s.Y-e.Y, s.Z-e.Z
			if d := dx*dx + dy*dy + dz*dz; d < nearest {
				nearest = d
			}
		}
		if nearest > bestDist {
			bestDist = nearest
			best = s
		}
	}
	return best
}

// ValidColor reports whether c is one of the palette colors (SPEC §9 colour
// picker). The server re-checks the client's requested colour, never trusting it.
func ValidColor(c string) bool {
	for _, p := range Palette {
		if p == c {
			return true
		}
	}
	return false
}

// PickColor resolves a player's colour on join: the requested colour if it is a
// valid palette colour not already taken in the room, otherwise the first free
// palette colour. The palette has MaxPlayers entries, so a non-full room always
// has a free one. This is the server-authoritative tie-break for the race where
// two clients request the same colour at once.
func PickColor(requested string, taken map[string]bool) string {
	if ValidColor(requested) && !taken[requested] {
		return requested
	}
	for _, p := range Palette {
		if !taken[p] {
			return p
		}
	}
	return Palette[0] // unreachable while the room isn't full
}

// ApplyHit applies one hit's damage to a living victim and reports whether it
// killed them (SPEC §4.4: 34 damage, 3 shots to kill).
func ApplyHit(victim *Player) bool {
	if !victim.Alive {
		return false
	}
	victim.HP -= HitDamage
	if victim.HP <= 0 {
		victim.HP = 0
		victim.Alive = false
		return true
	}
	return false
}

// RecordKill updates the scoreboard for a confirmed kill.
func RecordKill(killer, victim *Player) {
	victim.Deaths++
	if killer != victim {
		killer.Kills++
	}
}

// Respawn brings a dead player back at spawn with full HP and fresh spawn
// protection (SPEC §9.5).
func Respawn(p *Player, spawn protocol.Vec3) {
	p.Pos = spawn
	p.HP = PlayerHP
	p.Alive = true
	p.RespawnAt = time.Time{}
	p.SpawnProtectedUntil = time.Now().Add(SpawnProtect)
}

// WithinRange is the entire anti-cheat (SPEC §6.3): a hit claim only counts if
// shooter and victim are within max weapon range of each other.
func WithinRange(a, b protocol.Vec3) bool {
	dx, dy, dz := a.X-b.X, a.Y-b.Y, a.Z-b.Z
	return dx*dx+dy*dy+dz*dz <= MaxWeaponRange*MaxWeaponRange
}
