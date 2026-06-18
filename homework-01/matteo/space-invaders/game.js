// ─── Constants ────────────────────────────────────────────────────────────────

const W = 800, H = 600;
const COLS = 11, ROWS = 5;
const ALIEN_W = 36, ALIEN_H = 28;
const ALIEN_PAD_X = 18, ALIEN_PAD_Y = 16;
const GRID_OFFSET_X = 80, GRID_OFFSET_Y = 70;
const PLAYER_W = 48, PLAYER_H = 24;
const PLAYER_SPEED = 5;
const BULLET_SPEED = 8;
const BOMB_SPEED_BASE = 3;
const BUNKER_COUNT = 4;
const STAR_COUNT = 120;

// ─── Canvas setup ─────────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// ─── Audio (Web Audio API, procedural) ────────────────────────────────────────

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playTone(freq, type, duration, vol = 0.3) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.3, audioCtx.currentTime + duration);
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

const sfx = {
  shoot:    () => playTone(880, 'square', 0.08, 0.2),
  hit:      () => playTone(200, 'sawtooth', 0.15, 0.3),
  ufoHit:   () => playTone(600, 'square', 0.3, 0.4),
  playerDie:() => playTone(110, 'sawtooth', 0.6, 0.5),
  march: (() => {
    let step = 0;
    const notes = [160, 130, 100, 80];
    return () => { playTone(notes[step % 4], 'square', 0.06, 0.15); step++; };
  })(),
};

// ─── Sprite drawing (pixel art via canvas) ────────────────────────────────────

