package room

import (
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"

	"quakelite/internal/game"
	"quakelite/internal/protocol"
)

var upgrader = websocket.Upgrader{} // default same-origin check is fine on localhost

// Client is one websocket player: a read pump (socket -> room channel) and a
// write pump (send channel -> socket). Only the write pump writes the socket.
// No ping/pong keepalive on purpose — localhost MVP, closes arrive promptly.
type Client struct {
	conn  *websocket.Conn
	room  *Room
	send  chan []byte
	name  string
	color string // requested palette colour; the room validates and may override it
}

// ServeWS handles /ws?room=<id>&name=<nick>&color=<hex>. It re-validates the
// username server-side and rejects bad connects with a clear close reason —
// never trusting the client alone (SPEC §4.1). The colour is optional and not a
// rejection reason: the room validates it and falls back to a free one.
func ServeWS(lookup func(id string) (*Room, bool)) http.HandlerFunc {
	return func(w http.ResponseWriter, req *http.Request) {
		name := req.URL.Query().Get("name")
		if !protocol.ValidUsername(name) {
			reject(w, req, "invalid or missing username")
			return
		}
		rm, ok := lookup(req.URL.Query().Get("room"))
		if !ok {
			reject(w, req, "room not found")
			return
		}
		// Pre-registration fullness check: racy under simultaneous joins,
		// accepted for the MVP (SPEC §2 — no robustness gold-plating).
		if rm.PlayerCount() >= game.MaxPlayers {
			reject(w, req, "room full")
			return
		}
		conn, err := upgrader.Upgrade(w, req, nil)
		if err != nil {
			log.Printf("ws upgrade: %v", err)
			return
		}
		color := req.URL.Query().Get("color") // optional; the room resolves it
		c := &Client{conn: conn, room: rm, send: make(chan []byte, 64), name: name, color: color}
		if !rm.Register(c) {
			closeWith(conn, "room closed")
			return
		}
		go c.writePump()
		c.readPump()
	}
}

// reject upgrades just enough to deliver a close frame whose reason the client
// can display, then drops the connection.
func reject(w http.ResponseWriter, req *http.Request, reason string) {
	conn, err := upgrader.Upgrade(w, req, nil)
	if err != nil {
		return
	}
	log.Printf("ws rejected: %s (from %s)", reason, req.RemoteAddr)
	closeWith(conn, reason)
}

// closeWith is only used before the write pump exists, so it cannot race it.
func closeWith(conn *websocket.Conn, reason string) {
	msg := websocket.FormatCloseMessage(websocket.ClosePolicyViolation, reason)
	_ = conn.WriteControl(websocket.CloseMessage, msg, time.Now().Add(time.Second))
	_ = conn.Close()
}

// readPump forwards every frame to the room goroutine; on any read error it
// unregisters, which closes send and thereby stops the write pump.
func (c *Client) readPump() {
	defer func() {
		c.room.unregisterClient(c)
		_ = c.conn.Close()
	}()
	c.conn.SetReadLimit(512) // poses and hit claims are tiny
	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		c.room.forward(inbound{c: c, data: data})
	}
}

// writePump drains send to the socket. When the room closes send (unregister),
// it writes a normal close frame and exits.
func (c *Client) writePump() {
	for data := range c.send {
		if err := c.conn.WriteMessage(websocket.TextMessage, data); err != nil {
			return // read pump will notice the dead conn and unregister
		}
	}
	_ = c.conn.WriteMessage(websocket.CloseMessage,
		websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
	_ = c.conn.Close()
}

// trySend queues without ever blocking the room goroutine; a full buffer means
// a slow client and we drop the frame (naive on purpose, SPEC §2).
func (c *Client) trySend(data []byte) {
	select {
	case c.send <- data:
	default:
	}
}
