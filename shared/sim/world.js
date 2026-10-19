// The game world: players, input processing, shooting and damage.
// The server runs it authoritatively. The client runs the same stepPlayer() for prediction, and the
// offline Practice Range runs a full World locally.
import { CollisionWorld } from './collision.js';
import { createMoveState, simulateMove } from './movement.js';
import { createWeaponState, tickWeapon, weaponSpeedMult, isScoped, falloff, currentWeapon } from './weapons.js';
import { rayVsPlayer, PART } from './hitscan.js';
import { WEAPONS, sanitizeLoadout } from '../config/weapons.js';
import { MAX_HP } from '../config/game.js';
import { qAngle, clamp } from './math.js';

const PITCH_LIMIT = 1.55;
const r2 = (v) => Math.round(v * 100) / 100;

export function normalizeInput(inp) {
  return {
    b: inp.b | 0,
    y: qAngle(inp.y),
    p: qAngle(clamp(inp.p, -PITCH_LIMIT, PITCH_LIMIT)),
    w: inp.w | 0,
  };
}

/**
 * Movement plus weapon state for one tick. Pure: no damage, no events. Used by prediction too.
 * Returns the fire action (or null).
 */
export function stepPlayer(p, inp, coll, dt, opt = {}) {
  const n = normalizeInput(inp);
  const ms = p.ms, ws = p.ws;
  // Movement uses the weapon held at the start of the tick
  simulateMove(ms, n.b, n.y, n.p, coll, dt, {
    speedMult: weaponSpeedMult(ws),
    scoped: isScoped(ws),
    frozen: !!opt.frozen,
  });
  return tickWeapon(ws, opt.frozen ? 0 : n.b, opt.frozen ? 0 : n.w, ms, p.id, dt, opt.canFight !== false && !opt.frozen);
}

export class World {
  constructor(map, opts = {}) {
    this.map = map;
    this.coll = new CollisionWorld(map);
    this.players = new Map();
    this.events = [];
    this.tick = 0;
    this.teams = opts.teams !== false; // false = free-for-all (everyone can damage everyone)
    this.rewind = null; // (target, shooter, viewTick) => {x,y,z,h}  (server lag compensation)
  }

  addPlayer(id, opts = {}) {
    const p = {
      id,
      name: opts.name || 'Player',
      team: opts.team ?? 0,
      dummy: !!opts.dummy,
      loadout: sanitizeLoadout(opts.loadout),
      ms: createMoveState(),
      ws: createWeaponState(sanitizeLoadout(opts.loadout)),
      hp: MAX_HP,
      alive: false,
      kills: 0, deaths: 0, damage: 0,
      protectT: 0,
      lastHurtT: 99,
    };
    this.players.set(id, p);
    return p;
  }

  removePlayer(id) { this.players.delete(id); }

  spawnPlayer(p, spawn) {
    const [x, y, z, yaw] = spawn;
    p.ms = createMoveState(x, y, z, yaw);
    p.ws = createWeaponState(p.loadout);
    p.hp = MAX_HP;
    p.alive = true;
    p.lastHurtT = 99;
  }

  canDamage(a, b) {
    if (a === b || !b.alive) return false;
    if (this.teams && a.team === b.team) return false;
    return b.protectT <= 0;
  }

  /** Process one input tick for a player (authoritative). */
  processInput(p, inp, dt, opt = {}) {
    if (!p.alive) return null;
    if (p.protectT > 0) p.protectT -= dt;
    const act = stepPlayer(p, inp, this.coll, dt, opt);
    if (act) {
      if (p.protectT > 0) p.protectT = 0; // shooting ends spawn protection
      this.resolveFire(p, act, inp.v);
    }
    if (p.ms.y < this.map.killY) this.damage(p, p, 9999, PART.BODY, 'fall');
    return act;
  }

  targetPos(t, shooter, viewTick) {
    if (this.rewind) return this.rewind(t, shooter, viewTick);
    return t.ms;
  }

