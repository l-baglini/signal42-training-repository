import * as THREE from 'three';
import { makeTextSprite } from './sprites.js';
import { TILE, floorColor, makeFurniture } from './catalog.js';

// Cache materials by colour so 400+ floor tiles share a handful of materials.
const matCache = new Map();
function mat(color) {
  if (!matCache.has(color)) {
    matCache.set(color, new THREE.MeshLambertMaterial({ color, flatShading: true }));
  }
  return matCache.get(color);
}
const box = (w, h, d, color) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));

// ---- destructible desk ----------------------------------------------------

const WOOD = 0x9c6b43;
const WOOD_DARK = 0x7c5435;

// Returns { group, setStage(stage) }. Stages: 0 pristine .. 4 rubble.
function buildDesk() {
  const group = new THREE.Group();

  const top = box(0.92, 0.1, 0.62, WOOD); top.position.set(0, 0.56, 0);
  const legGeo = [
    [-0.4, -0.26], [0.4, -0.26], [-0.4, 0.26], [0.4, 0.26],
  ].map(([x, z]) => {
    const l = box(0.08, 0.52, 0.08, WOOD_DARK);
    l.position.set(x, 0.26, z);
    group.add(l);
    return l;
  });

  const drawers = box(0.34, 0.42, 0.5, WOOD_DARK); drawers.position.set(0.26, 0.3, 0);
  const monitorStand = box(0.06, 0.16, 0.06, 0x2b2f38); monitorStand.position.set(-0.18, 0.69, -0.12);
  const monitor = box(0.42, 0.28, 0.05, 0x20242c); monitor.position.set(-0.18, 0.86, -0.14);
  const screen = box(0.36, 0.22, 0.02, 0x4aa3e0); screen.position.set(-0.18, 0.86, -0.115);
  const keyboard = box(0.34, 0.03, 0.13, 0x3a3f4b); keyboard.position.set(-0.05, 0.62, 0.12);
  const mug = box(0.1, 0.12, 0.1, 0xe14b3b); mug.position.set(0.28, 0.67, 0.16);
  const papers = box(0.26, 0.02, 0.2, 0xf3f4f6); papers.position.set(0.12, 0.62, -0.1);
  const chair = new THREE.Group();
  const seat = box(0.34, 0.06, 0.34, 0x33415c); seat.position.y = 0.42;
  const backrest = box(0.34, 0.4, 0.06, 0x2a3550); backrest.position.set(0, 0.62, -0.16);
  chair.add(seat, backrest);
  chair.position.set(0, 0, 0.5);

  group.add(top, drawers, monitorStand, monitor, screen, keyboard, mug, papers, chair);

  // rubble (hidden until fully destroyed)
  const rubble = new THREE.Group();
  rubble.visible = false;
  for (const [x, y, z, s, col] of [
    [-0.2, 0.08, 0.1, 0.22, WOOD], [0.18, 0.1, -0.12, 0.26, WOOD_DARK],
    [0.0, 0.07, 0.2, 0.18, 0x20242c], [-0.28, 0.09, -0.18, 0.2, WOOD],
    [0.3, 0.06, 0.18, 0.16, 0x33415c],
  ]) {
    const r = box(s, s * 0.6, s, col);
    r.position.set(x, y, z);
    r.rotation.set(Math.random(), Math.random(), Math.random());
    rubble.add(r);
  }
  group.add(rubble);

  const breakables = { papers, mug, keyboard, monitor, screen, monitorStand, drawers, chair, top, legs: legGeo };

  function setStage(stage) {
    // reset to pristine, then apply cumulative damage for the stage
    papers.visible = stage < 1;
    mug.visible = stage < 1;
    keyboard.visible = stage < 2;
    const monitorDown = stage >= 2;
    monitorStand.visible = stage < 2;
    monitor.visible = screen.visible = stage < 4;
    if (monitorDown && stage < 4) {
      monitor.rotation.z = screen.rotation.z = 1.4;
      monitor.position.set(-0.05, 0.62, -0.05);
      screen.position.set(-0.03, 0.62, -0.05);
      screen.material = mat(0x12161c); // screen goes dark when knocked over
    } else {
      monitor.rotation.z = screen.rotation.z = 0;
      monitor.position.set(-0.18, 0.86, -0.14);
      screen.position.set(-0.18, 0.86, -0.115);
      screen.material = mat(0x4aa3e0);
    }
    drawers.position.x = stage >= 3 ? 0.5 : 0.26; // drawers burst out
    drawers.rotation.z = stage >= 3 ? 0.25 : 0;
    chair.rotation.z = stage >= 3 ? 1.3 : 0;
    chair.position.set(stage >= 3 ? 0.4 : 0, stage >= 3 ? 0.18 : 0, 0.5);
    top.rotation.z = stage >= 3 && stage < 4 ? 0.12 : 0;

    const wrecked = stage >= 4;
    top.visible = !wrecked;
    drawers.visible = !wrecked;
    chair.visible = !wrecked;
    keyboard.visible = !wrecked && stage < 2;
    for (const l of legGeo) l.visible = !wrecked;
    rubble.visible = wrecked;
  }

  return { group, setStage, breakables };
}

