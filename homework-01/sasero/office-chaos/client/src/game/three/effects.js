import * as THREE from 'three';
import { makeTextSprite } from './sprites.js';

// Lightweight per-frame effect systems. All share a single update(dt) tick
// driven by the scene's render loop.

// Soft radial smoke puff texture, built once.
let SMOKE_TEX = null;
function smokeTexture() {
  if (SMOKE_TEX) return SMOKE_TEX;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.5, 'rgba(245,247,250,0.55)');
  g.addColorStop(1, 'rgba(245,247,250,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  SMOKE_TEX = new THREE.CanvasTexture(c);
  return SMOKE_TEX;
}

// Billowing smoke / foam — used by the extinguisher jet.
export class SmokeSystem {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
    this.tex = smokeTexture();
  }

  puff(pos, { count = 3, color = 0xeef2f6, spread = 0.35, rise = 1.1, size = 0.5 } = {}) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.tex, color, transparent: true, opacity: 0.7, depthWrite: false });
      const s = new THREE.Sprite(mat);
      s.position.set(pos.x + (Math.random() - 0.5) * spread, pos.y + Math.random() * 0.2, pos.z + (Math.random() - 0.5) * spread);
      const sc = size * (0.6 + Math.random() * 0.7);
      s.scale.set(sc, sc, 1);
      s.renderOrder = 950;
      this.scene.add(s);
      this.parts.push({
        s,
        life: 0,
        ttl: 0.7 + Math.random() * 0.5,
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, rise * (0.6 + Math.random() * 0.6), (Math.random() - 0.5) * 0.6),
        grow: 1.6 + Math.random(),
      });
    }
  }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life += dt;
      p.s.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(0.94);
      const grow = 1 + p.grow * dt;
      p.s.scale.x *= grow;
      p.s.scale.y *= grow;
      p.s.material.opacity = Math.max(0, 0.7 * (1 - p.life / p.ttl));
      if (p.life >= p.ttl) {
        this.scene.remove(p.s);
        p.s.material.dispose();
        this.parts.splice(i, 1);
      }
    }
  }
}

export class DebrisSystem {
  constructor(scene) {
    this.scene = scene;
    this.bits = [];
    this.geo = new THREE.BoxGeometry(1, 1, 1);
  }

  // Throw a burst of small boxes from a point — papers, screen shards, splinters.
  burst(pos, { count = 10, colors = [0xffffff], spread = 3.2, size = 0.14 } = {}) {
    for (let i = 0; i < count; i++) {
      const color = colors[(Math.random() * colors.length) | 0];
      const m = new THREE.Mesh(this.geo, new THREE.MeshLambertMaterial({ color, flatShading: true }));
      const s = size * (0.6 + Math.random() * 0.9);
      m.scale.set(s, s, s);
      m.position.copy(pos);
      this.scene.add(m);
      this.bits.push({
        mesh: m,
        vel: new THREE.Vector3((Math.random() - 0.5) * spread, 2 + Math.random() * 3, (Math.random() - 0.5) * spread),
        spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
        life: 0,
        ttl: 1.1 + Math.random() * 0.5,
      });
    }
  }

  update(dt) {
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.life += dt;
      b.vel.y -= 11 * dt; // gravity
      b.mesh.position.addScaledVector(b.vel, dt);
      b.mesh.rotation.x += b.spin.x * dt;
      b.mesh.rotation.y += b.spin.y * dt;
      if (b.mesh.position.y < 0.05) {
        b.mesh.position.y = 0.05;
        b.vel.y *= -0.35;
        b.vel.x *= 0.6;
        b.vel.z *= 0.6;
      }
      if (b.life > b.ttl) {
        b.mesh.material.opacity = Math.max(0, 1 - (b.life - b.ttl) * 4);
        b.mesh.material.transparent = true;
        if (b.life > b.ttl + 0.25) {
          this.scene.remove(b.mesh);
          b.mesh.material.dispose();
          this.bits.splice(i, 1);
        }
      }
    }
  }
}

export class FloatTextSystem {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.items = [];
  }

  spawn(pos, text, { color = '#ffd166', fontSize = 48, scale = 0.9 } = {}) {
    const sprite = makeTextSprite(text, { color, fontSize, scale });
    sprite.position.copy(pos);
    sprite.renderOrder = 998;
    this.scene.add(sprite);
    this.items.push({ sprite, life: 0, ttl: 1.2 });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life += dt;
      it.sprite.position.y += dt * 1.3;
      it.sprite.material.opacity = Math.max(0, 1 - it.life / it.ttl);
      if (it.life > it.ttl) {
        this.scene.remove(it.sprite);
        it.sprite.material.map.dispose();
        it.sprite.material.dispose();
        this.items.splice(i, 1);
      }
    }
  }
}

export class FireSystem {
  constructor(scene) {
    this.scene = scene;
    this.fires = new Map(); // "x,y" -> { group, flames }
  }

  makeFlame(pos) {
    const group = new THREE.Group();
    group.position.set(pos.x, 0.1, pos.z);
    const flames = [];
    for (const [col, h, off] of [
      [0xff8c1a, 0.6, 0.0], [0xffd23b, 0.42, 0.06], [0xe8431f, 0.5, -0.05],
    ]) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.22, h, 5),
        new THREE.MeshBasicMaterial({ color: col })
      );
      cone.position.set((Math.random() - 0.5) * 0.2, h / 2 + off, (Math.random() - 0.5) * 0.2);
      group.add(cone);
      flames.push({ cone, base: h, phase: Math.random() * Math.PI * 2 });
    }
    const light = new THREE.PointLight(0xff7722, 1.1, 4);
    light.position.y = 0.6;
    group.add(light);
    this.scene.add(group);
    return { group, flames };
  }

  sync(fires) {
    const next = new Set(fires.map((f) => `${f.x},${f.y}`));
    for (const [key, f] of this.fires) {
      if (!next.has(key)) {
        this.scene.remove(f.group);
        this.fires.delete(key);
      }
    }
    for (const f of fires) {
      const key = `${f.x},${f.y}`;
      if (!this.fires.has(key)) this.fires.set(key, this.makeFlame({ x: f.x, z: f.y }));
    }
  }

  update(dt, t) {
    for (const f of this.fires.values()) {
      for (const fl of f.flames) {
        const s = 0.8 + Math.sin(t * 9 + fl.phase) * 0.22;
        fl.cone.scale.set(s, 0.9 + Math.sin(t * 11 + fl.phase) * 0.25, s);
        fl.cone.rotation.y += dt * 2;
      }
    }
  }

  clear() {
    for (const f of this.fires.values()) this.scene.remove(f.group);
    this.fires.clear();
  }
}
