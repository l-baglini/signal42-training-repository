package game

import (
	"testing"
	"time"
)

func TestShouldStart(t *testing.T) {
	if ShouldStart(MinPlayers - 1) {
		t.Fatal("should not start below MinPlayers")
	}
	if !ShouldStart(MinPlayers) || !ShouldStart(MinPlayers+1) {
		t.Fatal("should start at or above MinPlayers")
	}
}

func TestMatchOver(t *testing.T) {
	now := time.Now()
	future := now.Add(time.Minute)
	past := now.Add(-time.Minute)

	a := &Player{Kills: 5}
	b := &Player{Kills: 19}
	if over, _ := MatchOver([]*Player{a, b}, now, future, KillTarget); over {
		t.Fatal("not over: nobody at target, time remaining")
	}

	b.Kills = KillTarget
	if over, reason := MatchOver([]*Player{a, b}, now, future, KillTarget); !over || reason != "frags" {
		t.Fatalf("frags end expected, got over=%v reason=%q", over, reason)
	}

	b.Kills = 0
	if over, reason := MatchOver([]*Player{a, b}, now, past, KillTarget); !over || reason != "time" {
		t.Fatalf("time end expected, got over=%v reason=%q", over, reason)
	}
}
