// Maps are data: a workspace stores a { width, height, tiles, objects } layout
// (built in the 3D editor). compileMap() turns that layout into the runtime map
// used by the authoritative engine, and projects a client-friendly view for the
// renderer. A null layout falls back to DEFAULT_LAYOUT (the classic office).

export const TILE = {
  OPEN: 0, // open-plan floor
  WALL: 1,
  MEETING: 3,
  KITCHEN: 4,
  SERVER: 5,
};

export const ROOM_NAMES = {
  [TILE.MEETING]: 'Meeting Room',
  [TILE.KITCHEN]: 'Kitchen',
  [TILE.SERVER]: 'Server Room',
};

// Server-side object metadata (the client has the matching meshes in catalog.js).
// role: 'desk' (player desk, destructible), 'weapon' (pickup spawn), or 'decor'.
// solid objects block movement on their tile.
export const OBJECT_DEFS = {
  desk: { role: 'desk', solid: true },
  weapon_keyboard: { role: 'weapon', weaponType: 'keyboard', solid: false },
  weapon_stapler: { role: 'weapon', weaponType: 'stapler', solid: false },
  weapon_chair: { role: 'weapon', weaponType: 'chair', solid: false },
  weapon_monitor: { role: 'weapon', weaponType: 'monitor', solid: false },
  plant: { role: 'decor', solid: true },
  couch: { role: 'decor', solid: true },
  water_cooler: { role: 'decor', solid: true },
  printer: { role: 'decor', solid: true },
  whiteboard: { role: 'decor', solid: true },
  fridge: { role: 'decor', solid: true },
  server_rack: { role: 'decor', solid: true },
  bookshelf: { role: 'decor', solid: true },
  coffee_machine: { role: 'decor', solid: true },
  tv: { role: 'decor', solid: true },
  arcade: { role: 'decor', solid: true },
  vending: { role: 'decor', solid: true },
  meeting_table: { role: 'decor', solid: true },
  extinguisher: { role: 'decor', solid: false },
  rug: { role: 'decor', solid: false },
  box: { role: 'decor', solid: true },
};

export const MAX_DESKS = 20; // FR-8.4

export function chebyshev(ax, ay, bx, by) {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}
export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

// ---- default office (back-compat + fallback) ------------------------------

export function buildDefaultLayout() {
  const W = 24;
  const H = 18;
  const tiles = Array.from({ length: H }, () => Array(W).fill(TILE.OPEN));

  for (let x = 0; x < W; x++) {
    tiles[0][x] = TILE.WALL;
    tiles[H - 1][x] = TILE.WALL;
  }
  for (let y = 0; y < H; y++) {
    tiles[y][0] = TILE.WALL;
    tiles[y][W - 1] = TILE.WALL;
  }
  // divider with three doors
  const doors = new Set([3, 8, 13]);
  for (let y = 1; y < H - 1; y++) if (!doors.has(y)) tiles[y][14] = TILE.WALL;

  const rooms = [
    { tile: TILE.MEETING, x1: 15, y1: 1, x2: 22, y2: 6 },
    { tile: TILE.SERVER, x1: 15, y1: 8, x2: 22, y2: 9 },
    { tile: TILE.KITCHEN, x1: 15, y1: 11, x2: 22, y2: 16 },
  ];
  for (const r of rooms) for (let y = r.y1; y <= r.y2; y++) for (let x = r.x1; x <= r.x2; x++) tiles[y][x] = r.tile;
  for (let x = 15; x < W - 1; x++) {
    if (x !== 18) {
      tiles[7][x] = TILE.WALL;
      tiles[10][x] = TILE.WALL;
    }
  }

  const objects = [];
  for (const y of [3, 6, 9, 12]) for (const x of [3, 5, 7, 9, 11]) objects.push({ type: 'desk', x, y, rot: 0 });
  objects.push({ type: 'weapon_keyboard', x: 2, y: 2, rot: 0 });
  objects.push({ type: 'weapon_stapler', x: 12, y: 2, rot: 0 });
  objects.push({ type: 'weapon_chair', x: 2, y: 12, rot: 0 });
  objects.push({ type: 'weapon_monitor', x: 18, y: 3, rot: 0 });
  objects.push({ type: 'weapon_chair', x: 12, y: 9, rot: 0 });
  objects.push({ type: 'weapon_keyboard', x: 18, y: 13, rot: 0 });
  objects.push({ type: 'water_cooler', x: 16, y: 13, rot: 0 });
  objects.push({ type: 'plant', x: 2, y: 8, rot: 0 });
  objects.push({ type: 'meeting_table', x: 18, y: 4, rot: 0 });
  objects.push({ type: 'server_rack', x: 20, y: 9, rot: 0 });

  return { width: W, height: H, tiles, objects };
}

