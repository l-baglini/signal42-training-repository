// Package room runs one goroutine per room (register/unregister/inbound
// channels; the 20Hz ticker arrives in Step 5) plus per-client read/write pumps.
package room

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"sync/atomic"
	"time"

	"quakelite/internal/game"
	"quakelite/internal/protocol"
)

type inbound struct {
	c    *Client
	data []byte
}

// matchPhase is the room's match lifecycle (SPEC stretch). Zero value is waiting.
type matchPhase int

const (
	phaseWaiting matchPhase = iota
	phaseActive
	phaseFinished
)

func (p matchPhase) wire() string {
	switch p {
	case phaseActive:
		return "active"
	case phaseFinished:
		return "finished"
	default:
		return "waiting"
	}
}

// Room owns all player state for one game room. Only the Run goroutine touches
// clients/players, so no locks are needed (CLAUDE.md architecture).
type Room struct {
	ID   string
	Name string

	gameMap *game.Map
	onEmpty func() // removes the room from the lobby; called from Run on teardown

	register   chan *Client
	unregister chan *Client
	inbound    chan inbound
	done       chan struct{}

	clients map[*Client]*game.Player
	count   atomic.Int32             // mirror of len(clients) for lobby REST reads
	colors  atomic.Pointer[[]string] // mirror of taken colours for the lobby colour picker

	// Match state (SPEC stretch), owned by the Run goroutine like everything else.
	phase      matchPhase
	endTime    time.Time // when the active match runs out
	finishedAt time.Time // when the match ended; room closes PostMatchDelay later
}

// New builds a room; the caller starts Run in its own goroutine.
func New(id, name string, m *game.Map, onEmpty func()) *Room {
	return &Room{
		ID:         id,
		Name:       name,
		gameMap:    m,
		onEmpty:    onEmpty,
		register:   make(chan *Client),
		unregister: make(chan *Client),
		inbound:    make(chan inbound, 64),
		done:       make(chan struct{}),
		clients:    make(map[*Client]*game.Player),
	}
}

// PlayerCount is safe to call from any goroutine.
func (r *Room) PlayerCount() int { return int(r.count.Load()) }

// TakenColors returns the colours currently in use in the room. Safe to call
// from any goroutine (the lobby REST handler does) — it reads an atomic mirror
// the room goroutine publishes on every join/leave.
func (r *Room) TakenColors() []string {
	if p := r.colors.Load(); p != nil {
		return *p
	}
	return []string{}
}

// publishColors refreshes the atomic colour mirror; called from the room
// goroutine after r.clients changes.
func (r *Room) publishColors() {
	cs := make([]string, 0, len(r.clients))
	for _, p := range r.clients {
		cs = append(cs, p.Color)
	}
	r.colors.Store(&cs)
}

// Register hands a client to the room goroutine; false if the room already
// shut down (lost lookup/teardown race) so the caller can close the socket.
func (r *Room) Register(c *Client) bool {
	select {
	case r.register <- c:
		return true
	case <-r.done:
		return false
	}
}

func (r *Room) unregisterClient(c *Client) {
	select {
	case r.unregister <- c:
	case <-r.done:
	}
}

func (r *Room) forward(m inbound) {
	select {
	case r.inbound <- m:
	case <-r.done:
	}
}

// Run is the room goroutine. It returns — removing the room from the lobby —
// when the last player unregisters (CLAUDE.md room lifecycle). A room that was
// created but never joined stays listed until then.
func (r *Room) Run() {
	defer close(r.done)
	ticker := time.NewTicker(game.TickInterval)
	defer ticker.Stop()
	for {
		select {
		case c := <-r.register:
			r.handleJoin(c)
		case c := <-r.unregister:
			if r.handleLeave(c) {
				r.onEmpty()
				log.Printf("room %s: empty, shutting down", r.ID)
				return
			}
		case m := <-r.inbound:
			r.handleMessage(m)
		case <-ticker.C:
			if r.tick() {
				r.shutdown()
				return
			}
		}
	}
}

// tick advances the match each ticker fire (20Hz) and reports whether the room
// should now shut down. All match timing lives here, in the room goroutine.
func (r *Room) tick() bool {
	now := time.Now()
	switch r.phase {
	case phaseWaiting:
		if game.ShouldStart(len(r.clients)) {
			r.startMatch(now)
		}
	case phaseActive:
		r.processRespawns(now)
		if over, reason := game.MatchOver(r.players(), now, r.endTime, game.KillTarget); over {
			r.finish(now, reason)
		}
	case phaseFinished:
		if now.Sub(r.finishedAt) >= game.PostMatchDelay {
			return true // scoreboard shown long enough — close the room
		}
	}
	if r.phase != phaseFinished {
		r.broadcastSnapshot(now) // frozen during the post-match scoreboard
	}
	return false
}

