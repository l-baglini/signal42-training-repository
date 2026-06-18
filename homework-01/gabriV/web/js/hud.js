// HUD: crosshair, live HP + kills, the hold-Tab scoreboard (SPEC §4.5), the
// kill-feed overlay (SPEC §9.2), and a red damage vignette that flashes when the
// local player's HP drops. Fed the full player list on every snapshot; renders the
// board only while open. addKill() is called from killed events.
import { CONFIG } from './config.js';

export function createHud({ container }) {
  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.innerHTML = `
    <div id="crosshair"></div>
    <div id="damage-vignette"></div>
    <div id="you-died" hidden>
      <span class="yd-main">You Died</span>
      <span class="yd-by"></span>
    </div>
    <div id="killfeed"></div>
    <div id="match-status">
      <div id="match-timer">5:00</div>
      <div id="match-sub"></div>
    </div>
    <div id="hud-stats">
      <div id="hud-hp">HP —</div>
      <div id="hud-kills">Kills —</div>
      <div id="hud-protect" hidden>SPAWN PROTECTED</div>
    </div>
    <div id="scoreboard" hidden>
      <table>
        <thead><tr><th>player</th><th>kills</th><th>deaths</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <div id="gameover" hidden>
      <div class="gameover-card">
        <h2 id="go-title">Match Over</h2>
        <div id="go-reason"></div>
        <table>
          <thead><tr><th>player</th><th>kills</th><th>deaths</th></tr></thead>
          <tbody></tbody>
        </table>
        <div id="go-footer">Returning to lobby…</div>
      </div>
    </div>`;
  container.appendChild(hud);

  const hpEl = hud.querySelector('#hud-hp');
  const killsEl = hud.querySelector('#hud-kills');
  const board = hud.querySelector('#scoreboard');
  const tbody = board.querySelector('tbody');
  const feed = hud.querySelector('#killfeed');
  const protectEl = hud.querySelector('#hud-protect');
  const vignette = hud.querySelector('#damage-vignette');
  const youDied = hud.querySelector('#you-died');
  const youDiedBy = youDied.querySelector('.yd-by');
  const matchStatus = hud.querySelector('#match-status');
  const timerEl = hud.querySelector('#match-timer');
  const subEl = hud.querySelector('#match-sub');
  const gameoverEl = hud.querySelector('#gameover');
  const goTitle = hud.querySelector('#go-title');
  const goReason = hud.querySelector('#go-reason');
  const goBody = gameoverEl.querySelector('tbody');

  let players = [];
  let selfId = null;
  let lastHp = null; // previous self HP, to detect drops (damage) between snapshots
  let killTarget = 0; // last-known kills-to-win, for the game-over reason text

  const clock = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  // flash the red border vignette once; Web Animations API auto-resets opacity to
  // its base (0) and is safely re-triggerable on rapid consecutive hits.
  function flashDamage() {
    vignette.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      { duration: 500, easing: 'ease-out' });
  }

  // Souls-style death screen: slow dark fade-in of "You Died", shown on your own
  // death and cleared on respawn. Pointer lock is left alone (you stay in-game).
  let deathAnim = null;
  function showDeath(killerId) {
    youDiedBy.textContent = killerId ? `Killed by ${nameOf(killerId)}` : '';
    youDied.hidden = false;
    deathAnim?.cancel();
    deathAnim = youDied.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 1400, easing: 'ease-in', fill: 'forwards' });
  }
  function hideDeath() {
    deathAnim?.cancel();
    deathAnim = null;
    youDied.hidden = true;
  }

  const nameOf = (id) => players.find((p) => p.id === id)?.name ?? '???';

  // append a "killer fragged victim" line that fades and self-removes (SPEC §9.2)
  function addKill(killerId, victimId) {
    const line = document.createElement('div');
    line.className = 'killfeed-line';
    if (killerId === selfId || victimId === selfId) line.classList.add('mine');
    line.innerHTML =
      `<span class="kf-name">${nameOf(killerId)}</span> fragged ` +
      `<span class="kf-name">${nameOf(victimId)}</span>`;
    feed.appendChild(line);
    setTimeout(() => line.remove(), 4000);
  }

  // fill a tbody with players sorted by kills — shared by the live scoreboard and
  // the game-over standings.
  function fillBoard(target, list) {
    const sorted = [...list].sort((a, b) => b.kills - a.kills || a.name.localeCompare(b.name));
    target.replaceChildren();
    for (const p of sorted) {
      const tr = document.createElement('tr');
      if (p.id === selfId) tr.className = 'me';
      for (const text of [p.name, p.kills, p.deaths]) {
        const td = document.createElement('td');
        td.textContent = text;
        tr.appendChild(td);
      }
      target.appendChild(tr);
    }
    return sorted;
  }

  function renderBoard() {
    fillBoard(tbody, players);
  }

  // setMatch updates the timer + status line from the snapshot's match block.
  function setMatch(match) {
    if (!match) return;
    killTarget = match.target;
    matchStatus.dataset.phase = match.phase;
    timerEl.textContent = clock(match.timeLeft ?? 0);
    if (match.phase === 'waiting') {
      subEl.textContent = `Waiting for players (${players.length}/2)`;
    } else if (match.phase === 'active') {
      subEl.textContent = `First to ${match.target} kills`;
    } else {
      subEl.textContent = '';
    }
  }

  // showGameOver renders the final scoreboard overlay (SPEC stretch). The socket
  // closes shortly after, which returns the player to the lobby.
  function showGameOver({ reason, players: finalPlayers }) {
    const sorted = fillBoard(goBody, finalPlayers);
    const winner = sorted[0];
    goTitle.textContent = winner ? `🏆 ${winner.name} wins` : 'Match Over';
    goReason.textContent = reason === 'frags'
      ? `First to ${killTarget} kills`
      : "Time's up";
    gameoverEl.hidden = false;
  }

  function update(allPlayers) {
    players = allPlayers;
    const me = players.find((p) => p.id === selfId);
    if (me) {
      if (lastHp !== null && me.hp < lastHp) flashDamage(); // took damage since last snapshot
      lastHp = me.hp;
      hpEl.textContent = `HP ${me.hp}`;
      // "low" = one shot from death: a single hit (hitDamage) would drop us to <=0
      hpEl.classList.toggle('low', me.hp <= CONFIG.hitDamage);
      killsEl.textContent = `Kills ${me.kills}`;
      protectEl.hidden = !me.protected; // SPEC §9.5
    }
    if (!board.hidden) renderBoard();
  }

  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Tab') return;
    e.preventDefault(); // keep the browser from moving focus
    if (e.repeat) return;
    board.hidden = false;
    renderBoard();
  });
  document.addEventListener('keyup', (e) => {
    if (e.code !== 'Tab') return;
    e.preventDefault();
    board.hidden = true;
  });

  return {
    update,
    addKill,
    setMatch,
    showGameOver,
    showDeath,
    hideDeath,
    flashDamage, // exposed so it can be triggered/tested directly (window.game.hud)
    setSelf(id) { selfId = id; },
  };
}
