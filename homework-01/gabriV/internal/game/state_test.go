package game

import (
	"testing"
	"time"

	"quakelite/internal/protocol"
)

func newTestPlayer(id string) *Player {
	return NewPlayer(id, "name_"+id, "#fff", protocol.Vec3{X: 1, Y: 1.7, Z: 1})
}

func TestThreeHitsKill(t *testing.T) {
	v := newTestPlayer("v")
	if ApplyHit(v) || v.HP != PlayerHP-HitDamage {
		t.Fatalf("after 1 hit: died or wrong HP %d", v.HP)
	}
	if ApplyHit(v) || v.HP != PlayerHP-2*HitDamage {
		t.Fatalf("after 2 hits: died or wrong HP %d", v.HP)
	}
	if !ApplyHit(v) {
		t.Fatal("third hit should kill")
	}
	if v.HP != 0 || v.Alive {
		t.Fatalf("dead player should have HP 0 and Alive=false, got %d/%v", v.HP, v.Alive)
	}
}

func TestHitOnDeadIsNoop(t *testing.T) {
	v := newTestPlayer("v")
	for range 3 {
		ApplyHit(v)
	}
	if ApplyHit(v) {
		t.Fatal("hitting a corpse must not report another kill")
	}
	if v.HP != 0 {
		t.Fatalf("corpse HP changed to %d", v.HP)
	}
}

func TestRecordKill(t *testing.T) {
	k, v := newTestPlayer("k"), newTestPlayer("v")
	RecordKill(k, v)
	if k.Kills != 1 || v.Deaths != 1 {
		t.Fatalf("got kills=%d deaths=%d, want 1/1", k.Kills, v.Deaths)
	}
	RecordKill(v, v) // self-kill: a death, never a kill
	if v.Kills != 0 || v.Deaths != 2 {
		t.Fatalf("self-kill: got kills=%d deaths=%d, want 0/2", v.Kills, v.Deaths)
	}
}

func TestRespawn(t *testing.T) {
	v := newTestPlayer("v")
	for range 3 {
		ApplyHit(v)
	}
	v.RespawnAt = time.Now()
	spawn := protocol.Vec3{X: -20, Y: 1.7, Z: 20}
	Respawn(v, spawn)
	if !v.Alive || v.HP != PlayerHP || v.Pos != spawn || !v.RespawnAt.IsZero() {
		t.Fatalf("bad respawn state: %+v", v)
	}
}

func TestSpawnProtection(t *testing.T) {
	v := newTestPlayer("v")
	// fresh player is protected now, not a second from now (SPEC §9.5)
	if !time.Now().Before(v.SpawnProtectedUntil) {
		t.Fatal("new player should start spawn-protected")
	}
	if time.Now().Add(SpawnProtect + time.Second).Before(v.SpawnProtectedUntil) {
		t.Fatal("spawn protection should not outlast SpawnProtect")
	}
	if !v.Wire(time.Now()).Protected {
		t.Fatal("Wire should report a fresh player as protected")
	}
	if v.Wire(v.SpawnProtectedUntil.Add(time.Millisecond)).Protected {
		t.Fatal("Wire should clear Protected once the window passes")
	}
	// respawn re-arms protection
	v.SpawnProtectedUntil = time.Time{}
	Respawn(v, protocol.Vec3{})
	if !time.Now().Before(v.SpawnProtectedUntil) {
		t.Fatal("respawn should re-arm spawn protection")
	}
}

func TestPickSpawnAway(t *testing.T) {
	m := &Map{Spawns: []protocol.Vec3{{X: -20}, {X: 20}}}
	// an enemy hugging the -20 spawn should push us to the +20 one
	got := PickSpawnAway(m, []protocol.Vec3{{X: -19}})
	if got.X != 20 {
		t.Fatalf("expected the far spawn (x=20), got %+v", got)
	}
	// no enemies => still a valid spawn from the map
	free := PickSpawnAway(m, nil)
	if free.X != -20 && free.X != 20 {
		t.Fatalf("no-enemy spawn off the map: %+v", free)
	}
}

func TestPickColor(t *testing.T) {
	// a valid, free request is honoured verbatim
	if got := PickColor(Palette[2], map[string]bool{}); got != Palette[2] {
		t.Fatalf("free request not honoured: got %s", got)
	}
	// a taken request falls back to the first free palette colour
	taken := map[string]bool{Palette[0]: true, Palette[1]: true}
	if got := PickColor(Palette[0], taken); got != Palette[2] {
		t.Fatalf("taken request should fall back to first free, got %s", got)
	}
	// an invalid/empty request also falls back to the first free colour
	if got := PickColor("not-a-color", map[string]bool{}); got != Palette[0] {
		t.Fatalf("invalid request should fall back to first free, got %s", got)
	}
	if ValidColor("#000000") || !ValidColor(Palette[0]) {
		t.Fatal("ValidColor disagrees with the palette")
	}
}

func TestWithinRange(t *testing.T) {
	origin := protocol.Vec3{}
	if !WithinRange(origin, protocol.Vec3{X: MaxWeaponRange}) {
		t.Fatal("exactly max range should pass")
	}
	if WithinRange(origin, protocol.Vec3{X: MaxWeaponRange, Z: 10}) {
		t.Fatal("beyond max range should fail")
	}
}
