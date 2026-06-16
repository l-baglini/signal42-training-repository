'use strict';

// ═══════════════════════════════════════════════════════════════
//  CANVAS SETUP
// ═══════════════════════════════════════════════════════════════

const canvas = document.getElementById('game');
const ctx    = canvas.getContext('2d');
const DPR    = window.devicePixelRatio || 1;
const SW = 1280, SH = 800;

// Backing store at full DPR resolution; CSS size adapts to the window.
canvas.width  = SW * DPR;
canvas.height = SH * DPR;
ctx.scale(DPR, DPR);

function fitWindow() {
  // Never scale above 1 (avoids blur); scale down if the viewport is smaller.
  const s = Math.min(1, window.innerWidth / SW, window.innerHeight / SH);
  canvas.style.width  = Math.floor(SW * s) + 'px';
  canvas.style.height = Math.floor(SH * s) + 'px';
}
window.addEventListener('resize', fitWindow);
fitWindow();

// ═══════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════

const BOARD_COLS = 10;
const BOARD_ROWS = 6;
const NUM_SQ     = BOARD_COLS * BOARD_ROWS;   // 60
const WIN_SQ     = NUM_SQ - 1;               // 59
const SQ         = 70;                        // square side px
const BOARD_X    = 20;
const BOARD_Y    = 82;
const PANEL_X    = BOARD_X + BOARD_COLS * SQ + 18;  // 738
const PANEL_W    = SW - PANEL_X - 8;                 // 534
const MIN_P      = 2;
const MAX_P      = 6;
const ROLL_MS    = 1000;   // dice animation duration

// ═══════════════════════════════════════════════════════════════
//  PALETTE
// ═══════════════════════════════════════════════════════════════

const C = {
  bg:      '#0a0c1e',
  boardBg: '#12143a',
  sqN:     '#1e2249',
  sqBd:    '#3a3e73',
  sqS:     '#12591e',
  sqW:     '#591259',
  sqH:     '#165228',
  sqO:     '#521616',
  tx:      '#d2d7ff',
  txd:     '#8085a8',
  pnBg:    '#101230',
  pnBd:    '#383c72',
  btn:     '#3458ac',
  btnHov:  '#4472d4',
  gold:    '#dac030',
  help:    '#4ed076',
  obs:     '#d04e4e',
  wht:     '#ffffff',
};

const PAWN_COLORS = [
  { name: 'Red',    css: '#e43838' },
  { name: 'Blue',   css: '#3876e4' },
  { name: 'Green',  css: '#2ec44c' },
  { name: 'Yellow', css: '#e2ce2e' },
  { name: 'Purple', css: '#ba38e2' },
  { name: 'Cyan',   css: '#2ec4d8' },
];

// ═══════════════════════════════════════════════════════════════
//  SPECIAL SQUARES
//  effect → move ±N squares
//  goto   → teleport to square index
//  skip   → lose N turns
// ═══════════════════════════════════════════════════════════════

const SPECIALS = {
   4: { type:'help',     name:'Vim Shortcut Mastered!',
        desc:'You finally learned :wq!\nAdvance 3 squares.',                  effect:  3 },
   8: { type:'obstacle', name:'Infinite Loop Detected!',
        desc:'while True: pass  // forgot break\nGo back 4 squares.',         effect: -4 },
  13: { type:'help',     name:'Stack Overflow Saves You!',
        desc:'A 2009 answer solves your 2025 bug.\nAdvance 5 squares.',        effect:  5 },
  17: { type:'obstacle', name:'Merge Conflict!',
        desc:'<<<<<<< HEAD\nLose 1 turn resolving this.',                       skip:    1 },
  22: { type:'help',     name:'PR Merged on First Review!',
        desc:'Zero change requests. Legendary.\nAdvance 6 squares.',           effect:  6 },
  26: { type:'obstacle', name:'Blue Screen of Death!',
        desc:'IRQL_NOT_LESS_OR_EQUAL\nLose 2 turns rebooting.',                skip:    2 },
  30: { type:'help',     name:'Caffeine Overdose!',
        desc:'Quadruple espresso consumed.\nAdvance 4 squares.',               effect:  4 },
  34: { type:'obstacle', name:'git push --force to main!',
        desc:"You nuked the team's build.\nGo back 8 squares.",                effect: -8 },
  38: { type:'help',     name:'O(1) Algorithm Found!',
        desc:'Big-O perfection achieved.\nAdvance 5 squares.',                 effect:  5 },
  42: { type:'obstacle', name:'Segmentation Fault!',
        desc:'Core dumped.\nTeleport back to square 21.',                       goto:   20 },
  46: { type:'help',     name:'Rubber Duck Debug!',
        desc:'Explained to duck, bug solved instantly.\nAdvance 4 squares.',   effect:  4 },
  50: { type:'obstacle', name:'404 — Docs Not Found!',
        desc:'Documentation last updated 2015.\nGo back 5 squares.',           effect: -5 },
  54: { type:'help',     name:'CI/CD Pipeline All Green!',
        desc:'Friday deploy actually worked. Legend.\nAdvance 4 squares.',     effect:  4 },
  57: { type:'obstacle', name:'Production Down at 3 AM!',
        desc:'On-call nightmare. All hands on deck.\nGo back 10 squares.',     effect: -10 },
};

