// Fetch map.json and build render meshes + AABB colliders from the SAME box data,
// so rendering and collision can never drift (SPEC §7).
import * as THREE from 'three';

export async function loadMap(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetching ${url}: HTTP ${res.status}`);
  const data = await res.json();

  const group = new THREE.Group();
  const colliders = [];
  const { min, max } = data.bounds;
  const width = max.x - min.x;
  const depth = max.z - min.z;
  const height = max.y - min.y;

  // Floor at bounds.min.y, with a grid so motion is readable against it.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshLambertMaterial({ color: 0x2a2e36 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((min.x + max.x) / 2, min.y, (min.z + max.z) / 2);
  group.add(floor);
  const grid = new THREE.GridHelper(Math.max(width, depth), 25, 0x4a5568, 0x3a4250);
  grid.position.y = min.y + 0.01;
  group.add(grid);

  // Bounding walls sit just OUTSIDE the bounds so their inner faces lie exactly on
  // the bound planes. They are render-only: the player clamps to `bounds` (Step 2).
  const t = 1;
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x3a4250 });
  const wallY = min.y + height / 2;
  const cx = (min.x + max.x) / 2;
  const cz = (min.z + max.z) / 2;
  const wallSpecs = [
    { x: cx, z: min.z - t / 2, sx: width + 2 * t, sz: t },
    { x: cx, z: max.z + t / 2, sx: width + 2 * t, sz: t },
    { x: min.x - t / 2, z: cz, sx: t, sz: depth },
    { x: max.x + t / 2, z: cz, sx: t, sz: depth },
  ];
  for (const w of wallSpecs) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w.sx, height, w.sz), wallMat);
    wall.position.set(w.x, wallY, w.z);
    group.add(wall);
  }

  // Obstacle boxes: AABBs centred at pos with full extents size — mesh and collider
  // are built from the same numbers.
  for (const b of data.boxes) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(b.size.x, b.size.y, b.size.z),
      new THREE.MeshLambertMaterial({ color: b.color })
    );
    mesh.position.set(b.pos.x, b.pos.y, b.pos.z);
    group.add(mesh);
    colliders.push({
      min: { x: b.pos.x - b.size.x / 2, y: b.pos.y - b.size.y / 2, z: b.pos.z - b.size.z / 2 },
      max: { x: b.pos.x + b.size.x / 2, y: b.pos.y + b.size.y / 2, z: b.pos.z + b.size.z / 2 },
    });
  }

  return { name: data.name, bounds: data.bounds, spawns: data.spawns, group, colliders };
}
