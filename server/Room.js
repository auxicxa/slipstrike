// A game room: lobby, match state machine, authoritative simulation and snapshots.
import { World } from '../shared/sim/world.js';
import { MOVE_KEYS } from '../shared/sim/movement.js';
import { WEAPON_KEYS, createWeaponState } from '../shared/sim/weapons.js';
import { MAPS, MATCH_MAPS } from '../shared/maps/index.js';
import { MODES, ROUND, FFA, DT, TICK_RATE, SNAPSHOT_EVERY, MAX_HP, RECONNECT_GRACE } from '../shared/config/game.js';
import { sanitizeLoadout, DEFAULT_LOADOUT } from '../shared/config/weapons.js';
import { S } from '../shared/net/protocol.js';
import { LagComp } from './LagComp.js';
import { LIVE_SEQ_LEAD, LIVE_SEQ_EARLIEST } from '../shared/net/phase.js';

export const WEAPON_IDS = ['rifle', 'shotgun', 'sniper', 'pistol', 'revolver', 'knife'];
/** Drop queued inputs but acknowledge them, so the client doesn't replay inputs we never ran. */
function flushInputs(s) {
  if (s.inputs.length) s.lastSeq = s.inputs[s.inputs.length - 1].s;
  s.inputs = [];
}

const r3 = (v) => Math.round(v * 1000) / 1000;
const r1 = (v) => Math.round(v * 10) / 10;

export class Room {
  constructor(mgr, code, pub = false) {
    this.mgr = mgr;
    this.code = code;
    this.pub = pub;
    this.created = Date.now();
    this.hostId = null;
    this.mode = pub ? '2v2' : '1v1';
    this.mapId = MODES[this.mode].map;
    this.phase = 'lobby';
    this.phaseEndTick = 0; // phases end on exact ticks so clients can predict the freeze → live switch
    this.slots = new Map(); // id → slot
    this.world = null;
    this.lag = new LagComp();
    this.tick = 0;
    this.round = 0;
    this.scores = [0, 0];
    this.half = false;
    this.events = [];
    this.dirty = true;
    this.roomSendT = 0;
    this.lastResult = null;
    this.matchWinner = null;
  }

  get modeDef() { return MODES[this.mode]; }
  get capacity() { return this.modeDef.teams ? this.modeDef.teamSize * 2 : this.modeDef.teamSize; }
  get inMatch() { return this.world !== null; }
  connectedCount() { let n = 0; for (const s of this.slots.values()) if (!s.disc) n++; return n; }
  isFull() { return this.slots.size >= this.capacity; }
  teamCount(t) { let n = 0; for (const s of this.slots.values()) if (s.team === t) n++; return n; }

  // ------------------------------------------------------------------ membership
  addPlayer(conn) {
    if (this.isFull()) return false;
    const team = this.modeDef.teams ? (this.teamCount(0) <= this.teamCount(1) ? 0 : 1) : 0;
    const slot = {
      id: conn.id, name: conn.name, conn, team, ready: false, loadout: { ...DEFAULT_LOADOUT },
      inputs: [], lastSeq: -1, lastQueued: -1, budget: 2, disc: false, discAt: 0,
      fxAcc: 0, chatT: 0, respawnT: 0, life: 0, ping: 0, ent: null, liveSeq: null, liveTickMin: 0,
    };
    this.slots.set(conn.id, slot);
    conn.room = this;
    if (this.hostId == null) this.hostId = conn.id;
    if (this.world) this.addEntity(slot, true);
    this.dirty = true;
    this.mgr.bindSession(conn.token, this.code, conn.id);
    return true;
  }

  /** Reattach a reconnecting connection to its held slot. */
  reattach(conn, id) {
    const slot = this.slots.get(id);
    if (!slot) return false;
    if (!slot.disc) {
      // The old socket is still half-open (e.g. Wi-Fi switched): replace it
      const old = slot.conn;
      this.disconnect(id);
      if (old && old !== conn) { old.room = null; try { old.ws.close(4000, 'replaced'); } catch { /* ignore */ } }
      if (!this.slots.has(id)) return false; // was in the lobby, so the slot is gone
    }
    slot.conn = conn;
    slot.disc = false;
    slot.inputs = [];
    slot.budget = 2;
    conn.id = id;
    conn.name = slot.name;
    conn.room = this;
    this.events.push({ e: 'rejoin', id });
    if (!this.modeDef.teams && this.world && !slot.ent.alive) slot.respawnT = 1;
    this.dirty = true;
    return true;
  }