export const DEFAULT_LAYOUT = buildDefaultLayout();

// ---- compile a layout into the runtime map --------------------------------

export function compileMap(layout) {
  const L = normalizeLayout(layout);
  const { width, height, tiles } = L;

  const solid = new Set();
  const desks = [];
  const weaponSpawns = [];
  const decor = [];

  let deskIndex = 0;
  let weaponIndex = 0;
  for (const o of L.objects) {
    const def = OBJECT_DEFS[o.type];
    if (!def) continue;
    if (def.solid) solid.add(`${o.x},${o.y}`);
    if (def.role === 'desk') {
      desks.push({ deskIndex: deskIndex++, x: o.x, y: o.y }); // rendered as destructible desks
    } else if (def.role === 'weapon') {
      weaponSpawns.push({ id: `w${weaponIndex++}`, type: def.weaponType, x: o.x, y: o.y }); // rendered as dynamic pickups
    } else {
      decor.push({ type: o.type, x: o.x, y: o.y, rot: o.rot || 0 }); // static furniture
    }
  }

  // room label regions: centroid of each contiguous non-open room area
  const rooms = computeRoomLabels(tiles, width, height);

  const inBounds = (x, y) => x >= 0 && y >= 0 && x < width && y < height;
  const tileAt = (x, y) => (inBounds(x, y) ? tiles[y][x] : TILE.WALL);
  const isWalkable = (x, y) => inBounds(x, y) && tiles[y][x] !== TILE.WALL && !solid.has(`${x},${y}`);
  const isRoom = (x, y) => {
    const t = tileAt(x, y);
    return t === TILE.MEETING || t === TILE.KITCHEN || t === TILE.SERVER;
  };

  function spawnFor(idx) {
    const desk = desks.find((d) => d.deskIndex === idx);
    if (!desk) {
      // no such desk — drop them on any walkable tile
      for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) if (isWalkable(x, y)) return { x, y };
      return { x: 1, y: 1 };
    }
    const around = [
      [desk.x, desk.y + 1], [desk.x, desk.y - 1], [desk.x + 1, desk.y], [desk.x - 1, desk.y],
      [desk.x + 1, desk.y + 1], [desk.x - 1, desk.y - 1], [desk.x + 1, desk.y - 1], [desk.x - 1, desk.y + 1],
    ];
    for (const [x, y] of around) if (isWalkable(x, y)) return { x, y };
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) if (isWalkable(x, y)) return { x, y };
    return { x: 1, y: 1 };
  }

  // Circle-vs-tile collision (tiles centred on integer coords; cell [i-0.5, i+0.5])
  function circleClear(x, y, r) {
    for (let ty = Math.round(y - r); ty <= Math.round(y + r); ty++) {
      for (let tx = Math.round(x - r); tx <= Math.round(x + r); tx++) {
        if (!isWalkable(tx, ty)) {
          const cx = Math.max(tx - 0.5, Math.min(x, tx + 0.5));
          const cy = Math.max(ty - 0.5, Math.min(y, ty + 0.5));
          if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return false;
        }
      }
    }
    return true;
  }

  return {
    width,
    height,
    grid: tiles,
    desks,
    weaponSpawns,
    decor,
    rooms,
    inBounds,
    isWalkable,
    isRoom,
    roomNameAt: (x, y) => ROOM_NAMES[tileAt(x, y)] || null,
    spawnFor,
    circleClear,
    deskByIndex: (idx) => desks.find((d) => d.deskIndex === idx) || null,
    // projection sent to the browser renderer
    clientMap() {
      return { width, height, grid: tiles, desks, decor, rooms };
    },
  };
}

