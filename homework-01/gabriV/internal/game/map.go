package game

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"

	"quakelite/internal/protocol"
)

// Map is the server's view of web/map.json — spawn points only; geometry and
// collision stay a client concern (SPEC §7).
type Map struct {
	Name   string          `json:"name"`
	Spawns []protocol.Vec3 `json:"spawns"`
}

// LoadMap reads and validates the map file once at startup.
func LoadMap(path string) (*Map, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading map: %w", err)
	}
	var m Map
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("parsing map %s: %w", path, err)
	}
	if len(m.Spawns) == 0 {
		return nil, errors.New("map has no spawn points")
	}
	return &m, nil
}