  removePlayer(id) {
    const slot = this.slots.get(id);
    if (!slot) return;
    this.slots.delete(id);
    if (slot.conn && slot.conn.room === this) slot.conn.room = null;
    if (this.world) { this.world.removePlayer(id); this.lag.forget(id); }
    this.mgr.unbindSession(id);
    if (this.hostId === id) this.hostId = this.slots.size ? [...this.slots.values()].find((s) => !s.disc)?.id ?? [...this.slots.keys()][0] : null;
    this.events.push({ e: 'leave', id });
    this.dirty = true;
    if (this.phase === 'countdown') this.setPhase('lobby', 0);
    this.checkForfeit();
  }

  /** Socket closed. In a match the slot is kept for RECONNECT_GRACE seconds. */
  disconnect(id) {
    const slot = this.slots.get(id);
    if (!slot) return;
    if (!this.world) { this.removePlayer(id); return; }
    slot.disc = true;
    slot.discAt = Date.now();
    slot.inputs = [];
    if (slot.ent && slot.ent.alive) slot.ent.alive = false; // counts as eliminated this round
    this.events.push({ e: 'disc', id });
    if (this.hostId === id) {
      const next = [...this.slots.values()].find((s) => !s.disc);
      if (next) this.hostId = next.id;
    }
    this.dirty = true;
  }

  // ------------------------------------------------------------------ lobby actions
  setMode(conn, mode, mapId) {
    if (conn.id !== this.hostId) return this.err(conn, 'Only the host can change the mode.');
    if (this.phase !== 'lobby') return this.err(conn, 'You can only change the mode in the lobby.');
    if (!MODES[mode]) return;
    const def = MODES[mode];
    const cap = def.teams ? def.teamSize * 2 : def.teamSize;
    if (this.slots.size > cap) return this.err(conn, `Too many players for ${def.label}.`);
    this.mode = mode;
    this.mapId = mapId && MATCH_MAPS.includes(mapId) ? mapId : def.map;
    // Re-balance teams for the new size
    if (def.teams) {
      for (const s of this.slots.values()) {
        if (this.teamCount(s.team) > def.teamSize) s.team = 1 - s.team;
      }
      while (Math.abs(this.teamCount(0) - this.teamCount(1)) > 1) {
        const big = this.teamCount(0) > this.teamCount(1) ? 0 : 1;
        const mv = [...this.slots.values()].reverse().find((s) => s.team === big);
        mv.team = 1 - big;
      }
    } else for (const s of this.slots.values()) s.team = 0;
    for (const s of this.slots.values()) s.ready = false;
    this.dirty = true;
  }

  setMap(conn, mapId) {
    if (conn.id !== this.hostId || this.phase !== 'lobby' || !MATCH_MAPS.includes(mapId)) return;
    this.mapId = mapId;
    this.dirty = true;
  }

  swapTeam(conn) {
    const s = this.slots.get(conn.id);
    if (!s || this.phase !== 'lobby' || !this.modeDef.teams) return;
    const other = 1 - s.team;
    if (this.teamCount(other) >= this.modeDef.teamSize) return this.err(conn, 'That team is full.');
    s.team = other;
    s.ready = false;
    this.dirty = true;
  }

  setReady(conn, ready) {
    const s = this.slots.get(conn.id);
    if (!s || (this.phase !== 'lobby' && this.phase !== 'countdown')) return;
    s.ready = ready;
    if (!ready && this.phase === 'countdown') this.setPhase('lobby', 0);
    this.dirty = true;
  }

  setLoadout(conn, p, sec) {
    const s = this.slots.get(conn.id);
    if (!s) return;
    s.loadout = sanitizeLoadout({ p, s: sec });
    if (s.ent) {
      s.ent.loadout = s.loadout;
      // Apply immediately while frozen in spawn (round modes) or when not yet fighting
      if (s.ent.alive && this.phase === 'freeze') s.ent.ws = createWeaponState(s.loadout);
    }
    this.dirty = true;
  }

  chat(conn, i) {
    const s = this.slots.get(conn.id);
    const now = Date.now();
    if (!s || now - s.chatT < 1000) return;
    s.chatT = now;
    const msg = { t: S.CHAT, from: s.id, i };
    for (const o of this.slots.values()) {
      if (o.disc) continue;
      if (this.world && this.modeDef.teams && o.team !== s.team) continue;
      o.conn.send(msg);
    }
  }

  queueInput(conn, m) {
    const s = this.slots.get(conn.id);
    if (!s || m.s <= s.lastQueued) return;
    s.lastQueued = m.s;
    s.inputs.push(m);
    if (s.inputs.length > 30) s.inputs.shift();
  }

