// =====================================================
//  WONDER BOY: MONSTER QUEST
//  Inspired by Wonder Boy in Monster Land (Sega, 1987)
// =====================================================

const canvas = document.getElementById('game');
const ctx    = canvas.getContext('2d');
const W = 800, H = 500;

// ── CONSTANTS ──────────────────────────────────────
const TILE    = 32;
const GRAV    = 0.46;
const MAXFALL = 13;
const JFORCE  = -11.8;
const PSPD    = 4;
const DIR = { L: -1, R: 1 };
const ST  = { MENU: 0, PLAY: 1, SHOP: 2, OVER: 3, WIN: 4, NEXT: 5 };

// ── INPUT ──────────────────────────────────────────
const keys = {}, jp = {};
document.addEventListener('keydown', e => {
  if (!keys[e.code]) jp[e.code] = true;
  keys[e.code] = true;
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))
    e.preventDefault();
});
document.addEventListener('keyup',   e => { keys[e.code] = false; });
function clearJP() { for (const k in jp) delete jp[k]; }

// ── UTILS ──────────────────────────────────────────
const rand  = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function overlap(a, b) {
  return a.x + a.w > b.x && a.x < b.x + b.w &&
         a.y + a.h > b.y && a.y < b.y + b.h;
}

// ── CAMERA ─────────────────────────────────────────
class Camera {
  constructor(lw, lh) { this.x = 0; this.y = 0; this.lw = lw; this.lh = lh; }
  update(t) {
    this.x = clamp(t.x + t.w / 2 - W / 2, 0, Math.max(0, this.lw - W));
    this.y = clamp(t.y + t.h / 2 - H / 2, 0, Math.max(0, this.lh - H));
  }
  tx(x) { return x - this.x; }
  ty(y) { return y - this.y; }
  inView(x, y, w, h) {
    return x + w > this.x - 40 && x < this.x + W + 40 &&
           y + h > this.y - 40 && y < this.y + H + 40;
  }
}

// ── SHAKE ──────────────────────────────────────────
let shakeAmt = 0;
function shake(n) { shakeAmt = Math.max(shakeAmt, n); }

// ── TILE ───────────────────────────────────────────
class Tile {
  constructor(tx, ty, type) {
    this.x = tx * TILE; this.y = ty * TILE;
    this.w = TILE; this.h = TILE; this.type = type;
  }
  solid()    { return this.type === 'ground' || this.type === 'wall'; }
  platform() { return this.type === 'platform'; }

  draw(cam) {
    if (!cam.inView(this.x, this.y, TILE, TILE)) return;
    const sx = cam.tx(this.x), sy = cam.ty(this.y);
    switch (this.type) {
      case 'ground':
        ctx.fillStyle = '#7a4f2e'; ctx.fillRect(sx, sy, TILE, TILE);
        ctx.fillStyle = '#2d8c2d'; ctx.fillRect(sx, sy, TILE, 8);
        ctx.fillStyle = '#3aaa3a'; ctx.fillRect(sx+2, sy+1, TILE-4, 4);
        ctx.strokeStyle = '#5a3010'; ctx.lineWidth = 1;
        ctx.strokeRect(sx+.5, sy+.5, TILE-1, TILE-1);
        break;
      case 'platform':
        ctx.fillStyle = '#c8a060'; ctx.fillRect(sx, sy, TILE, 14);
        ctx.fillStyle = '#a07040'; ctx.fillRect(sx, sy+14, TILE, 4);
        ctx.strokeStyle = '#8a6030'; ctx.lineWidth = 1;
        ctx.strokeRect(sx+.5, sy+.5, TILE-1, 14);
        break;
      case 'wall': {
        ctx.fillStyle = '#888'; ctx.fillRect(sx, sy, TILE, TILE);
        ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
        ctx.strokeRect(sx+.5, sy+.5, TILE-1, TILE-1);
        const row = Math.floor(this.y / TILE);
        if (row % 2 === 0) {
          ctx.beginPath(); ctx.moveTo(sx+TILE/2, sy); ctx.lineTo(sx+TILE/2, sy+TILE);
          ctx.strokeStyle = '#666'; ctx.stroke();
        } else {
          ctx.beginPath(); ctx.moveTo(sx, sy+TILE/2); ctx.lineTo(sx+TILE, sy+TILE/2);
          ctx.strokeStyle = '#666'; ctx.stroke();
        }
        break;
      }
      case 'spike':
        ctx.fillStyle = '#404040'; ctx.fillRect(sx, sy+TILE/2, TILE, TILE/2);
        ctx.fillStyle = '#cc2222';
        for (let i = 0; i < 3; i++) {
          const bx = sx + 4 + i * 9;
          ctx.beginPath(); ctx.moveTo(bx, sy+TILE); ctx.lineTo(bx+4, sy+TILE/2); ctx.lineTo(bx+8, sy+TILE); ctx.fill();
        }
        break;
    }
  }
}

// ── PARTICLE ───────────────────────────────────────
class Particle {
  constructor(x, y, col, vx, vy, life) {
    this.x=x; this.y=y; this.col=col;
    this.vx=vx; this.vy=vy; this.life=life; this.max=life;
  }
  update() { this.x+=this.vx; this.y+=this.vy; this.vy+=0.18; this.vx*=0.96; return --this.life>0; }
  draw(cam) {
    if (!cam.inView(this.x-4, this.y-4, 8, 8)) return;
    const a = this.life/this.max;
    ctx.globalAlpha = a;
    ctx.fillStyle = this.col;
    const s = Math.max(1, 4*a);
    ctx.fillRect(cam.tx(this.x)-s/2, cam.ty(this.y)-s/2, s, s);
    ctx.globalAlpha = 1;
  }
}

// ── GOLD ───────────────────────────────────────────
class Gold {
  constructor(x, y, val) {
    this.x=x; this.y=y; this.w=14; this.h=14;
    this.val=val; this.vx=(Math.random()-.5)*4; this.vy=-5.5;
    this.grounded=false; this.life=360; this.bob=Math.random()*100;
  }
  update(tiles) {
    if (!this.grounded) {
      this.vy = Math.min(this.vy+GRAV, MAXFALL); this.vx*=0.92;
      this.x+=this.vx; this.y+=this.vy;
      for (const t of tiles) {
        if (!t.solid() && !t.platform()) continue;
        if (this.x+this.w>t.x && this.x<t.x+t.w && this.y+this.h>t.y && this.y<t.y+t.h) {
          if (this.vy>=0 && this.y+this.h-this.vy<=t.y+4) {
            this.y=t.y-this.h; this.vy=0; this.vx*=0.5;
            if (Math.abs(this.vx)<0.4) this.grounded=true;
          }
        }
      }
    }
    this.bob++; return --this.life>0;
  }
  draw(cam) {
    if (!cam.inView(this.x, this.y, this.w, this.h)) return;
    const bx=cam.tx(this.x), by=cam.ty(this.y + Math.sin(this.bob*.1)*2);
    // Outer gold
    ctx.fillStyle='#e8c000'; ctx.beginPath();
    ctx.arc(bx+7, by+7, 7, 0, Math.PI*2); ctx.fill();
    // Shine
    ctx.fillStyle='#ffe840'; ctx.beginPath();
    ctx.arc(bx+5, by+5, 3.5, 0, Math.PI*2); ctx.fill();
    // Border
    ctx.strokeStyle='#a08000'; ctx.lineWidth=1; ctx.beginPath();
    ctx.arc(bx+7, by+7, 7, 0, Math.PI*2); ctx.stroke();
  }
}

