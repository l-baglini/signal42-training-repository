import * as THREE from 'three';
import { makeWeapon, makeTool } from './weapons.js';

// Client mirror of the server's TILE enum (server/src/game/map.js)
export const TILE = { OPEN: 0, WALL: 1, MEETING: 3, KITCHEN: 4, SERVER: 5 };

const FLOOR_COLORS = {
  [TILE.OPEN]: [0xdfe4ec, 0xd2d8e2],
  [TILE.MEETING]: [0xa9c8ff, 0x9bbcf7],
  [TILE.KITCHEN]: [0xffe1a8, 0xf7d595],
  [TILE.SERVER]: [0xa9e7c4, 0x9bdcb6],
};
export function floorColor(tile, x = 0, y = 0) {
  const pair = FLOOR_COLORS[tile] || FLOOR_COLORS[TILE.OPEN];
  return pair[(x + y) % 2];
}

// Floor / structure brushes for the editor palette
export const FLOOR_BRUSHES = [
  { tile: TILE.OPEN, label: 'Open floor', emoji: '⬜', swatch: '#dfe4ec' },
  { tile: TILE.MEETING, label: 'Meeting', emoji: '🟦', swatch: '#a9c8ff' },
  { tile: TILE.KITCHEN, label: 'Kitchen', emoji: '🟨', swatch: '#ffe1a8' },
  { tile: TILE.SERVER, label: 'Server', emoji: '🟩', swatch: '#a9e7c4' },
  { tile: TILE.WALL, label: 'Wall', emoji: '🧱', swatch: '#8a93a5' },
];

// Placeable objects (palette + meshes). role: desk | weapon | decor.
export const CATALOG = [
  { type: 'desk', label: 'Desk', emoji: '🗄️', role: 'desk', cat: 'Essential' },
  { type: 'weapon_keyboard', label: 'Keyboard', emoji: '⌨️', role: 'weapon', cat: 'Weapons' },
  { type: 'weapon_stapler', label: 'Stapler', emoji: '📎', role: 'weapon', cat: 'Weapons' },
  { type: 'weapon_chair', label: 'Chair (wpn)', emoji: '🪑', role: 'weapon', cat: 'Weapons' },
  { type: 'weapon_monitor', label: 'Monitor (wpn)', emoji: '🖥️', role: 'weapon', cat: 'Weapons' },
  { type: 'meeting_table', label: 'Meeting table', emoji: '🪟', role: 'decor', cat: 'Furniture' },
  { type: 'couch', label: 'Couch', emoji: '🛋️', role: 'decor', cat: 'Furniture' },
  { type: 'plant', label: 'Plant', emoji: '🪴', role: 'decor', cat: 'Furniture' },
  { type: 'water_cooler', label: 'Water cooler', emoji: '🚰', role: 'decor', cat: 'Furniture' },
  { type: 'printer', label: 'Printer', emoji: '🖨️', role: 'decor', cat: 'Furniture' },
  { type: 'whiteboard', label: 'Whiteboard', emoji: '📋', role: 'decor', cat: 'Furniture' },
  { type: 'fridge', label: 'Fridge', emoji: '🧊', role: 'decor', cat: 'Furniture' },
  { type: 'server_rack', label: 'Server rack', emoji: '🗃️', role: 'decor', cat: 'Furniture' },
  { type: 'bookshelf', label: 'Bookshelf', emoji: '📚', role: 'decor', cat: 'Furniture' },
  { type: 'coffee_machine', label: 'Coffee', emoji: '☕', role: 'decor', cat: 'Furniture' },
  { type: 'tv', label: 'TV', emoji: '📺', role: 'decor', cat: 'Furniture' },
  { type: 'arcade', label: 'Arcade', emoji: '🕹️', role: 'decor', cat: 'Fun' },
  { type: 'vending', label: 'Vending', emoji: '🥤', role: 'decor', cat: 'Fun' },
  { type: 'extinguisher', label: 'Extinguisher', emoji: '🧯', role: 'decor', cat: 'Fun' },
  { type: 'rug', label: 'Rug', emoji: '🟫', role: 'decor', cat: 'Fun' },
  { type: 'box', label: 'Boxes', emoji: '📦', role: 'decor', cat: 'Fun' },
];
export const CATALOG_BY_TYPE = Object.fromEntries(CATALOG.map((c) => [c.type, c]));