  err(conn, msg) { conn.send({ t: S.ERROR, msg }); }

  // ------------------------------------------------------------------ phases
  /** Seconds left in the current phase. */
  get phaseT() { return Math.max(0, (this.phaseEndTick - this.tick) / TICK_RATE); }

  setPhase(p, t) {
    this.phase = p;
    this.phaseEndTick = this.tick + Math.round(t * TICK_RATE);
    this.dirty = true;
  }

  canStart() {
    const list = [...this.slots.values()];
    if (!list.length || list.some((s) => !s.ready)) return false;
    if (this.modeDef.teams) return this.teamCount(0) >= 1 && this.teamCount(1) >= 1;
    return true;
  }

  startMatch() {
    const map = MAPS[this.mapId] || MAPS[this.modeDef.map] || MAPS.kiln;
    this.world = new World(map, { teams: this.modeDef.teams });
    this.world.rewind = (t, shooter, viewTick) => this.lag.at(t, viewTick, this.tick);
    this.lag.clear();
    this.scores = [0, 0];
    this.round = 0;
    this.draws = 0;
    this.half = false;
    this.matchWinner = null;
    this.lastResult = null;
    for (const s of this.slots.values()) this.addEntity(s, false);
    this.events.push({ e: 'match', mode: this.mode, map: this.mapId });
    if (this.modeDef.teams) this.startRound();
    else {
      for (const s of this.slots.values()) this.spawnFFA(s);
      this.setPhase('live', FFA.timeLimit);
    }
  }

  addEntity(slot, midMatch) {
    const ent = this.world.addPlayer(slot.id, { name: slot.name, team: slot.team, loadout: slot.loadout });
    slot.ent = ent;
    if (midMatch && !this.modeDef.teams) slot.respawnT = 1;
  }

  sideOf(team) { return this.half ? 1 - team : team; }

  startRound() {
    this.round++;
    const map = this.world.map;
    const idx = [0, 0];
    for (const s of this.slots.values()) {
      if (s.disc) { s.ent.alive = false; continue; }
      const side = this.sideOf(s.team);
      const spawns = map.spawns[side];
      const sp = spawns[idx[side]++ % spawns.length];
      s.ent.team = s.team;
      s.ent.loadout = s.loadout;
      this.world.spawnPlayer(s.ent, sp);
      s.life++;
      s.liveSeq = null;
      flushInputs(s);
    }
    this.lag.clear();
    this.events.push({ e: 'round', n: this.round });
    this.setPhase('freeze', this.round === 1 ? ROUND.freezeTime : ROUND.freezeTime - 2);
  }

  spawnFFA(s) {
    if (s.disc) return;
    const map = this.world.map;
    const pts = map.ffa.length ? map.ffa : map.spawns[0].concat(map.spawns[1]);
    // Pick the spawn farthest from the nearest living enemy
    let best = pts[0], bestD = -1;
    for (const p of pts) {
      let near = Infinity;
      for (const o of this.slots.values()) {
        if (o === s || !o.ent || !o.ent.alive) continue;
        near = Math.min(near, Math.hypot(o.ent.ms.x - p[0], o.ent.ms.z - p[2]));
      }
      const d = near + Math.random() * 3;
      if (d > bestD) { bestD = d; best = p; }
    }
    this.world.spawnPlayer(s.ent, best);
    s.ent.protectT = FFA.spawnProtect;
    s.life++;
    flushInputs(s);
    this.lag.forget(s.id);
  }

  endRound(winner) {
    if (winner >= 0) this.scores[winner]++;
    else this.draws++;
    const over = this.scores[0] >= ROUND.winsNeeded || this.scores[1] >= ROUND.winsNeeded;
    const halftime = !over && this.round === ROUND.halftimeAfter && !this.half;
    this.events.push({ e: 'roundEnd', w: winner, sc: this.scores.slice(), ht: halftime ? 1 : 0, over: over ? 1 : 0 });
    if (over) this.matchWinner = this.scores[0] > this.scores[1] ? 0 : 1;
    this.setPhase('roundEnd', ROUND.roundEndTime + (halftime ? ROUND.halftimeExtra : 0));
  }

  endMatch(winner, reason = '') {
    this.matchWinner = winner;
    this.lastResult = this.buildResult(reason);
    this.events.push({ e: 'matchEnd', w: winner, reason });
    this.setPhase('matchEnd', ROUND.matchEndTime);
  }