// ── PROJECTILE ─────────────────────────────────────
class Projectile {
  constructor(x,y,vx,vy,dmg,col,owner) {
    this.x=x; this.y=y; this.w=12; this.h=8;
    this.vx=vx; this.vy=vy; this.dmg=dmg; this.col=col;
    this.owner=owner; this.alive=true; this.timer=0;
  }
  update(tiles) {
    this.x+=this.vx; this.y+=this.vy; this.timer++;
    if (this.timer>90) { this.alive=false; return; }
    for (const t of tiles)
      if (t.solid() && this.x+this.w>t.x && this.x<t.x+t.w && this.y+this.h>t.y && this.y<t.y+t.h)
        { this.alive=false; return; }
  }
  draw(cam) {
    if (!cam.inView(this.x, this.y, this.w, this.h)) return;
    const bx=cam.tx(this.x), by=cam.ty(this.y);
    // Glow
    ctx.globalAlpha=0.35; ctx.fillStyle=this.col; ctx.beginPath();
    ctx.ellipse(bx+6, by+4, 9, 6, 0, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha=1; ctx.fillStyle=this.col; ctx.beginPath();
    ctx.ellipse(bx+6, by+4, 6, 4, 0, 0, Math.PI*2); ctx.fill();
    // Core
    ctx.fillStyle='#fff'; ctx.beginPath();
    ctx.ellipse(bx+5, by+3.5, 2.5, 2, 0, 0, Math.PI*2); ctx.fill();
  }
}

// ── PLAYER ─────────────────────────────────────────
class Player {
  constructor(x, y) {
    this.x=x; this.y=y; this.w=22; this.h=30;
    this.vx=0; this.vy=0; this.dir=DIR.R; this.onGround=false; this.alive=true;
    // Stats
    this.maxHp=6; this.hp=6; this.atk=1; this.def=0;
    this.gold=0; this.score=0;
    // Equipment
    this.swordLv=1; this.hasShield=false; this.hasArmor=false; this.boots=false;
    // Combat
    this.atkTimer=0; this.atkDur=18; this.atkCD=0;
    this.atkRect=null; this.hitSet=new Set(); this.invTimer=0;
    // Spell
    this.mana=0; this.maxMana=3; this.projectiles=[];
    // Anim
    this.frame=0; this.animT=0; this.jumping=false;
  }

  move(tiles) {
    const spd = PSPD + (this.boots ? 1 : 0);
    this.vx = 0;
    if (keys['ArrowLeft']  || keys['KeyA']) { this.vx=-spd; this.dir=DIR.L; }
    if (keys['ArrowRight'] || keys['KeyD']) { this.vx= spd; this.dir=DIR.R; }
    if ((jp['ArrowUp']||jp['KeyW']||jp['Space']) && this.onGround) {
      this.vy = JFORCE-(this.boots?.5:0); this.onGround=false; this.jumping=true;
    }
    this.vy = Math.min(this.vy+GRAV, MAXFALL);

    // Move X
    this.x += this.vx; this.x = Math.max(0, this.x);
    for (const t of tiles) {
      if (!t.solid()) continue;
      if (this._ov(t)) {
        if (this.vx>0) this.x=t.x-this.w; else this.x=t.x+TILE;
      }
    }
    // Move Y
    this.y += this.vy; this.onGround=false;
    for (const t of tiles) {
      if (t.type==='spike') { if (this._ov(t)) this.takeDamage(2); continue; }
      if (!this._ov(t)) continue;
      if (t.solid()) {
        if (this.vy>=0) { this.y=t.y-this.h; this.vy=0; this.onGround=true; this.jumping=false; }
        else             { this.y=t.y+TILE; this.vy=0; }
      } else if (t.platform()) {
        if (this.vy>=0 && this.y+this.h-this.vy <= t.y+5) {
          this.y=t.y-this.h; this.vy=0; this.onGround=true; this.jumping=false;
        }
      }
    }
  }

  _ov(t) {
    return this.x+this.w>t.x && this.x<t.x+t.w && this.y+this.h>t.y && this.y<t.y+t.h;
  }

  doAttack() {
    if (this.atkCD>0) return;
    this.atkTimer=this.atkDur; this.atkCD=24; this.hitSet.clear();
    this.atkRect = this.dir===DIR.R
      ? {x:this.x+this.w, y:this.y+6, w:30, h:18}
      : {x:this.x-30,     y:this.y+6, w:30, h:18};
  }

  castSpell() {
    if (this.mana<=0) return false;
    this.mana--;
    this.projectiles.push(new Projectile(
      this.x+this.w/2, this.y+this.h/2-4,
      this.dir*7.5, 0, this.atk*2, '#ff6000', 'player'
    ));
    return true;
  }

  takeDamage(amt) {
    if (this.invTimer>0) return;
    this.hp = Math.max(0, this.hp - Math.max(1, amt-this.def));
    this.invTimer=90; shake(5);
    if (this.hp<=0) this.alive=false;
  }

  heal(n) { this.hp=Math.min(this.maxHp, this.hp+n); }

  update(enemies) {
    if (this.atkTimer>0) this.atkTimer--; else this.atkRect=null;
    if (this.atkCD>0) this.atkCD--;
    if (this.invTimer>0) this.invTimer--;
    if (++this.animT>=8) { this.animT=0; this.frame=(this.frame+1)%4; }

    // Sword hit
    if (this.atkRect) {
      for (const e of enemies) {
        if (!e.alive || this.hitSet.has(e)) continue;
        if (overlap(this.atkRect, e)) { e.takeDamage(this.atk); this.hitSet.add(e); }
      }
    }
    this.projectiles = this.projectiles.filter(p=>p.alive);
  }

