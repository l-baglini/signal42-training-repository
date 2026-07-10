// Command server runs the Quake-Lite server: static files, lobby REST API, and
// the game WebSocket — one process on one port (SPEC §3).
package main

import (
	"encoding/json"
	"flag"
	"log"
	"net/http"
	"os"

	"quakelite/internal/game"
	"quakelite/internal/lobby"
	"quakelite/internal/room"
)

func main() {
	addr := flag.String("addr", defaultAddr(), "listen address (host:port)")
	flag.Parse()

	gameMap, err := game.LoadMap("web/map.json")
	if err != nil {
		log.Fatalf("loading map: %v", err)
	}
	lob := lobby.New(gameMap)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/rooms", handleListRooms(lob))
	mux.HandleFunc("POST /api/rooms", handleCreateRoom(lob))
	mux.HandleFunc("/ws", room.ServeWS(lob.Get))
	// noCache wraps the static server so browsers always fetch fresh JS/CSS during
	// local development — no bundler means no content hashing to bust the cache,
	// and stale ES modules otherwise hide edits (localhost dev only, SPEC §3).
	mux.Handle("/", noCache(http.FileServer(http.Dir("web"))))

	log.Printf("quake-lite listening on http://localhost%s", *addr)
	if err := http.ListenAndServe(*addr, mux); err != nil {
		log.Fatalf("listen %s: %v", *addr, err)
	}
}

func handleListRooms(lob *lobby.Lobby) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"rooms": lob.List()})
	}
}

func handleCreateRoom(lob *lobby.Lobby) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
			return
		}
		room, err := lob.Create(body.Name)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		log.Printf("room created: %s (%q)", room.ID, room.Name)
		writeJSON(w, http.StatusOK, map[string]string{"id": room.ID, "name": room.Name})
	}
}

// noCache tells the browser not to cache static assets, so edits to JS/CSS show
// up on a normal reload without a manual hard-refresh.
func noCache(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		h.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("encoding response: %v", err)
	}
}

// defaultAddr reads ADDR or PORT from the environment with a localhost-friendly
// default — deploy-readiness without deploying (SPEC §3).
func defaultAddr() string {
	if a := os.Getenv("ADDR"); a != "" {
		return a
	}
	if p := os.Getenv("PORT"); p != "" {
		return ":" + p
	}
	return ":8080"
}
