import { prisma } from '../lib/prisma.js';
import { C, WEAPONS, DEFAULT_WEAPON } from './constants.js';
import { compileMap, DEFAULT_LAYOUT, dist } from './map.js';
import { addScore } from './scoring.js';

// One authoritative GameRoom per workspace (architecture §6.1). State lives in
// memory; the server simulates free movement + combat and broadcasts results.
// Clients are render-only and send only intents (input vector, attack, etc.).

const rooms = new Map();
let ioRef = null;

export function setIo(io) {
  ioRef = io;
}

export function getRoom(workspaceId) {
  let room = rooms.get(workspaceId);
  if (!room) {
    room = new GameRoom(workspaceId);
    rooms.set(workspaceId, room);
  }
  return room;
}

export function kickFromRoom(workspaceId, userId) {
  rooms.get(workspaceId)?.kick(userId);
}

export function broadcastAll(event, data) {
  for (const room of rooms.values()) room.emit(event, data);
}

class GameRoom {
  constructor(workspaceId) {
    this.id = workspaceId;
    this.players = new Map(); // userId -> player state
    this.deskOwners = new Map(); // deskIndex -> { userId, name }
    this.deskStates = new Map(); // deskIndex -> { hp, stage, by, byName, destroyed }
    this.fires = new Map(); // "x,y" -> { x, y, ignitedAt }

    this.map = null; // compiled from the workspace's layout on first join
    this.mapLoading = null;
    this.weapons = new Map(); // id -> { id, type, x, y, available, respawnAt }

    this.timers = [
      setInterval(() => this.simTick(), C.SIM_TICK_MS),
      setInterval(() => this.stressTick(), 60_000),
      setInterval(() => this.fireTick(), C.FIRE_TICK_MS),
      setInterval(() => this.afkTick(), C.AFK_CHECK_MS),
    ];
  }

  channel() {
    return `ws:${this.id}`;
  }

  emit(event, data) {
    ioRef?.to(this.channel()).emit(event, data);
  }

  // Compile this workspace's custom layout (or the default office) once.
  async ensureMap() {
    if (this.map) return;
    if (!this.mapLoading) {
      this.mapLoading = (async () => {
        let layout = DEFAULT_LAYOUT;
        try {
          const ws = await prisma.workspace.findUnique({ where: { id: this.id }, select: { layout: true } });
          if (ws?.layout) layout = ws.layout;
        } catch {
          /* fall back to default */
        }
        this.map = compileMap(layout);
        this.weapons = new Map();
        for (const w of this.map.weaponSpawns) this.weapons.set(w.id, { ...w, available: true, respawnAt: 0 });
      })();
    }
    await this.mapLoading;
  }

  async refreshMembers() {
    const memberships = await prisma.membership.findMany({
      where: { workspaceId: this.id },
      include: { user: { select: { id: true, displayName: true } } },
    });
    this.deskOwners.clear();
    for (const m of memberships) {
      this.deskOwners.set(m.deskIndex, { userId: m.user.id, name: m.user.displayName });
    }
  }

  // ---- lifecycle -----------------------------------------------------------