function normalizeLayout(layout) {
  const L = layout && Array.isArray(layout.tiles) ? layout : DEFAULT_LAYOUT;
  const width = L.width;
  const height = L.height;
  // force a solid perimeter so nobody walks off the map
  const tiles = L.tiles.map((row) => row.slice());
  for (let x = 0; x < width; x++) {
    tiles[0][x] = TILE.WALL;
    tiles[height - 1][x] = TILE.WALL;
  }
  for (let y = 0; y < height; y++) {
    tiles[y][0] = TILE.WALL;
    tiles[y][width - 1] = TILE.WALL;
  }
  const objects = Array.isArray(L.objects) ? L.objects.filter((o) => OBJECT_DEFS[o?.type] && Number.isInteger(o.x) && Number.isInteger(o.y)) : [];
  return { width, height, tiles, objects };
}

function computeRoomLabels(tiles, width, height) {
  const seen = Array.from({ length: height }, () => Array(width).fill(false));
  const labels = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = tiles[y][x];
      if (seen[y][x] || !ROOM_NAMES[t]) continue;
      // flood fill the contiguous region of this room type
      let sx = 0, sy = 0, n = 0;
      const stack = [[x, y]];
      seen[y][x] = true;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        sx += cx; sy += cy; n++;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height && !seen[ny][nx] && tiles[ny][nx] === t) {
            seen[ny][nx] = true;
            stack.push([nx, ny]);
          }
        }
      }
      if (n >= 2) labels.push({ name: ROOM_NAMES[t], cx: sx / n, cy: sy / n });
    }
  }
  return labels;
}

// Validate a layout submitted from the editor. Returns { ok } or { error }.
export function validateLayout(layout) {
  if (!layout || typeof layout !== 'object') return { error: 'Missing layout' };
  const { width, height, tiles, objects } = layout;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 10 || height < 10 || width > 48 || height > 48) {
    return { error: 'Invalid office size' };
  }
  if (!Array.isArray(tiles) || tiles.length !== height || tiles.some((r) => !Array.isArray(r) || r.length !== width)) {
    return { error: 'Invalid floor grid' };
  }
  const valid = new Set(Object.values(TILE));
  if (tiles.some((row) => row.some((t) => !valid.has(t)))) return { error: 'Invalid floor tile' };
  if (!Array.isArray(objects)) return { error: 'Invalid objects' };
  for (const o of objects) {
    if (!OBJECT_DEFS[o?.type]) return { error: `Unknown object: ${o?.type}` };
    if (!Number.isInteger(o.x) || !Number.isInteger(o.y) || o.x < 0 || o.y < 0 || o.x >= width || o.y >= height) {
      return { error: 'Object out of bounds' };
    }
    if (tiles[o.y][o.x] === TILE.WALL) return { error: 'An object sits inside a wall' };
  }
  const desks = objects.filter((o) => OBJECT_DEFS[o.type]?.role === 'desk');
  if (desks.length < 1) return { error: 'Place at least one desk — players spawn at desks' };
  if (desks.length > MAX_DESKS) return { error: `Too many desks (max ${MAX_DESKS})` };

  // every desk needs a walkable neighbour to spawn onto
  const compiled = compileMap(layout);
  for (const d of compiled.desks) {
    const ok = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => compiled.isWalkable(d.x + dx, d.y + dy));
    if (!ok) return { error: 'A desk is walled in with no space to stand next to it' };
  }
  return { ok: true, deskCount: desks.length };
}
