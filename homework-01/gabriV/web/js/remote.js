// Remote player meshes + name tags, driven by snapshot messages (SPEC §4.3).
// State (alive/hp/color/protected) is replaced wholesale per snapshot — lossy and
// naive on purpose. Position/yaw are buffered and interpolated at render time with a
// fixed delay so other players glide instead of snapping (SPEC §9.1). Still no
// prediction/extrapolation: past the newest sample we clamp, never guess ahead.
import * as THREE from 'three';
import { CONFIG } from './config.js';

// shortest-path angle lerp so a yaw wrapping past ±π doesn't spin the long way round
function lerpAngle(a, b, t) {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

export function createRemotePlayers({ scene, selfId }) {
  const remotes = new Map(); // id -> { group, body, data }

  function makeNameTag(name) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(name, canvas.width / 2, canvas.height / 2);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas) }));
    sprite.scale.set(2, 0.5, 1);
    return sprite;
  }

  function add(p) {
    const group = new THREE.Group();
    // capsule total height = length + 2r = playerHeight, same AABB as the local player
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(CONFIG.playerRadius, CONFIG.playerHeight - 2 * CONFIG.playerRadius, 4, 8),
      new THREE.MeshLambertMaterial({ color: p.color }));
    body.position.y = CONFIG.playerHeight / 2; // capsule centre vs feet origin
    body.userData.playerId = p.id; // lets the weapon raycast name its victim
    const tag = makeNameTag(p.name);
    tag.position.y = CONFIG.playerHeight + 0.4;
    group.add(body, tag);
    group.position.set(p.pos.x, p.pos.y, p.pos.z); // avoid a one-frame flash at the origin
    group.rotation.y = p.yaw;
    scene.add(group);
    // buffer = timestamped pose history; update() interpolates across it (SPEC §9.1)
    const r = { group, body, data: p, buffer: [], protected: false };
    remotes.set(p.id, r);
    return r;
  }

  // reflect the spawn-protection look on the capsule (translucent shimmer, SPEC §9.5)
  function setProtectedLook(r, on) {
    if (r.protected === on) return;
    r.protected = on;
    r.body.material.transparent = on;
    r.body.material.opacity = on ? 0.4 : 1;
  }

  function remove(id) {
    const r = remotes.get(id);
    if (!r) return;
    scene.remove(r.group);
    r.body.geometry.dispose();
    r.body.material.dispose();
    r.group.traverse((o) => {
      if (o.isSprite) {
        o.material.map.dispose();
        o.material.dispose();
      }
    });
    remotes.delete(id);
  }

  function applySnapshot(players) {
    const now = performance.now();
    const seen = new Set();
    for (const p of players) {
      if (p.id === selfId) continue; // the local player renders itself
      seen.add(p.id);
      const r = remotes.get(p.id) ?? add(p);
      r.group.visible = p.alive;
      r.data = p;
      setProtectedLook(r, !!p.protected);
      // record the pose; update() lerps toward it. Cap history at a few samples.
      r.buffer.push({ time: now, pos: { x: p.pos.x, y: p.pos.y, z: p.pos.z }, yaw: p.yaw });
      if (r.buffer.length > 6) r.buffer.shift();
    }
    for (const id of [...remotes.keys()]) {
      if (!seen.has(id)) remove(id); // catches leavers even without a 'left'
    }
  }

  // Called every render frame: place each remote at where it was interpDelayMs ago,
  // interpolating between the two buffered samples that bracket that instant.
  function update(now) {
    const renderTime = now - CONFIG.interpDelayMs;
    for (const r of remotes.values()) {
      const buf = r.buffer;
      if (buf.length === 0) continue;
      if (renderTime <= buf[0].time) { setPose(r.group, buf[0]); continue; }
      const newest = buf[buf.length - 1];
      if (renderTime >= newest.time) { setPose(r.group, newest); continue; } // clamp, no extrapolation
      let a = buf[0];
      let b = newest;
      for (let i = 0; i < buf.length - 1; i++) {
        if (renderTime >= buf[i].time && renderTime <= buf[i + 1].time) {
          a = buf[i];
          b = buf[i + 1];
          break;
        }
      }
      const span = b.time - a.time;
      const t = span > 0 ? (renderTime - a.time) / span : 1;
      r.group.position.set(
        a.pos.x + (b.pos.x - a.pos.x) * t,
        a.pos.y + (b.pos.y - a.pos.y) * t,
        a.pos.z + (b.pos.z - a.pos.z) * t);
      r.group.rotation.y = lerpAngle(a.yaw, b.yaw, t);
    }
  }

  function setPose(group, s) {
    group.position.set(s.pos.x, s.pos.y, s.pos.z);
    group.rotation.y = s.yaw;
  }

  return {
    applySnapshot,
    update,
    remove,
    get: (id) => remotes.get(id),
    ids: () => [...remotes.keys()],
  };
}
