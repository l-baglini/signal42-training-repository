import * as THREE from 'three';
import { TILE, floorColor, makeFurniture, CATALOG_BY_TYPE } from './catalog.js';

// 3D drag-and-build editor. Orbit camera, grid-snapped ghost preview, click to
// place / paint, drag to move objects, R to rotate, Delete to remove. Produces a
// { width, height, tiles, objects } layout via getLayout().

const matCache = new Map();
function mat(c) {
  if (!matCache.has(c)) matCache.set(c, new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
  return matCache.get(c);
}
const box = (w, h, d, c) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));

export default class BuildScene {
  constructor({ canvas, layout, onStats }) {
    this.width = layout.width;
    this.height = layout.height;
    this.tiles = layout.tiles.map((r) => r.slice());
    this.onStats = onStats;
    this.brush = { kind: 'object', type: 'desk' };
    this.ghostRot = 0;
    this.disposed = false;

    this.tileMeshes = []; // [y][x] -> mesh
    this.objects = new Map(); // "x,y" -> { type, rot, mesh }
    this.selected = null;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xc7e6ff);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa3b2, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 0.5);
    sun.position.set(this.width, 24, this.height * 0.4);
    this.scene.add(sun);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
    this.camTarget = new THREE.Vector3(this.width / 2 - 0.5, 0, this.height / 2 - 0.5);
    this.orbitYaw = 0.0;
    this.orbitPitch = 1.05;
    this.radius = Math.max(this.width, this.height) * 1.1;

    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.clock = new THREE.Clock();

    // gridlines
    const grid = new THREE.GridHelper(Math.max(this.width, this.height), Math.max(this.width, this.height), 0x33415c, 0x99a6bb);
    grid.position.set(this.width / 2 - 0.5, 0.05, this.height / 2 - 0.5);
    grid.material.opacity = 0.35;
    grid.material.transparent = true;
    this.root.add(grid);

    // ghost preview
    this.ghost = new THREE.Group();
    this.scene.add(this.ghost);

    this._buildInitial(layout.objects);
    this._bind();
    this.resize();
    this._emitStats();
    this._loop();
  }

  _buildInitial(objects) {
    for (let y = 0; y < this.height; y++) {
      this.tileMeshes[y] = [];
      for (let x = 0; x < this.width; x++) this._renderTile(x, y);
    }
    for (const o of objects || []) {
      if (CATALOG_BY_TYPE[o.type]) this._placeObject(o.x, o.y, o.type, o.rot || 0, true);
    }
  }

  // ---- tiles ---------------------------------------------------------------

  _renderTile(x, y) {
    const old = this.tileMeshes[y][x];
    if (old) {
      this.root.remove(old);
    }
    const t = this.tiles[y][x];
    let mesh;
    if (t === TILE.WALL) {
      mesh = box(1, 2.2, 1, 0x8a93a5);
      mesh.position.set(x, 1.1, y);
    } else {
      mesh = box(0.98, 0.1, 0.98, floorColor(t, x, y));
      mesh.position.set(x, 0, y);
    }
    mesh.userData.tile = { x, y };
    this.root.add(mesh);
    this.tileMeshes[y][x] = mesh;
  }

  _paintTile(x, y, tile) {
    if (x <= 0 || y <= 0 || x >= this.width - 1 || y >= this.height - 1) return; // keep the border wall
    if (this.tiles[y][x] === tile) return;
    this.tiles[y][x] = tile;
    this._renderTile(x, y);
    // painting a wall removes any object sitting there
    if (tile === TILE.WALL) this._removeObject(x, y);
  }

  // ---- objects -------------------------------------------------------------

  _placeObject(x, y, type, rot, silent = false) {
    if (this.tiles[y][x] === TILE.WALL) return;
    this._removeObject(x, y);
    const mesh = makeFurniture(type);
    mesh.position.set(x, 0, y);
    mesh.rotation.y = rot * (Math.PI / 2);
    mesh.userData.object = true;
    this.root.add(mesh);
    this.objects.set(`${x},${y}`, { type, rot, mesh, x, y });
    if (!silent) this._emitStats();
  }

  _removeObject(x, y) {
    const key = `${x},${y}`;
    const o = this.objects.get(key);
    if (o) {
      this.root.remove(o.mesh);
      this.objects.delete(key);
      if (this.selected === o) this.selected = null;
      this._emitStats();
    }
  }

  _emitStats() {
    let deskCount = 0;
    for (const o of this.objects.values()) if (CATALOG_BY_TYPE[o.type]?.role === 'desk') deskCount++;
    this.onStats?.({ deskCount, objectCount: this.objects.size });
  }

  // ---- public API (React) --------------------------------------------------

  setBrush(brush) {
    this.brush = brush;
    this.selected = null;
    this._updateGhost();
  }

  rotate() {
    this.ghostRot = (this.ghostRot + 1) % 4;
    if (this.selected) {
      this.selected.rot = this.ghostRot;
      this.selected.mesh.rotation.y = this.ghostRot * (Math.PI / 2);
    }
    this._updateGhost();
  }

  deleteSelected() {
    if (this.selected) this._removeObject(this.selected.x, this.selected.y);
  }

  getLayout() {
    const objects = [...this.objects.values()].map((o) => ({ type: o.type, x: o.x, y: o.y, rot: o.rot }));
    return { width: this.width, height: this.height, tiles: this.tiles.map((r) => r.slice()), objects };
  }

  // ---- ghost ---------------------------------------------------------------

  _clearGhost() {
    while (this.ghost.children.length) this.ghost.remove(this.ghost.children[0]);
  }

  _updateGhost() {
    this._clearGhost();
    if (!this.hover) return;
    const { x, y } = this.hover;
    if (this.brush.kind === 'object') {
      const m = makeFurniture(this.brush.type);
      m.traverse((o) => {
        if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; }
      });
      m.rotation.y = this.ghostRot * (Math.PI / 2);
      const blocked = this.tiles[y][x] === TILE.WALL;
      if (blocked) m.traverse((o) => o.material && o.material.color?.setHex(0xff5555));
      this.ghost.add(m);
      this.ghost.position.set(x, 0, y);
    } else if (this.brush.kind === 'floor') {
      const ring = new THREE.Mesh(
        new THREE.BoxGeometry(1.02, 0.14, 1.02),
        new THREE.MeshBasicMaterial({ color: this.brush.tile === TILE.WALL ? 0x8a93a5 : 0xffd166, transparent: true, opacity: 0.4 })
      );
      this.ghost.add(ring);
      this.ghost.position.set(x, 0.1, y);
    }
  }

  // ---- input ---------------------------------------------------------------

  _bind() {
    const c = this.renderer.domElement;
    this._km = {};
    this._onContext = (e) => e.preventDefault();
    c.addEventListener('contextmenu', this._onContext);

    this._onDown = (e) => {
      if (e.button === 2 || e.button === 1) { // orbit / pan
        this.drag = { mode: e.button === 1 || e.shiftKey ? 'pan' : 'orbit', x: e.clientX, y: e.clientY };
        return;
      }
      if (e.button !== 0) return;
      this._updateHover(e);
      if (!this.hover) return;
      const { x, y } = this.hover;
      if (this.brush.kind === 'floor') { this.painting = this.brush.tile; this._paintTile(x, y, this.brush.tile); }
      else if (this.brush.kind === 'object') { this._placeObject(x, y, this.brush.type, this.ghostRot); }
      else if (this.brush.kind === 'tool' && this.brush.tool === 'erase') { this._eraseAt(e); }
      else if (this.brush.kind === 'tool' && this.brush.tool === 'move') { this._selectAt(e); this.movingSel = !!this.selected; }
    };
    this._onMove = (e) => {
      if (this.drag) {
        const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
        this.drag.x = e.clientX; this.drag.y = e.clientY;
        if (this.drag.mode === 'orbit') {
          this.orbitYaw -= dx * 0.01;
          this.orbitPitch = Math.max(0.4, Math.min(1.45, this.orbitPitch - dy * 0.005));
        } else {
          const f = this.radius * 0.0018;
          const right = new THREE.Vector3(Math.cos(this.orbitYaw), 0, -Math.sin(this.orbitYaw));
          const fwd = new THREE.Vector3(Math.sin(this.orbitYaw), 0, Math.cos(this.orbitYaw));
          this.camTarget.addScaledVector(right, -dx * f).addScaledVector(fwd, -dy * f);
        }
        return;
      }
      this._updateHover(e);
      this._updateGhost();
      if (this.painting != null && this.hover) this._paintTile(this.hover.x, this.hover.y, this.painting);
      if (this.movingSel && this.selected && this.hover) this._moveSelected(this.hover.x, this.hover.y);
    };
    this._onUp = () => { this.drag = null; this.painting = null; this.movingSel = false; };
    this._onWheel = (e) => { this.radius = Math.max(6, Math.min(60, this.radius + Math.sign(e.deltaY) * 2)); e.preventDefault(); };
    this._onKey = (e) => {
      if (e.key === 'r' || e.key === 'R') this.rotate();
      else if (e.key === 'Delete' || e.key === 'Backspace') this.deleteSelected();
    };

    c.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    c.addEventListener('wheel', this._onWheel, { passive: false });
    window.addEventListener('keydown', this._onKey);
  }

  _updateHover(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const p = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, p)) {
      const x = Math.round(p.x), y = Math.round(p.z);
      this.hover = x >= 0 && y >= 0 && x < this.width && y < this.height ? { x, y } : null;
    } else this.hover = null;
  }

  _pickObject(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes = [...this.objects.values()].map((o) => o.mesh);
    const hit = this.raycaster.intersectObjects(meshes, true)[0];
    if (!hit) return null;
    let obj = hit.object;
    while (obj && !obj.userData.object) obj = obj.parent;
    return [...this.objects.values()].find((o) => o.mesh === obj) || null;
  }

  _selectAt(e) {
    this.selected = this._pickObject(e);
    if (this.selected) this.ghostRot = this.selected.rot;
  }

  _eraseAt(e) {
    const o = this._pickObject(e);
    if (o) this._removeObject(o.x, o.y);
  }

  _moveSelected(x, y) {
    if (this.tiles[y][x] === TILE.WALL) return;
    if (this.objects.has(`${x},${y}`) && this.objects.get(`${x},${y}`) !== this.selected) return;
    const sel = this.selected;
    this.objects.delete(`${sel.x},${sel.y}`);
    sel.x = x; sel.y = y;
    sel.mesh.position.set(x, 0, y);
    this.objects.set(`${x},${y}`, sel);
  }

  resize() {
    const c = this.renderer.domElement;
    const w = c.clientWidth || window.innerWidth;
    const h = c.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _loop() {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(() => this._loop());
    const off = new THREE.Vector3(
      Math.sin(this.orbitYaw) * Math.cos(this.orbitPitch),
      Math.sin(this.orbitPitch),
      Math.cos(this.orbitYaw) * Math.cos(this.orbitPitch)
    ).multiplyScalar(this.radius);
    this.camera.position.copy(this.camTarget).add(off);
    this.camera.lookAt(this.camTarget);
    // pulse the selected object so you can see what's picked
    if (this.selected) {
      const s = 1 + Math.sin(this.clock.elapsedTime * 6) * 0.06;
      this.selected.mesh.scale.setScalar(s);
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    const c = this.renderer.domElement;
    c.removeEventListener('contextmenu', this._onContext);
    c.removeEventListener('pointerdown', this._onDown);
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    c.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('keydown', this._onKey);
    this.renderer.dispose();
  }
}
