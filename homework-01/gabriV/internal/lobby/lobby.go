// Package lobby owns the room registry behind the REST API — the only
// mutex-guarded state on the server (CLAUDE.md); rooms themselves are
// single-goroutine.
package lobby

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"

	"quakelite/internal/game"
	"quakelite/internal/room"
)

// Info is the REST listing shape (SPEC §6.1). Colors lists the palette colours
// already in use so the lobby can offer only free ones per room (SPEC §9 picker).
type Info struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Players int      `json:"players"`
	Max     int      `json:"max"`
	Colors  []string `json:"colors"`
}

// Lobby is the global room registry.
type Lobby struct {
	mu      sync.Mutex
	rooms   map[string]*room.Room
	gameMap *game.Map
}

// New returns an empty lobby; rooms it creates spawn players from gameMap.
func New(gameMap *game.Map) *Lobby {
	return &Lobby{rooms: make(map[string]*room.Room), gameMap: gameMap}
}

// Create registers and starts a new room with a server-generated id (SPEC
// §6.1). Room names need not be unique. The room removes itself from the
// lobby when its last player leaves.
func (l *Lobby) Create(name string) (*room.Room, error) {
	name = strings.TrimSpace(name)
	if name == "" || len(name) > 32 {
		return nil, errors.New("room name must be 1-32 characters")
	}
	id, err := newID()
	if err != nil {
		return nil, fmt.Errorf("generating room id: %w", err)
	}
	rm := room.New(id, name, l.gameMap, func() { l.Remove(id) })
	l.mu.Lock()
	l.rooms[id] = rm
	l.mu.Unlock()
	go rm.Run()
	return rm, nil
}

// List returns all rooms sorted by name for a stable lobby display.
func (l *Lobby) List() []Info {
	l.mu.Lock()
	defer l.mu.Unlock()
	out := make([]Info, 0, len(l.rooms))
	for _, r := range l.rooms {
		out = append(out, Info{ID: r.ID, Name: r.Name, Players: r.PlayerCount(), Max: game.MaxPlayers, Colors: r.TakenColors()})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Name != out[j].Name {
			return out[i].Name < out[j].Name
		}
		return out[i].ID < out[j].ID
	})
	return out
}

// Get looks up a room by id; the WS handler uses it as its lookup function.
func (l *Lobby) Get(id string) (*room.Room, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	r, ok := l.rooms[id]
	return r, ok
}

// Remove deletes a room; called by the room's own goroutine on teardown.
func (l *Lobby) Remove(id string) {
	l.mu.Lock()
	delete(l.rooms, id)
	l.mu.Unlock()
}

func newID() (string, error) {
	b := make([]byte, 3)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "r_" + hex.EncodeToString(b), nil
}