  async addPlayer(socket, user, membership) {
    await this.ensureMap();
    await this.refreshMembers();

    const existing = this.players.get(user.id);
    if (existing && existing.socketId !== socket.id) {
      ioRef?.sockets.sockets.get(existing.socketId)?.disconnect(true);
    }

    const spawn = existing ? { x: existing.x, y: existing.y } : this.map.spawnFor(membership.deskIndex);
    const player = existing || {
      userId: user.id,
      name: user.displayName,
      jobTitle: user.jobTitle,
      avatar: user.avatar,
      deskIndex: membership.deskIndex,
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      kbx: 0,
      kby: 0,
      facing: Math.PI / 2, // facing "down" (+y)
      stress: 0,
      hp: C.MAX_HP,
      state: 'alive',
      rageUntil: 0,
      afk: false,
      lastActivity: Date.now(),
      lastAttackAt: 0,
      comboTimes: [],
      sessionKos: 0,
      koStreak: 0,
      wanted: false,
      weapon: DEFAULT_WEAPON,
      activeSlot: 1, // 1 = weapon/hands, 2 = extinguisher, 3 = lighter
      stamina: C.SPRINT_MAX,
      sprintWanted: false,
      sprintLocked: false, // true once fully drained, until it recovers to SPRINT_MIN_TO_START
      lastDrainAt: 0,
    };
    player.socketId = socket.id;
    player.name = user.displayName;
    player.avatar = user.avatar;
    player.vx = 0;
    player.vy = 0;
    this.players.set(user.id, player);

    // FR-5.4 follow-through: the victim has seen the damage — repair their desk
    if (this.deskStates.has(player.deskIndex)) {
      this.deskStates.delete(player.deskIndex);
      this.emit('desk:repaired', { deskIndex: player.deskIndex });
    }

    this.emit('player:joined', this.publicPlayer(player));
    return player;
  }

  removePlayer(userId, socketId) {
    const player = this.players.get(userId);
    if (!player || (socketId && player.socketId !== socketId)) return;
    this.players.delete(userId);
    this.emit('player:left', { userId });
    if (this.players.size === 0) this.destroy();
  }

  kick(userId) {
    const player = this.players.get(userId);
    if (player) {
      const socket = ioRef?.sockets.sockets.get(player.socketId);
      socket?.emit('kicked', { workspaceId: this.id });
      socket?.disconnect(true);
      this.removePlayer(userId);
    }
    this.refreshMembers().then(() => this.emit('members:changed', {}));
  }

  destroy() {
    for (const t of this.timers) clearInterval(t);
    rooms.delete(this.id);
  }

  publicPlayer(p) {
    return {
      userId: p.userId,
      name: p.name,
      jobTitle: p.jobTitle,
      avatar: p.avatar,
      deskIndex: p.deskIndex,
      x: p.x,
      y: p.y,
      facing: p.facing,
      stress: p.stress,
      hp: p.hp,
      state: p.state,
      rageUntil: p.rageUntil,
      afk: p.afk,
      wanted: p.wanted,
      weapon: p.weapon,
      activeSlot: p.activeSlot,
    };
  }

  snapshot() {
    return {
      players: [...this.players.values()].map((p) => this.publicPlayer(p)),
      deskOwners: [...this.deskOwners.entries()].map(([deskIndex, o]) => ({ deskIndex, ...o })),
      deskStates: [...this.deskStates.entries()].map(([deskIndex, d]) => ({ deskIndex, ...d })),
      fires: [...this.fires.values()],
      weapons: [...this.weapons.values()].filter((w) => w.available).map((w) => ({ id: w.id, type: w.type, x: w.x, y: w.y })),
      now: Date.now(),
    };
  }

  // ---- simulation tick (20 Hz): movement, knockback, pickups, broadcast -----