const box = (w, h, d, color) =>
  new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color, flatShading: true }));

// Static furniture mesh for a type. The in-game destructible desk lives in
// world.js; this desk is the editor/preview look.
export function makeFurniture(type) {
  const g = new THREE.Group();
  switch (type) {
    case 'desk': {
      const top = box(0.9, 0.1, 0.6, 0x9c6b43); top.position.y = 0.56;
      for (const [x, z] of [[-0.38, -0.24], [0.38, -0.24], [-0.38, 0.24], [0.38, 0.24]]) {
        const l = box(0.08, 0.52, 0.08, 0x7c5435); l.position.set(x, 0.26, z); g.add(l);
      }
      const mon = box(0.42, 0.28, 0.05, 0x20242c); mon.position.set(-0.15, 0.84, -0.13);
      const scr = box(0.36, 0.22, 0.02, 0x4aa3e0); scr.position.set(-0.15, 0.84, -0.105);
      g.add(top, mon, scr);
      break;
    }
    case 'weapon_keyboard': case 'weapon_stapler': case 'weapon_chair': case 'weapon_monitor': {
      const w = makeWeapon(type.replace('weapon_', ''));
      w.scale.multiplyScalar(1.3); w.position.y = 0.35;
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 16), new THREE.MeshLambertMaterial({ color: 0xffd166 }));
      pad.position.y = 0.05;
      g.add(pad, w);
      break;
    }
    case 'extinguisher': {
      const t = makeTool('extinguisher'); t.scale.multiplyScalar(1.2); t.position.y = 0.3; g.add(t);
      break;
    }
    case 'meeting_table': {
      const top = box(1.4, 0.1, 0.8, 0x6b4e34); top.position.y = 0.55;
      for (const [x, z] of [[-0.6, -0.3], [0.6, -0.3], [-0.6, 0.3], [0.6, 0.3]]) {
        const l = box(0.1, 0.5, 0.1, 0x4e3a26); l.position.set(x, 0.25, z); g.add(l);
      }
      g.add(top);
      break;
    }
    case 'couch': {
      const seat = box(1.1, 0.3, 0.6, 0x3f7cac); seat.position.y = 0.2;
      const back = box(1.1, 0.4, 0.18, 0x356a94); back.position.set(0, 0.45, -0.21);
      const aL = box(0.18, 0.4, 0.6, 0x356a94); aL.position.set(-0.46, 0.35, 0);
      const aR = box(0.18, 0.4, 0.6, 0x356a94); aR.position.set(0.46, 0.35, 0);
      g.add(seat, back, aL, aR);
      break;
    }
    case 'plant': {
      const pot = box(0.34, 0.3, 0.34, 0xb5651d); pot.position.y = 0.15;
      for (const [x, y, z, r] of [[0, 0.7, 0, 0.28], [-0.18, 0.55, 0.1, 0.2], [0.18, 0.6, -0.1, 0.22]]) {
        const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), new THREE.MeshLambertMaterial({ color: 0x3fa34d, flatShading: true }));
        leaf.position.set(x, y, z); g.add(leaf);
      }
      g.add(pot);
      break;
    }
    case 'water_cooler': {
      const base = box(0.34, 0.6, 0.34, 0xeef2f6); base.position.y = 0.3;
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.4, 12), new THREE.MeshLambertMaterial({ color: 0x6cc6e8, transparent: true, opacity: 0.8 }));
      bottle.position.y = 0.78; g.add(base, bottle);
      break;
    }
    case 'printer': {
      const body = box(0.5, 0.4, 0.5, 0x3a3f4b); body.position.y = 0.2;
      const tray = box(0.4, 0.04, 0.3, 0xe9edf2); tray.position.set(0, 0.42, 0.12); g.add(body, tray);
      break;
    }
    case 'whiteboard': {
      const board = box(1.0, 0.7, 0.06, 0xf6f8fb); board.position.y = 0.75;
      const f1 = box(0.05, 0.75, 0.05, 0x6b7280); f1.position.set(-0.42, 0.37, 0);
      const f2 = box(0.05, 0.75, 0.05, 0x6b7280); f2.position.set(0.42, 0.37, 0); g.add(board, f1, f2);
      break;
    }
    case 'fridge': {
      const body = box(0.6, 1.2, 0.6, 0xeaf0f4); body.position.y = 0.6;
      const handle = box(0.05, 0.5, 0.05, 0x9aa3b2); handle.position.set(0.24, 0.7, 0.31);
      const seam = box(0.6, 0.03, 0.6, 0xc7cfd8); seam.position.y = 0.78; g.add(body, seam, handle);
      break;
    }
    case 'server_rack': {
      const body = box(0.6, 1.3, 0.6, 0x21262e); body.position.y = 0.65;
      g.add(body);
      for (let i = 0; i < 5; i++) {
        const led = box(0.05, 0.05, 0.02, i % 2 ? 0x49d17a : 0xf2c14e); led.position.set(-0.2 + (i % 3) * 0.12, 0.5 + i * 0.16, 0.31); g.add(led);
      }
      break;
    }
    case 'bookshelf': {
      const frame = box(0.7, 1.1, 0.3, 0x7c5435); frame.position.y = 0.55; g.add(frame);
      const cols = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6];
      for (let s = 0; s < 3; s++) for (let b = 0; b < 4; b++) {
        const book = box(0.12, 0.22, 0.22, cols[(s + b) % cols.length]); book.position.set(-0.24 + b * 0.16, 0.35 + s * 0.34, 0.05); g.add(book);
      }
      break;
    }
    case 'coffee_machine': {
      const body = box(0.4, 0.5, 0.4, 0x2b2f38); body.position.y = 0.25;
      const cup = box(0.12, 0.12, 0.12, 0xffffff); cup.position.set(0, 0.36, 0.18);
      const btn = box(0.3, 0.04, 0.04, 0xe14b3b); btn.position.set(0, 0.5, 0.18); g.add(body, cup, btn);
      break;
    }
    case 'tv': {
      const stand = box(0.6, 0.1, 0.3, 0x33415c); stand.position.y = 0.06;
      const post = box(0.1, 0.4, 0.1, 0x33415c); post.position.y = 0.3;
      const screen = box(0.9, 0.55, 0.06, 0x16161a); screen.position.y = 0.78;
      const glow = box(0.82, 0.47, 0.02, 0x4aa3e0); glow.position.set(0, 0.78, 0.04); g.add(stand, post, screen, glow);
      break;
    }
    case 'arcade': {
      const cab = box(0.55, 1.2, 0.5, 0x6a2c91); cab.position.y = 0.6;
      const screen = box(0.42, 0.4, 0.05, 0x16161a); screen.position.set(0, 0.9, 0.24);
      const glow = box(0.36, 0.32, 0.02, 0xff5db1); glow.position.set(0, 0.9, 0.27);
      const panel = box(0.5, 0.06, 0.3, 0x222); panel.position.set(0, 0.62, 0.2); g.add(cab, screen, glow, panel);
      break;
    }
    case 'vending': {
      const body = box(0.6, 1.3, 0.5, 0xc0392b); body.position.y = 0.65;
      const win = box(0.42, 0.9, 0.05, 0x16161a); win.position.set(-0.05, 0.75, 0.24);
      g.add(body, win);
      const cols = [0xf1c40f, 0x2ecc71, 0x3498db, 0xffffff];
      for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) {
        const item = box(0.1, 0.12, 0.02, cols[(r + c) % cols.length]); item.position.set(-0.16 + c * 0.12, 0.45 + r * 0.18, 0.27); g.add(item);
      }
      break;
    }
    case 'rug': {
      const rug = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.03, 20), new THREE.MeshLambertMaterial({ color: 0xb5651d }));
      rug.position.y = 0.025;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.04, 8, 24), new THREE.MeshLambertMaterial({ color: 0xe8c39e }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.04; g.add(rug, ring);
      break;
    }
    case 'box': {
      const b1 = box(0.45, 0.45, 0.45, 0xb5824a); b1.position.y = 0.23;
      const b2 = box(0.35, 0.35, 0.35, 0xc8975c); b2.position.set(0.14, 0.62, -0.08); b2.rotation.y = 0.3;
      g.add(b1, b2);
      break;
    }
    default:
      g.add(box(0.5, 0.5, 0.5, 0xcccccc));
  }
  return g;
}
