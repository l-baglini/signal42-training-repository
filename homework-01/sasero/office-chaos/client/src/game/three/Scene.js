import * as THREE from 'three';
import { buildWorld } from './world.js';
import { buildAvatar, makeStatusSprite } from './avatar.js';
import { makeWeapon, makeTool, makePickup } from './weapons.js';
import { DebrisSystem, FloatTextSystem, FireSystem, SmokeSystem } from './effects.js';

const PLAYER_SPEED = 4.2; // mirror of server C.PLAYER_SPEED for client prediction
const RAGE_SPEED_MULT = 1.5;
// sprint mirror (must match server constants.js)
const SPRINT = { MULT: 1.6, MAX: 100, DRAIN: 25, REGEN: 16, DELAY_MS: 700, MIN_START: 15 };
const UP = new THREE.Vector3(0, 1, 0);

const DEBRIS_BY_STAGE = {
  1: { colors: [0xf3f4f6, 0xe14b3b], count: 12 },
  2: { colors: [0x20242c, 0x4aa3e0], count: 14 },
  3: { colors: [0x7c5435, 0x33415c], count: 14 },
  4: { colors: [0x9c6b43, 0x7c5435, 0x20242c], count: 22 },
};

// server facing θ (tile-space atan2(dy,dx)) → avatar yaw (avatar faces +Z at yaw 0)
const yawFromFacing = (theta) => Math.atan2(Math.cos(theta), Math.sin(theta));

export default class OfficeScene3D {
  constructor({ canvas, map, socket, meId, workspaceId, bridge }) {
    this.map = map;
    this.socket = socket;
    this.meId = meId;
    this.workspaceId = workspaceId;
    this.bridge = bridge;
    this.players = new Map();
    this.pickups = new Map(); // weaponSpawnId -> mesh
    this.keys = new Set();
    this.lastInput = { x: 0, y: 0 };
    this.lastInputSent = 0;
    // local mirror of sprint stamina (server is authoritative; this drives the
    // HUD bar and movement prediction so sprint feels responsive)
    this.sprintHeld = false;
    this.stamina = SPRINT.MAX;
    this.staminaLocked = false;
    this.lastDrainAt = 0;
    this.lastStaminaPush = 0;
    this.shake = 0;
    this.orbitYaw = 0;
    this.orbitPitch = 0.92;
    this.radius = 11;
    this.dragging = false;
    this.disposed = false;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbfe3ff);
    this.scene.fog = new THREE.Fog(0xbfe3ff, 38, 70);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
    this.camTarget = new THREE.Vector3(map.width / 2, 1, map.height / 2);
    this.camera.position.set(map.width / 2, 14, map.height + 6);
    this.camera.lookAt(this.camTarget);
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    const world = buildWorld(this.scene, map);
    this.floorPicks = world.floorPicks;
    this.deskPicks = world.deskPicks;
    this.deskAPIs = world.deskAPIs;

    this.debris = new DebrisSystem(this.scene);
    this.floatText = new FloatTextSystem(this.scene, this.camera);
    this.fire = new FireSystem(this.scene);
    this.smoke = new SmokeSystem(this.scene);
    this.spraying = null; // active tool slot while the mouse is held (2 ext / 3 lighter)
    this.lastSprayAt = 0;
    this.aimClient = null; // last pointer position (client px) for hold-to-spray aiming

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.clock = new THREE.Clock();

    this._bind();
    this._wireSocket();
    this.resize();

    this.socket.emit('join', { workspaceId }, (res) => {
      if (this.disposed) return;
      if (res?.error) return this.bridge.onError(res.error);
      this._applySnapshot(res.state);
      this.bridge.onJoined?.(res.state);
    });

