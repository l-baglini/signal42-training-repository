import * as THREE from 'three';

// Low-poly office-object weapons, built from boxes. The same mesh is used both
// as a floor pickup (scaled up, bobbing) and held in a player's hand.

const box = (w, h, d, color) =>
  new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color, flatShading: true }));

export const WEAPON_EMOJI = {
  fists: '👊', keyboard: '⌨️', stapler: '📎', chair: '🪑', monitor: '🖥️',
};

// Returns a small THREE.Group oriented so its "business end" points along +Z
// (the avatar's facing), sized to sit in a hand (~0.3 units).
export function makeWeapon(type) {
  const g = new THREE.Group();
  switch (type) {
    case 'keyboard': {
      const base = box(0.34, 0.04, 0.16, 0x2b2f38);
      const keys = box(0.3, 0.02, 0.13, 0xb8c0cc);
      keys.position.y = 0.03;
      g.add(base, keys);
      break;
    }
    case 'stapler': {
      const body = box(0.12, 0.08, 0.26, 0xd23b2e);
      const top = box(0.1, 0.05, 0.22, 0x9c2a20);
      top.position.set(0, 0.06, -0.01);
      top.rotation.x = -0.12;
      g.add(body, top);
      break;
    }
    case 'chair': {
      const seat = box(0.26, 0.05, 0.26, 0x33415c);
      seat.position.y = 0.18;
      const back = box(0.26, 0.28, 0.05, 0x2a3550);
      back.position.set(0, 0.32, -0.12);
      const post = box(0.05, 0.18, 0.05, 0x20242c);
      post.position.y = 0.06;
      g.add(seat, back, post);
      g.scale.setScalar(0.7);
      break;
    }
    case 'monitor': {
      const screen = box(0.4, 0.28, 0.05, 0x20242c);
      screen.position.y = 0.2;
      const glow = box(0.34, 0.22, 0.02, 0x4aa3e0);
      glow.position.set(0, 0.2, 0.03);
      const stand = box(0.06, 0.12, 0.06, 0x2b2f38);
      const foot = box(0.18, 0.03, 0.12, 0x2b2f38);
      foot.position.y = -0.06;
      g.add(screen, glow, stand, foot);
      g.scale.setScalar(0.7);
      break;
    }
    default:
      return g; // fists: no mesh
  }
  return g;
}

// Held utility tools (not weapons): the extinguisher and the lighter. Returned
// oriented like makeWeapon so the scene can attach them to the hand pivot.
export function makeTool(kind) {
  const g = new THREE.Group();
  if (kind === 'extinguisher') {
    const body = box(0.16, 0.34, 0.16, 0xd23b2e);
    const nozzle = box(0.05, 0.13, 0.05, 0x20242c);
    nozzle.position.set(0, 0.2, 0.06);
    nozzle.rotation.x = -0.5;
    g.add(body, nozzle);
  } else if (kind === 'lighter') {
    const body = box(0.09, 0.15, 0.06, 0x9c2a20);
    const cap = box(0.09, 0.04, 0.06, 0xb8c0cc);
    cap.position.y = 0.095;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 6), new THREE.MeshBasicMaterial({ color: 0xff8c1a }));
    flame.position.y = 0.19;
    g.add(body, cap, flame);
  }
  return g;
}

// A pickup sitting on the floor: the weapon mesh on a glowing pad. The scene
// bobs/spins it. Tagged for raycast-free handling (pickups are auto-grabbed).
export function makePickup(type, x, y) {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 0.05, 16),
    new THREE.MeshLambertMaterial({ color: 0xffd166, flatShading: true })
  );
  pad.position.y = 0.06;
  const weapon = makeWeapon(type);
  weapon.scale.multiplyScalar(1.25);
  weapon.position.y = 0.55;
  const holder = new THREE.Group();
  holder.add(weapon);
  holder.position.y = 0;
  g.add(pad, holder);
  g.position.set(x, 0, y);
  g.userData.holder = holder;
  g.userData.baseY = 0;
  return g;
}