  simTick() {
    if (!this.map) return; // map not compiled yet (no players have joined)
    const now = Date.now();
    const moved = [];

    for (const p of this.players.values()) {
      if (p.state === 'alive') {
        const raging = this.isRaging(p);
        const dt = C.SIM_TICK_MS / 1000;
        const moving = p.vx !== 0 || p.vy !== 0;

        // sprint: only while actually moving and with stamina left
        const sprinting = p.sprintWanted && moving && p.stamina > 0 && !p.sprintLocked;
        if (sprinting) {
          p.stamina = Math.max(0, p.stamina - C.SPRINT_DRAIN_PER_SEC * dt);
          p.lastDrainAt = now;
          if (p.stamina <= 0) p.sprintLocked = true; // exhausted — lock until recovered
        } else if (now - p.lastDrainAt > C.SPRINT_REGEN_DELAY_MS) {
          p.stamina = Math.min(C.SPRINT_MAX, p.stamina + C.SPRINT_REGEN_PER_SEC * dt);
          if (p.sprintLocked && p.stamina >= C.SPRINT_MIN_TO_START) p.sprintLocked = false;
        }

        const speed = C.PLAYER_SPEED * (raging ? C.RAGE_SPEED_MULT : 1) * (sprinting ? C.SPRINT_SPEED_MULT : 1);
        const sx = (p.vx * speed + p.kbx) * dt;
        const sy = (p.vy * speed + p.kby) * dt;

        const ox = p.x;
        const oy = p.y;
        // axis-separated collision so players slide along walls instead of sticking
        if (sx !== 0 && this.map.circleClear(p.x + sx, p.y, C.PLAYER_RADIUS)) p.x += sx;
        if (sy !== 0 && this.map.circleClear(p.x, p.y + sy, C.PLAYER_RADIUS)) p.y += sy;

        // knockback decays toward rest
        p.kbx *= C.KNOCKBACK_DECAY;
        p.kby *= C.KNOCKBACK_DECAY;
        if (Math.abs(p.kbx) < 0.05) p.kbx = 0;
        if (Math.abs(p.kby) < 0.05) p.kby = 0;

        if (p.vx || p.vy) p.facing = Math.atan2(p.vy, p.vx);

        this.maybePickup(p, now);

        if (Math.abs(p.x - ox) > 0.0005 || Math.abs(p.y - oy) > 0.0005) {
          moved.push({ userId: p.userId, x: round(p.x), y: round(p.y), facing: round(p.facing) });
        }
      }
    }

    if (moved.length) this.emit('positions', moved);

    // respawn weapons that have been gone long enough
    for (const w of this.weapons.values()) {
      if (!w.available && now >= w.respawnAt) {
        w.available = true;
        this.emit('weapon:spawned', { id: w.id, type: w.type, x: w.x, y: w.y });
      }
    }
  }

  maybePickup(p, now) {
    for (const w of this.weapons.values()) {
      if (!w.available) continue;
      if (p.weapon === w.type) continue; // already wielding this kind
      if (dist(p.x, p.y, w.x, w.y) <= C.PICKUP_RADIUS) {
        p.weapon = w.type;
        w.available = false;
        w.respawnAt = now + C.WEAPON_RESPAWN_MS;
        this.emit('weapon:taken', { id: w.id });
        this.emit('equip', { userId: p.userId, weapon: p.weapon });
        return; // one pickup per tick
      }
    }
  }

  // ---- periodic ticks ------------------------------------------------------

  stressTick() {
    const updates = [];
    for (const p of this.players.values()) {
      if (p.state !== 'alive') continue;
      this.setStress(p, p.stress + C.STRESS_PASSIVE_PER_MIN, { silent: true });
      updates.push({ userId: p.userId, stress: p.stress });
    }
    if (updates.length) this.emit('stress:batch', updates);
  }

  fireTick() {
    const now = Date.now();
    let changed = false;
    for (const [key, fire] of this.fires) {
      if (now - fire.ignitedAt > C.FIRE_BURNOUT_MS) {
        this.fires.delete(key);
        changed = true;
        continue;
      }
      if (Math.random() < C.FIRE_SPREAD_CHANCE) {
        const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        const [dx, dy] = dirs[Math.floor(Math.random() * dirs.length)];
        const nx = fire.x + dx;
        const ny = fire.y + dy;
        const key2 = `${nx},${ny}`;
        if (!this.fires.has(key2) && this.map.isWalkable(nx, ny) && this.map.isRoom(nx, ny)) {
          this.fires.set(key2, { x: nx, y: ny, ignitedAt: now });
          changed = true;
        }
      }
    }
    if (changed) this.emit('fires', [...this.fires.values()]);
  }

  afkTick() {
    const now = Date.now();
    for (const p of this.players.values()) {
      if (!p.afk && now - p.lastActivity > C.AFK_MS) {
        p.afk = true;
        this.emit('presence', { userId: p.userId, status: 'afk' });
      }
      if (p.rageUntil && p.rageUntil <= now) p.rageUntil = 0;
    }
  }

  // ---- shared helpers ------------------------------------------------------