  draw(cam) {
    if (this.invTimer>0 && Math.floor(this.invTimer/5)%2===0) return;
    const sx=cam.tx(this.x), sy=cam.ty(this.y);

    // Legs
    ctx.fillStyle = this.hasArmor ? '#183080':'#6a3c14';
    ctx.fillRect(sx+2, sy+20, 8, 10); ctx.fillRect(sx+12, sy+20, 8, 10);
    // Walk anim
    if (this.onGround && (this.vx!==0)) {
      const lf = Math.floor(this.animT/4)%2===0;
      ctx.fillStyle = this.hasArmor ? '#183080':'#6a3c14';
      ctx.fillRect(sx+2, sy+20+(lf?2:0), 8, 10-(lf?2:0));
      ctx.fillRect(sx+12, sy+20+(lf?0:2), 8, 10-(lf?0:2));
    }

    // Body
    ctx.fillStyle = this.hasArmor ? '#2858c0':'#2888d8';
    ctx.fillRect(sx+2, sy+12, 18, 12);
    // Chest detail
    ctx.fillStyle = this.hasArmor ? '#4070d8':'#40a0e8';
    ctx.fillRect(sx+5, sy+14, 12, 6);

    // Head
    ctx.fillStyle='#e0b878'; ctx.fillRect(sx+4, sy+1, 14, 13);

    // Helmet
    ctx.fillStyle = this.hasArmor ? '#b0b0c0':'#e07818';
    ctx.fillRect(sx+3, sy-2, 16, 9);
    ctx.fillRect(sx, sy+3, 5, 6); // cheek guard
    ctx.fillRect(sx+17, sy+3, 5, 6);

    // Visor slit
    ctx.fillStyle='rgba(0,0,0,0.4)'; ctx.fillRect(sx+3, sy+4, 16, 3);

    // Shield
    if (this.hasShield) {
      const shx = this.dir===DIR.R ? sx-8 : sx+this.w+1;
      ctx.fillStyle='#b05000'; ctx.fillRect(shx, sy+8, 9, 16);
      ctx.fillStyle='#e07000'; ctx.fillRect(shx+2, sy+10, 5, 12);
      ctx.strokeStyle='#703000'; ctx.lineWidth=1; ctx.strokeRect(shx, sy+8, 9, 16);
    }

    // Sword
    const swC = ['#c0c0c8','#a8c0d8','#ff8000'][this.swordLv-1];
    if (this.atkRect && this.atkTimer>0) {
      if (this.dir===DIR.R) {
        ctx.fillStyle=swC; ctx.fillRect(sx+this.w-2, sy+10, 32, 7);
        if (this.swordLv===3) { ctx.fillStyle='#ff2200'; ctx.fillRect(sx+this.w+6, sy+11, 18, 5); }
      } else {
        ctx.fillStyle=swC; ctx.fillRect(sx-30, sy+10, 32, 7);
        if (this.swordLv===3) { ctx.fillStyle='#ff2200'; ctx.fillRect(sx-24, sy+11, 18, 5); }
      }
    } else {
      ctx.fillStyle=swC;
      if (this.dir===DIR.R) ctx.fillRect(sx+this.w, sy+14, 14, 4);
      else                   ctx.fillRect(sx-14, sy+14, 14, 4);
    }

    // Projectiles
    for (const p of this.projectiles) p.draw(cam);
  }
}

// ── ENEMY BASE ─────────────────────────────────────
class Enemy {
  constructor(x,y,w,h,hp,atk,spd,gr) {
    this.x=x; this.y=y; this.w=w; this.h=h;
    this.vx=0; this.vy=0; this.dir=DIR.L;
    this.onGround=false; this.alive=true;
    this.maxHp=hp; this.hp=hp; this.atk=atk; this.spd=spd; this.gr=gr;
    this.invT=0; this.frame=0; this.animT=0; this.kb=0; this.score=hp*10;
  }
  takeDamage(n) {
    if (this.invT>0) return;
    this.hp-=n; this.invT=16;
    if (this.hp<=0) { this.alive=false; return true; } return false;
  }
  _ov(o) { return this.x+this.w>o.x&&this.x<o.x+o.w&&this.y+this.h>o.y&&this.y<o.y+o.h; }
  _physics(tiles) {
    this.vy=Math.min(this.vy+GRAV, MAXFALL); this.y+=this.vy; this.onGround=false;
    for (const t of tiles) {
      if ((t.solid()||t.platform()) && this.x+this.w>t.x&&this.x<t.x+t.w&&this.y+this.h>t.y&&this.y<t.y+t.h) {
        if (this.vy>=0) { this.y=t.y-this.h; this.vy=0; this.onGround=true; }
        else             { this.y=t.y+TILE; this.vy=0; }
      }
    }
  }
  _patrol(tiles) {
    if (Math.abs(this.kb)>0.3) { this.x+=this.kb; this.kb*=0.72; } else { this.kb=0; }
    if (this.kb!==0) return;
    this.x+=this.dir*this.spd;
    for (const t of tiles) {
      if (t.solid()&&this.x+this.w>t.x&&this.x<t.x+t.w&&this.y+this.h>t.y&&this.y<t.y+t.h)
        { this.dir*=-1; this.x+=this.dir*this.spd*2; break; }
    }
  }
  _tick() {
    if (this.invT>0) this.invT--;
    if (++this.animT>=8) { this.animT=0; this.frame=(this.frame+1)%4; }
  }
  dropGold() {
    const tot=rand(this.gr[0],this.gr[1]);
    const n=rand(1,Math.min(3,Math.max(1,Math.floor(tot/2))));
    return Array.from({length:n},()=>new Gold(
      this.x+this.w/2+rand(-12,12), this.y+this.h/2,
      Math.max(1,Math.floor(tot/n))
    ));
  }
  _hpBar(cam) {
    if (this.hp>=this.maxHp) return;
    const sx=cam.tx(this.x), sy=cam.ty(this.y)-8;
    ctx.fillStyle='#900'; ctx.fillRect(sx, sy, this.w, 4);
    ctx.fillStyle='#0c0'; ctx.fillRect(sx, sy, this.w*(this.hp/this.maxHp), 4);
  }
}

// ── SLIME ──────────────────────────────────────────
class Slime extends Enemy {
  constructor(x,y) {
    super(x,y,22,16,2,1,1,[1,3]);
    this.jTimer=rand(40,90); this.score=20;
  }
  update(tiles,player) {
    this._tick();
    if (--this.jTimer<=0&&this.onGround) {
      this.vy=-7; this.dir=player.x<this.x?DIR.L:DIR.R; this.jTimer=rand(55,110);
    }
    this._patrol(tiles); this._physics(tiles);
  }
  draw(cam) {
    if (!cam.inView(this.x,this.y,this.w,this.h)) return;
    const sx=cam.tx(this.x), sy=cam.ty(this.y);
    const fl=this.invT>0&&Math.floor(this.invT/4)%2===0;
    ctx.fillStyle=fl?'#fff':'#28cc28';
    ctx.beginPath(); ctx.ellipse(sx+11,sy+10,11,8,0,0,Math.PI*2); ctx.fill();
    // Sheen
    ctx.fillStyle=fl?'#eee':'#50ee50'; ctx.beginPath();
    ctx.ellipse(sx+7,sy+6,5,3,-.3,0,Math.PI*2); ctx.fill();
    // Eyes
    ctx.fillStyle='#111';
    ctx.fillRect(sx+3,sy+6,4,4); ctx.fillRect(sx+14,sy+6,4,4);
    ctx.fillStyle='#fff';
    ctx.fillRect(sx+5,sy+6,2,2); ctx.fillRect(sx+16,sy+6,2,2);
    // Mouth
    ctx.fillStyle='#005500'; ctx.fillRect(sx+6,sy+12,10,2);
    this._hpBar(cam);
  }
}

// ── SKELETON ───────────────────────────────────────
class Skeleton extends Enemy {
  constructor(x,y) {
    super(x,y,20,36,4,1,2,[2,5]);
    this.swingT=rand(0,80); this.swingCD=90; this.score=50;
  }
  update(tiles,player) {
    this._tick();
    const d=Math.abs(player.x-this.x);
    if (d<240) this.dir=player.x<this.x?DIR.L:DIR.R;
    this._patrol(tiles); this._physics(tiles);
    this.swingT++;
  }
  atkRect() {
    return this.dir===DIR.R
      ? {x:this.x+this.w,y:this.y+10,w:22,h:18}
      : {x:this.x-22,    y:this.y+10,w:22,h:18};
  }
  draw(cam) {
    if (!cam.inView(this.x,this.y,this.w,this.h)) return;
    const sx=cam.tx(this.x), sy=cam.ty(this.y);
    const fl=this.invT>0&&Math.floor(this.invT/4)%2===0;
    const c=fl?'#ffff88':'#e8e8e0';
    // Legs
    ctx.fillStyle=c;
    ctx.fillRect(sx+2,sy+26,6,10); ctx.fillRect(sx+12,sy+26,6,10);
    // Torso
    ctx.fillRect(sx+3,sy+14,14,14);
    ctx.strokeStyle=fl?'#333':'#999'; ctx.lineWidth=1;
    for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(sx+3,sy+17+i*4);ctx.lineTo(sx+17,sy+17+i*4);ctx.stroke();}
    // Skull
    ctx.fillStyle=c; ctx.beginPath();
    ctx.ellipse(sx+10,sy+8,8.5,8,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#1a1a1a';
    ctx.fillRect(sx+3,sy+8,4,4); ctx.fillRect(sx+13,sy+8,4,4);
    // Teeth
    ctx.fillStyle=c;
    ctx.fillRect(sx+5,sy+14,3,3); ctx.fillRect(sx+9,sy+14,3,3); ctx.fillRect(sx+13,sy+14,3,3);
    // Arm + sword
    ctx.fillStyle=c;
    const ay=sy+20;
    if(this.dir===DIR.R){ctx.fillRect(sx+17,ay,14,3);ctx.fillStyle='#c0c0c8';ctx.fillRect(sx+28,ay-7,3,17);}
    else                 {ctx.fillRect(sx-11,ay,14,3);ctx.fillStyle='#c0c0c8';ctx.fillRect(sx-14,ay-7,3,17);}
    this._hpBar(cam);
  }
}

// ── BAT ────────────────────────────────────────────
class Bat extends Enemy {
  constructor(x,y) {
    super(x,y,18,12,2,1,2,[1,2]);
    this.baseY=y; this.ft=Math.random()*100; this.score=30;
  }
  update(tiles,player) {
    this._tick(); this.ft+=0.038;
    const dx=player.x+player.w/2-(this.x+this.w/2);
    const dy=player.y+player.h/2-(this.y+this.h/2);
    const d=Math.sqrt(dx*dx+dy*dy)||1;
    if(d<340){this.x+=dx/d*this.spd; this.y+=dy/d*this.spd*.55;}
    else{this.x+=Math.cos(this.ft)*1.5; this.y=this.baseY+Math.sin(this.ft*2)*38;}
    this.dir=dx>0?DIR.R:DIR.L;
    if(this.invT>0)this.invT--;
  }
  draw(cam) {
    if(!cam.inView(this.x,this.y,this.w,this.h))return;
    const sx=cam.tx(this.x), sy=cam.ty(this.y);
    const fl=this.invT>0&&Math.floor(this.invT/4)%2===0;
    const c=fl?'#fff':'#9030cc';
    const wf=Math.sin(this.animT*.8)*5;
    // Wings
    ctx.fillStyle=c; ctx.globalAlpha=0.85;
    ctx.beginPath();ctx.ellipse(sx-5,sy+6+wf,10,7,-.3,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(sx+this.w+3,sy+6+wf,10,7,.3,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=1;
    // Body
    ctx.fillStyle=c; ctx.beginPath();
    ctx.ellipse(sx+9,sy+6,9,7,0,0,Math.PI*2); ctx.fill();
    // Eyes
    ctx.fillStyle='#ff1818';
    ctx.fillRect(sx+3,sy+3,3,3); ctx.fillRect(sx+12,sy+3,3,3);
    // Fangs
    ctx.fillStyle='#fff';
    ctx.fillRect(sx+6,sy+10,2,4); ctx.fillRect(sx+10,sy+10,2,4);
    this._hpBar(cam);
  }
}

// ── DRAGON BOSS ────────────────────────────────────
class Dragon extends Enemy {
  constructor(x,y) {
    super(x,y,60,58,30,2,0,[15,25]);
    this.phase=1; this.mt=0; this.st=0; this.scd=75;
    this.projectiles=[]; this.ft=0; this.score=1500;
  }
  update(tiles,player) {
    this._tick(); this.ft+=0.025; this.mt++;

    // Float toward player vertically
    const ty=player.y-50; this.y+=(ty-this.y)*.024;
    // Horizontal drift (phase2 faster)
    const spd=this.phase===1?0.7:1.1;
    const dir=this.mt%220<110?-1:1; this.x+=dir*spd;
    this.x=clamp(this.x,70,this.lw-(this.w+70)||900);
    this.y=clamp(this.y,60,390);
    this.dir=dir<0?DIR.L:DIR.R;

    // Phase 2 at half HP
    if(this.hp<=this.maxHp/2&&this.phase===1){this.phase=2;this.scd=45;}

    // Shoot
    if(++this.st>=this.scd){
      this.st=0;
      const cx=this.x+this.w/2, cy=this.y+this.h/2;
      const px=player.x+player.w/2, py=player.y+player.h/2;
      const dx=px-cx, dy=py-cy; const d=Math.sqrt(dx*dx+dy*dy)||1;
      const sp=this.phase===1?5:6.5;
      this.projectiles.push(new Projectile(cx,cy,dx/d*sp,dy/d*sp,2,'#ff5000','boss'));
      if(this.phase===2){
        this.projectiles.push(new Projectile(cx,cy,dx/d*sp-1.8,dy/d*sp+1.2,2,'#ff2800','boss'));
        this.projectiles.push(new Projectile(cx,cy,dx/d*sp+1.8,dy/d*sp+1.2,2,'#ff2800','boss'));
      }
    }
    this.projectiles=this.projectiles.filter(p=>{p.update(tiles);return p.alive;});
  }
  draw(cam) {
    if(!cam.inView(this.x,this.y,this.w,this.h))return;
    const sx=cam.tx(this.x), sy=cam.ty(this.y);
    const fl=this.invT>0&&Math.floor(this.invT/4)%2===0;
    const mc=fl?'#fff':(this.phase===2?'#ff2800':'#e04800');
    const dc=fl?'#aaa':'#800c00';

    // Wings
    const wf=Math.sin(this.ft*10)*.4;
    ctx.fillStyle=fl?'#fff':'#cc2800'; ctx.globalAlpha=0.75;
    ctx.save(); ctx.translate(sx+12,sy+22); ctx.rotate(-wf);
    ctx.beginPath();ctx.ellipse(0,0,22,10,-.5,0,Math.PI*2);ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(sx+48,sy+22); ctx.rotate(wf);
    ctx.beginPath();ctx.ellipse(0,0,22,10,.5,0,Math.PI*2);ctx.fill(); ctx.restore();
    ctx.globalAlpha=1;

    // Body
    ctx.fillStyle=mc; ctx.beginPath();
    ctx.ellipse(sx+30,sy+28,26,20,0,0,Math.PI*2); ctx.fill();

    // Scales
    ctx.fillStyle=dc;
    for(let i=0;i<4;i++){ctx.beginPath();ctx.ellipse(sx+9+i*13,sy+18,5,4,0,0,Math.PI*2);ctx.fill();}

    // Tail
    ctx.strokeStyle=mc; ctx.lineWidth=6;
    ctx.beginPath();
    ctx.moveTo(sx+this.dir===DIR.R?sx:sx+this.w, sy+40);
    ctx.quadraticCurveTo(sx+30,sy+65,sx+10+this.dir*20,sy+55);
    ctx.stroke();

    // Eyes
    ctx.fillStyle=this.phase===1?'#ffe000':'#ff0000';
    ctx.beginPath();ctx.arc(sx+16,sy+19,7,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(sx+44,sy+19,7,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#000';
    ctx.beginPath();ctx.arc(sx+16,sy+19,3.5,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(sx+44,sy+19,3.5,0,Math.PI*2);ctx.fill();
    // Eye sheen
    ctx.fillStyle='rgba(255,255,255,.5)';
    ctx.beginPath();ctx.arc(sx+14,sy+17,2,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(sx+42,sy+17,2,0,Math.PI*2);ctx.fill();

    // Teeth
    ctx.fillStyle=dc; ctx.fillRect(sx+10,sy+36,40,3);
    ctx.fillStyle='#f0f0f0';
    for(let i=0;i<5;i++){
      const tx2=sx+12+i*7;
      ctx.beginPath();ctx.moveTo(tx2,sy+39);ctx.lineTo(tx2+3,sy+46);ctx.lineTo(tx2+6,sy+39);ctx.fill();
    }
    // Nostrils
    ctx.fillStyle='#600';
    ctx.fillRect(sx+22,sy+28,4,3); ctx.fillRect(sx+34,sy+28,4,3);

    // Horns
    ctx.fillStyle=dc;
    ctx.beginPath();ctx.moveTo(sx+14,sy+5);ctx.lineTo(sx+8,sy-12);ctx.lineTo(sx+21,sy+5);ctx.fill();
    ctx.beginPath();ctx.moveTo(sx+46,sy+5);ctx.lineTo(sx+52,sy-12);ctx.lineTo(sx+39,sy+5);ctx.fill();

    // HP bar
    const bx=sx-6, by=cam.ty(this.y)-15;
    ctx.fillStyle='#500'; ctx.fillRect(bx,by,this.w+12,8);
    ctx.fillStyle=this.phase===2?'#ff4400':'#ff9900';
    ctx.fillRect(bx,by,(this.w+12)*(this.hp/this.maxHp),8);
    ctx.strokeStyle='rgba(255,255,255,.7)'; ctx.lineWidth=1; ctx.strokeRect(bx,by,this.w+12,8);

    // "BOSS" label
    ctx.fillStyle='#ffd700'; ctx.font='bold 11px monospace';
    ctx.textAlign='center'; ctx.fillText('DRAGON BOSS',sx+30,by-4);

    // Boss projectiles
    for(const p of this.projectiles)p.draw(cam);
  }
}

// ── SHOP ───────────────────────────────────────────
class Shop {
  constructor(x,y){
    this.x=x; this.y=y; this.w=64; this.h=64;
    this.items=[
      {name:'Potion',    desc:'+2 HP',        cost:5,  type:'heal'},
      {name:'Iron Sword',desc:'ATK +1',        cost:10, type:'sword2'},
      {name:'Fire Sword',desc:'ATK +2 + Fire', cost:20, type:'sword3'},
      {name:'Shield',    desc:'DEF +1',        cost:8,  type:'shield'},
      {name:'Armor',     desc:'+2 Max HP',     cost:12, type:'armor'},
      {name:'Boots',     desc:'Move faster',   cost:8,  type:'boots'},
      {name:'Mana Orb',  desc:'+1 Mana',       cost:6,  type:'mana'},
    ];
    this.sel=0; this.msg=''; this.msgT=0;
  }
  nearby(p){return Math.abs(p.x+p.w/2-(this.x+this.w/2))<90;}

  draw(cam){
    if(!cam.inView(this.x,this.y,this.w,this.h))return;
    const sx=cam.tx(this.x), sy=cam.ty(this.y);
    // Building
    ctx.fillStyle='#c89050'; ctx.fillRect(sx,sy,this.w,this.h);
    ctx.strokeStyle='#8a6030'; ctx.lineWidth=2; ctx.strokeRect(sx,sy,this.w,this.h);
    // Roof
    ctx.fillStyle='#a05828';
    ctx.beginPath();ctx.moveTo(sx-5,sy);ctx.lineTo(sx+32,sy-20);ctx.lineTo(sx+69,sy);ctx.fill();
    ctx.strokeStyle='#7a3010'; ctx.stroke();
    // Door
    ctx.fillStyle='#5a2e0a'; ctx.fillRect(sx+20,sy+32,24,32);
    ctx.fillStyle='#ffd700'; ctx.beginPath();ctx.arc(sx+36,sy+48,3,0,Math.PI*2);ctx.fill();
    // Window
    ctx.fillStyle='#80c0ff'; ctx.fillRect(sx+6,sy+14,16,16);
    ctx.fillStyle='#c8a060'; ctx.fillRect(sx+6,sy+14,16,3); ctx.fillRect(sx+14,sy+14,3,16);
    // Sign
    ctx.fillStyle='#8a4820'; ctx.fillRect(sx+4,sy+4,56,20);
    ctx.strokeStyle='#5a2808'; ctx.lineWidth=1; ctx.strokeRect(sx+4,sy+4,56,20);
    ctx.fillStyle='#ffd700'; ctx.font='bold 12px monospace'; ctx.textAlign='center';
    ctx.fillText('SHOP',sx+32,sy+18);
    // Hint
    if(Math.abs(cam.x-(this.x-W/2+this.w/2))<400){
      ctx.fillStyle='rgba(255,255,255,.85)'; ctx.font='12px monospace';
      ctx.fillText('[E]',sx+32,sy-6);
    }
  }

  drawMenu(player){
    ctx.fillStyle='rgba(0,0,0,.78)'; ctx.fillRect(0,0,W,H);
    const px=190,py=55,pw=420,ph=390;
    // Panel
    ctx.fillStyle='#1a1006'; ctx.strokeStyle='#ffd700'; ctx.lineWidth=2;
    _roundRect(px,py,pw,ph,10);
    // Title
    ctx.fillStyle='#ffd700'; ctx.font='bold 24px monospace'; ctx.textAlign='center';
    ctx.fillText('⚔  SHOP  ⚔',400,90);
    // Divider
    ctx.strokeStyle='#6a4010'; ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(px+10,102);ctx.lineTo(px+pw-10,102);ctx.stroke();
    // Gold
    ctx.fillStyle='#ffd700'; ctx.font='16px monospace'; ctx.textAlign='left';
    ctx.fillText(`💰 ${player.gold} G`, px+16, 122);
    // Items
    for(let i=0;i<this.items.length;i++){
      const it=this.items[i], iy=138+i*36;
      const sel=i===this.sel, afford=player.gold>=it.cost;
      ctx.fillStyle=sel?'#3c2208':'#221400';
      ctx.fillRect(px+10,iy,pw-20,32);
      if(sel){ctx.strokeStyle='#ffd700';ctx.lineWidth=1;ctx.strokeRect(px+10,iy,pw-20,32);}
      ctx.fillStyle=sel?'#ffe080':(afford?'#fff':'#666');
      ctx.font='15px monospace'; ctx.textAlign='left';
      ctx.fillText(it.name, px+18, iy+21);
      ctx.fillStyle='#aaa'; ctx.font='12px monospace';
      ctx.fillText(it.desc, px+155, iy+21);
      ctx.fillStyle=afford?'#ffd700':'#886622'; ctx.font='bold 14px monospace';
      ctx.textAlign='right'; ctx.fillText(`${it.cost}G`, px+pw-14, iy+21);
    }
    // Controls
    ctx.fillStyle='#666'; ctx.font='12px monospace'; ctx.textAlign='center';
    ctx.fillText('↑↓ Select  |  Z / Enter  Buy  |  E / Esc  Close', 400,448);
    // Message
    if(this.msgT>0){
      const ok=this.msg.startsWith('Bought');
      ctx.fillStyle=ok?'#60ff80':'#ff6060'; ctx.font='bold 14px monospace';
      ctx.fillText(this.msg, 400,432); this.msgT--;
    }
  }

  handleKey(code,player){
    if(code==='ArrowUp'||code==='KeyW') this.sel=(this.sel-1+this.items.length)%this.items.length;
    if(code==='ArrowDown'||code==='KeyS') this.sel=(this.sel+1)%this.items.length;
    if(code==='KeyZ'||code==='Enter') this._buy(player);
    if(code==='KeyE'||code==='Escape') return false;
    return true;
  }
  _buy(player){
    const it=this.items[this.sel];
    if(player.gold<it.cost){this.msg='Not enough gold!';this.msgT=90;return;}
    player.gold-=it.cost;
    switch(it.type){
      case'heal':   player.heal(2);this.msg='Bought Potion! +2 HP';break;
      case'sword2': player.swordLv=Math.max(2,player.swordLv);player.atk=Math.max(2,player.atk);this.msg='Bought Iron Sword!';break;
      case'sword3': player.swordLv=3;player.atk=3;this.msg='Bought Fire Sword!';break;
      case'shield': player.hasShield=true;player.def=Math.max(1,player.def);this.msg='Bought Shield!';break;
      case'armor':  player.hasArmor=true;player.maxHp+=2;player.hp=Math.min(player.hp+2,player.maxHp);this.msg='Bought Armor! +2 Max HP';break;
      case'boots':  player.boots=true;this.msg='Bought Boots! Move faster';break;
      case'mana':   player.maxMana=Math.min(5,player.maxMana+1);player.mana=Math.min(player.mana+1,player.maxMana);this.msg='Bought Mana Orb!';break;
    }
    this.msgT=120;
  }
}

function _roundRect(x,y,w,h,r){
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();ctx.fill();ctx.stroke();
}

// ── LEVEL ──────────────────────────────────────────
class Level {
  constructor(num){
    this.num=num; this.tiles=[]; this.enemies=[]; this.gold=[];
    this.shops=[]; this.particles=[]; this.width=0; this.height=H;
    this.spawnX=64; this.spawnY=380; this.exitR=null;
    this.timeLimit=300*60; this.timeLeft=this.timeLimit;
    this._build(num);
  }

  _g(x1,x2,ty,d=3){
    for(let x=x1;x<=x2;x++){
      this.tiles.push(new Tile(x,ty,'ground'));
      for(let i=1;i<=d;i++) this.tiles.push(new Tile(x,ty+i,'wall'));
    }
  }
  _p(x,ty,w){for(let i=0;i<w;i++) this.tiles.push(new Tile(x+i,ty,'platform'));}
  _wc(x,y1,y2){for(let y=y1;y<=y2;y++) this.tiles.push(new Tile(x,y,'wall'));}

  _build(n){
    if(n===1)this._lv1();
    else if(n===2)this._lv2();
    else if(n===3)this._lv3();
    else this._boss();
  }

  _lv1(){
    // Grassy plains — two ground segments separated by a gap
    this._g(0,54,13);        // Seg 1
    this._g(57,115,13);      // Seg 2
    this._wc(0,0,13);        // Left wall
    // Platforms
    this._p(10,9,5); this._p(22,7,4); this._p(38,10,5);
    this._p(68,8,6); this._p(84,11,4); this._p(96,7,6);
    // Spikes in seg 1
    this.tiles.push(new Tile(28,13,'spike'));
    this.tiles.push(new Tile(29,13,'spike'));
    this.tiles.push(new Tile(44,13,'spike'));

    this.enemies=[
      new Slime(350,360),  new Slime(600,360),  new Skeleton(880,360),
      new Slime(1100,360), new Bat(1350,200),   new Skeleton(1600,360),
      new Bat(1900,180),   new Slime(2150,360), new Skeleton(2400,360),
      new Bat(2650,220),
    ];
    this.shops=[new Shop(950, 13*TILE-64)];
    // Exit at end of seg 2, at player reachable height
    this.exitR={x:112*TILE, y:10*TILE, w:48, h:84};
    this.width=116*TILE; this.spawnX=64; this.spawnY=356;
  }

  _lv2(){
    // Castle — main floor + elevated section
    this._g(0,70,14);          // Lower floor
    this._wc(0,0,14);          // Left wall
    // Castle pillars
    this._wc(40,8,14); this._wc(41,8,14);
    this._wc(55,8,14); this._wc(56,8,14);
    // Platforms leading upward
    this._p(8,11,5);  this._p(16,8,4);
    this._p(24,11,4); this._p(30,7,5);
    this._p(44,10,5); this._p(50,6,6);
    this._p(60,10,4); this._p(65,7,5);
    // Upper walkway accessible after platforms
    this._g(57,70,10,2);
    // Spikes at row 13 (one row above the ground floor, so they actually trigger)
    [18,19,33,34].forEach(x=>this.tiles.push(new Tile(x,13,'spike')));

    this.enemies=[
      new Skeleton(350,430), new Bat(580,200),    new Skeleton(820,430),
      new Bat(1060,170),     new Skeleton(1280,430), new Bat(1500,200),
      new Skeleton(1750,320), new Bat(1980,180),
    ];

    this.shops=[new Shop(750, 14*TILE-64)];
    this.exitR={x:68*TILE, y:7*TILE, w:48, h:84};
    this.width=72*TILE; this.spawnX=64; this.spawnY=390;
  }

  _lv3(){
    // Underground cave — ceiling + floor + pillars
    for(let x=0;x<95;x++){
      this.tiles.push(new Tile(x,0,'wall'));
      this.tiles.push(new Tile(x,1,'wall'));
      this.tiles.push(new Tile(x,14,'ground'));
      for(let d=1;d<=3;d++) this.tiles.push(new Tile(x,14+d,'wall'));
    }
    this._wc(0,0,15);
    // Cave pillars
    [16,34,52,70].forEach(px=>{
      for(let y=3;y<=11;y++){this.tiles.push(new Tile(px,y,'wall'));this.tiles.push(new Tile(px+1,y,'wall'));}
    });
    // Platforms
    this._p(6,8,5);  this._p(20,11,4); this._p(38,7,5);
    this._p(56,11,4); this._p(62,7,5); this._p(76,10,4);
    // Spike traps at row 13 (one row above the floor so they work correctly)
    [26,27,28,58,59].forEach(x=>this.tiles.push(new Tile(x,13,'spike')));

    this.enemies=[
      new Bat(400,160),    new Skeleton(660,420), new Bat(920,130),
      new Skeleton(1180,420), new Bat(1440,180),  new Skeleton(1700,420),
      new Bat(1960,150),  new Skeleton(2220,420), new Bat(2480,170),
    ];
    this.shops=[new Shop(1150, 14*TILE-64)];
    this.exitR={x:92*TILE, y:10*TILE, w:48, h:84};
    this.width=96*TILE; this.spawnX=64; this.spawnY=390;
  }

  _boss(){
    // Dragon lair arena
    this._g(0,40,14);
    this._wc(0,0,14); this._wc(40,0,14);
    // Arena platforms
    this._p(5,10,6); this._p(14,6,8); this._p(29,10,6);
    // Lava pits at row 13 (above the floor so they work correctly)
    [2,3,37,38].forEach(x=>this.tiles.push(new Tile(x,13,'spike')));

    const boss=new Dragon(19*TILE, 5*TILE);
    boss.lw=42*TILE; // for clamping
    this.enemies=[boss];
    this.exitR={x:37*TILE, y:11*TILE, w:48, h:84};
    this.width=42*TILE; this.spawnX=80; this.spawnY=390;
    this.timeLimit=600*60; this.timeLeft=this.timeLimit;
  }

  burst(x,y,col,n=8){
    for(let i=0;i<n;i++){
      const a=Math.random()*Math.PI*2, s=1+Math.random()*3.5;
      this.particles.push(new Particle(x,y,col,Math.cos(a)*s,Math.sin(a)*s,rand(14,28)));
    }
  }

  update(player){
    this.timeLeft=Math.max(0,this.timeLeft-1);
    const dead=[];

    for(const e of this.enemies){
      if(!e.alive){dead.push(e);continue;}
      if(e instanceof Dragon){
        e.update(this.tiles,player);
        for(const p of e.projectiles){
          if(p.alive&&overlap(p,player)){player.takeDamage(p.dmg);p.alive=false;this.burst(p.x,p.y,'#ff5500');}
        }
      } else {
        e.update(this.tiles,player);
        if(e instanceof Skeleton){
          if(e.swingT>=e.swingCD){const ar=e.atkRect();if(overlap(ar,player))player.takeDamage(e.atk);e.swingT=0;}
        } else {
          if(overlap(e,player)&&e.invT===0) player.takeDamage(e.atk);
        }
      }
    }

    for(const e of dead){
      this.enemies.splice(this.enemies.indexOf(e),1);
      this.burst(e.x+e.w/2,e.y+e.h/2,'#ff3030',14);
      this.gold.push(...e.dropGold());
      player.score+=e.score;
    }

    // Gold
    this.gold=this.gold.filter(g=>{
      if(!g.update(this.tiles))return false;
      if(overlap(g,player)){
        player.gold+=g.val; player.score+=g.val;
        this.burst(g.x+7,g.y+7,'#ffd700',5); return false;
      }
      return true;
    });

    // Player spells vs enemies
    for(const proj of player.projectiles){
      if(!proj.alive)continue;
      proj.update(this.tiles);
      for(const e of this.enemies){
        if(e.alive&&overlap(proj,e)){e.takeDamage(proj.dmg);proj.alive=false;this.burst(proj.x,proj.y,'#ff9900',6);break;}
      }
    }

    this.particles=this.particles.filter(p=>p.update());
  }

  draw(cam){
    this._drawBG(cam);
    for(const t of this.tiles)t.draw(cam);
    for(const s of this.shops)s.draw(cam);
    for(const g of this.gold)g.draw(cam);
    for(const e of this.enemies)e.draw(cam);
    for(const p of this.particles)p.draw(cam);
    this._drawExit(cam);
  }

  _drawBG(cam){
    // Sky gradient
    const g=ctx.createLinearGradient(0,0,0,H);
    const bgPalette=[
      ['#5090cc','#2a5080'],  // 1: day sky
      ['#403060','#1a1030'],  // 2: dusk castle
      ['#101018','#050510'],  // 3: cave
      ['#1a0828','#0a0415'],  // 4: dragon lair
    ];
    const [c1,c2]=bgPalette[Math.min(this.num-1,3)];
    g.addColorStop(0,c1); g.addColorStop(1,c2);
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

    // Clouds (level 1)
    if(this.num===1){
      ctx.fillStyle='rgba(255,255,255,.45)';
      [[160,75],[380,58],[620,85],[760,68]].forEach(([cx,cy])=>{
        const ox=((cx-cam.x*.22)%(W+130))-65;
        ctx.beginPath();ctx.ellipse(ox,cy,48,18,0,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.ellipse(ox+26,cy-14,30,17,0,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.ellipse(ox+52,cy,35,15,0,0,Math.PI*2);ctx.fill();
      });
    }

    // Background trees (level 1) — parallax
    if(this.num===1){
      for(let i=0;i<14;i++){
        const tx=((i*120-cam.x*.15+20)%(W+100))-50;
        const th=80+i%4*20;
        ctx.fillStyle='#1a6a20'; ctx.fillRect(tx-3,H-th-10,6,th+10);
        ctx.fillStyle='#228a28';
        ctx.beginPath();ctx.arc(tx,H-th-10,18,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#1a7820';
        ctx.beginPath();ctx.arc(tx-8,H-th+2,14,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(tx+8,H-th+2,14,0,Math.PI*2);ctx.fill();
      }
    }

    // Stars (levels 3+)
    if(this.num>=3){
      ctx.fillStyle='rgba(255,255,255,.65)';
      for(let i=0;i<50;i++){
        const sx=((i*137+Math.floor(cam.x*.08))%W+W)%W;
        const sy=(i*71)%H;
        ctx.fillRect(sx,sy,i%3===0?2:1,i%3===0?2:1);
      }
    }

    // Lava glow (boss level)
    if(this.num===4){
      const lg=ctx.createLinearGradient(0,H-60,0,H);
      lg.addColorStop(0,'rgba(0,0,0,0)');
      lg.addColorStop(1,'rgba(200,40,0,.35)');
      ctx.fillStyle=lg; ctx.fillRect(0,H-60,W,60);
    }
  }

  _drawExit(cam){
    if(!this.exitR)return;
    const ex=this.exitR;
    if(!cam.inView(ex.x,ex.y,ex.w,ex.h))return;
    const sx=cam.tx(ex.x), sy=cam.ty(ex.y);
    const pulse=.55+.45*Math.sin(Date.now()*.0032);
    // Door glow
    ctx.fillStyle=`rgba(255,200,0,${.12*pulse})`; ctx.fillRect(sx,sy,ex.w,ex.h);
    ctx.strokeStyle=`rgba(255,210,0,${.6+.4*pulse})`; ctx.lineWidth=3;
    ctx.strokeRect(sx+.5,sy+.5,ex.w-1,ex.h-1);
    // Arrow
    ctx.fillStyle='#ffd700';
    ctx.beginPath();ctx.moveTo(sx+ex.w/2-8,sy+14);ctx.lineTo(sx+ex.w/2+8,sy+14);ctx.lineTo(sx+ex.w/2,sy+4);ctx.fill();
    ctx.font='bold 13px monospace'; ctx.textAlign='center';
    ctx.fillText('EXIT',sx+ex.w/2,sy+ex.h/2+6);
  }
}

// ── HUD ────────────────────────────────────────────
function drawHUD(player,levelNum,timeLeft){
  ctx.fillStyle='rgba(0,0,0,.62)'; ctx.fillRect(0,0,W,50);

  // Hearts
  ctx.font='11px monospace'; ctx.fillStyle='#aaa'; ctx.textAlign='left'; ctx.fillText('HP',8,20);
  for(let i=0;i<player.maxHp;i++) _heart(36+i*24, 3, i<player.hp);

  // Gold
  ctx.fillStyle='#ffd700'; ctx.font='bold 15px monospace';
  ctx.fillText(`${player.gold}G`, 320, 22);

  // Score
  ctx.fillStyle='#fff'; ctx.font='14px monospace';
  ctx.fillText(`${player.score}pts`, 400, 22);

  // Level
  ctx.fillStyle='#88d0ff'; ctx.fillText(`Lv.${levelNum}`, 580, 22);

  // Time
  const s=Math.ceil(timeLeft/60);
  ctx.fillStyle=s<30?'#ff3030':(s<60?'#ffcc00':'#fff');
  ctx.textAlign='right'; ctx.fillText(`${s}s`,790,22);

  // Mana orbs
  if(player.maxMana>0){
    ctx.fillStyle='#7090ff'; ctx.font='11px monospace'; ctx.textAlign='left';
    ctx.fillText('MP',8,42);
    for(let i=0;i<player.maxMana;i++){
      ctx.fillStyle=i<player.mana?'#3355ff':'#1a2266';
      ctx.beginPath();ctx.arc(34+i*15,38,6,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=i<player.mana?'#7799ff':'#334';
      ctx.lineWidth=1; ctx.beginPath();ctx.arc(34+i*15,38,6,0,Math.PI*2);ctx.stroke();
    }
  }

  // Equipment badges
  let ex=598;
  if(player.swordLv>=2){ctx.fillStyle=player.swordLv===3?'#ff8800':'#c0c8d0';ctx.font='11px monospace';ctx.textAlign='left';ctx.fillText(`[${player.swordLv===3?'FIRE':'IRON'}]`,ex,42);ex+=55;}
  if(player.hasShield){ctx.fillStyle='#c0a060';ctx.fillText('[SHD]',ex,42);ex+=50;}
  if(player.hasArmor) {ctx.fillStyle='#80b8ff';ctx.fillText('[ARM]',ex,42);}
}

function _heart(x,y,full){
  ctx.fillStyle=full?'#dd2020':'#2a2a2a';
  ctx.beginPath();
  ctx.moveTo(x+10,y+6);
  ctx.bezierCurveTo(x+10,y+3,x+6,y,x+6,y+4);
  ctx.bezierCurveTo(x+6,y,x,y,x,y+6);
  ctx.bezierCurveTo(x,y+11,x+6,y+15,x+10,y+18);
  ctx.bezierCurveTo(x+14,y+15,x+20,y+11,x+20,y+6);
  ctx.bezierCurveTo(x+20,y,x+14,y,x+14,y+4);
  ctx.bezierCurveTo(x+14,y,x+10,y+3,x+10,y+6);
  ctx.fill();
  if(full){ctx.fillStyle='rgba(255,120,120,.5)';ctx.beginPath();ctx.ellipse(x+8,y+7,4,3,-.4,0,Math.PI*2);ctx.fill();}
}

// ── MENU SCREENS ───────────────────────────────────
function drawMenu(){
  // Starfield
  ctx.fillStyle='#08051a'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle='rgba(255,255,255,.55)';
  for(let i=0;i<70;i++) ctx.fillRect((i*137)%W,(i*79)%H,i%4===0?2:1,i%4===0?2:1);

  // Moon
  ctx.fillStyle='rgba(220,220,180,.3)'; ctx.beginPath();
  ctx.arc(680,80,60,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#08051a'; ctx.beginPath();
  ctx.arc(700,75,55,0,Math.PI*2); ctx.fill();

  // Title shadow
  ctx.fillStyle='rgba(0,0,0,.5)'; ctx.font='bold 44px monospace'; ctx.textAlign='center';
  ctx.fillText('WONDER BOY',402,116); ctx.fillText('MONSTER QUEST',402,164);
  // Title
  ctx.fillStyle='#ffd700'; ctx.fillText('WONDER BOY',400,114);
  ctx.fillStyle='#ff8800'; ctx.fillText('MONSTER QUEST',400,162);
  ctx.fillStyle='#999'; ctx.font='13px monospace';
  ctx.fillText('Inspired by Wonder Boy in Monster Land  (Sega, 1987)',400,188);

  // Hero sprite on menu
  const hx=250,hy=220;
  ctx.fillStyle='#6a3c14';ctx.fillRect(hx,hy+20,8,12);ctx.fillRect(hx+12,hy+20,8,12);
  ctx.fillStyle='#2888d8';ctx.fillRect(hx,hy+10,22,13);
  ctx.fillStyle='#e0b878';ctx.fillRect(hx+3,hy+1,15,12);
  ctx.fillStyle='#e07818';ctx.fillRect(hx+2,hy-2,18,9);
  ctx.fillStyle='#c0c0c8';ctx.fillRect(hx+22,hy+14,16,4);

  // Dragon sprite on menu
  const dx=460,dy=218;
  ctx.fillStyle='#e04800'; ctx.beginPath();ctx.ellipse(dx+24,dy+22,22,17,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#cc2800'; ctx.beginPath();ctx.ellipse(dx+8,dy+16,14,8,-.4,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(dx+40,dy+16,14,8,.4,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#ffe000';ctx.beginPath();ctx.arc(dx+16,dy+18,5,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(dx+32,dy+18,5,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#000';ctx.beginPath();ctx.arc(dx+16,dy+18,2.5,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(dx+32,dy+18,2.5,0,Math.PI*2);ctx.fill();
  // Dragon horns
  ctx.fillStyle='#800c00';
  ctx.beginPath();ctx.moveTo(dx+14,dy+5);ctx.lineTo(dx+9,dy-8);ctx.lineTo(dx+20,dy+5);ctx.fill();
  ctx.beginPath();ctx.moveTo(dx+34,dy+5);ctx.lineTo(dx+39,dy-8);ctx.lineTo(dx+28,dy+5);ctx.fill();

  // VS text
  ctx.fillStyle='#ff4400'; ctx.font='bold 20px monospace'; ctx.fillText('VS',382,248);

  // Controls box
  ctx.fillStyle='rgba(0,0,0,.5)'; ctx.strokeStyle='#444'; ctx.lineWidth=1;
  _roundRect(100,268,600,140,8);
  const lines=[
    ['#ffd700','bold 14px monospace','CONTROLS',275],
    ['#fff','13px monospace','Arrow Keys / WASD  —  Move & Jump',297],
    ['#fff','13px monospace','Z / X  —  Sword Attack',317],
    ['#aef','13px monospace','C  —  Cast Spell  (requires Mana)',337],
    ['#aef','13px monospace','E  —  Enter Shop (when nearby)',357],
  ];
  for(const [col,font,text,y] of lines){
    ctx.fillStyle=col; ctx.font=font; ctx.textAlign='center'; ctx.fillText(text,400,y);
  }

  // Blink start
  const bl=Math.floor(Date.now()/520)%2===0;
  ctx.fillStyle=bl?'#40ff60':'#187028'; ctx.font='bold 20px monospace';
  ctx.fillText('▶  Press ENTER to Start  ◀',400,430);

  ctx.fillStyle='#555'; ctx.font='11px monospace';
  ctx.fillText('4 levels  •  sword upgrades  •  shop  •  boss fight',400,475);
}

function drawGameOver(score){
  ctx.fillStyle='rgba(0,0,0,.82)'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#ff2020'; ctx.font='bold 52px monospace'; ctx.textAlign='center';
  ctx.fillText('GAME OVER',400,170);
  ctx.fillStyle='#ffd700'; ctx.font='22px monospace';
  ctx.fillText(`Final Score: ${score}`,400,230);
  const bl=Math.floor(Date.now()/620)%2===0;
  ctx.fillStyle=bl?'#fff':'#555'; ctx.font='18px monospace';
  ctx.fillText('ENTER — Play Again   |   ESC — Menu',400,295);
}

function drawWin(score){
  ctx.fillStyle='#050520'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle='rgba(255,255,255,.6)';
  for(let i=0;i<90;i++) ctx.fillRect((i*137+Math.floor(Date.now()/60))%W,(i*71)%H,i%4===0?2:1,i%4===0?2:1);
  ctx.fillStyle='#ffd700'; ctx.font='bold 56px monospace'; ctx.textAlign='center';
  ctx.fillText('YOU WIN!',400,140);
  ctx.fillStyle='#80ffaa'; ctx.font='24px monospace';
  ctx.fillText('Monster Land is saved!',400,196);
  ctx.fillStyle='#ffd700'; ctx.font='20px monospace';
  ctx.fillText(`Final Score: ${score}`,400,248);
  const bl=Math.floor(Date.now()/620)%2===0;
  ctx.fillStyle=bl?'#40ff80':'#186030'; ctx.font='18px monospace';
  ctx.fillText('Press ENTER to Play Again',400,318);
}

function drawLevelComplete(levelNum,score){
  ctx.fillStyle='rgba(0,0,0,.74)'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#ffd700'; ctx.font='bold 38px monospace'; ctx.textAlign='center';
  ctx.fillText(`LEVEL ${levelNum} CLEAR!`,400,180);
  ctx.fillStyle='#fff'; ctx.font='20px monospace';
  ctx.fillText(`Score: ${score}`,400,234);
  const bl=Math.floor(Date.now()/520)%2===0;
  ctx.fillStyle=bl?'#60ff80':'#208040'; ctx.font='18px monospace';
  ctx.fillText('Press ENTER — Next Level',400,296);
}

// ── HUD MESSAGE ────────────────────────────────────
let hudMsg='', hudMsgT=0, hudMsgC='#fff';
function showMsg(txt,col='#fff',dur=120){hudMsg=txt;hudMsgC=col;hudMsgT=dur;}
function drawMsg(){
  if(hudMsgT<=0)return;
  ctx.globalAlpha=Math.min(1,hudMsgT/25);
  ctx.fillStyle=hudMsgC; ctx.font='bold 16px monospace'; ctx.textAlign='center';
  ctx.fillText(hudMsg,400,72);
  ctx.globalAlpha=1; hudMsgT--;
}

// ── GAME ───────────────────────────────────────────
class Game {
  constructor(){
    this.state=ST.MENU;
    this.level=null; this.player=null; this.cam=null;
    this.lvNum=1; this.totalLvs=4;
    this.shop=null;
    this.step=1000/60; this.acc=0; this.last=0;
  }

  start(){
    this.lvNum=1; this._load(1); this.state=ST.PLAY;
  }

  _load(n){
    const old=this.player;
    this.level=new Level(n);
    this.player=new Player(this.level.spawnX, this.level.spawnY);
    if(old){
      this.player.maxHp=old.maxHp; this.player.hp=Math.min(old.hp+2,old.maxHp);
      this.player.atk=old.atk; this.player.def=old.def;
      this.player.gold=old.gold; this.player.score=old.score;
      this.player.swordLv=old.swordLv; this.player.hasShield=old.hasShield;
      this.player.hasArmor=old.hasArmor; this.player.boots=old.boots;
      this.player.mana=old.mana; this.player.maxMana=old.maxMana;
    }
    // Spawn protection: invincible for first 3 seconds of every level
    this.player.invTimer = 180;
    this.cam=new Camera(this.level.width, this.level.height);
    this.shop=null;
  }

  _next(){
    if(++this.lvNum>this.totalLvs){this.state=ST.WIN;return;}
    this._load(this.lvNum); this.state=ST.PLAY;
    showMsg(`Level ${this.lvNum}!`,'#ffd700',180);
  }

  handleKey(code){
    if(this.state===ST.SHOP&&this.shop){
      if(!this.shop.handleKey(code,this.player)){this.state=ST.PLAY;this.shop=null;}
      return;
    }
    switch(this.state){
      case ST.MENU: if(code==='Enter')this.start(); break;
      case ST.PLAY:
        if(code==='KeyZ'||code==='KeyX') this.player.doAttack();
        if(code==='KeyC'){if(!this.player.castSpell())showMsg('No Mana!','#ff6060',60);}
        if(code==='KeyE'){
          for(const s of this.level.shops)if(s.nearby(this.player)){this.shop=s;this.state=ST.SHOP;return;}
        }
        if(code==='Escape') this.state=ST.MENU;
        break;
      case ST.OVER:
        if(code==='Enter')this.start();
        if(code==='Escape')this.state=ST.MENU;
        break;
      case ST.WIN:    if(code==='Enter')this.start(); break;
      case ST.NEXT:   if(code==='Enter')this._next(); break;
    }
  }

  update(){
    if(this.state!==ST.PLAY)return;
    const p=this.player;

    // Gameplay key actions (via justPressed) also handled here
    if(jp['KeyZ']||jp['KeyX']) p.doAttack();
    if(jp['KeyC']){if(!p.castSpell())showMsg('No Mana!','#ff6060',60);}

    p.move(this.level.tiles);
    p.update(this.level.enemies);
    this.level.update(p);
    this.cam.update(p);

    // Fall out of bounds
    if(p.y>this.level.height+120) p.takeDamage(99);

    if(!p.alive||this.level.timeLeft<=0){this.state=ST.OVER;return;}

    if(this.level.exitR&&overlap(p,this.level.exitR))
      this.state=this.lvNum>=this.totalLvs?ST.WIN:ST.NEXT;
  }

  draw(){
    // Screen shake
    ctx.save();
    if(shakeAmt>0){
      ctx.translate(Math.random()*shakeAmt*2-shakeAmt, Math.random()*shakeAmt*2-shakeAmt);
      shakeAmt=Math.max(0,shakeAmt-0.6);
    }

    switch(this.state){
      case ST.MENU: drawMenu(); break;
      case ST.OVER: drawGameOver(this.player?.score??0); break;
      case ST.WIN:  drawWin(this.player?.score??0); break;
      default: {
        // Render game world for PLAY / SHOP / NEXT
        this.level.draw(this.cam);
        this.player.draw(this.cam);
        drawHUD(this.player,this.lvNum,this.level.timeLeft);
        drawMsg();
        if(this.state===ST.SHOP&&this.shop) this.shop.drawMenu(this.player);
        if(this.state===ST.NEXT) drawLevelComplete(this.lvNum,this.player.score);
      }
    }

    ctx.restore();
  }

  loop(ts){
    this.acc+=ts-this.last; this.last=ts;
    if(this.acc>200)this.acc=200;
    while(this.acc>=this.step){ this.update(); clearJP(); this.acc-=this.step; }
    this.draw();
    requestAnimationFrame(t=>this.loop(t));
  }

  run(){
    document.addEventListener('keydown', e=>this.handleKey(e.code));
    requestAnimationFrame(t=>{this.last=t; this.loop(t);});
  }
}

// ── BOOT ───────────────────────────────────────────
new Game().run();
