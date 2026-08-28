import {
  getAuthStatus, getRanges, startLogin, streamFight,
  type FightEvent, type StatusEvent,
} from './api.js';
import { Arena } from './game/engine.js';
import { Hud } from './ui/hud.js';
import { Ticker } from './ui/ticker.js';
import { mountRangePicker } from './ui/range-picker.js';
import { authMessage, errorMessage, loginMessage, statusMessage } from './messages.js';

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as T;
};

const startScreen = el('screen-start');
const fightScreen = el('screen-fight');
const startBtn = el<HTMLButtonElement>('start-btn');
const fightStatus = el('fight-status');
const authBox = el('auth-box');

let selectedDays: number | null = null;

async function mountRanges(): Promise<void> {
  const { maxDaysBack } = await getRanges().catch(() => ({ maxDaysBack: 4 }));
  mountRangePicker(el('range-picker'), maxDaysBack, (days) => {
    selectedDays = days;
    startBtn.disabled = false;
  });
}

async function refreshAuth(): Promise<void> {
  authBox.textContent = 'Checking your Claude login...';
  const status = await getAuthStatus();
  authBox.replaceChildren();

  const line = document.createElement('p');
  line.className = status.loggedIn ? 'auth-ok' : 'auth-warn';
  line.textContent = authMessage(status);
  authBox.appendChild(line);
  if (status.loggedIn) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'auth-btn';
  btn.textContent = 'Sign in to Claude';
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const { url, code } = await startLogin();
    const info = document.createElement('p');
    info.textContent = loginMessage(code);
    authBox.appendChild(info);
    if (url) {
      window.open(url, '_blank', 'noopener');
      // Poll until the OAuth round-trip completes in the other tab.
      const poll = window.setInterval(async () => {
        const next = await getAuthStatus();
        if (next.loggedIn) { window.clearInterval(poll); void refreshAuth(); }
      }, 2000);
      window.setTimeout(() => window.clearInterval(poll), 180_000);
    }
    btn.disabled = false;
  });
  authBox.appendChild(btn);
}

startBtn.addEventListener('click', () => {
  if (selectedDays === null) return;
  startScreen.classList.add('hidden');
  fightScreen.classList.remove('hidden');

  const arena = new Arena(el<HTMLCanvasElement>('arena'));
  const hud = new Hud(10);
  const ticker = new Ticker();
  const roundLabel = el('round-label');

  // Nothing real can arrive for the best part of twenty seconds, so the
  // fighters spar until it does. No damage is dealt and the HUD says so.
  arena.start();
  arena.startWarmup();
  roundLabel.textContent = 'WARM-UP';

  streamFight(selectedDays, {
    onStatus: (status: StatusEvent) => { fightStatus.textContent = statusMessage(status); },
    onEvent: (event: FightEvent) => {
      if (arena.isWarmingUp) roundLabel.textContent = 'ROUND 1';
      arena.apply(event);
      if (event.t === 'hit') {
        hud.set(event.hp);
        ticker.show(event);
      } else if (event.t === 'clinch') {
        ticker.show(event);
      } else {
        hud.set(event.hp);
        fightStatus.textContent = `${event.winner} wins by knockout.`;
      }
    },
    onDecision: ({ winner }) => {
      arena.showBanner(winner === 'DRAW' ? 'DRAW' : `${winner} WINS`, 6000);
      fightStatus.textContent = winner === 'DRAW'
        ? 'Posts ran out with the fighters level - it is a draw.'
        : `Posts ran out before a knockout - ${winner} wins on points.`;
    },
    onError: (code) => {
      arena.endWarmup(false);
      roundLabel.textContent = '';
      fightStatus.textContent = errorMessage(code);
    },
    onEnd: () => { arena.stop(); },
  });
});

void mountRanges();
void refreshAuth();