  touch(p) {
    p.lastActivity = Date.now();
    if (p.afk) {
      p.afk = false;
      this.emit('presence', { userId: p.userId, status: 'online' });
    }
  }

  isRaging(p) {
    return p.rageUntil > Date.now();
  }

  inRange(p, x, y, range) {
    return dist(p.x, p.y, x, y) <= range;
  }

  setStress(p, value, { silent = false } = {}) {
    p.stress = Math.max(0, Math.min(C.STRESS_MAX, Math.round(value)));
    if (p.stress >= C.STRESS_MAX && !this.isRaging(p)) {
      p.rageUntil = Date.now() + C.RAGE_DURATION_MS;
      p.stress = 0;
      this.emit('rage:start', { userId: p.userId, until: p.rageUntil });
      addScore(this.id, p.userId, { rageActivations: 1, destructionScore: C.SCORE.rage }).catch(() => {});
      this.emit('leaderboard:dirty', {});
      setTimeout(() => this.emit('rage:end', { userId: p.userId }), C.RAGE_DURATION_MS + 50);
    }
    if (!silent) this.emit('stress:update', { userId: p.userId, stress: p.stress });
  }

  comboMultiplier(p) {
    const now = Date.now();
    p.comboTimes = p.comboTimes.filter((t) => now - t < C.COMBO_WINDOW_MS);
    p.comboTimes.push(now);
    if (p.comboTimes.length === C.COMBO_MIN_ACTIONS) {
      addScore(this.id, p.userId, { combos: 1, destructionScore: C.SCORE.combo }).catch(() => {});
      this.emit('combo', { userId: p.userId, chain: p.comboTimes.length });
    }
    return p.comboTimes.length >= C.COMBO_MIN_ACTIONS ? C.COMBO_MULTIPLIER : 1;
  }

  // ---- player intents ------------------------------------------------------

  // Free movement: the client streams a desired input vector; the sim integrates it.
  setInput(p, dx, dy) {
    if (p.state !== 'alive') return;
    const len = Math.hypot(dx || 0, dy || 0);
    if (len > 0.01) {
      p.vx = dx / len;
      p.vy = dy / len;
      this.touch(p);
    } else {
      p.vx = 0;
      p.vy = 0;
    }
  }

  logMeeting(p) {
    if (p.state !== 'alive') return;
    this.touch(p);
    this.setStress(p, p.stress + C.STRESS_MEETING);
    this.emit('meeting:logged', { userId: p.userId });
  }

  // Active inventory slot (1 weapon/hands, 2 extinguisher, 3 lighter). Cosmetic
  // on the server — drives the held item everyone sees; click validity is still
  // enforced per-action (charge, room, range).
  setSlot(p, n) {
    if (![1, 2, 3].includes(n) || p.activeSlot === n) return;
    p.activeSlot = n;
    this.touch(p);
    this.emit('slot', { userId: p.userId, slot: n });
  }

  // Sprint intent (hold Left Shift). Stamina is drained/regenerated in the sim tick.
  setSprint(p, on) {
    p.sprintWanted = !!on;
    if (on) this.touch(p);
  }