// ═══════════════════════════════════════════════════════════════
//  GAME STATE
// ═══════════════════════════════════════════════════════════════

let G = null;

function resetGame() {
  G = {
    screen:      'setup_count',  // setup_count | setup_players | game | event
    players:     [],
    numPlayers:  2,
    setupIdx:    0,
    setupName:   '',
    setupColIdx: 0,
    current:     0,
    dieValue:    1,
    rolling:     false,
    rollStart:   0,
    eventData:   null,
    message:     '',
    winner:      null,
    clickables:  [],
    mouse:       { x: -1, y: -1 },
  };
}
resetGame();

// ═══════════════════════════════════════════════════════════════
//  DRAWING UTILITIES
// ═══════════════════════════════════════════════════════════════

function fillRR(x, y, w, h, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function strokeRR(x, y, w, h, r, color, lw = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth   = lw;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.stroke();
}

function dot(x, y, r, fill, stroke, lw = 2) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill)   { ctx.fillStyle   = fill;   ctx.fill();   }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

function txt(text, font, color, x, y, align = 'left', baseline = 'top') {
  ctx.font         = font;
  ctx.fillStyle    = color;
  ctx.textAlign    = align;
  ctx.textBaseline = baseline;
  ctx.fillText(text, x, y);
}

function hline(x1, x2, y, color, lw = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth   = lw;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
}

/** Register a button on clickables, draw it, return its rect. */
function button(label, font, x, y, w, h, action) {
  const r   = { x, y, w, h };
  const hov = isHit(r);
  fillRR(x, y, w, h, 8, hov ? C.btnHov : C.btn);
  strokeRR(x, y, w, h, 8, C.wht, 2);
  txt(label, font, C.wht, x + w / 2, y + h / 2, 'center', 'middle');
  G.clickables.push({ r, action });
  return r;
}

function isHit(r) {
  const { x, y } = G.mouse;
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/**
 * Word-wrap text with '\n' paragraph breaks.
 * Returns the y after the last line.
 */
function wrapped(text, font, color, x, y, maxW, lineH) {
  ctx.font         = font;
  ctx.fillStyle    = color;
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';
  for (const para of text.split('\n')) {
    const words = para.split(' ');
    let   line  = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width <= maxW) {
        line = test;
      } else {
        if (line) { ctx.fillText(line, x, y); y += lineH; }
        line = w;
      }
    }
    if (line) { ctx.fillText(line, x, y); y += lineH; }
  }
  return y;
}

// ═══════════════════════════════════════════════════════════════
//  BOARD GEOMETRY  (snake path, bottom row = squares 1-10)
// ═══════════════════════════════════════════════════════════════

function sqTL(idx) {
  const fromBottom = Math.floor(idx / BOARD_COLS);
  const inRow      = idx % BOARD_COLS;
  const row        = (BOARD_ROWS - 1) - fromBottom;
  const col        = fromBottom % 2 === 0 ? inRow : (BOARD_COLS - 1 - inRow);
  return { x: BOARD_X + col * SQ, y: BOARD_Y + row * SQ };
}