function drawAlien(x, y, type, frame, color) {
  const sprites = {
    0: [ // squid
      ['..XXXXX..', '.X.XXX.X.', 'XXXXXXXXX', 'XX.XXX.XX', 'XXXXXXXXX', '.X.....X.', '..XX.XX..'],
      ['..XXXXX..', 'X.XXXXX.X', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..', '.X.....X.', 'X.......X'],
    ],
    1: [ // crab
      ['.X.....X.', '..XXXXX..', '.XXXXXXX.', 'XX.X.X.XX', 'XXXXXXXXX', '.XX...XX.', 'X.......X'],
      ['.X.....X.', '..XXXXX..', '.XXXXXXX.', 'XX.X.X.XX', 'XXXXXXXXX', '..X...X..', '.X.....X.'],
    ],
    2: [ // octopus
      ['...XXX...', '.XXXXXXX.', 'XX.X.X.XX', 'XXXXXXXXX', '..X...X..', '.X.XXX.X.', 'X.......X'],
      ['...XXX...', '.XXXXXXX.', 'XX.X.X.XX', 'XXXXXXXXX', '..X.X.X..', 'X.......X', '.X.....X.'],
    ],
  };

  const sprite = sprites[type][frame];
  const pw = 4; // pixel width
  ctx.fillStyle = color;

  sprite.forEach((row, ry) => {
    row.split('').forEach((cell, rx) => {
      if (cell === 'X') {
        ctx.fillRect(x + rx * pw, y + ry * pw, pw, pw);
      }
    });
  });
}

function drawPlayer(x, y) {
  ctx.fillStyle = '#0f0';
  // body
  ctx.fillRect(x + 16, y, 16, 8);
  ctx.fillRect(x + 4, y + 8, 40, 8);
  ctx.fillRect(x, y + 16, 48, 8);
  // nozzle glow
  ctx.shadowColor = '#0f0';
  ctx.shadowBlur = 8;
  ctx.fillRect(x + 20, y - 4, 8, 4);
  ctx.shadowBlur = 0;
}

function drawBunker(bx, by, blocks) {
  ctx.fillStyle = '#0f0';
  for (let r = 0; r < blocks.length; r++) {
    for (let c = 0; c < blocks[r].length; c++) {
      if (blocks[r][c]) {
        ctx.fillRect(bx + c * 4, by + r * 4, 4, 4);
      }
    }
  }
}

function drawUFO(x, y) {
  ctx.fillStyle = '#f00';
  ctx.shadowColor = '#f00';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.ellipse(x + 24, y + 14, 24, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f88';
  ctx.beginPath();
  ctx.ellipse(x + 24, y + 8, 12, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

// ─── Bunker pixel map ─────────────────────────────────────────────────────────

function makeBunker() {
  const shape = [
    [0,0,1,1,1,1,1,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,0],
    [1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,1,1,0,0,0,0,0,0,1,1,1,1],  // notch row 5-6
    [1,1,0,0,0,0,0,0,0,0,1,1,1],
  ];
  // deep-copy to mutable
  return shape.map(r => r.slice());
}

// ─── Stars ────────────────────────────────────────────────────────────────────

const stars = Array.from({ length: STAR_COUNT }, () => ({
  x: Math.random() * W,
  y: Math.random() * H,
  r: Math.random() * 1.5 + 0.3,
  bright: Math.random(),
}));

function drawStars() {
  stars.forEach(s => {
    const alpha = 0.3 + 0.5 * Math.abs(Math.sin(Date.now() * 0.001 + s.bright * 10));
    ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ─── Game state ───────────────────────────────────────────────────────────────

let state; // 'title' | 'playing' | 'dead' | 'levelup' | 'gameover' | 'victory'

let score, hiScore, level, lives;
let player;
let aliens;
let bullets;        // player bullets
let bombs;          // alien bombs
let bunkers;
let ufo;
let alienDir;       // 1 = right, -1 = left
let alienSpeed;
let alienDropCounter;
let marchTimer, marchInterval;
let animFrame;
let stateTimer;
let particles;
let ufoTimer;

function init() {
  score = 0;
  hiScore = parseInt(localStorage.getItem('si_hiscore') || '0');
  level = 1;
  lives = 3;
  initLevel();
}

function initLevel() {
  player = { x: W / 2 - PLAYER_W / 2, y: H - 60 };
  bullets = [];
  bombs = [];
  particles = [];
  alienDir = 1;
  alienDropCounter = 0;
  marchTimer = 0;
  marchInterval = 60;
  ufoTimer = Math.floor(Math.random() * 600) + 400;
  ufo = null;
  alienSpeed = 1 + (level - 1) * 0.5;

  // build alien grid
  aliens = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const type = r === 0 ? 0 : r < 3 ? 1 : 2;
      const points = type === 0 ? 30 : type === 1 ? 20 : 10;
      aliens.push({
        r, c,
        x: GRID_OFFSET_X + c * (ALIEN_W + ALIEN_PAD_X),
        y: GRID_OFFSET_Y + r * (ALIEN_H + ALIEN_PAD_Y),
        type, points,
        alive: true,
        frame: 0,
      });
    }
  }

  // build bunkers
  const bunkerY = H - 140;
  const spacing = W / (BUNKER_COUNT + 1);
  bunkers = Array.from({ length: BUNKER_COUNT }, (_, i) => ({
    x: spacing * (i + 1) - 26,
    y: bunkerY,
    blocks: makeBunker(),
  }));

  updateHUD();
}

// ─── HUD ──────────────────────────────────────────────────────────────────────

function updateHUD() {
  document.getElementById('score').textContent = score;
  document.getElementById('hiscore').textContent = hiScore;
  document.getElementById('level').textContent = level;
  const livesEl = document.getElementById('lives');
  livesEl.innerHTML = 'LIVES: ';
  for (let i = 0; i < lives; i++) {
    const span = document.createElement('span');
    span.style.cssText = 'display:inline-block;width:18px;height:18px;margin-left:4px;background:#0f0;clip-path:polygon(50% 0%,0% 100%,100% 100%)';
    livesEl.appendChild(span);
  }
}

// ─── Particles ────────────────────────────────────────────────────────────────

function spawnExplosion(x, y, color) {
  for (let i = 0; i < 18; i++) {
    const angle = (Math.PI * 2 * i) / 18 + Math.random() * 0.3;
    const speed = Math.random() * 3 + 1;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 30 + Math.random() * 20,
      maxLife: 50,
      color,
    });
  }
}

function updateParticles() {
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.life--;
    const alpha = p.life / p.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  });
  ctx.globalAlpha = 1;
}

// ─── Collision helpers ────────────────────────────────────────────────────────

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function damagePoint(px, py, blocks, bx, by) {
  // px,py are world coords of projectile hit point
  const lx = Math.floor((px - bx) / 4);
  const ly = Math.floor((py - by) / 4);
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const rr = ly + dr, cc = lx + dc;
      if (rr >= 0 && rr < blocks.length && cc >= 0 && cc < blocks[0].length) {
        blocks[rr][cc] = 0;
      }
    }
  }
}

// ─── Input ────────────────────────────────────────────────────────────────────

const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if ((state === 'title' || state === 'gameover' || state === 'victory') && e.code === 'Space') {
    audioCtx.resume();
    startGame();
  }
  if (state === 'dead' && e.code === 'Space') {
    audioCtx.resume();
    if (lives > 0) {
      resumeAfterDeath();
    } else {
      state = 'gameover';
      showOverlay('GAME OVER', `FINAL SCORE: ${score}`, 'PRESS SPACE TO RETRY');
    }
  }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

let shootCooldown = 0;

// ─── Overlay ──────────────────────────────────────────────────────────────────

function showOverlay(title, sub, blink) {
  const ov = document.getElementById('overlay');
  ov.innerHTML = `
    <h1>${title}</h1>
    <div class="subtitle">${sub}</div>
    <div class="blink">${blink}</div>`;
  ov.style.display = 'flex';
}

function hideOverlay() {
  document.getElementById('overlay').style.display = 'none';
}

