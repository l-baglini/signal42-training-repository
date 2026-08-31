// Local first-person controller: pointer-lock mouse-look (manual yaw/pitch), WASD
// relative to look, gravity + jump, axis-separated AABB collision vs map colliders
// and the arena bounds. Client-authoritative on purpose — see SPEC §2.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { settings } from './settings.js';

export function createPlayer({ camera, dom, map, spawn, net }) {
  const pos = new THREE.Vector3(); // feet position; camera sits at pos.y + eyeHeight
  const vel = new THREE.Vector3();
  let yaw = 0;
  let pitch = 0;
  let onGround = false;
  let alive = true;
  const keys = new Set();

  const r = CONFIG.playerRadius;
  const h = CONFIG.playerHeight;
  const b = map.bounds;

  camera.rotation.order = 'YXZ';

  // Server-assigned spawn (welcome.you.pos); random local fallback for dev.
  const s = spawn ?? map.spawns[Math.floor(Math.random() * map.spawns.length)];
  pos.set(s.x, s.y, s.z);

  dom.addEventListener('click', () => {
    if (document.pointerLockElement !== dom) dom.requestPointerLock();
  });
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== dom) return;
    yaw -= e.movementX * settings.sensitivity; // live, player-set (settings.js)
    pitch -= e.movementY * settings.sensitivity;
    pitch = Math.max(-1.55, Math.min(1.55, pitch)); // just shy of straight up/down
  });
  // Keys are deliberately not gated on pointer lock: the game view only exists while
  // playing, and it keeps the controller scriptable for testing.
  document.addEventListener('keydown', (e) => keys.add(e.code));
  document.addEventListener('keyup', (e) => keys.delete(e.code));

  // Stream the local pose at a fixed ~30Hz (SPEC §5). Never cleared — the page
  // reloads on disconnect, and net.send is a no-op on a closed socket.
  if (net) {
    setInterval(() => {
      net.send('state', { pos: { x: pos.x, y: pos.y, z: pos.z }, yaw, pitch });
    }, 1000 / CONFIG.sendRateHz);
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Move along one axis then push out of anything we entered — axis separation
  // keeps AABB resolution trivial and slide-along-walls free.
  function moveAxis(axis, d) {
    pos[axis] += d;

    if (axis === 'x') pos.x = clamp(pos.x, b.min.x + r, b.max.x - r);
    if (axis === 'z') pos.z = clamp(pos.z, b.min.z + r, b.max.z - r);
    if (axis === 'y') {
      if (pos.y <= b.min.y) {
        pos.y = b.min.y;
        vel.y = 0;
        onGround = true;
      }
      if (pos.y + h >= b.max.y) {
        pos.y = b.max.y - h;
        vel.y = Math.min(vel.y, 0);
      }
    }

    for (const c of map.colliders) {
      const overlap =
        pos.x - r < c.max.x && pos.x + r > c.min.x &&
        pos.y < c.max.y && pos.y + h > c.min.y &&
        pos.z - r < c.max.z && pos.z + r > c.min.z;
      if (!overlap) continue;
      if (axis === 'x') {
        pos.x = d > 0 ? c.min.x - r : c.max.x + r;
      } else if (axis === 'z') {
        pos.z = d > 0 ? c.min.z - r : c.max.z + r;
      } else if (d > 0) {
        pos.y = c.min.y - h; // bumped a ceiling
        vel.y = 0;
      } else {
        pos.y = c.max.y; // landed on a box top
        vel.y = 0;
        onGround = true;
      }
    }
  }

  function update(dt) {
    if (!alive) return; // dead: frozen in place until the server respawns us
    const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    let dx = 0;
    let dz = 0;
    if (f || strafe) {
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      dx = -sin * f + cos * strafe;
      dz = -cos * f - sin * strafe;
      const len = Math.hypot(dx, dz);
      dx /= len;
      dz /= len;
    }
    // Instant accel/stop — brisk Quake-ish feel, simplest possible (SPEC §4.2).
    vel.x = dx * CONFIG.moveSpeed;
    vel.z = dz * CONFIG.moveSpeed;

    if (keys.has('Space') && onGround) vel.y = CONFIG.jumpVelocity;
    vel.y -= CONFIG.gravity * dt;

    moveAxis('x', vel.x * dt);
    moveAxis('z', vel.z * dt);
    onGround = false;
    moveAxis('y', vel.y * dt); // may set onGround back to true

    camera.position.set(pos.x, pos.y + CONFIG.eyeHeight, pos.z);
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
  }

  return {
    pos,
    vel,
    update,
    get yaw() { return yaw; },
    get pitch() { return pitch; },
    get onGround() { return onGround; },
    get alive() { return alive; },
    setLook(newYaw, newPitch) { yaw = newYaw; pitch = newPitch; },
    setAlive(v) { alive = v; },
    respawnAt(p) {
      pos.set(p.x, p.y, p.z);
      vel.set(0, 0, 0);
    },
  };
}
