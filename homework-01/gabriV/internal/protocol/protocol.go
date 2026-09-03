// Package protocol is the wire contract (SPEC §6): message structs, "t" type
// constants, and the username rule shared by client and server. Must stay in
// exact agreement with web/js/net.js and web/js/lobby.js.
package protocol

import "regexp"

// Message type constants — every wire message carries one in its "t" field.
const (
	TypeWelcome   = "welcome"
	TypeSnapshot  = "snapshot"
	TypeJoined    = "joined"
	TypeLeft      = "left"
	TypeFired     = "fired"
	TypeKilled    = "killed"
	TypeRespawned = "respawned"
	TypeGameOver  = "gameover"
	TypeState     = "state"
	TypeFire      = "fire"
	TypeHit       = "hit"
)

// Match is the per-room match state carried on welcome/snapshot so clients can
// show the timer and waiting/active status (SPEC stretch: timed deathmatch).
type Match struct {
	Phase    string `json:"phase"`    // "waiting" | "active" | "finished"
	TimeLeft int    `json:"timeLeft"` // whole seconds remaining while active
	Target   int    `json:"target"`   // kills that end the match
}

// Vec3 is a position or direction in Three.js convention: Y is up (SPEC §6).
type Vec3 struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	Z float64 `json:"z"`
}

// Player is the wire shape of one player inside welcome/snapshot/joined.
type Player struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	Color  string  `json:"color"`
	Pos    Vec3    `json:"pos"`
	Yaw    float64 `json:"yaw"`
	Pitch  float64 `json:"pitch"`
	HP     int     `json:"hp"`
	Kills  int     `json:"kills"`
	Deaths int     `json:"deaths"`
	Alive  bool    `json:"alive"`
	// Protected is true during the post-spawn invulnerability window (SPEC §9.5);
	// computed per-snapshot from SpawnProtectedUntil, clients render a shimmer.
	Protected bool `json:"protected"`
}

// Welcome is sent once on connect (SPEC §6.2).
type Welcome struct {
	T       string   `json:"t"`
	ID      string   `json:"id"`
	MapURL  string   `json:"mapUrl"`
	You     Player   `json:"you"`
	Players []Player `json:"players"`
	Match   Match    `json:"match"`
}

// Snapshot is broadcast every tick (20Hz, Step 5).
type Snapshot struct {
	T       string   `json:"t"`
	Players []Player `json:"players"`
	Match   Match    `json:"match"`
}

// Joined announces a new player to the rest of the room.
type Joined struct {
	T      string `json:"t"`
	Player Player `json:"player"`
}

// Left announces a departure.
type Left struct {
	T  string `json:"t"`
	ID string `json:"id"`
}

// Fired is the visual-only shot rebroadcast (Step 6).
type Fired struct {
	T      string `json:"t"`
	ID     string `json:"id"`
	Origin Vec3   `json:"origin"`
	Dir    Vec3   `json:"dir"`
}

// Killed announces a death (Step 7).
type Killed struct {
	T      string `json:"t"`
	Victim string `json:"victim"`
	Killer string `json:"killer"`
}

// Respawned announces a respawn position (Step 7).
type Respawned struct {
	T   string `json:"t"`
	ID  string `json:"id"`
	Pos Vec3   `json:"pos"`
}

// GameOver ends a match: the reason ("time" | "frags") and the final standings.
// After sending it the server shows the scoreboard briefly, then closes the
// sockets so clients return to the lobby (SPEC stretch).
type GameOver struct {
	T       string   `json:"t"`
	Reason  string   `json:"reason"`
	Players []Player `json:"players"`
}

// ClientMessage is the single decode target for everything a client sends —
// state, fire, or hit; which fields are meaningful depends on T (SPEC §6.3).
type ClientMessage struct {
	T      string  `json:"t"`
	Pos    Vec3    `json:"pos"`
	Yaw    float64 `json:"yaw"`
	Pitch  float64 `json:"pitch"`
	Origin Vec3    `json:"origin"`
	Dir    Vec3    `json:"dir"`
	Target string  `json:"target"`
}

// usernameRE is the SPEC §4.1 rule: 2–16 chars of [A-Za-z0-9_-].
// web/js/lobby.js mirrors it; the server re-checks on WS upgrade.
var usernameRE = regexp.MustCompile(`^[A-Za-z0-9_-]{2,16}$`)

// ValidUsername reports whether name satisfies SPEC §4.1.
func ValidUsername(name string) bool {
	return usernameRE.MatchString(name)
}