// processRespawns brings back anyone whose respawn timer is up (SPEC §4.4/§9.5).
func (r *Room) processRespawns(now time.Time) {
	for _, p := range r.clients {
		if !p.Alive && !p.RespawnAt.IsZero() && now.After(p.RespawnAt) {
			spawn := game.PickSpawnAway(r.gameMap, r.enemyPositions(p))
			game.Respawn(p, spawn)
			r.broadcast(marshal(protocol.Respawned{T: protocol.TypeRespawned, ID: p.ID, Pos: spawn}), nil)
			log.Printf("room %s: %s respawned", r.ID, p.ID)
		}
	}
}

// startMatch begins the countdown once enough players are present.
func (r *Room) startMatch(now time.Time) {
	r.phase = phaseActive
	r.endTime = now.Add(game.MatchDuration)
	log.Printf("room %s: match started (%d players, first to %d kills or %s)",
		r.ID, len(r.clients), game.KillTarget, game.MatchDuration)
}

// finish ends the match: broadcast the final standings, delist the room from the
// lobby so no one new joins the scoreboard screen, and stamp finishedAt so tick
// closes the room after PostMatchDelay.
func (r *Room) finish(now time.Time, reason string) {
	r.phase = phaseFinished
	r.finishedAt = now
	players := make([]protocol.Player, 0, len(r.clients))
	for _, p := range r.clients {
		players = append(players, p.Wire(now))
	}
	r.broadcast(marshal(protocol.GameOver{T: protocol.TypeGameOver, Reason: reason, Players: players}), nil)
	r.onEmpty() // remove from the lobby listing now; sockets close after the scoreboard
	log.Printf("room %s: match over (%s)", r.ID, reason)
}

// shutdown closes every client's socket so they return to the lobby, then Run
// returns (its deferred close(done) unblocks any in-flight unregister/forward).
func (r *Room) shutdown() {
	for c := range r.clients {
		close(c.send)
	}
	log.Printf("room %s: closing after match", r.ID)
}

// players returns the live player structs for the match-rule check.
func (r *Room) players() []*game.Player {
	ps := make([]*game.Player, 0, len(r.clients))
	for _, p := range r.clients {
		ps = append(ps, p)
	}
	return ps
}

// matchInfo is the wire match block: full duration while waiting, the live
// remaining seconds (ceil) while active.
func (r *Room) matchInfo(now time.Time) protocol.Match {
	timeLeft := int(game.MatchDuration / time.Second)
	if r.phase == phaseActive {
		if d := r.endTime.Sub(now); d > 0 {
			timeLeft = int((d + time.Second - 1) / time.Second)
		} else {
			timeLeft = 0
		}
	}
	return protocol.Match{Phase: r.phase.wire(), TimeLeft: timeLeft, Target: game.KillTarget}
}

// broadcastSnapshot sends the whole room state to everyone, every tick (20Hz).
// Clients ignore their own entry (SPEC §6.2).
func (r *Room) broadcastSnapshot(now time.Time) {
	if len(r.clients) == 0 {
		return
	}
	players := make([]protocol.Player, 0, len(r.clients))
	for _, p := range r.clients {
		players = append(players, p.Wire(now))
	}
	r.broadcast(marshal(protocol.Snapshot{T: protocol.TypeSnapshot, Players: players, Match: r.matchInfo(now)}), nil)
}

func (r *Room) handleMessage(m inbound) {
	p, ok := r.clients[m.c]
	if !ok {
		return
	}
	var msg protocol.ClientMessage
	if err := json.Unmarshal(m.data, &msg); err != nil {
		log.Printf("room %s: bad message from %s: %v", r.ID, p.ID, err)
		return
	}
	switch msg.T {
	case protocol.TypeState:
		// Client-authoritative movement, relayed untransformed — trusted on
		// purpose (SPEC §2).
		p.Pos, p.Yaw, p.Pitch = msg.Pos, msg.Yaw, msg.Pitch
	case protocol.TypeFire:
		if r.phase != phaseActive || !p.Alive {
			return // no shooting before the match starts or after it ends
		}
		// visual only: rebroadcast to everyone (shooter included) for tracers
		r.broadcast(marshal(protocol.Fired{
			T: protocol.TypeFired, ID: p.ID, Origin: msg.Origin, Dir: msg.Dir,
		}), nil)
	case protocol.TypeHit:
		if r.phase != phaseActive {
			return
		}
		r.handleHit(p, msg.Target)
	}
}