// ---- world ----------------------------------------------------------------

export function buildWorld(scene, map) {
  const root = new THREE.Group();
  scene.add(root);

  // lights — flat, bright low-poly look
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa3b2, 1.05));
  const sun = new THREE.DirectionalLight(0xffffff, 0.55);
  sun.position.set(map.width * 0.7, 22, map.height * 0.3);
  scene.add(sun);

  // ground slab beneath the office
  const ground = box(map.width + 8, 0.4, map.height + 8, 0x39424f);
  ground.position.set(map.width / 2 - 0.5, -0.22, map.height / 2 - 0.5);
  root.add(ground);

  const floorPicks = []; // for fire / extinguish raycasting
  const deskAPIs = new Map(); // deskIndex -> { setStage, group }
  const deskPicks = []; // desk hitboxes

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const t = map.grid[y][x];
      if (t === TILE.WALL) {
        const wall = box(1, 2.4, 1, 0x8a93a5);
        wall.position.set(x, 1.2, y);
        root.add(wall);
        continue;
      }
      const tile = box(0.98, 0.08, 0.98, floorColor(t, x, y));
      tile.position.set(x, 0, y);
      tile.userData.pickType = 'floor';
      tile.userData.gx = x;
      tile.userData.gy = y;
      root.add(tile);
      floorPicks.push(tile);
    }
  }

  // destructible player desks
  for (const desk of map.desks) {
    const { group, setStage } = buildDesk();
    group.position.set(desk.x, 0.04, desk.y);
    const hitbox = new THREE.Mesh(new THREE.BoxGeometry(1, 1.4, 1), new THREE.MeshBasicMaterial({ visible: false }));
    hitbox.position.y = 0.6;
    hitbox.userData.pickType = 'desk';
    hitbox.userData.deskIndex = desk.deskIndex;
    group.add(hitbox);
    root.add(group);
    deskAPIs.set(desk.deskIndex, { group, setStage });
    deskPicks.push(hitbox);
  }

  // static decorative furniture from the layout
  for (const o of map.decor || []) {
    const mesh = makeFurniture(o.type);
    mesh.position.set(o.x, 0, o.y);
    mesh.rotation.y = (o.rot || 0) * (Math.PI / 2);
    root.add(mesh);
  }

  // room name labels floating above each room region (centroid)
  for (const room of map.rooms || []) {
    const label = makeTextSprite(room.name.toUpperCase(), { color: '#33415c', fontSize: 40, scale: 1.3 });
    label.position.set(room.cx, 2.6, room.cy);
    root.add(label);
  }

  return { root, floorPicks, deskPicks, deskAPIs };
}
