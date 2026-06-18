package game

import "time"

// ShouldStart reports whether a waiting room has enough players to begin the
// match (SPEC stretch: a game starts when at least MinPlayers have joined).
func ShouldStart(playerCount int) bool {
	return playerCount >= MinPlayers
}

// MatchOver decides whether an active match should end now and why: "frags" if
// any player has reached killTarget, "time" once now is at/after endTime, and
// ("", false) otherwise. Pure so the rule is unit-testable without real timing.
func MatchOver(players []*Player, now, endTime time.Time, killTarget int) (bool, string) {
	for _, p := range players {
		if p.Kills >= killTarget {
			return true, "frags"
		}
	}
	if !now.Before(endTime) {
		return true, "time"
	}
	return false, ""
}
