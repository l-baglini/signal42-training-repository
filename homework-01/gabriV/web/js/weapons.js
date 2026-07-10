// Hitscan weapon: fire-rate cooldown, camera ray for the tracer endpoint.
// Tracers are drawn on the server's `fired` rebroadcast — one code path for
// everyone including the shooter; localhost latency makes that invisible
// (SPEC §4.4). Hit claims against remote colliders land in Step 7.
import * as THREE from 'three';
import { CONFIG } from './config.js';

export function createWeapon({ scene, camera, dom, net, map, remotes, player, sound }) {
  let lastFire = -Infinity;

  const raycaster = new THREE.Raycaster();
  raycaster.far = CONFIG.weaponRange;

  function targets() {
    // raycaster tests invisible meshes too, so dead players must be excluded here
    const meshes = map.group.children.filter((o) => o.isMesh);
    for (const id of remotes.ids()) {
      const r = remotes.get(id);
      if (r.data.alive) meshes.push(r.body);
    }
    return meshes;
  }

  // fire sends the shot unless cooling down or dead; returns whether it left.
  // The closest intersection decides the hit, so walls block shots; if it is a
  // player capsule, the shooter claims the hit (SPEC §4.4 / §6.3).
  function fire() {
    const now = performance.now();
    if (now - lastFire < CONFIG.fireCooldownMs) return false;
    if (player && !player.alive) return false;
    lastFire = now;
    const origin = camera.position;
    const dir = camera.getWorldDirection(new THREE.Vector3());
    net?.send('fire', {
      origin: { x: origin.x, y: origin.y, z: origin.z },
      dir: { x: dir.x, y: dir.y, z: dir.z },
    });
    raycaster.set(origin, dir);
    const first = raycaster.intersectObjects(targets(), false)[0];
    if (first?.object.userData.playerId) {
      net?.send('hit', { target: first.object.userData.playerId });
    }
    return true;
  }

  function drawTracer({ origin, dir }) {
    const o = new THREE.Vector3(origin.x, origin.y, origin.z);
    const d = new THREE.Vector3(dir.x, dir.y, dir.z).normalize();
    raycaster.set(o, d);
    const hit = raycaster.intersectObjects(targets(), false)[0];
    const end = hit ? hit.point : o.clone().addScaledVector(d, CONFIG.weaponRange);
    // start a little along and below the ray so the shooter sees their own shot
    const start = o.clone().addScaledVector(d, 0.8).add(new THREE.Vector3(0, -0.15, 0));
    const geom = new THREE.BufferGeometry().setFromPoints([start, end]);
    const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: 0xffe066 }));
    scene.add(line);
    setTimeout(() => {
      scene.remove(line);
      geom.dispose();
      line.material.dispose();
    }, 90);
  }

  dom.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    sound?.resume(); // first fire click is a user gesture — unlock WebAudio (SPEC §9.2)
    // the click that engages pointer lock must not also fire
    if (document.pointerLockElement !== dom) return;
    fire();
  });

  // tracer + blip on every shot, shooter included — one code path for everyone
  net?.on('fired', (m) => {
    drawTracer(m);
    sound?.fire();
  });

  return { fire, drawTracer };
}
