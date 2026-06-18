// WebSocket wrapper: connect, typed send, per-type onMessage dispatch.
// Every "t" value and field name here is the wire contract and must match
// internal/protocol/protocol.go exactly (SPEC §6).
export function connect({ roomId, username, color }) {
  // Derive the WS URL from the page location — never hard-code the host (SPEC §3).
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  let url = `${proto}//${window.location.host}/ws` +
    `?room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(username)}`;
  if (color) url += `&color=${encodeURIComponent(color)}`; // optional; server resolves it
  const ws = new WebSocket(url);
  const handlers = new Map();

  const net = {
    on(type, fn) {
      handlers.set(type, fn);
      return net;
    },
    send(type, fields = {}) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ t: type, ...fields }));
      }
    },
    close() {
      ws.close();
    },
    onclose: null, // assigned by the caller; receives the CloseEvent
  };

  ws.addEventListener('message', (e) => {
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch {
      console.warn('undecodable frame:', e.data);
      return;
    }
    const handler = handlers.get(msg.t);
    if (handler) handler(msg);
    else console.warn('unhandled message type:', msg.t);
  });
  ws.addEventListener('close', (e) => net.onclose?.(e));

  return net;
}