func (r *Room) handleJoin(c *Client) {
	id, err := newID("p_")
	if err != nil {
		log.Printf("room %s: generating player id: %v", r.ID, err)
		_ = c.conn.Close()
		return
	}
	spawn := game.PickSpawnAway(r.gameMap, r.enemyPositions(nil)) // away from everyone already here (SPEC §9.5)
	taken := make(map[string]bool, len(r.clients))
	for _, pl := range r.clients {
		taken[pl.Color] = true
	}
	color := game.PickColor(c.color, taken) // client's pick if free, else first free (SPEC §9 picker)
	p := game.NewPlayer(id, c.name, color, spawn)
	r.clients[c] = p
	r.count.Store(int32(len(r.clients)))
	r.publishColors()

	now := time.Now()
	all := make([]protocol.Player, 0, len(r.clients))
	for _, pl := range r.clients {
		all = append(all, pl.Wire(now))
	}
	c.trySend(marshal(protocol.Welcome{
		T: protocol.TypeWelcome, ID: id, MapURL: "/map.json", You: p.Wire(now), Players: all, Match: r.matchInfo(now),
	}))
	r.broadcast(marshal(protocol.Joined{T: protocol.TypeJoined, Player: p.Wire(now)}), c)
	log.Printf("room %s: %s (%s) joined, %d player(s)", r.ID, p.Name, p.ID, len(r.clients))
}

// handleLeave reports whether the room is now empty.
func (r *Room) handleLeave(c *Client) bool {
	p, ok := r.clients[c]
	if !ok {
		return false
	}
	delete(r.clients, c)
	close(c.send) // write pump drains, sends a close frame, and exits
	r.count.Store(int32(len(r.clients)))
	r.publishColors()
	r.broadcast(marshal(protocol.Left{T: protocol.TypeLeft, ID: p.ID}), nil)
	log.Printf("room %s: %s (%s) left, %d player(s)", r.ID, p.Name, p.ID, len(r.clients))
	return len(r.clients) == 0
}

// handleHit applies a shooter-claimed hit (SPEC §6.3): the server trusts the
// claim on purpose, checking only that the victim exists, is someone else, is
// alive, and is within weapon range of the shooter.
func (r *Room) handleHit(shooter *game.Player, targetID string) {
	if !shooter.Alive {
		return
	}
	victim := r.playerByID(targetID)
	if victim == nil || victim == shooter || !victim.Alive {
		return
	}
	if time.Now().Before(victim.SpawnProtectedUntil) {
		return // spawn-protected: invulnerable on purpose (SPEC §9.5)
	}
	if !game.WithinRange(shooter.Pos, victim.Pos) {
		log.Printf("room %s: hit claim out of range: %s -> %s", r.ID, shooter.ID, targetID)
		return
	}
	if game.ApplyHit(victim) {
		game.RecordKill(shooter, victim)
		victim.RespawnAt = time.Now().Add(game.RespawnDelay)
		r.broadcast(marshal(protocol.Killed{
			T: protocol.TypeKilled, Victim: victim.ID, Killer: shooter.ID,
		}), nil)
		log.Printf("room %s: %s fragged %s (%d kills)", r.ID, shooter.Name, victim.Name, shooter.Kills)
	}
}

// enemyPositions returns the positions of every living player except exclude —
// the spawn picker steers a new/respawning player away from them (SPEC §9.5).
func (r *Room) enemyPositions(exclude *game.Player) []protocol.Vec3 {
	ps := make([]protocol.Vec3, 0, len(r.clients))
	for _, p := range r.clients {
		if p != exclude && p.Alive {
			ps = append(ps, p.Pos)
		}
	}
	return ps
}

func (r *Room) playerByID(id string) *game.Player {
	for _, p := range r.clients {
		if p.ID == id {
			return p
		}
	}
	return nil
}

// broadcast queues data on every client except skip. Slow clients drop frames
// rather than block the room — naive on purpose (SPEC §2).
func (r *Room) broadcast(data []byte, skip *Client) {
	for c := range r.clients {
		if c != skip {
			c.trySend(data)
		}
	}
}

func marshal(v any) []byte {
	data, _ := json.Marshal(v) // cannot fail for our own wire structs
	return data
}

func newID(prefix string) (string, error) {
	b := make([]byte, 2)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("reading random bytes: %w", err)
	}
	return prefix + hex.EncodeToString(b), nil
}