    this._loop();
  }

  // ---- setup ---------------------------------------------------------------

  _bind() {
    const c = this.renderer.domElement;
    this._onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        this.keys.add(k);
        e.preventDefault();
      } else if (k === '1' || k === '2' || k === '3') {
        this.selectSlot(Number(k)); // 1 weapon/hands · 2 extinguisher · 3 lighter
      } else if (e.key === 'Shift' && !this.sprintHeld) {
        this.sprintHeld = true;
        this.socket.emit('sprint', { on: true });
      }
    };
    this._onKeyUp = (e) => {
      this.keys.delete(e.key.toLowerCase());
      if (e.key === 'Shift' && this.sprintHeld) {
        this.sprintHeld = false;
        this.socket.emit('sprint', { on: false });
      }
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);

    this._onPointerDown = (e) => {
      if (e.button === 2 || e.button === 1) {
        this.dragging = true;
        this.lastDrag = { x: e.clientX, y: e.clientY };
      } else if (e.button === 0) {
        this.clickStart = { x: e.clientX, y: e.clientY };
        this.aimClient = { x: e.clientX, y: e.clientY };
        // extinguisher (2) / lighter (3): hold to keep spraying — fire on the next loop tick
        const slot = this.bridge.slotRef.current || 1;
        if (slot === 2 || slot === 3) { this.spraying = slot; this.lastSprayAt = 0; }
      }
    };
    this._onPointerMove = (e) => {
      this.aimClient = { x: e.clientX, y: e.clientY };
      if (this.dragging) {
        this.orbitYaw -= (e.clientX - this.lastDrag.x) * 0.01;
        this.orbitPitch = Math.max(0.35, Math.min(1.4, this.orbitPitch - (e.clientY - this.lastDrag.y) * 0.005));
        this.lastDrag = { x: e.clientX, y: e.clientY };
      }
    };
    this._onPointerUp = (e) => {
      if (e.button === 0 && this.clickStart) {
        const moved = Math.hypot(e.clientX - this.clickStart.x, e.clientY - this.clickStart.y);
        // single click only matters for slot 1 (attack/desk); slots 2/3 sprayed via hold
        if (moved < 6 && !this.spraying) this._handleClick(e);
        this.clickStart = null;
      }
      this.spraying = null;
      this.dragging = false;
    };
    this._onWheel = (e) => {
      this.radius = Math.max(5, Math.min(20, this.radius + Math.sign(e.deltaY) * 1.2));
      e.preventDefault();
    };
    this._onContext = (e) => e.preventDefault();

    c.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    c.addEventListener('wheel', this._onWheel, { passive: false });
    c.addEventListener('contextmenu', this._onContext);
  }

  resize() {
    const c = this.renderer.domElement;
    const w = c.clientWidth || window.innerWidth;
    const h = c.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---- input → action ------------------------------------------------------

  _setPointer(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  _groundPoint() {
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.groundPlane, p) ? p : null;
  }

  // Tile under a client-space point (for hold-to-spray aiming)
  _groundTile(client) {
    if (!client) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((client.x - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((client.y - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const p = this._groundPoint();
    if (!p) return null;
    const x = Math.round(p.x);
    const y = Math.round(p.z);
    return x >= 0 && y >= 0 && x < this.map.width && y < this.map.height ? { x, y } : null;
  }

  // Slot 2/3 spray tick — emit the tool action at the aimed tile while held.
  _sprayTick() {
    const me = this.players.get(this.meId);
    if (!me || me.data.state !== 'alive') return;
    const tile = this._groundTile(this.aimClient);
    if (!tile) return;
    const event = this.spraying === 3 ? 'fire:ignite' : 'fire:extinguish';
    this.socket.emit(event, { x: tile.x, y: tile.y }); // errors are silent while holding
    me.targetYaw = Math.atan2(tile.x - me.group.position.x, tile.y - me.group.position.z);
    this._triggerSwing(this.meId, 0.6);
    if (this.spraying === 2) {
      const to = new THREE.Vector3(tile.x, 0.5, tile.y);
      const mid = me.group.position.clone().setY(1.0).lerp(to, 0.65);
      this.smoke.puff(mid, { count: 2, spread: 0.35 });
      this.smoke.puff(to, { count: 2, spread: 0.55 });
    }
  }

  _handleClick(e) {
    this._setPointer(e);

    // Slot 1 (weapon / hands):
    // 1) clicked an enemy → swing at them
    const playerHit = this.raycaster.intersectObjects(this._playerGroups(), true)[0];
    if (playerHit) {
      const d = this._resolve(playerHit.object);
      const v = d && this.players.get(d.userId);
      if (v && d.userId !== this.meId) return this._attack(v.group.position.x, v.group.position.z);
    }
    // 2) clicked a desk → whack it
    const deskHit = this.raycaster.intersectObjects(this.deskPicks, false)[0];
    if (deskHit) {
      this.socket.emit('desk:destroy', { deskIndex: deskHit.object.userData.deskIndex }, (res) =>
        res?.error && this.bridge.onError(res.error)
      );
      return;
    }
    // 3) clicked the floor → swing toward that point
    const gp = this._groundPoint();
    if (gp) this._attack(gp.x, gp.z);
  }

  selectSlot(n) {
    if (![1, 2, 3].includes(n)) return;
    const me = this.players.get(this.meId);
    if (me) { me.data.activeSlot = n; this._setHeld(this.meId); } // instant local feedback
    this.bridge.onSlot?.(n); // update React HUD + emit to server
  }

  _attack(tx, ty) {
    const me = this.players.get(this.meId);
    if (me) {
      me.targetYaw = Math.atan2(tx - me.group.position.x, ty - me.group.position.z);
      this._triggerSwing(this.meId);
    }
    this.socket.emit('attack', { tx, ty }, (res) => res?.error && this.bridge.onError(res.error));
  }

  _resolve(obj) {
    while (obj) {
      if (obj.userData?.pickType) return obj.userData;
      obj = obj.parent;
    }
    return null;
  }

  _playerGroups() {
    const groups = [];
    for (const v of this.players.values()) if (v.userId !== this.meId) groups.push(v.group);
    return groups;
  }

  _inputWorld() {
    const k = this.keys;
    const fwd = new THREE.Vector3(-Math.sin(this.orbitYaw), 0, -Math.cos(this.orbitYaw));
    const right = new THREE.Vector3().crossVectors(fwd, UP).normalize();
    const v = new THREE.Vector3();
    if (k.has('w') || k.has('arrowup')) v.add(fwd);
    if (k.has('s') || k.has('arrowdown')) v.sub(fwd);
    if (k.has('d') || k.has('arrowright')) v.add(right);
    if (k.has('a') || k.has('arrowleft')) v.sub(right);
    if (v.lengthSq() < 0.01) return null;
    v.y = 0;
    return v.normalize();
  }

  // ---- players -------------------------------------------------------------

  _addPlayer(p) {
    const existing = this.players.get(p.userId);
    if (existing) {
      existing.data = { ...existing.data, ...p };
      this._refreshStatus(p.userId);
      return;
    }
    const group = buildAvatar(p.avatar);
    group.position.set(p.x, 0, p.y);
    group.rotation.y = yawFromFacing(p.facing ?? Math.PI / 2);
    group.userData.pickType = 'player';
    group.userData.userId = p.userId;

    const { sprite, update } = makeStatusSprite();
    group.add(sprite);
    this.scene.add(group);

    const view = {
      userId: p.userId,
      data: p,
      group,
      status: update,
      isMe: p.userId === this.meId,
      serverPos: new THREE.Vector3(p.x, 0, p.y),
      targetYaw: group.rotation.y,
      heldMesh: null,
      swingT: 0,
      swingDur: 0.32,
      swingArc: 1.9,
      stars: null,
    };
    this.players.set(p.userId, view);
    this._setHeld(p.userId);
    this._refreshStatus(p.userId);
  }

  _removePlayer(userId) {
    const v = this.players.get(userId);
    if (!v) return;
    this.scene.remove(v.group);
    this.players.delete(userId);
  }

  // Swap the item shown in the hand based on the active slot: weapon (slot 1),
  // extinguisher (slot 2), or lighter (slot 3). Everyone sees what you're wielding.
  _setHeld(userId) {
    const v = this.players.get(userId);
    if (!v) return;
    const arm = v.group.userData.parts?.armR;
    if (!arm) return;
    if (v.heldMesh) {
      arm.remove(v.heldMesh);
      v.heldMesh = null;
    }
    const slot = v.data.activeSlot || 1;
    let m = null;
    if (slot === 2) m = makeTool('extinguisher');
    else if (slot === 3) m = makeTool('lighter');
    else if (v.data.weapon && v.data.weapon !== 'fists') {
      m = makeWeapon(v.data.weapon);
      m.scale.multiplyScalar(0.85);
    }
    if (m) {
      m.position.set(0, -0.62, 0.22); // at the wrist of the arm pivot, pointing forward
      arm.add(m);
      v.heldMesh = m;
    }
  }

  _triggerSwing(userId, arc = 1.9) {
    const v = this.players.get(userId);
    if (v) { v.swingT = v.swingDur; v.swingArc = arc; }
  }

  // A gentle tool-use motion (lighter flick / extinguisher spray), facing the tile.
  _useToward(userId, x, y) {
    if (userId === this.meId) return; // self already animated on click
    const v = this.players.get(userId);
    if (!v) return;
    v.targetYaw = Math.atan2(x - v.group.position.x, y - v.group.position.z);
    this._triggerSwing(userId, 0.8);
  }

  _refreshStatus(userId) {
    const v = this.players.get(userId);
    if (!v) return;
    const d = v.data;
    v.status({
      name: d.name,
      hp: d.hp,
      stress: d.stress,
      ko: d.state === 'ko',
      isMe: userId === this.meId,
      afk: d.afk,
      rage: d.rageUntil > Date.now(),
      wanted: d.wanted,
    });
    v.group.traverse((o) => {
      if (o.isMesh && o.material?.emissive) o.material.emissive.setHex(d.rageUntil > Date.now() ? 0x551111 : 0x000000);
    });
  }

  // ---- snapshot ------------------------------------------------------------

  _applySnapshot(state) {
    for (const p of state.players) this._addPlayer(p);
    for (const d of state.deskStates || []) this.deskAPIs.get(d.deskIndex)?.setStage(d.stage);
    this.fire.sync(state.fires || []);
    for (const w of state.weapons || []) this._spawnPickup(w);
  }

  _spawnPickup({ id, type, x, y }) {
    if (this.pickups.has(id)) return;
    const mesh = makePickup(type, x, y);
    this.scene.add(mesh);
    this.pickups.set(id, mesh);
  }

  _removePickup(id) {
    const mesh = this.pickups.get(id);
    if (mesh) {
      this.scene.remove(mesh);
      this.pickups.delete(id);
    }
  }

  _deskPos(deskIndex) {
    return this.deskAPIs.get(deskIndex)?.group.position || null;
  }

  // ---- socket wiring -------------------------------------------------------

  _wireSocket() {
    const s = this.socket;
    const H = (this.handlers = {});

    H['player:joined'] = (p) => this._addPlayer(p);
    H['player:left'] = ({ userId }) => this._removePlayer(userId);
    H['positions'] = (updates) => {
      for (const u of updates) {
        const v = this.players.get(u.userId);
        if (!v) continue;
        v.serverPos.set(u.x, 0, u.y);
        if (!v.isMe) v.targetYaw = yawFromFacing(u.facing); // self steers locally
      }
    };
    H['stress:update'] = ({ userId, stress }) => {
      const v = this.players.get(userId);
      if (v) { v.data.stress = stress; this._refreshStatus(userId); }
    };
    H['stress:batch'] = (updates) => {
      for (const u of updates) {
        const v = this.players.get(u.userId);
        if (v) { v.data.stress = u.stress; this._refreshStatus(u.userId); }
      }
    };
    H['rage:start'] = ({ userId, until }) => {
      const v = this.players.get(userId);
      if (!v) return;
      v.data.rageUntil = until;
      v.data.stress = 0;
      this._refreshStatus(userId);
      this.floatText.spawn(v.group.position.clone().setY(2.8), '😡 RAGE!', { color: '#ff5d5d', fontSize: 56 });
      this.shake = 0.35;
    };
    H['rage:end'] = ({ userId }) => {
      const v = this.players.get(userId);
      if (v) { v.data.rageUntil = 0; this._refreshStatus(userId); }
    };
    H['equip'] = ({ userId, weapon }) => {
      const v = this.players.get(userId);
      if (!v) return;
      v.data.weapon = weapon;
      this._setHeld(userId);
      this.floatText.spawn(v.group.position.clone().setY(2.7), 'picked up!', { color: '#ffd166', fontSize: 34, scale: 0.6 });
    };
    H['slot'] = ({ userId, slot }) => {
      const v = this.players.get(userId);
      if (!v) return;
      v.data.activeSlot = slot;
      this._setHeld(userId);
    };
    H['weapon:taken'] = ({ id }) => this._removePickup(id);
    H['weapon:spawned'] = (w) => this._spawnPickup(w);
    H['desk:hit'] = ({ deskIndex, stage, raging }) => {
      this.deskAPIs.get(deskIndex)?.setStage(stage);
      const pos = this._deskPos(deskIndex);
      if (pos) {
        const recipe = DEBRIS_BY_STAGE[stage] || DEBRIS_BY_STAGE[1];
        this.debris.burst(pos.clone().setY(0.7), { ...recipe, spread: raging ? 4 : 3 });
        this.floatText.spawn(pos.clone().setY(1.4), raging ? 'SMASH!' : 'WHACK!', { color: '#ffd166', fontSize: 40, scale: 0.7 });
      }
      this.shake = 0.35;
    };
    H['desk:destroyed'] = ({ deskIndex, byName }) => {
      this.deskAPIs.get(deskIndex)?.setStage(4);
      const pos = this._deskPos(deskIndex);
      if (pos) {
        this.debris.burst(pos.clone().setY(0.6), DEBRIS_BY_STAGE[4]);
        this.floatText.spawn(pos.clone().setY(1.6), `💥 ${byName} wrecked it!`, { color: '#ff8c1a', fontSize: 40, scale: 0.8 });
      }
      this.shake = 0.6;
    };
    H['desk:repaired'] = ({ deskIndex }) => {
      this.deskAPIs.get(deskIndex)?.setStage(0);
      const pos = this._deskPos(deskIndex);
      if (pos) this.floatText.spawn(pos.clone().setY(1.2), '🔧', { fontSize: 44, scale: 0.7 });
    };
    H['fires'] = (fires) => this.fire.sync(fires); // re-sync removes extinguished flames
    H['fire:ignited'] = ({ x, y, by }) => {
      this._useToward(by, x, y); // lighter flick toward the tile
    };
    H['spray'] = ({ x, y, by }) => {
      // the extinguisher jet — others render the smoke; self already does it locally
      if (by !== this.meId) {
        this._useToward(by, x, y);
        this.smoke.puff(new THREE.Vector3(x, 0.5, y), { count: 3, spread: 0.55 });
      }
    };
    H['attack'] = ({ userId, weapon, facing }) => {
      if (userId === this.meId) return; // self already swung locally on click
      const v = this.players.get(userId);
      if (!v) return;
      if (Number.isFinite(facing)) v.targetYaw = yawFromFacing(facing);
      if (weapon && weapon !== v.data.weapon) { v.data.weapon = weapon; this._setHeld(userId); }
      this._triggerSwing(userId);
    };
    H['player:hit'] = ({ targetId, hp, label }) => {
      const t = this.players.get(targetId);
      if (!t) return;
      t.data.hp = hp;
      this._refreshStatus(targetId);
      this.floatText.spawn(t.group.position.clone().setY(2.7), label, { color: '#ff5d5d', fontSize: 52 });
      this.debris.burst(t.group.position.clone().setY(1.1), { count: 8, colors: [0xffe066, 0xffffff], spread: 1.8, size: 0.1 });
    };
    H['player:ko'] = ({ userId, byName }) => {
      const v = this.players.get(userId);
      if (!v) return;
      v.data.state = 'ko';
      this._refreshStatus(userId);
      v.group.rotation.z = Math.PI / 2;
      const stars = makeStarsSprite();
      stars.position.set(0, 1.2, 0);
      v.group.add(stars);
      v.stars = stars;
      this.floatText.spawn(v.group.position.clone().setY(2.6), `KO by ${byName}!`, { color: '#ff5d5d', fontSize: 46 });
    };
    H['player:respawn'] = ({ userId, x, y, hp }) => {
      const v = this.players.get(userId);
      if (!v) return;
      v.data.state = 'alive';
      v.data.hp = hp;
      v.group.rotation.z = 0;
      if (v.stars) { v.group.remove(v.stars); v.stars = null; }
      v.serverPos.set(x, 0, y);
      v.group.position.set(x, 0, y);
      this._refreshStatus(userId);
      this.floatText.spawn(v.group.position.clone().setY(2.6), '✨ back!', { color: '#74e36b', fontSize: 40, scale: 0.7 });
    };
    H['presence'] = ({ userId, status }) => {
      const v = this.players.get(userId);
      if (v) { v.data.afk = status === 'afk'; this._refreshStatus(userId); }
    };
    H['wanted'] = ({ userId, wanted }) => {
      const v = this.players.get(userId);
      if (v) { v.data.wanted = wanted; this._refreshStatus(userId); }
    };
    H['combo'] = ({ userId }) => {
      const v = this.players.get(userId);
      if (v) this.floatText.spawn(v.group.position.clone().setY(2.9), '🔥 COMBO x2', { color: '#f4a261', fontSize: 48 });
    };
    H['emoji'] = ({ userId, emoji }) => {
      const v = this.players.get(userId);
      if (v) this.floatText.spawn(v.group.position.clone().setY(2.7), emoji, { fontSize: 56 });
    };
    H['members:changed'] = () => this.bridge.onMembersChanged?.();

    for (const [ev, fn] of Object.entries(H)) s.on(ev, fn);
  }

  // Per-frame avatar animation: walk cycle (arms + legs swing from the joints),
  // a step bob while moving, gentle breathing while idle, and the attack swing.
  _animate(v, dt, t) {
    const parts = v.group.userData.parts || {};

    // planar speed from frame-to-frame travel (x,z only — y is the bob)
    const px = v.prevX ?? v.group.position.x;
    const pz = v.prevZ ?? v.group.position.z;
    const planar = Math.hypot(v.group.position.x - px, v.group.position.z - pz);
    v.prevX = v.group.position.x;
    v.prevZ = v.group.position.z;

    if (v.data.state === 'ko') {
      v.group.position.y = 0; // toppled — no walk cycle
      return;
    }

    // face the movement / aim direction
    const diff = ((v.targetYaw - v.group.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    v.group.rotation.y += diff * 0.3;

    // advance the stride by distance travelled (avoids foot-sliding), ease in/out
    const moving = planar > 0.004;
    v.walkPhase = (v.walkPhase || 0) + planar * 2.6;
    v.walkAmp = THREE.MathUtils.lerp(v.walkAmp || 0, moving ? 1 : 0, 0.18);
    const wp = v.walkPhase;
    const amp = v.walkAmp;
    const legSwing = Math.sin(wp) * 0.55 * amp;
    const armSwing = Math.sin(wp) * 0.45 * amp;

    if (parts.legL) parts.legL.rotation.x = legSwing;
    if (parts.legR) parts.legR.rotation.x = -legSwing;
    if (parts.armL) parts.armL.rotation.x = -armSwing; // arms counter-swing the legs

    // right arm: an attack swing overrides the walk swing
    if (parts.armR) {
      if (v.swingT > 0) {
        v.swingT = Math.max(0, v.swingT - dt);
        const prog = 1 - v.swingT / v.swingDur;
        parts.armR.rotation.x = -Math.sin(prog * Math.PI) * (v.swingArc || 1.9);
      } else {
        parts.armR.rotation.x = armSwing;
      }
    }

    // vertical bob: a step bounce while walking, gentle breathing while idle
    v.group.position.y = amp > 0.05 ? Math.abs(Math.sin(wp)) * 0.06 * amp : Math.sin(t * 1.6) * 0.012;
  }

  // ---- render loop ---------------------------------------------------------

  _loop() {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(() => this._loop());
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    const now = performance.now();

    const me = this.players.get(this.meId);

    // local input → server + client-side prediction
    if (me && me.data.state === 'alive') {
      const v = this._inputWorld();
      const sx = v ? +v.x.toFixed(2) : 0;
      const sy = v ? +v.z.toFixed(2) : 0;
      if (sx !== this.lastInput.x || sy !== this.lastInput.y || (v && now - this.lastInputSent > 180)) {
        this.socket.emit('move', { dx: sx, dy: sy });
        this.lastInput = { x: sx, y: sy };
        this.lastInputSent = now;
      }
      // sprint stamina (local mirror of the server sim — same constants)
      const sprinting = this.sprintHeld && !!v && this.stamina > 0 && !this.staminaLocked;
      if (sprinting) {
        this.stamina = Math.max(0, this.stamina - SPRINT.DRAIN * dt);
        this.lastDrainAt = now;
        if (this.stamina <= 0) this.staminaLocked = true;
      } else if (now - this.lastDrainAt > SPRINT.DELAY_MS) {
        this.stamina = Math.min(SPRINT.MAX, this.stamina + SPRINT.REGEN * dt);
        if (this.staminaLocked && this.stamina >= SPRINT.MIN_START) this.staminaLocked = false;
      }
      if (now - this.lastStaminaPush > 90) {
        this.lastStaminaPush = now;
        this.bridge.onStamina?.(Math.round(this.stamina), this.staminaLocked);
      }

      if (v) {
        const rageMult = me.data.rageUntil > Date.now() ? RAGE_SPEED_MULT : 1;
        const sp = PLAYER_SPEED * rageMult * (sprinting ? SPRINT.MULT : 1);
        me.group.position.x += v.x * sp * dt;
        me.group.position.z += v.z * sp * dt;
        me.targetYaw = Math.atan2(v.x, v.z);
      }
      // reconcile to authoritative position (snappier when far, e.g. knockback)
      const drift = me.group.position.distanceTo(me.serverPos);
      me.group.position.lerp(me.serverPos, drift > 0.6 ? 0.4 : 0.12);

      // hold-to-spray: extinguisher (2) / lighter (3) fire repeatedly while held
      if (this.spraying && now - this.lastSprayAt > 110) {
        this.lastSprayAt = now;
        this._sprayTick();
      }
    } else if (me && now - this.lastDrainAt > SPRINT.DELAY_MS) {
      // regen while KO / not controlling
      this.stamina = Math.min(SPRINT.MAX, this.stamina + SPRINT.REGEN * dt);
      if (this.staminaLocked && this.stamina >= SPRINT.MIN_START) this.staminaLocked = false;
      if (now - this.lastStaminaPush > 120) { this.lastStaminaPush = now; this.bridge.onStamina?.(Math.round(this.stamina), this.staminaLocked); }
    }

    for (const v of this.players.values()) {
      if (!v.isMe) v.group.position.lerp(v.serverPos, 0.25);
      this._animate(v, dt, t);
      if (v.stars) v.stars.rotation.z += dt * 6;
    }

    // bob/spin floor pickups
    for (const mesh of this.pickups.values()) {
      const holder = mesh.userData.holder;
      holder.rotation.y += dt * 1.6;
      holder.position.y = Math.sin(t * 2.2) * 0.12;
    }

    this.debris.update(dt);
    this.floatText.update(dt);
    this.fire.update(dt, t);
    this.smoke.update(dt);

    if (me) this.camTarget.lerp(me.group.position.clone().setY(1.1), 0.18);
    const off = new THREE.Vector3(
      Math.sin(this.orbitYaw) * Math.cos(this.orbitPitch),
      Math.sin(this.orbitPitch),
      Math.cos(this.orbitYaw) * Math.cos(this.orbitPitch)
    ).multiplyScalar(this.radius);
    const desired = this.camTarget.clone().add(off);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2);
      desired.x += (Math.random() - 0.5) * this.shake;
      desired.y += (Math.random() - 0.5) * this.shake;
    }
    this.camera.position.lerp(desired, 0.15);
    this.camera.lookAt(this.camTarget);

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    for (const [ev, fn] of Object.entries(this.handlers || {})) this.socket.off(ev, fn);
    this.renderer.dispose();
  }
}

function makeStarsSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = '48px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('💫', 32, 36);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(0.6, 0.6, 1);
  return sprite;
}
