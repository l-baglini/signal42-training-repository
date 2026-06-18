package room

import (
	"encoding/json"
	"testing"
	"time"

	"quakelite/internal/game"
	"quakelite/internal/protocol"
)

// White-box test of the match end + teardown path: it pokes the room's match
// fields directly (no real 5-minute wait) and drives tick()/shutdown() to assert
// the gameover broadcast, lobby delist, and socket close all happen.
func newMatchRoom(t *testing.T, onEmpty func()) *Room {
	t.Helper()
	m := &game.Map{Name: "t", Spawns: []protocol.Vec3{{X: 1, Y: 1.7, Z: 1}}}
	r := New("r_test", "test", m, onEmpty)
	for i := 0; i < 2; i++ {
		c := &Client{room: r, send: make(chan []byte, 64)}
		r.clients[c] = game.NewPlayer("p", "name", game.Palette[i], m.Spawns[0])
	}
	return r
}

func drain(c chan []byte) []map[string]any {
	var out []map[string]any
	for {
		select {
		case b := <-c:
			var m map[string]any
			_ = json.Unmarshal(b, &m)
			out = append(out, m)
		default:
			return out
		}
	}
}

func TestMatchTimeEndAndTeardown(t *testing.T) {
	delisted := 0
	r := newMatchRoom(t, func() { delisted++ })

	// active match whose clock already ran out
	r.phase = phaseActive
	r.endTime = time.Now().Add(-time.Second)

	if r.tick() {
		t.Fatal("tick should not request shutdown the instant the match ends")
	}
	if r.phase != phaseFinished {
		t.Fatalf("phase should be finished, got %v", r.phase)
	}
	if delisted != 1 {
		t.Fatalf("room should delist from the lobby exactly once on finish, got %d", delisted)
	}
	for c := range r.clients {
		msgs := drain(c.send)
		if len(msgs) == 0 || msgs[len(msgs)-1]["t"] != protocol.TypeGameOver {
			t.Fatalf("each client should receive a gameover, got %v", msgs)
		}
		if msgs[len(msgs)-1]["reason"] != "time" {
			t.Fatalf("reason should be time, got %v", msgs[len(msgs)-1]["reason"])
		}
	}

	// once the post-match delay passes, tick asks Run to shut the room down
	r.finishedAt = time.Now().Add(-game.PostMatchDelay - time.Second)
	if !r.tick() {
		t.Fatal("tick should request shutdown after PostMatchDelay")
	}

	// shutdown closes every send channel so the write pumps exit
	clients := make([]*Client, 0, len(r.clients))
	for c := range r.clients {
		clients = append(clients, c)
	}
	r.shutdown()
	for _, c := range clients {
		if _, open := <-c.send; open {
			t.Fatal("shutdown should close client send channels")
		}
	}
}

func TestFragsEnd(t *testing.T) {
	r := newMatchRoom(t, func() {})
	r.phase = phaseActive
	r.endTime = time.Now().Add(time.Hour) // plenty of time left
	for _, p := range r.players() {
		p.Kills = game.KillTarget // someone hit the target
		break
	}
	r.tick()
	if r.phase != phaseFinished {
		t.Fatalf("reaching the kill target should finish the match, phase=%v", r.phase)
	}
	for c := range r.clients {
		msgs := drain(c.send)
		if msgs[len(msgs)-1]["reason"] != "frags" {
			t.Fatalf("reason should be frags, got %v", msgs[len(msgs)-1]["reason"])
		}
	}
}
