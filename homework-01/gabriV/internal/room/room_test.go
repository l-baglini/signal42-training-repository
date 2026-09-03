package room_test

import (
	"net/http/httptest"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"quakelite/internal/game"
	"quakelite/internal/lobby"
	"quakelite/internal/protocol"
	"quakelite/internal/room"
)

func newTestServer(t *testing.T) (*lobby.Lobby, *httptest.Server) {
	t.Helper()
	m := &game.Map{Name: "test", Spawns: []protocol.Vec3{{X: 1, Y: 1.7, Z: 1}}}
	lob := lobby.New(m)
	ts := httptest.NewServer(room.ServeWS(lob.Get))
	t.Cleanup(ts.Close)
	return lob, ts
}

func wsURL(ts *httptest.Server, query string) string {
	return "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws" + query
}

// settleAtBaseline polls because pump goroutines exit asynchronously after close.
func settleAtBaseline(t *testing.T, baseline int) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		runtime.GC()
		if runtime.NumGoroutine() <= baseline+2 {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("goroutine leak: baseline %d, now %d", baseline, runtime.NumGoroutine())
}

// TestJoinLeaveNoGoroutineLeak repeatedly fills and empties rooms and checks
// that pumps and room goroutines all exit (SPEC §8 quality bar).
func TestJoinLeaveNoGoroutineLeak(t *testing.T) {
	lob, ts := newTestServer(t)
	runtime.GC()
	baseline := runtime.NumGoroutine()

	for i := 0; i < 25; i++ {
		rm, err := lob.Create("leaktest")
		if err != nil {
			t.Fatal(err)
		}
		var conns []*websocket.Conn
		for j := 0; j < 2; j++ {
			c, _, err := websocket.DefaultDialer.Dial(wsURL(ts, "?room="+rm.ID+"&name=tester"), nil)
			if err != nil {
				t.Fatalf("cycle %d dial %d: %v", i, j, err)
			}
			// reading the welcome guarantees registration completed
			var msg map[string]any
			if err := c.ReadJSON(&msg); err != nil || msg["t"] != string(protocol.TypeWelcome) {
				t.Fatalf("cycle %d: want welcome, got %v (%v)", i, msg["t"], err)
			}
			conns = append(conns, c)
		}
		for _, c := range conns {
			_ = c.Close()
		}
		waitGone(t, lob, rm.ID)
	}
	settleAtBaseline(t, baseline)
}

// TestRejectedConnectsDontLeak hits every refusal path repeatedly.
func TestRejectedConnectsDontLeak(t *testing.T) {
	lob, ts := newTestServer(t)
	if _, err := lob.Create("keepalive"); err != nil {
		t.Fatal(err)
	}
	runtime.GC()
	baseline := runtime.NumGoroutine()

	for i := 0; i < 25; i++ {
		for _, q := range []string{
			"?room=r_nope&name=valid_name", // unknown room
			"?room=r_nope&name=x",          // name too short
			"?room=r_nope",                 // name missing
		} {
			c, _, err := websocket.DefaultDialer.Dial(wsURL(ts, q), nil)
			if err != nil {
				t.Fatalf("dial %q: %v", q, err)
			}
			if _, _, err := c.ReadMessage(); err == nil {
				t.Fatalf("connect %q: expected server-side close, got a message", q)
			}
			_ = c.Close()
		}
	}
	settleAtBaseline(t, baseline)
}

func waitGone(t *testing.T, lob *lobby.Lobby, id string) {
	t.Helper()
	for i := 0; i < 200; i++ {
		if _, ok := lob.Get(id); !ok {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("room %s never tore down", id)
}