// ─── Game transitions ─────────────────────────────────────────────────────────

function startGame() {
  hideOverlay();
  init();
  state = 'playing';
}

function resumeAfterDeath() {
  hideOverlay();
  // reset player pos, clear projectiles
  player.x = W / 2 - PLAYER_W / 2;
  bullets = [];
  bombs = [];
  state = 'playing';
}

// ─── Alien logic ──────────────────────────────────────────────────────────────

function getAliveAliens() {
  return aliens.filter(a => a.alive);
}

function alienBounds() {
  const alive = getAliveAliens();
  if (!alive.length) return null;
  return {
    left:  Math.min(...alive.map(a => a.x)),
    right: Math.max(...alive.map(a => a.x + ALIEN_W)),
    bottom: Math.max(...alive.map(a => a.y + ALIEN_H)),
  };
}

function moveAliens() {
  const bounds = alienBounds();
  if (!bounds) return;

  let drop = false;
  if (bounds.right >= W - 20 && alienDir === 1) { drop = true; alienDir = -1; }
  if (bounds.left  <= 20      && alienDir === -1) { drop = true; alienDir = 1; }

  if (drop) {
    aliens.forEach(a => { if (a.alive) a.y += 12; });
    alienDropCounter++;
    marchInterval = Math.max(8, 60 - getAliveAliens().length * 0.8 - level * 3);
  } else {
    const dx = alienDir * alienSpeed;
    aliens.forEach(a => { if (a.alive) a.x += dx; });
  }

  // flip animation frame on march
  aliens.forEach(a => { if (a.alive) a.frame ^= 1; });
  sfx.march();
}

function alienShoot() {
  const alive = getAliveAliens();
  if (!alive.length) return;
  // pick a random alien from the bottom row of each column
  const cols = {};
  alive.forEach(a => {
    if (!cols[a.c] || a.r > cols[a.c].r) cols[a.c] = a;
  });
  const shooters = Object.values(cols);
  const shooter = shooters[Math.floor(Math.random() * shooters.length)];
  if (bombs.length < 3 + level) {
    bombs.push({
      x: shooter.x + ALIEN_W / 2 - 2,
      y: shooter.y + ALIEN_H,
      speed: BOMB_SPEED_BASE + level * 0.5 + Math.random(),
    });
  }
}

// ─── Main update loop ─────────────────────────────────────────────────────────

let lastTime = 0;