  // FR-5.1 multi-hit desk destruction (euclidean range now that movement is free)
  async destroyDesk(p, deskIndex) {
    if (p.state !== 'alive') return { error: 'You are knocked out' };
    this.touch(p);
    const desk = this.map.deskByIndex(deskIndex);
    if (!desk) return { error: 'No such desk' };
    const owner = this.deskOwners.get(deskIndex);
    if (!owner) return { error: 'Nobody sits there — no fun in that' };
    if (owner.userId === p.userId) return { error: "You can't trash your own desk" };
    if (!this.inRange(p, desk.x, desk.y, C.ACTION_RANGE)) return { error: 'Get closer to the desk' };

    const state = this.deskStates.get(deskIndex);
    if (state?.destroyed) return { error: 'That desk is already a pile of rubble' };

    const ownerOnline = this.players.get(owner.userId);
    if (ownerOnline && !ownerOnline.afk) return { error: `${owner.name} is online — too risky!` };

    const cur = state || { hp: C.DESK_MAX_HP, stage: 0, by: p.userId, byName: p.name, destroyed: false };
    const raging = this.isRaging(p);
    cur.hp = Math.max(0, cur.hp - (raging ? C.RAGE_DESK_DAMAGE : C.DESK_DAMAGE));
    cur.stage = C.DESK_MAX_HP - cur.hp;
    cur.by = p.userId;
    cur.byName = p.name;
    cur.destroyed = cur.hp <= 0;
    this.deskStates.set(deskIndex, cur);

    const mult = this.comboMultiplier(p);
    this.setStress(p, p.stress - C.STRESS_RELIEF_PER_HIT);

    this.emit('desk:hit', {
      deskIndex, hp: cur.hp, stage: cur.stage, maxHp: C.DESK_MAX_HP,
      by: p.userId, byName: p.name, raging, destroyed: cur.destroyed,
    });
    await addScore(this.id, p.userId, { destructionScore: C.SCORE.deskHit * mult }).catch(() => {});

    if (cur.destroyed) {
      this.emit('desk:destroyed', { deskIndex, by: p.userId, byName: p.name, victim: owner.userId });
      await addScore(this.id, p.userId, { destructions: 1, destructionScore: C.SCORE.destruction * mult }).catch(() => {});
      await prisma.notification
        .create({
          data: {
            userId: owner.userId,
            workspaceId: this.id,
            type: 'desk_destroyed',
            payload: { byName: p.name, deskIndex, at: new Date().toISOString() },
          },
        })
        .catch(() => {});
    }
    this.emit('leaderboard:dirty', {});
    return { ok: true };
  }

  // FR-5.2: set fire with the lighter (slot 3). Any walkable floor catches; fire
  // only *spreads* inside rooms (fireTick), so open-floor fires stay contained.
  // Errors are silent ('') so holding the lighter to sweep doesn't spam toasts.
  async igniteFire(p, x, y) {
    if (p.state !== 'alive') return { error: '' };
    this.touch(p);
    if (!Number.isInteger(x) || !Number.isInteger(y)) return { error: '' };
    if (!this.map.isWalkable(x, y)) return { error: '' };
    if (!this.inRange(p, x, y, C.ACTION_RANGE)) return { error: '' };
    const key = `${x},${y}`;
    if (this.fires.has(key)) return { ok: true }; // already burning — fine while holding

    this.fires.set(key, { x, y, ignitedAt: Date.now() });
    const mult = this.comboMultiplier(p);
    this.setStress(p, p.stress - C.STRESS_RELIEF_PER_ACTION);
    this.emit('fires', [...this.fires.values()]);
    this.emit('fire:ignited', { x, y, by: p.userId, byName: p.name, room: this.map.roomNameAt(x, y) });

    await addScore(this.id, p.userId, { fires: 1, destructionScore: C.SCORE.fire * mult }).catch(() => {});
    this.emit('leaderboard:dirty', {});
    return { ok: true };
  }

  // FR-5.2: extinguisher (slot 2) — unlimited; hold to keep spraying. Emits a
  // 'spray' so everyone sees the foam/smoke jet, and re-broadcasts 'fires' so
  // extinguished flames actually disappear (this was the bug).
  async extinguishFire(p, x, y) {
    if (p.state !== 'alive') return { error: '' };
    this.touch(p);
    if (!Number.isInteger(x) || !Number.isInteger(y)) return { error: '' };
    if (!this.inRange(p, x, y, C.ACTION_RANGE)) return { error: '' }; // silent while holding

    let removed = 0;
    for (const [key, fire] of this.fires) {
      if (dist(fire.x, fire.y, x, y) <= 1.7) {
        this.fires.delete(key);
        removed++;
      }
    }

    this.emit('spray', { x, y, by: p.userId }); // smoke jet, even over bare floor
    if (removed) {
      this.emit('fires', [...this.fires.values()]); // refresh so the flames vanish
      await addScore(this.id, p.userId, { destructionScore: C.SCORE.extinguish }).catch(() => {});
    }
    return { ok: true };
  }

