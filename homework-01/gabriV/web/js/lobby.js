// Lobby UI: mandatory username (SPEC §4.1), room list polled every 2s, create
// form, join buttons. Validation mirrors internal/protocol — the server
// re-checks on WS connect, never trusting the client alone.
import { CONFIG } from './config.js';
import { settings } from './settings.js';

const USERNAME_RE = /^[A-Za-z0-9_-]{2,16}$/;
const STORAGE_KEY = 'quakelite.username';

export function initLobby({ container, onJoin, notice }) {
  container.innerHTML = `
    <div class="panel">
      <h1>Quake-Lite</h1>
      <div id="lobby-notice" class="error" hidden></div>
      <label for="username">Username</label>
      <input id="username" maxlength="16" autocomplete="off"
             placeholder="2-16 chars: letters, digits, _ or -">
      <div id="username-error" class="error" hidden></div>
      <label>Colour</label>
      <div id="color-picker"></div>
      <label for="sens">Mouse sensitivity</label>
      <input id="sens" type="range"
             min="${CONFIG.sensMin}" max="${CONFIG.sensMax}" step="0.0001">
      <form id="create-form">
        <input id="room-name" maxlength="32" autocomplete="off" placeholder="new room name">
        <button id="create-btn" type="submit">Create</button>
      </form>
      <div id="create-error" class="error" hidden></div>
      <h2>Rooms</h2>
      <ul id="room-list"><li class="empty">loading…</li></ul>
    </div>`;

  const usernameInput = container.querySelector('#username');
  const usernameError = container.querySelector('#username-error');
  const colorPicker = container.querySelector('#color-picker');
  const sensInput = container.querySelector('#sens');
  const createForm = container.querySelector('#create-form');
  const roomNameInput = container.querySelector('#room-name');
  const createBtn = container.querySelector('#create-btn');
  const createError = container.querySelector('#create-error');
  const roomList = container.querySelector('#room-list');

  let rooms = [];
  let pollTimer = null;

  // Colour picker: one swatch per palette colour; the chosen one is persisted.
  // Picking re-renders rooms so per-room availability (Join gating) updates.
  function renderColorPicker() {
    colorPicker.replaceChildren();
    for (const c of CONFIG.palette) {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'swatch';
      sw.style.background = c;
      sw.title = c;
      if (c === settings.color) sw.classList.add('selected');
      sw.addEventListener('click', () => {
        settings.setColor(c);
        renderColorPicker();
        renderRooms(); // refresh which rooms accept this colour
      });
      colorPicker.appendChild(sw);
    }
  }

  // Mouse sensitivity slider — shared with the in-game options overlay via settings.
  sensInput.value = settings.sensitivity;
  sensInput.addEventListener('input', () => settings.setSensitivity(sensInput.value));

  if (notice) {
    const noticeEl = container.querySelector('#lobby-notice');
    noticeEl.textContent = notice;
    noticeEl.hidden = false;
  }
  usernameInput.value = localStorage.getItem(STORAGE_KEY) ?? '';

  function username() {
    return usernameInput.value.trim();
  }

  // Valid username unblocks Create/Join; anything else shows why (SPEC §4.1).
  function validateUsername() {
    const name = username();
    let msg = '';
    if (name === '') msg = 'A username is required to create or join a room.';
    else if (!USERNAME_RE.test(name)) {
      msg = 'Username must be 2-16 characters: letters, digits, _ or -.';
    }
    usernameError.textContent = msg;
    usernameError.hidden = msg === '';
    const ok = msg === '';
    createBtn.disabled = !ok;
    for (const btn of roomList.querySelectorAll('button')) {
      btn.disabled = !ok || btn.dataset.full === '1' || btn.dataset.colorTaken === '1';
    }
    if (ok) localStorage.setItem(STORAGE_KEY, name);
    return ok;
  }

  function renderRooms() {
    roomList.replaceChildren();
    if (rooms.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'no rooms yet — create one';
      roomList.appendChild(li);
      return;
    }
    for (const room of rooms) {
      const li = document.createElement('li');
      const taken = room.colors ?? [];
      const colorTaken = taken.includes(settings.color);

      const label = document.createElement('span');
      label.className = 'room-label';
      const text = document.createElement('span');
      text.textContent = `${room.name} — ${room.players}/${room.max}`;
      const dots = document.createElement('span');
      dots.className = 'color-dots';
      for (const c of taken) {
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.background = c;
        dot.title = `${c} taken`;
        dots.appendChild(dot);
      }
      label.append(text, dots);

      const btn = document.createElement('button');
      const full = room.players >= room.max;
      // a room you can't join with your current colour stays listed but blocked,
      // nudging you to pick a free colour (SPEC §9 picker, enforced per room)
      btn.textContent = full ? 'Full' : colorTaken ? 'Colour in use' : 'Join';
      btn.dataset.full = full ? '1' : '0';
      btn.dataset.colorTaken = colorTaken ? '1' : '0';
      if (colorTaken && !full) btn.title = 'Your colour is taken in this room — pick another';
      btn.addEventListener('click', () => {
        if (!validateUsername() || full || colorTaken) return;
        stop();
        onJoin({ roomId: room.id, username: username(), color: settings.color });
      });
      li.append(label, btn);
      roomList.appendChild(li);
    }
    validateUsername(); // apply enabled/disabled state to the fresh buttons
  }

  async function fetchRooms() {
    try {
      const res = await fetch('/api/rooms');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      rooms = (await res.json()).rooms;
      renderRooms();
    } catch (err) {
      // transient poll failure: keep the last list, log once per occurrence
      console.warn('room list fetch failed:', err.message);
    }
  }

  createForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    createError.hidden = true;
    if (!validateUsername()) return;
    const name = roomNameInput.value.trim();
    if (name === '') {
      createError.textContent = 'Room name must not be empty.';
      createError.hidden = false;
      return;
    }
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      createError.textContent = (await res.json()).error ?? 'create failed';
      createError.hidden = false;
      return;
    }
    roomNameInput.value = '';
    fetchRooms();
  });

  usernameInput.addEventListener('input', validateUsername);

  function stop() {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  renderColorPicker();
  validateUsername();
  fetchRooms();
  pollTimer = setInterval(fetchRooms, CONFIG.roomListRefreshMs);
  return { stop };
}
