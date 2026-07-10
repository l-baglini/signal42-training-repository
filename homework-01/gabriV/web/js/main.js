// Entry point: the lobby <-> game state machine. Join opens the WS; the game
// view takes over once the server's welcome arrives.
import { initLobby } from './lobby.js';
import { connect } from './net.js';
import { startGame } from './game.js';

const lobbyEl = document.getElementById('lobby');
const gameEl = document.getElementById('game');

function showLobby(notice) {
  gameEl.style.display = 'none';
  lobbyEl.style.display = '';
  initLobby({ container: lobbyEl, onJoin, notice });
}

function onJoin({ roomId, username, color }) {
  const net = connect({ roomId, username, color });
  let entered = false;

  net.on('welcome', (welcome) => {
    entered = true;
    console.log('welcome:', welcome.id, 'spawn:', welcome.you.pos);
    lobbyEl.style.display = 'none';
    gameEl.style.display = '';
    startGame({ container: gameEl, net, welcome }).catch((err) => {
      console.error('failed to start game:', err);
    });
  });

  net.onclose = (e) => {
    if (!entered) {
      // refused before welcome (invalid name / room full / room gone)
      showLobby(e.reason || 'connection refused');
    } else {
      // naive on purpose: a full reload resets all game state cleanly (SPEC §2)
      window.location.reload();
    }
  };
}

gameEl.style.display = 'none';
showLobby();