  // FR-6: weapon-based directional melee. The swing animates client-side; the
  // server resolves which players are in the arc and applies damage + knockback.
  async attack(p, tx, ty) {
    if (p.state !== 'alive') return { error: 'You are knocked out' };
    this.touch(p);
    const w = WEAPONS[p.weapon] || WEAPONS[DEFAULT_WEAPON];
    const now = Date.now();
    const raging = this.isRaging(p);
    const cooldown = w.cooldownMs * (raging ? C.RAGE_COOLDOWN_MULT : 1);
    if (now - p.lastAttackAt < cooldown) return { error: '' }; // silent — still on cooldown
    p.lastAttackAt = now;

    if (Number.isFinite(tx) && Number.isFinite(ty) && (tx !== p.x || ty !== p.y)) {
      p.facing = Math.atan2(ty - p.y, tx - p.x);
    }
    const fx = Math.cos(p.facing);
    const fy = Math.sin(p.facing);
    // broadcast the swing regardless of whether it connects (whiffs still animate)
    this.emit('attack', { userId: p.userId, weapon: p.weapon, facing: p.facing });

    const reach = w.range + C.PLAYER_RADIUS;
    for (const o of this.players.values()) {
      if (o.userId === p.userId || o.state !== 'alive' || o.afk) continue; // FR-6.8
      const dx = o.x - p.x;
      const dy = o.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > reach) continue;
      if (d > 0.001 && (dx / d) * fx + (dy / d) * fy < C.ATTACK_ARC_COS) continue; // outside swing arc

      const dmg = w.damage * (raging ? C.RAGE_DAMAGE_MULT : 1);
      o.hp = Math.max(0, o.hp - dmg);
      const kb = w.knockback * (raging ? 1.4 : 1);
      const ux = d > 0.001 ? dx / d : fx;
      const uy = d > 0.001 ? dy / d : fy;
      o.kbx += ux * kb;
      o.kby += uy * kb;

      const label = w.labels[Math.floor(Math.random() * w.labels.length)];
      this.emit('player:hit', {
        attackerId: p.userId, targetId: o.userId, weapon: p.weapon,
        damage: dmg, hp: o.hp, label,
      });
      if (o.hp <= 0) await this.knockOut(p, o);
    }
    return { ok: true };
  }

  async knockOut(attacker, target) {
    target.state = 'ko';
    target.koStreak = 0;
    target.vx = target.vy = target.kbx = target.kby = 0;
    attacker.sessionKos++;
    attacker.koStreak++;
    this.emit('player:ko', { userId: target.userId, by: attacker.userId, byName: attacker.name });

    if (!attacker.wanted && attacker.sessionKos >= C.WANTED_KO_THRESHOLD) {
      attacker.wanted = true;
      this.emit('wanted', { userId: attacker.userId, wanted: true });
    }

    await Promise.all([
      addScore(this.id, attacker.userId, { kos: 1, bestKoStreak: attacker.koStreak, destructionScore: 0 }),
      addScore(this.id, target.userId, { timesKnockedOut: 1 }),
    ]).catch(() => {});
    this.emit('leaderboard:dirty', {});

    setTimeout(() => {
      if (!this.players.has(target.userId)) return;
      const spawn = this.map.spawnFor(target.deskIndex);
      target.x = spawn.x;
      target.y = spawn.y;
      target.kbx = target.kby = 0;
      target.hp = C.MAX_HP;
      target.state = 'alive';
      this.emit('player:respawn', { userId: target.userId, x: spawn.x, y: spawn.y, hp: target.hp });
    }, C.RESPAWN_MS);
  }

  emoji(p, emoji) {
    this.touch(p);
    const allowed = ['😂', '🔥', '👏', '😱', '💀', '🍿'];
    if (!allowed.includes(emoji)) return;
    this.emit('emoji', { userId: p.userId, emoji });
  }
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}