  buildResult(reason) {
    return {
      mode: this.mode, map: this.mapId, winner: this.matchWinner, scores: this.scores.slice(), reason, rounds: this.round, draws: this.draws, half: this.half,
      players: [...this.slots.values()].map((s) => ({ id: s.id, name: s.name, team: s.team, k: s.ent?.kills ?? 0, d: s.ent?.deaths ?? 0, dmg: Math.round(s.ent?.damage ?? 0) })),
    };
  }

  backToLobby() {
    this.world = null;
    this.lag.clear();
    for (const s of [...this.slots.values()]) {
      if (s.disc) { this.removePlayer(s.id); continue; }
      s.ready = false;
      s.ent = null;
    }
    this.setPhase('lobby', 0);
  }

  checkForfeit() {
    if (!this.world || this.phase === 'matchEnd') return;
    if (!this.slots.size) return;
    if (this.modeDef.teams) {
      const a = this.teamCount(0), b = this.teamCount(1);
      if (a === 0 || b === 0) {
        if (this.matchWinner === null) this.endMatch(a === 0 ? 1 : 0, 'forfeit');
      }
    } else if (this.slots.size === 0) this.backToLobby();
  }

  // ------------------------------------------------------------------ simulation
  update() {
    this.tick++;
    const now = Date.now();

    // Drop players whose reconnect grace ran out
    for (const s of [...this.slots.values()]) {
      if (s.disc && now - s.discAt > RECONNECT_GRACE * 1000) this.removePlayer(s.id);
    }

    if (this.phase === 'lobby') {
      if (this.canStart()) this.setPhase('countdown', ROUND.countdown);
    } else if (this.phase === 'countdown') {
      if (!this.canStart()) this.setPhase('lobby', 0);
      else {
        if (this.tick % TICK_RATE === 0) this.dirty = true;
        if (this.tick >= this.phaseEndTick) this.startMatch();
      }
    }

    if (this.world) this.simulate();

    if (this.world && this.tick % SNAPSHOT_EVERY === 0) this.sendSnapshots();
    else if (!this.world && this.events.length) this.events = [];

    this.roomSendT -= DT;
    if (this.dirty || this.roomSendT <= 0) {
      this.sendRoomState();
      this.dirty = false;
      this.roomSendT = 1;
    }
  }

  simulate() {
    const w = this.world;
    const ph = this.phase;
    const frozen = ph === 'freeze';
    const canFight = ph === 'live';
    const teams = this.modeDef.teams;

    for (const s of this.slots.values()) {
      const ent = s.ent;
      // One input per tick, so inputs run on evenly spaced ticks (clients predict that timing), with
      // a catch-up to two per tick when a low-FPS client's bursts pile up. The token bucket keeps the
      // average at one input per tick, so nobody can move faster than real time.
      s.budget = Math.min(s.budget + 1, 10);
      if (s.inputs.length > 30) s.inputs.splice(0, s.inputs.length - 10); // hopelessly behind: drop old inputs
      let take = s.inputs.length > 4 ? 2 : 1;
      // Shortly before the freeze ends, pick this player's first unfrozen input (see shared/net/phase.js)
      if (ph === 'freeze' && s.liveSeq === null && this.tick >= this.phaseEndTick - LIVE_SEQ_LEAD) {
        s.liveSeq = s.lastSeq + (this.phaseEndTick + 1 - this.tick);
        s.liveTickMin = this.phaseEndTick + 1 - LIVE_SEQ_EARLIEST;
      }
      while (take-- > 0 && s.inputs.length && s.budget >= 1) {
        const inp = s.inputs.shift();
        s.budget--;
        s.lastSeq = inp.s;
        if (!ent || !ent.alive) continue;
        let fr = frozen, cf = canFight;
        if (s.liveSeq !== null && (ph === 'freeze' || ph === 'live')) {
          // A client can't unfreeze itself early by skipping ahead in sequence numbers
          fr = !(inp.s >= s.liveSeq && this.tick >= s.liveTickMin);
          cf = !fr;
        }
        w.processInput(ent, inp, DT, { frozen: fr, canFight: cf });
        s.fxAcc |= ent.ms.fx;
      }
      if (!teams && ent) {
        // FFA: respawn and health regen
        if (!ent.alive && !s.disc) {
          s.respawnT -= DT;
          if (s.respawnT <= 0 && ph === 'live') this.spawnFFA(s);
        } else if (ent.alive) {
          ent.lastHurtT += DT;
          if (ent.lastHurtT > FFA.regenDelay && ent.hp < MAX_HP) ent.hp = Math.min(MAX_HP, ent.hp + FFA.regenPerSec * DT);
        }
      }
    }
    this.lag.record(this.tick, w.players.values());

    const evs = w.takeEvents();
    for (const e of evs) {
      this.events.push(e);
      if (e.e === 'kill' && !teams) {
        const v = this.slots.get(e.v);
        if (v) v.respawnT = FFA.respawnDelay;
      }
      if (e.e === 'kill') this.dirty = true;
    }

    // Phase timers and win conditions. Inputs processed this tick used the phase at the start of the
    // tick, so the first unfrozen inputs are the ones processed at tick phaseEndTick + 1.
    const over = this.tick >= this.phaseEndTick;
    if (teams) {
      if (ph === 'freeze' && over) { this.setPhase('live', ROUND.roundTime); this.events.push({ e: 'go' }); }
      else if (ph === 'live') {
        const alive = [0, 0], hp = [0, 0];
        for (const s of this.slots.values()) if (s.ent && s.ent.alive) { alive[s.team]++; hp[s.team] += s.ent.hp; }
        if (alive[0] === 0 || alive[1] === 0) this.endRound(alive[0] === 0 && alive[1] === 0 ? -1 : alive[0] === 0 ? 1 : 0);
        else if (over) {
          let win = -1;
          if (alive[0] !== alive[1]) win = alive[0] > alive[1] ? 0 : 1;
          else if (Math.abs(hp[0] - hp[1]) >= 1) win = hp[0] > hp[1] ? 0 : 1;
          this.endRound(win);
        }
      } else if (ph === 'roundEnd' && over) {
        if (this.matchWinner !== null) this.endMatch(this.matchWinner);
        else {
          if (this.round === ROUND.halftimeAfter && !this.half) this.half = true;
          this.startRound();
        }
      } else if (ph === 'matchEnd' && over) this.backToLobby();
    } else {
      if (ph === 'live') {
        let top = null;
        for (const s of this.slots.values()) if (s.ent && (!top || s.ent.kills > top.ent.kills)) top = s;
        if ((top && top.ent.kills >= FFA.killLimit) || over) this.endMatch(top ? top.id : -1);
      } else if (ph === 'matchEnd' && over) this.backToLobby();
    }
  }

