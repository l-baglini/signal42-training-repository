import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileMap, DEFAULT_LAYOUT, validateLayout, TILE, chebyshev, MAX_DESKS } from '../src/game/map.js';

const MAP = compileMap(DEFAULT_LAYOUT);

test('default office compiles 20 desks', () => {
  assert.equal(MAP.desks.length, 20);
  assert.ok(MAP.desks.length <= MAX_DESKS);
});

test('desks are not walkable (solid), open floor is', () => {
  for (const d of MAP.desks) assert.equal(MAP.isWalkable(d.x, d.y), false);
  assert.equal(MAP.isWalkable(2, 2), true);
});

test('perimeter is walled', () => {
  for (let x = 0; x < MAP.width; x++) {
    assert.equal(MAP.grid[0][x], TILE.WALL);
    assert.equal(MAP.grid[MAP.height - 1][x], TILE.WALL);
  }
});

test('every desk has a walkable spawn point next to it', () => {
  for (const d of MAP.desks) {
    const s = MAP.spawnFor(d.deskIndex);
    assert.ok(MAP.isWalkable(s.x, s.y), `desk ${d.deskIndex} spawn blocked`);
    assert.ok(chebyshev(s.x, s.y, d.x, d.y) <= 1, `desk ${d.deskIndex} spawn too far`);
  }
});

test('rooms are reachable through doors', () => {
  const seen = new Set(['2,2']);
  const queue = [[2, 2]];
  while (queue.length) {
    const [x, y] = queue.pop();
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const k = `${x + dx},${y + dy}`;
      if (!seen.has(k) && MAP.isWalkable(x + dx, y + dy)) {
        seen.add(k);
        queue.push([x + dx, y + dy]);
      }
    }
  }
  // each labelled room region's centroid neighbourhood is reachable
  for (const room of MAP.rooms) {
    const cx = Math.round(room.cx);
    const cy = Math.round(room.cy);
    let reachable = false;
    for (let y = cy - 2; y <= cy + 2 && !reachable; y++) {
      for (let x = cx - 2; x <= cx + 2 && !reachable; x++) {
        if (MAP.isWalkable(x, y) && seen.has(`${x},${y}`)) reachable = true;
      }
    }
    assert.ok(reachable, `${room.name} unreachable`);
  }
});

test('isRoom detects rooms and open space', () => {
  assert.equal(MAP.isRoom(2, 2), false);
  assert.equal(MAP.isRoom(18, 3), true); // meeting room
  assert.equal(MAP.isRoom(18, 13), true); // kitchen
});

test('validateLayout rejects a deskless office', () => {
  const layout = { width: 12, height: 12, tiles: blankTiles(12, 12), objects: [] };
  assert.ok(validateLayout(layout).error);
});

test('validateLayout accepts a small valid office', () => {
  const tiles = blankTiles(12, 12);
  const layout = { width: 12, height: 12, tiles, objects: [{ type: 'desk', x: 5, y: 5, rot: 0 }] };
  const r = validateLayout(layout);
  assert.ok(r.ok, r.error);
  assert.equal(r.deskCount, 1);
});

test('validateLayout rejects an object inside a wall', () => {
  const layout = { width: 12, height: 12, tiles: blankTiles(12, 12), objects: [{ type: 'desk', x: 0, y: 0, rot: 0 }] };
  assert.ok(validateLayout(layout).error);
});

function blankTiles(w, h) {
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => (x === 0 || y === 0 || x === w - 1 || y === h - 1 ? TILE.WALL : TILE.OPEN))
  );
}
