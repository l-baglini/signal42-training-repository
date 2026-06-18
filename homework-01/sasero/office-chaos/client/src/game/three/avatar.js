import * as THREE from 'three';
import { SKIN_TONES, HAIR_COLORS, OUTFITS, DEFAULT_AVATAR } from '../../avatar/parts.js';
import { roundRect } from './sprites.js';

// Krunker-style blocky humanoid: built entirely from boxes with flat low-poly
// shading, coloured from the player's avatar config (skin / hair / outfit).

const box = (w, h, d, color) =>
  new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color, flatShading: true }));

function addHair(group, style, colorHex) {
  const color = new THREE.Color(colorHex);
  const mk = (w, h, d, x, y, z) => {
    const m = box(w, h, d, color);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  switch (style) {
    case 0:
      break; // bald
    case 1: // buzz
      mk(0.54, 0.12, 0.54, 0, 1.82, 0);
      break;
    case 2: // bob
      mk(0.56, 0.24, 0.56, 0, 1.78, -0.02);
      mk(0.58, 0.34, 0.14, 0, 1.62, -0.24);
      break;
    case 3: // spiky
      mk(0.54, 0.1, 0.54, 0, 1.8, 0);
      for (let i = 0; i < 4; i++) mk(0.1, 0.2, 0.1, -0.18 + i * 0.12, 1.95, 0);
      break;
    case 4: // long
      mk(0.58, 0.22, 0.58, 0, 1.79, 0);
      mk(0.14, 0.55, 0.58, -0.26, 1.5, -0.02);
      mk(0.14, 0.55, 0.58, 0.26, 1.5, -0.02);
      break;
    case 5: // curly
      [[-0.17, 1.86, 0.12], [0.17, 1.86, 0.12], [0, 1.94, 0], [-0.24, 1.8, -0.12], [0.24, 1.8, -0.12]].forEach(
        ([x, y, z]) => mk(0.22, 0.22, 0.22, x, y, z)
      );
      break;
    case 6: // mohawk
      mk(0.12, 0.28, 0.5, 0, 1.95, 0);
      break;
    case 7: // ponytail
      mk(0.58, 0.2, 0.58, 0, 1.8, 0);
      mk(0.16, 0.42, 0.16, 0, 1.55, -0.36);
      break;
    default:
      break;
  }
}

export function buildAvatar(config) {
  const c = { ...DEFAULT_AVATAR, ...(config || {}) };
  const skin = new THREE.Color(SKIN_TONES[c.skin] || SKIN_TONES[1]);
  const outfit = OUTFITS[c.outfit] || OUTFITS[0];
  const body = new THREE.Color(outfit.body);
  const accent = new THREE.Color(outfit.accent);
  const pants = new THREE.Color(0x33415c);

  const g = new THREE.Group();

  // Limbs hang from a joint pivot (hip / shoulder) so rotating the pivot swings
  // the whole limb naturally — that's what the scene's walk cycle drives.
  const limb = (w, h, d, color, jointX, jointY) => {
    const pivot = new THREE.Group();
    pivot.position.set(jointX, jointY, 0);
    const mesh = box(w, h, d, color);
    mesh.position.set(0, -h / 2, 0); // hang downward from the joint
    pivot.add(mesh);
    return pivot;
  };

  // legs: hips at y = 0.6, feet reach the floor
  const legL = limb(0.2, 0.6, 0.22, pants, -0.13, 0.6);
  const legR = limb(0.2, 0.6, 0.22, pants, 0.13, 0.6);

  const torso = box(0.6, 0.7, 0.34, body); torso.position.set(0, 0.95, 0);
  const acc = box(c.outfit === 1 ? 0.12 : 0.08, 0.5, 0.02, accent); acc.position.set(0, 0.95, 0.18);

  // arms: shoulders at y = 1.28, with a hand at the wrist
  const armL = limb(0.16, 0.6, 0.18, body, -0.39, 1.28);
  const armR = limb(0.16, 0.6, 0.18, body, 0.39, 1.28);
  const handL = box(0.17, 0.16, 0.19, skin); handL.position.set(0, -0.66, 0); armL.add(handL);
  const handR = box(0.17, 0.16, 0.19, skin); handR.position.set(0, -0.66, 0); armR.add(handR);

  const head = box(0.5, 0.5, 0.5, skin); head.position.set(0, 1.55, 0);

  const eyeGeo = new THREE.BoxGeometry(0.08, 0.1, 0.04);
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0x16161a });
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.12, 1.58, 0.255);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.12, 1.58, 0.255);

  g.add(legL, legR, torso, acc, armL, armR, head, eyeL, eyeR);
  addHair(g, c.hair, HAIR_COLORS[c.hairColor] || HAIR_COLORS[0]);

  // The avatar's "front" (face/eyes) is +Z; the scene rotates the group to face
  // the movement direction. Limb pivots are exposed so the scene can animate the
  // walk cycle (arms + legs) and the attack swing (armR).
  g.userData.parts = { armR, armL, legR, legL, head };
  return g;
}

// Floating status panel above each avatar: name + badges, HP hearts, stress bar.
// Redrawn into one canvas texture whenever the player's state changes.
export function makeStatusSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 140;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.0, 1.1, 1);
  sprite.position.y = 2.45;
  sprite.renderOrder = 999;

  function update({ name, hp = 3, stress = 0, ko, isMe, afk, rage, wanted }) {
    ctx.clearRect(0, 0, 256, 140);
    let badges = '';
    if (wanted) badges += '🚨';
    if (rage) badges += '😡';
    if (afk) badges += '💤';
    const label = (badges ? badges + ' ' : '') + name;

    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = Math.min(248, ctx.measureText(label).width + 26);
    ctx.fillStyle = 'rgba(20,28,40,0.82)';
    roundRect(ctx, 128 - w / 2, 6, w, 36, 9);
    ctx.fill();
    ctx.fillStyle = isMe ? '#ffd166' : '#ffffff';
    ctx.fillText(label, 128, 25);

    ctx.font = '22px system-ui, sans-serif';
    ctx.fillText(ko ? '💫' : '❤️'.repeat(Math.max(0, hp)), 128, 66);

    const bx = 60, by = 92, bw = 136, bh = 14;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, bx, by, bw, bh, 7);
    ctx.fill();
    const r = Math.max(0, Math.min(1, stress / 100));
    ctx.fillStyle = r > 0.75 ? '#e63946' : r > 0.4 ? '#f4a261' : '#2a9d8f';
    roundRect(ctx, bx, by, bw * r, bh, 7);
    ctx.fill();

    tex.needsUpdate = true;
  }

  return { sprite, update };
}