  resolveFire(p, act, viewTick) {
    const w = WEAPONS[act.weapon];
    const o = act.origin;
    if (act.kind === 'melee') {
      const d = act.dir;
      let best = null, bestT = act.range;
      for (const t of this.players.values()) {
        if (!this.canDamage(p, t)) continue;
        const pos = this.targetPos(t, p, viewTick);
        // Point-blank: the eye is inside the target's padded box
        const close = Math.abs(pos.x - o[0]) < 0.6 && Math.abs(pos.z - o[2]) < 0.6 && o[1] > pos.y && o[1] < pos.y + pos.h + 0.3;
        const hit = close ? { t: 0.1, part: PART.BODY } : rayVsPlayer(o, d, pos.x, pos.y, pos.z, pos.h, act.range, 0.3);
        if (hit && hit.t < bestT) {
          const wall = this.coll.raycast(o[0], o[1], o[2], d[0], d[1], d[2], hit.t);
          if (wall === Infinity || close) { best = t; bestT = hit.t; }
        }
      }
      this.events.push({ e: 'melee', id: p.id, hv: act.heavy ? 1 : 0, hit: best ? 1 : 0 });
      if (best) this.damage(best, p, act.damage, PART.BODY, w.id);
      return;
    }

    const ends = [];
    const perTarget = new Map(); // target → { dmg, head }
    for (const d of act.dirs) {
      let maxD = this.coll.raycast(o[0], o[1], o[2], d[0], d[1], d[2], w.range);
      const hitWorld = maxD !== Infinity;
      if (!hitWorld) maxD = w.range;
      let tgt = null, tHit = maxD, part = -1;
      for (const t of this.players.values()) {
        if (!this.canDamage(p, t)) continue;
        const pos = this.targetPos(t, p, viewTick);
        const h = rayVsPlayer(o, d, pos.x, pos.y, pos.z, pos.h, tHit);
        if (h) { tgt = t; tHit = h.t; part = h.part; }
      }
      ends.push([r2(o[0] + d[0] * tHit), r2(o[1] + d[1] * tHit), r2(o[2] + d[2] * tHit), tgt ? 1 : hitWorld ? 2 : 0]);
      if (tgt) {
        const mult = part === PART.HEAD ? w.headMult : part === PART.LEGS ? w.legMult : 1;
        const dmg = w.damage * mult * falloff(w, tHit);
        const acc = perTarget.get(tgt) || { dmg: 0, head: false, part };
        acc.dmg += dmg;
        acc.head = acc.head || part === PART.HEAD;
        perTarget.set(tgt, acc);
      }
    }
    this.events.push({ e: 'shot', id: p.id, w: w.id, o: [r2(o[0]), r2(o[1]), r2(o[2])], h: ends });
    for (const [t, acc] of perTarget) this.damage(t, p, Math.round(acc.dmg), acc.head ? PART.HEAD : PART.BODY, w.id);
  }

  damage(t, attacker, amount, part, weaponId) {
    if (!t.alive) return;
    const dmg = Math.min(t.hp, amount);
    t.hp -= amount;
    t.lastHurtT = 0;
    if (attacker && attacker !== t) attacker.damage += dmg;
    const killed = t.hp <= 0;
    this.events.push({
      e: 'hit', a: attacker ? attacker.id : -1, v: t.id, d: Math.round(amount), hs: part === PART.HEAD ? 1 : 0, k: killed ? 1 : 0,
      ax: attacker ? r2(attacker.ms.x) : 0, az: attacker ? r2(attacker.ms.z) : 0,
    });
    if (killed) {
      t.hp = 0;
      t.alive = false;
      t.deaths++;
      if (attacker && attacker !== t) attacker.kills++;
      this.events.push({ e: 'kill', a: attacker && attacker !== t ? attacker.id : -1, v: t.id, w: weaponId, hs: part === PART.HEAD ? 1 : 0 });
    }
  }

  takeEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}

export { currentWeapon };