  // ------------------------------------------------------------------ network output
  sendSnapshots() {
    const w = this.world;
    if (!w) return;
    const others = [];
    for (const s of this.slots.values()) {
      const e = s.ent;
      if (!e) continue;
      const ms = e.ms;
      const flags = (ms.grounded ? 1 : 0) | (ms.sliding ? 2 : 0) | (e.alive ? 4 : 0) | (ms.crouching ? 8 : 0);
      others.push([s.id, r3(ms.x), r3(ms.y), r3(ms.z), r3(ms.yaw), r3(ms.pitch), r3(ms.h), flags,
        WEAPON_IDS.indexOf(e.ws.slots[e.ws.cur]), Math.ceil(e.hp), s.fxAcc]);
      s.fxAcc = 0;
    }
    const ev = this.events;
    this.events = [];
    const pt = r1(Math.max(0, this.phaseT));
    for (const s of this.slots.values()) {
      if (s.disc) continue;
      const e = s.ent;
      const msg = { t: S.SNAP, k: this.tick, ack: s.lastSeq, ph: this.phase, pt, pe: this.phaseEndTick, life: s.life, p: others };
      if (s.liveSeq !== null) msg.ls = s.liveSeq;
      if (e && e.alive) {
        msg.ms = MOVE_KEYS.map((k) => e.ms[k]);
        msg.ws = WEAPON_KEYS.map((k) => e.ws[k]);
        msg.hp = e.hp;
      }
      if (ev.length) msg.ev = ev;
      s.conn.send(msg);
    }
  }

  roomState() {
    return {
      t: S.ROOM, code: this.code, pub: this.pub, host: this.hostId, mode: this.mode, map: this.mapId,
      phase: this.phase, pt: r1(Math.max(0, this.phaseT)), round: this.round, sc: this.scores, half: this.half,
      winner: this.matchWinner, result: this.phase === 'matchEnd' ? this.lastResult : null,
      players: [...this.slots.values()].map((s) => ({
        id: s.id, name: s.name, team: s.team, ready: s.ready, disc: s.disc, ping: s.ping,
        k: s.ent?.kills ?? 0, d: s.ent?.deaths ?? 0, dmg: Math.round(s.ent?.damage ?? 0), alive: !!s.ent?.alive,
        lo: s.loadout,
      })),
    };
  }

  sendRoomState() {
    const st = this.roomState();
    for (const s of this.slots.values()) if (!s.disc) s.conn.send(st);
  }

  broadcast(msg) {
    for (const s of this.slots.values()) if (!s.disc) s.conn.send(msg);
  }
}