function update(ts) {
  const dt = Math.min(ts - lastTime, 50);
  lastTime = ts;

  if (state !== 'playing') {
    animFrame = requestAnimationFrame(update);
    draw();
    return;
  }

  // ── Player movement
  if (keys['ArrowLeft'] || keys['KeyA'])  player.x = Math.max(0, player.x - PLAYER_SPEED);
  if (keys['ArrowRight'] || keys['KeyD']) player.x = Math.min(W - PLAYER_W, player.x + PLAYER_SPEED);

  // ── Shooting
  shootCooldown = Math.max(0, shootCooldown - 1);
  if ((keys['Space'] || keys['ArrowUp'] || keys['KeyW']) && shootCooldown === 0 && bullets.length < 3) {
    bullets.push({ x: player.x + PLAYER_W / 2 - 2, y: player.y });
    shootCooldown = 18;
    sfx.shoot();
  }

  // ── Bullet movement & alien collision
  bullets = bullets.filter(b => b.y > -8);
  bullets.forEach(b => {
    b.y -= BULLET_SPEED;

    // hit alien
    for (const alien of aliens) {
      if (!alien.alive) continue;
      if (rectsOverlap(b.x, b.y, 4, 12, alien.x, alien.y, ALIEN_W, ALIEN_H)) {
        alien.alive = false;
        score += alien.points;
        if (score > hiScore) { hiScore = score; localStorage.setItem('si_hiscore', hiScore); }
        spawnExplosion(alien.x + ALIEN_W / 2, alien.y + ALIEN_H / 2, '#0f0');
        sfx.hit();
        b.y = -100;
        updateHUD();
        marchInterval = Math.max(8, 60 - getAliveAliens().length * 0.8 - level * 3);
        break;
      }
    }

    // hit UFO
    if (ufo && rectsOverlap(b.x, b.y, 4, 12, ufo.x, ufo.y, 48, 28)) {
      const bonus = (Math.floor(Math.random() * 6) + 1) * 50;
      score += bonus;
      if (score > hiScore) { hiScore = score; localStorage.setItem('si_hiscore', hiScore); }
      spawnExplosion(ufo.x + 24, ufo.y + 14, '#f00');
      sfx.ufoHit();
      ufo = null;
      b.y = -100;
      updateHUD();
    }

    // hit bunker
    for (const bk of bunkers) {
      if (rectsOverlap(b.x, b.y, 4, 12, bk.x, bk.y, 52, 28)) {
        damagePoint(b.x + 2, b.y + 6, bk.blocks, bk.x, bk.y);
        b.y = -100;
        break;
      }
    }
  });

  // ── Bomb movement & player/bunker collision
  bombs = bombs.filter(b => b.y < H + 10);
  for (let i = bombs.length - 1; i >= 0; i--) {
    const b = bombs[i];
    b.y += b.speed;

    // hit player
    if (rectsOverlap(b.x, b.y, 5, 14, player.x, player.y, PLAYER_W, PLAYER_H)) {
      spawnExplosion(player.x + PLAYER_W / 2, player.y + PLAYER_H / 2, '#0f0');
      sfx.playerDie();
      lives--;
      updateHUD();
      bombs.splice(i, 1);
      state = 'dead';
      if (lives <= 0) {
        showOverlay('GAME OVER', `SCORE: ${score}`, 'PRESS SPACE TO RETRY');
      } else {
        showOverlay('YOU DIED', `${lives} ${lives === 1 ? 'LIFE' : 'LIVES'} REMAINING`, 'PRESS SPACE TO CONTINUE');
      }
      break;
    }

    // hit bunker
    for (const bk of bunkers) {
      if (rectsOverlap(b.x, b.y, 5, 14, bk.x, bk.y, 52, 28)) {
        damagePoint(b.x + 2, b.y + 7, bk.blocks, bk.x, bk.y);
        bombs.splice(i, 1);
        break;
      }
    }
  }

  // ── Alien march timer
  marchTimer++;
  if (marchTimer >= marchInterval) {
    marchTimer = 0;
    moveAliens();
    if (Math.random() < 0.3 + level * 0.05) alienShoot();
  }

  // ── UFO
  ufoTimer--;
  if (ufoTimer <= 0 && !ufo) {
    ufo = { x: -60, y: 30, dir: 1, speed: 2 + level * 0.3 };
    ufoTimer = Math.floor(Math.random() * 600) + 400;
  }
  if (ufo) {
    ufo.x += ufo.speed * ufo.dir;
    if (ufo.x > W + 60) ufo = null;
  }

  // ── Win condition
  if (getAliveAliens().length === 0) {
    level++;
    state = 'levelup';
    showOverlay(`LEVEL ${level}`, `SCORE: ${score}`, 'GET READY...');
    setTimeout(() => {
      if (state === 'levelup') {
        hideOverlay();
        initLevel();
        state = 'playing';
      }
    }, 2500);
  }

  // ── Aliens reach the ground / player line
  const bounds = alienBounds();
  if (bounds && bounds.bottom >= player.y - 10) {
    sfx.playerDie();
    state = 'gameover';
    showOverlay('GAME OVER', 'THE ALIENS INVADED!', 'PRESS SPACE TO RETRY');
  }

  draw();
  animFrame = requestAnimationFrame(update);
}

// ─── Draw ─────────────────────────────────────────────────────────────────────

const ALIEN_COLORS = ['#0ff', '#0af', '#0f8'];

function draw() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  drawStars();

  // ground line
  ctx.strokeStyle = '#0f06';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, H - 30);
  ctx.lineTo(W, H - 30);
  ctx.stroke();

  // bunkers
  bunkers.forEach(bk => drawBunker(bk.x, bk.y, bk.blocks));

  // aliens
  aliens.forEach(a => {
    if (!a.alive) return;
    const color = ALIEN_COLORS[a.type];
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    drawAlien(a.x, a.y, a.type, a.frame, color);
    ctx.shadowBlur = 0;
  });

  // UFO
  if (ufo) drawUFO(ufo.x, ufo.y);

  // player
  if (state === 'playing' || state === 'levelup') drawPlayer(player.x, player.y);

  // bullets
  ctx.fillStyle = '#ff0';
  ctx.shadowColor = '#ff0';
  ctx.shadowBlur = 6;
  bullets.forEach(b => ctx.fillRect(b.x, b.y, 4, 12));
  ctx.shadowBlur = 0;

  // bombs
  bombs.forEach(b => {
    ctx.fillStyle = '#f80';
    ctx.shadowColor = '#f80';
    ctx.shadowBlur = 4;
    ctx.fillRect(b.x, b.y, 5, 14);
    ctx.shadowBlur = 0;
  });

  updateParticles();
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

state = 'title';
hiScore = parseInt(localStorage.getItem('si_hiscore') || '0');
document.getElementById('hiscore').textContent = hiScore;
document.getElementById('score').textContent = '0';
document.getElementById('level').textContent = '1';

// draw starfield behind the title screen
(function titleLoop() {
  if (state !== 'title') return;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  drawStars();
  requestAnimationFrame(titleLoop);
})();

// wait for SPACE to start (handled in keydown listener)
// start update loop eagerly so stars animate
animFrame = requestAnimationFrame(update);