function sqC(idx) {
  const { x, y } = sqTL(idx);
  return { x: x + SQ / 2, y: y + SQ / 2 };
}

// ═══════════════════════════════════════════════════════════════
//  DICE
// ═══════════════════════════════════════════════════════════════

const DICE_DOTS = {
  1: [[0,0]],
  2: [[-1,-1],[1,1]],
  3: [[-1,-1],[0,0],[1,1]],
  4: [[-1,-1],[1,-1],[-1,1],[1,1]],
  5: [[-1,-1],[1,-1],[0,0],[-1,1],[1,1]],
  6: [[-1,-1],[1,-1],[-1,0],[1,0],[-1,1],[1,1]],
};

function drawDice(val, x, y, size, dotCol, bgCol) {
  fillRR(x, y, size, size, 10, bgCol);
  strokeRR(x, y, size, size, 10, dotCol, 2);
  const cx = x + size / 2, cy = y + size / 2;
  const r  = Math.max(size / 10, 4);
  const o  = size / 4;
  ctx.fillStyle = dotCol;
  for (const [dx, dy] of DICE_DOTS[val] ?? []) {
    ctx.beginPath();
    ctx.arc(cx + dx * o, cy + dy * o, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ═══════════════════════════════════════════════════════════════
//  GAME LOGIC
// ═══════════════════════════════════════════════════════════════

function confirmPlayer() {
  const name = G.setupName.trim() || `Player ${G.setupIdx + 1}`;
  const used = new Set(G.players.map(p => p.colorName));
  let ci     = G.setupColIdx;
  if (used.has(PAWN_COLORS[ci].name)) {
    ci = PAWN_COLORS.findIndex(c => !used.has(c.name));
  }
  G.players.push({
    name:      name,
    color:     PAWN_COLORS[ci].css,
    colorName: PAWN_COLORS[ci].name,
    position:  0,
    skipTurns: 0,
  });
  G.setupIdx++;
  if (G.setupIdx >= G.numPlayers) {
    G.screen  = 'game';
    G.current = 0;
    G.message = `${G.players[0].name}'s turn — roll the dice!`;
  } else {
    G.setupName = '';
    const used2  = new Set(G.players.map(p => p.colorName));
    G.setupColIdx = PAWN_COLORS.findIndex(c => !used2.has(c.name));
  }
}

function startRoll() {
  const p = G.players[G.current];
  if (p.skipTurns > 0) {
    p.skipTurns--;
    G.message = `${p.name} loses a turn!` +
                (p.skipTurns ? `  (${p.skipTurns} remaining)` : '');
    nextPlayer();
    return;
  }
  G.rolling   = true;
  G.rollStart = performance.now();
}

function nextPlayer() {
  G.current = (G.current + 1) % G.players.length;
  const p   = G.players[G.current];
  G.message  = `${p.name}'s turn — roll the dice!`;
  if (p.skipTurns > 0) G.message += `  (skip: ${p.skipTurns} pending)`;
  G.screen  = 'game';
}

function resolveMove() {
  const p = G.players[G.current];
  let pos  = p.position + G.dieValue;
  if (pos > WIN_SQ) pos = WIN_SQ - (pos - WIN_SQ);
  pos        = Math.max(0, pos);
  p.position = pos;
  G.message  = `${p.name} rolled ${G.dieValue} → square ${pos + 1}`;

  if (pos === WIN_SQ)          { showWin(p); return; }
  if (SPECIALS[pos] !== undefined) { applySpecial(p, SPECIALS[pos]); }
  else                             { nextPlayer(); }
}

function applySpecial(p, sp) {
  if      ('goto'   in sp) p.position = sp.goto;
  else if ('effect' in sp) p.position = Math.max(0, Math.min(WIN_SQ, p.position + sp.effect));
  if      ('skip'   in sp) p.skipTurns += sp.skip;
  if (p.position === WIN_SQ) { showWin(p); return; }
  G.eventData = { ...sp };
  G.screen    = 'event';
}

function showWin(p) {
  G.winner    = p;
  G.eventData = {
    type: 'win',
    name: `${p.name} WINS!`,
    desc: `Congratulations!\n${p.name} reached the finish line first!`,
  };
  G.screen = 'event';
}

// ═══════════════════════════════════════════════════════════════
//  UPDATE
// ═══════════════════════════════════════════════════════════════

function update(now) {
  if (!G.rolling) return;
  const elapsed = now - G.rollStart;
  if (elapsed < ROLL_MS) {
    if (Math.floor(elapsed / 90) !== Math.floor((elapsed - 16) / 90)) {
      G.dieValue = Math.ceil(Math.random() * 6);
    }
  } else {
    G.rolling  = false;
    G.dieValue = Math.ceil(Math.random() * 6);
    resolveMove();
  }
}

// ═══════════════════════════════════════════════════════════════
//  DRAW — SETUP COUNT
// ═══════════════════════════════════════════════════════════════

function drawSetupCount(now) {
  // Animated background particles
  for (let i = 0; i < 40; i++) {
    const a  = (now * 0.0003 + i * 0.628) % (Math.PI * 2);
    const rx = ((SW / 2 + 380 * Math.cos(a + i * 0.7)) % SW + SW) % SW;
    const ry = ((SH / 2 + 310 * Math.sin(a * 1.2 + i * 0.5)) % SH + SH) % SH;
    dot(rx, ry, 1 + (i % 3), `rgb(${30+i*4},${35+i*3},${80+i*4})`, null);
  }

  txt('NERD QUEST', 'bold 30px "Courier New",monospace', C.gold,
      SW / 2, 178, 'center', 'top');
  txt('A Nerd-Themed Game of the Goose', '17px "Courier New",monospace',
      C.txd, SW / 2, 222, 'center', 'top');
  hline(SW / 2 - 200, SW / 2 + 200, 265, C.pnBd);

  txt('How many players?', 'bold 22px "Courier New",monospace',
      C.tx, SW / 2, 292, 'center', 'top');

  const bw = 50;
  button('-', 'bold 22px "Courier New",monospace',
         SW / 2 - 110, 340, bw, bw,
         () => { G.numPlayers = Math.max(MIN_P, G.numPlayers - 1); });
  button('+', 'bold 22px "Courier New",monospace',
         SW / 2 + 60, 340, bw, bw,
         () => { G.numPlayers = Math.min(MAX_P, G.numPlayers + 1); });
  txt(String(G.numPlayers), 'bold 30px "Courier New",monospace',
      C.gold, SW / 2, 340, 'center', 'top');

  // Colour preview circles
  for (let i = 0; i < G.numPlayers; i++) {
    const col = PAWN_COLORS[i % PAWN_COLORS.length].css;
    const px  = SW / 2 - (G.numPlayers - 1) * 24 + i * 48;
    dot(px, 432, 16, col, C.wht, 2);
  }

  txt(`2 to ${MAX_P} players supported`, '13px "Courier New",monospace',
      C.txd, SW / 2, 466, 'center', 'top');

  button('Next  -->', 'bold 22px "Courier New",monospace',
         SW / 2 - 110, 522, 220, 48, () => {
           G.screen      = 'setup_players';
           G.setupIdx    = 0;
           G.setupName   = '';
           G.setupColIdx = 0;
         });

  txt('Press ESC to quit', '11px "Courier New",monospace',
      C.txd, SW / 2, SH - 26, 'center', 'top');
}

// ═══════════════════════════════════════════════════════════════
//  DRAW — SETUP PLAYERS
// ═══════════════════════════════════════════════════════════════

function drawSetupPlayers(now) {
  const n  = G.setupIdx + 1;
  const cx = SW / 2;

  txt('NERD QUEST', 'bold 30px "Courier New",monospace', C.gold, cx, 34, 'center', 'top');

  // Progress indicator
  for (let i = 0; i < G.numPlayers; i++) {
    const px  = cx - (G.numPlayers - 1) * 16 + i * 32;
    const col = i < n ? C.gold : C.txd;
    dot(px, 84, 8, col, i < n ? C.wht : null, 2);
  }
  txt(`Player ${n} of ${G.numPlayers}`, 'bold 22px "Courier New",monospace',
      C.tx, cx, 100, 'center', 'top');

  // Name input
  txt('Enter your name:', '17px "Courier New",monospace', C.txd, cx - 200, 150, 'left', 'top');
  fillRR(cx - 200, 178, 400, 42, 6, C.sqN);
  strokeRR(cx - 200, 178, 400, 42, 6, C.sqBd, 2);
  const cursor = Math.floor(now / 500) % 2 === 0 ? '|' : ' ';
  txt(G.setupName + cursor, 'bold 20px "Courier New",monospace',
      C.tx, cx - 190, 190, 'left', 'top');

  // Colour picker
  txt('Choose your pawn colour:', '17px "Courier New",monospace',
      C.txd, cx - 200, 252, 'left', 'top');
  const used   = new Set(G.players.map(p => p.colorName));
  const totalW = PAWN_COLORS.length * 58;
  const ox     = cx - totalW / 2;
  PAWN_COLORS.forEach((pc, i) => {
    const bx    = ox + i * 58 + 29;
    const by    = 308;
    const avail = !used.has(pc.name);

    dot(bx, by, 20, avail ? pc.css : dimHex(pc.css), null);
    if (i === G.setupColIdx && avail) dot(bx, by, 23, null, C.wht, 3);
    if (!avail) {
      ctx.strokeStyle = '#b42828';
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.moveTo(bx - 14, by - 14); ctx.lineTo(bx + 14, by + 14);
      ctx.moveTo(bx + 14, by - 14); ctx.lineTo(bx - 14, by + 14);
      ctx.stroke();
    }
    txt(pc.name, '11px "Courier New",monospace',
        avail ? C.txd : '#323250', bx, by + 28, 'center', 'top');

    if (avail) {
      const r = { x: bx - 24, y: by - 24, w: 48, h: 48 };
      G.clickables.push({ r, action: () => { G.setupColIdx = i; } });
    }
  });

  // Players registered so far
  if (G.players.length > 0) {
    txt('Players so far:', '13px "Courier New",monospace',
        C.txd, cx - 200, 380, 'left', 'top');
    G.players.forEach((p, i) => {
      dot(cx - 184, 410 + i * 30, 10, p.color, null);
      txt(p.name, '17px "Courier New",monospace',
          C.tx, cx - 166, 401 + i * 30, 'left', 'top');
    });
  }

  const label = n === G.numPlayers ? 'Start Game!' : 'Next Player -->';
  button(label, 'bold 22px "Courier New",monospace',
         cx - 115, SH - 106, 230, 48, confirmPlayer);
}

// ═══════════════════════════════════════════════════════════════
//  DRAW — BOARD
// ═══════════════════════════════════════════════════════════════

function drawBoard() {
  const bw = BOARD_COLS * SQ, bh = BOARD_ROWS * SQ;
  fillRR(BOARD_X - 4, BOARD_Y - 4, bw + 8, bh + 8, 6, C.boardBg);

  for (let i = 0; i < NUM_SQ; i++) {
    const { x, y } = sqTL(i);
    const sp       = SPECIALS[i];
    const bg =
      i === 0       ? C.sqS :
      i === WIN_SQ  ? C.sqW :
      sp?.type === 'help'     ? C.sqH :
      sp?.type === 'obstacle' ? C.sqO :
      C.sqN;

    fillRR(x, y, SQ, SQ, 3, bg);
    strokeRR(x, y, SQ, SQ, 3, C.sqBd, 1);

    txt(String(i + 1), '11px "Courier New",monospace', C.txd, x + 3, y + 2);

    if (i === 0) {
      txt('START', '11px "Courier New",monospace', C.wht,
          x + SQ / 2, y + SQ / 2, 'center', 'middle');
    } else if (i === WIN_SQ) {
      txt('FINISH', '11px "Courier New",monospace', C.gold,
          x + SQ / 2, y + SQ / 2, 'center', 'middle');
    } else if (sp) {
      const sym = sp.type === 'help' ? '+' : '!';
      const col = sp.type === 'help' ? C.help : C.obs;
      txt(sym, 'bold 22px "Courier New",monospace', col,
          x + SQ / 2, y + SQ / 2, 'center', 'middle');
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  DRAW — PAWNS
// ═══════════════════════════════════════════════════════════════

function drawPawns() {
  const groups = {};
  for (const p of G.players) {
    (groups[p.position] ??= []).push(p);
  }
  for (const [pos, grp] of Object.entries(groups)) {
    const { x: cx, y: cy } = sqC(Number(pos));
    grp.forEach((p, i) => {
      let ox = 0, oy = 0;
      if (grp.length > 1) {
        const a = (2 * Math.PI * i / grp.length) - Math.PI / 2;
        ox = Math.round(12 * Math.cos(a));
        oy = Math.round(12 * Math.sin(a));
      }
      dot(cx + ox, cy + oy, 11, p.color, C.wht, 2);
    });
  }
}

// ═══════════════════════════════════════════════════════════════
//  DRAW — PANEL
// ═══════════════════════════════════════════════════════════════

function drawPanel() {
  const px = PANEL_X, pw = PANEL_W;
  ctx.fillStyle = C.pnBg;
  ctx.fillRect(px, 0, pw, SH);
  hline(px, px, SH, C.pnBd);             // left border
  ctx.strokeStyle = C.pnBd; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, SH); ctx.stroke();

  const SM  = '13px "Courier New",monospace';
  const MD  = '17px "Courier New",monospace';
  const BLD = 'bold 20px "Courier New",monospace';
  const XS  = '11px "Courier New",monospace';

  let y = 14;
  const p = G.players[G.current];

  // ── Current turn ──
  txt('CURRENT TURN', SM, C.txd, px + 12, y);
  y += 20;
  dot(px + 22, y + 10, 10, p.color, C.wht, 2);
  txt(p.name, BLD, C.tx, px + 40, y);
  y += 32;

  hline(px + 6, px + pw - 6, y, C.pnBd); y += 8;

  // ── Status message ──
  y = wrapped(G.message, SM, C.txd, px + 10, y, pw - 20, 17) + 6;

  hline(px + 6, px + pw - 6, y, C.pnBd); y += 12;

  // ── Dice ──
  txt('DICE', SM, C.txd, px + 12, y); y += 20;
  const ds   = 74;
  const dx   = px + (pw - ds) / 2;
  const dotC = G.rolling ? C.wht : C.gold;
  drawDice(G.dieValue, dx, y, ds, dotC, '#282e60');
  y += ds + 12;

  if (!G.rolling) {
    button('Roll Dice', MD, px + (pw - 160) / 2, y, 160, 44, startRoll);
  } else {
    txt('Rolling...', MD, C.txd, px + pw / 2, y + 12, 'center', 'top');
  }
  y += 62;

  hline(px + 6, px + pw - 6, y, C.pnBd); y += 10;

  // ── Players list ──
  txt('PLAYERS', SM, C.txd, px + 12, y); y += 20;
  for (let i = 0; i < G.players.length; i++) {
    const pl    = G.players[i];
    const isCur = i === G.current;
    dot(px + 22, y + 9, 8, pl.color, null);
    txt((isCur ? '> ' : '  ') + pl.name, SM, isCur ? C.tx : C.txd, px + 36, y);
    let info = `sq.${pl.position + 1}`;
    if (pl.skipTurns > 0) info += `  skip:${pl.skipTurns}`;
    txt(info, XS, C.txd, px + 36, y + 16);
    y += 36;
  }

  // ── Legend ──
  const ly = SH - 96;
  hline(px + 6, px + pw - 6, ly, C.pnBd);
  fillRR(px + 12, ly + 10, 12, 12, 2, C.sqH);
  txt('+ Help square',     XS, C.help, px + 30, ly + 8);
  fillRR(px + 12, ly + 28, 12, 12, 2, C.sqO);
  txt('! Obstacle square', XS, C.obs,  px + 30, ly + 26);
  fillRR(px + 12, ly + 46, 12, 12, 2, C.sqS);
  txt('  Start / Finish',  XS, C.txd,  px + 30, ly + 44);
}

// ═══════════════════════════════════════════════════════════════
//  DRAW — EVENT OVERLAY
// ═══════════════════════════════════════════════════════════════

function drawEvent() {
  if (!G.eventData) return;
  const sp = G.eventData;

  // Dimmed backdrop
  ctx.fillStyle = 'rgba(0,0,14,0.78)';
  ctx.fillRect(0, 0, SW, SH);

  const et = sp.type ?? 'help';
  const cw = 620, ch = 340;
  const cx = (SW - cw) / 2, cy = (SH - ch) / 2;

  const cardBg = et === 'win' ? '#37126a' : et === 'help' ? C.sqH : C.sqO;
  const cardBd = et === 'win' ? C.gold    : et === 'help' ? C.help : C.obs;
  const tag    = et === 'win' ? '**  WINNER  **'
               : et === 'help' ? '**  BONUS  **'
               : '!!  OBSTACLE  !!';
  const tagC   = et === 'win' ? C.gold : et === 'help' ? C.help : C.obs;

  fillRR(cx, cy, cw, ch, 16, cardBg);
  strokeRR(cx, cy, cw, ch, 16, cardBd, 3);

  txt(tag,     'bold 20px "Courier New",monospace', tagC,  SW / 2, cy + 22, 'center', 'top');
  txt(sp.name, 'bold 28px "Courier New",monospace', C.tx,  SW / 2, cy + 58, 'center', 'top');
  wrapped(sp.desc, '17px "Courier New",monospace', C.txd, cx + 32, cy + 118, cw - 64, 22);

  if (et !== 'win') {
    const pl = G.players[G.current];
    dot(SW / 2 - 84, cy + ch - 70, 10, pl.color, C.wht, 2);
    txt(pl.name, '17px "Courier New",monospace', C.tx,
        SW / 2 - 66, cy + ch - 79);
  }

  const btnLabel = et === 'win' ? 'Play Again!' : 'Continue';
  button(btnLabel, '17px "Courier New",monospace',
         SW / 2 - 88, cy + ch - 52, 176, 42,
         () => {
           if (et === 'win') { resetGame(); }
           else { G.eventData = null; G.screen = 'game'; nextPlayer(); }
         });
}

// ═══════════════════════════════════════════════════════════════
//  MAIN DRAW LOOP
// ═══════════════════════════════════════════════════════════════

function draw(now) {
  G.clickables = [];

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, SW, SH);

  if (G.screen === 'setup_count') {
    drawSetupCount(now);
  } else if (G.screen === 'setup_players') {
    drawSetupPlayers(now);
  } else {
    // game or event — draw board first, then overlay if needed
    txt('NERD QUEST', 'bold 28px "Courier New",monospace', C.gold, BOARD_X, 8, 'left', 'top');
    txt('Nerd Edition  —  Game of the Goose',
        '11px "Courier New",monospace', C.txd, BOARD_X, 48, 'left', 'top');
    drawBoard();
    drawPawns();
    drawPanel();
    if (G.screen === 'event') drawEvent();
  }

  // Pointer cursor when hovering a button / colour swatch
  const hovering = G.clickables.some(({ r }) => isHit(r));
  canvas.style.cursor = hovering ? 'pointer' : 'default';
}

function loop(now) {
  update(now);
  draw(now);
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

// ═══════════════════════════════════════════════════════════════
//  INPUT
// ═══════════════════════════════════════════════════════════════

// Normalize CSS-pixel event coords back to the logical 1280×800 space.
function logicalPos(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (SW / r.width),
    y: (e.clientY - r.top)  * (SH / r.height),
  };
}

canvas.addEventListener('mousemove', e => { G.mouse = logicalPos(e); });
canvas.addEventListener('mouseleave', () => { G.mouse = { x: -1, y: -1 }; });

canvas.addEventListener('click', e => {
  const { x: mx, y: my } = logicalPos(e);
  for (const { r: rect, action } of G.clickables) {
    if (mx >= rect.x && mx <= rect.x + rect.w &&
        my >= rect.y && my <= rect.y + rect.h) {
      action();
      break;
    }
  }
});

window.addEventListener('keydown', e => {
  if (e.key === 'Escape') { window.close(); return; }
  if (G.screen !== 'setup_players') return;
  if (e.key === 'Backspace') {
    G.setupName = G.setupName.slice(0, -1);
  } else if (e.key === 'Enter') {
    confirmPlayer();
  } else if (e.key.length === 1 && G.setupName.length < 16) {
    G.setupName += e.key;
  }
});

// ═══════════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════════

function dimHex(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r/3)},${Math.round(g/3)},${Math.round(b/3)})`;
}
