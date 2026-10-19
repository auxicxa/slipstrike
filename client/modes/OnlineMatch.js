// Online match session: client-side prediction + reconciliation for the local player,
// snapshot interpolation for everyone else, spectating, and round/HUD state.
import { CollisionWorld } from '../../shared/sim/collision.js';
import { createMoveState, copyMoveState, MOVE_KEYS, FX } from '../../shared/sim/movement.js';
import { createWeaponState, WEAPON_KEYS } from '../../shared/sim/weapons.js';
import { stepPlayer } from '../../shared/sim/world.js';
import { MAPS } from '../../shared/maps/index.js';
import { DT, TICK_RATE, INTERP_DELAY, MODES, TEAM_NAMES, ROUND } from '../../shared/config/game.js';
import { PRIMARIES, SECONDARIES } from '../../shared/config/weapons.js';
import { MOVEMENT as M } from '../../shared/config/movement.js';
import { C, S } from '../../shared/net/protocol.js';
import { lerpAngle } from '../../shared/sim/math.js';
import { sfx } from '../audio/Sfx.js';
import { input } from '../core/Input.js';

export const WEAPON_IDS = ['rifle', 'shotgun', 'sniper', 'pistol', 'revolver', 'knife'];
const INTERP_TICKS = INTERP_DELAY * TICK_RATE;

export class OnlineMatch {
  constructor(game, net, room, hooks = {}) {
    this.game = game;
    this.net = net;
    this.hooks = hooks; // { onEvent(ev) }
    this.room = room;
    this.myId = net.id;
    this.map = MAPS[room.map] || MAPS.kiln;
    this.coll = new CollisionWorld(this.map);
    this.me = { id: this.myId, ms: createMoveState(), ws: createWeaponState(), alive: false, hp: 100 };
    this.prev = copyMoveState({}, this.me.ms);
    this.history = [];
    this.seq = 0;
    this.acc = 0;
    this.alpha = 0;
    this.snaps = [];
    this.tickOffset = null;
    this.life = -1;
    this.ready = false;
    this.err = { x: 0, y: 0, z: 0 };
    this.corrections = 0;
    this.lastCorrection = 0;
    this.phase = room.phase;
    this.phaseT = room.pt;
    this.phaseAt = performance.now();
    this.specId = null;
    this.remoteSteps = new Map();
    this.lastEnts = new Map();
    this.bannerT = 0;
    // ?netdebug: remember predicted states per input so mispredictions can be diagnosed
    this.debug = new URLSearchParams(location.search).has('netdebug') ? new Map() : null;
    this.mispredicts = [];
    this.offs = [
      net.on(S.SNAP, (m) => this.onSnap(m)),
      net.on(S.CHAT, (m) => this.onChat(m)),
      input.on('key', (code) => this.onKey(code)),
    ];
  }

  dispose() {
    for (const off of this.offs) off();
    this.game.hud.showLoadout(null);
    this.game.hud.setBanner('');
  }

  initialYaw() {
    const p = this.room.players.find((x) => x.id === this.myId);
    const side = p ? (this.room.half ? 1 - p.team : p.team) : 0;
    return this.map.spawns[side]?.[0]?.[3] ?? 0;
  }

  localPlayer() { return this.me; }
  get teams() { return MODES[this.room.mode]?.teams !== false; }
  get myTeam() { return this.room.players.find((p) => p.id === this.myId)?.team ?? 0; }

  setRoom(room) {
    this.room = room;
    if (room.phase !== this.phase) { this.phase = room.phase; }
    this.phaseT = room.pt;
    this.phaseAt = performance.now();
  }

  // ------------------------------------------------------------------ server clock
  serverTick() {
    if (this.tickOffset === null) return 0;
    return (performance.now() / 1000) * TICK_RATE + this.tickOffset;
  }
  renderTick() { return this.serverTick() - INTERP_TICKS; }

  // ------------------------------------------------------------------ fixed update
  update(dt, game) {
    this.acc += dt;
    let n = 0;
    while (this.acc >= DT && n < 8) {
      this.acc -= DT;
      this.tick(game);
      n++;
    }
    if (n === 8) this.acc = 0;
    this.alpha = this.acc / DT;
    const k = Math.exp(-dt * 12);
    this.err.x *= k; this.err.y *= k; this.err.z *= k;
    this.updateLoadoutPanel();
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) game.hud.setBanner(''); }
  }

  tick(game) {
    const inp = game.buildInput();
    inp.s = ++this.seq;
    inp.v = Math.round(this.renderTick() * 100) / 100;
    this.net.send({ t: C.INPUT, s: inp.s, b: inp.b, y: inp.y, p: inp.p, w: inp.w, v: inp.v });
    // Every sent input is remembered until the server acknowledges it, even while dead or not yet
    // spawned: the server may process it in our next life, and replays must include it.
    const opts = { frozen: this.phase === 'freeze', canFight: this.phase === 'live' };
    this.history.push({ inp, opts });
    if (this.history.length > 240) this.history.shift();
    if (!this.me.alive || !this.ready) return;
    copyMoveState(this.prev, this.me.ms);
    const act = stepPlayer(this.me, inp, this.coll, DT, opts);
    if (this.debug) {
      this.debug.set(inp.s, { ms: { ...this.me.ms }, ws: JSON.parse(JSON.stringify(this.me.ws)), inp: { ...inp }, opts, phase: this.phase });
      this.debug.delete(inp.s - 300);
    }
    game.onLocalTick(this.me, act);
  }

  // ------------------------------------------------------------------ snapshots
  onSnap(m) {
    const now = performance.now();
    const sample = m.k - (now / 1000) * TICK_RATE;
    if (this.tickOffset === null || Math.abs(sample - this.tickOffset) > 30) this.tickOffset = sample;
    else this.tickOffset += (sample - this.tickOffset) * (sample > this.tickOffset ? 0.25 : 0.05);

    const ents = new Map();
    for (const a of m.p) {
      ents.set(a[0], { id: a[0], x: a[1], y: a[2], z: a[3], yaw: a[4], pitch: a[5], h: a[6], flags: a[7], weapon: WEAPON_IDS[a[8]] || 'rifle', hp: a[9], fx: a[10] });
    }
    this.snaps.push({ k: m.k, ents });
    if (this.snaps.length > 40) this.snaps.shift();

    // Remote movement sounds
    for (const e of ents.values()) {
      if (e.id === this.myId || !(e.flags & 4) || !e.fx) continue;
      const pos = [e.x, e.y + 0.2, e.z];
      if (e.fx & FX.JUMP) sfx.jump(pos);
      if (e.fx & FX.LAND) sfx.land(0.6, pos);
      if (e.fx & FX.DASH) sfx.dash(pos);
      if (e.fx & FX.SLIDE) sfx.slide(pos);
    }

    if (m.ph !== this.phase) this.phase = m.ph;
    this.phaseT = m.pt;
    this.phaseAt = now;

    // Local player: new life (spawn) → hard reset, otherwise reconcile
    if (m.ms) {
      if (m.life !== this.life || !this.ready) {
        this.life = m.life;
        this.applyServerState(m);
        this.history = this.history.filter((h) => h.inp.s > m.ack);
        for (const h of this.history) stepPlayer(this.me, h.inp, this.coll, DT, h.opts);
        copyMoveState(this.prev, this.me.ms);
        this.err.x = this.err.y = this.err.z = 0;
        this.game.setView(this.me.ms.yaw, 0);
        this.ready = true;
        this.specId = null;
      } else this.reconcile(m);
      this.me.alive = true;
      this.me.hp = m.hp;
    } else {
      this.me.alive = false;
      this.history = this.history.filter((h) => h.inp.s > m.ack);
    }
    if (m.ev) {
      this.game.handleEvents(m.ev, this.myId);
      for (const ev of m.ev) this.onEvent(ev);
    }
  }

  applyServerState(m) {
    MOVE_KEYS.forEach((k, i) => { this.me.ms[k] = m.ms[i]; });
    WEAPON_KEYS.forEach((k, i) => { const v = m.ws[i]; this.me.ws[k] = Array.isArray(v) ? v.slice() : v; });
  }

  reconcile(m) {
    const ms = this.me.ms;
    const bx = ms.x, by = ms.y, bz = ms.z;
    this.applyServerState(m);
    if (this.debug) {
      const pred = this.debug.get(m.ack);
      if (pred) {
        const diff = MOVE_KEYS.filter((k) => k !== 'fx' && pred.ms[k] !== ms[k] && !(typeof ms[k] === 'number' && Math.abs(pred.ms[k] - ms[k]) < 1e-9));
        for (const k of WEAPON_KEYS) if (k !== 'fx' && JSON.stringify(pred.ws[k]) !== JSON.stringify(this.me.ws[k])) diff.push('ws.' + k);
        if (diff.length && this.mispredicts.length < 20) {
          this.mispredicts.push({ seq: m.ack, phase: pred.phase, serverPhase: m.ph, inp: pred.inp, opts: pred.opts, diff: diff.map((k) => (k.startsWith('ws.') ? [k, pred.ws[k.slice(3)], this.me.ws[k.slice(3)]] : [k, pred.ms[k], ms[k]])) });
        }
      }
    }
    this.history = this.history.filter((h) => h.inp.s > m.ack);
    for (const h of this.history) stepPlayer(this.me, h.inp, this.coll, DT, h.opts);
    const dx = bx - ms.x, dy = by - ms.y, dz = bz - ms.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > 0.001) {
      if (this.debug && this.mispredicts.length < 20) {
        const seqs = this.history.map((h) => h.inp.s);
        this.mispredicts.push({ correction: d, ack: m.ack, hist: [seqs[0], seqs[seqs.length - 1], seqs.length], gaps: seqs.some((v, i) => i && v !== seqs[i - 1] + 1), predAtAck: !!this.debug.get(m.ack) });
      }
      this.corrections++;
      this.lastCorrection = d;
      if (d < 2) {
        // Hide small corrections by blending them out over ~100 ms
        this.err.x += dx; this.err.y += dy; this.err.z += dz;
        this.prev.x -= dx; this.prev.y -= dy; this.prev.z -= dz;
      } else copyMoveState(this.prev, ms);
    }
  }

  onEvent(ev) {
    const hud = this.game.hud;
    if (ev.e === 'round') {
      hud.setBanner(`ROUND ${ev.n}`, this.teams ? `${this.scoreText()}  ·  pick your loadout` : '', '');
      this.bannerT = 2.5;
      sfx.beep(false);
    } else if (ev.e === 'go') {
      hud.setBanner('FIGHT', '', 'win');
      this.bannerT = 0.9;
      sfx.beep(true);
    } else if (ev.e === 'roundEnd') {
      const mine = this.myTeam;
      const won = ev.w === mine;
      const main = ev.w < 0 ? 'DRAW' : won ? 'ROUND WON' : 'ROUND LOST';
      let sub = `${TEAM_NAMES[0]} ${ev.sc[0]} – ${ev.sc[1]} ${TEAM_NAMES[1]}`;
      if (ev.over) sub = won ? 'You won the match!' : 'Match lost';
      else if (ev.ht) sub += '  ·  Halftime: switching sides';
      hud.setBanner(main, sub, ev.w < 0 ? '' : won ? 'win' : 'lose');
      this.bannerT = ROUND.roundEndTime;
      sfx.roundWin(won);
    } else if (ev.e === 'matchEnd') {
      hud.setBanner('');
    }
    this.hooks.onEvent?.(ev);
  }

  onChat(m) {
    const p = this.room.players.find((x) => x.id === m.from);
    this.game.hud.chatMessage(p ? p.name : '?', p ? (this.teams ? p.team : 'x') : 'x', m.i);
    sfx.chat();
  }

  sendChat(i) { this.net.send({ t: C.CHAT, i }); }

  // ------------------------------------------------------------------ loadout during freeze
  loadoutWindow() {
    if (this.teams) return this.phase === 'freeze' || this.phase === 'roundEnd';
    return !this.me.alive;
  }

  myLoadout() { return this.room.players.find((p) => p.id === this.myId)?.lo || { p: 'rifle', s: 'pistol' }; }

  pickLoadout(p, s) {
    const lo = this.room.players.find((x) => x.id === this.myId);
    if (lo) lo.lo = { p, s };
    this.net.send({ t: C.LOADOUT, p, s });
    try { localStorage.setItem('slipstrike.loadout', JSON.stringify({ p, s })); } catch { /* ignore */ }
    this.loadoutKey = '';
  }

  updateLoadoutPanel() {
    const show = this.loadoutWindow() && !this.game.paused;
    const cur = this.myLoadout();
    const key = show ? cur.p + cur.s : '';
    if (key === this.loadoutKey) return;
    this.loadoutKey = key;
    this.game.hud.showLoadout(show ? { primaries: PRIMARIES, secondaries: SECONDARIES, cur, onPick: (p, s) => this.pickLoadout(p, s) } : null);
  }

  onKey(code) {
    if (!this.loadoutWindow() || this.game.paused) return;
    const n = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Digit5: 5 }[code];
    if (!n) return;
    const cur = this.myLoadout();
    if (n <= PRIMARIES.length) this.pickLoadout(PRIMARIES[n - 1], cur.s);
    else if (n - PRIMARIES.length <= SECONDARIES.length) this.pickLoadout(cur.p, SECONDARIES[n - PRIMARIES.length - 1]);
  }

  // ------------------------------------------------------------------ spectating
  onAction(a, down) {
    if (!down || this.me.alive) return;
    if (a === 'fire' || a === 'jump') this.cycleSpectate(a === 'fire' ? 1 : -1);
  }

  spectateCandidates() {
    const ents = this.interpolated();
    const myTeam = this.myTeam;
    return ents.filter((e) => e.alive && e.id !== this.myId && (!this.teams || this.room.players.find((p) => p.id === e.id)?.team === myTeam));
  }

  cycleSpectate(dir) {
    const c = this.spectateCandidates();
    if (!c.length) { this.specId = null; return; }
    const i = c.findIndex((e) => e.id === this.specId);
    this.specId = c[(i + dir + c.length) % c.length].id;
  }

  spectateView() {
    if (this.me.alive) return null;
    const c = this.spectateCandidates();
    if (!c.length) return null;
    let e = c.find((x) => x.id === this.specId);
    if (!e) { e = c[0]; this.specId = e.id; }
    return { x: e.x, y: e.y, z: e.z, eye: e.h - 0.18, yaw: e.yaw, pitch: e.pitch, name: this.playerName(e.id) };
  }

  // ------------------------------------------------------------------ drawing
  localView() {
    if (!this.ready) return null;
    const a = this.alpha, p = this.prev, c = this.me.ms;
    return {
      x: p.x + (c.x - p.x) * a + this.err.x, y: p.y + (c.y - p.y) * a + this.err.y, z: p.z + (c.z - p.z) * a + this.err.z,
      eye: p.eye + (c.eye - p.eye) * a,
      vx: c.vx, vz: c.vz, vy: c.vy, grounded: c.grounded, sliding: c.sliding, dashCd: c.dashCd, dashUsed: c.dashUsed,
      alive: this.me.alive, hp: this.me.hp, ws: this.me.ws,
    };
  }

  /** Remote entities interpolated at the render tick. */
  interpolated() {
    const snaps = this.snaps;
    if (!snaps.length) return [];
    const rt = this.renderTick();
    let a = snaps[0], b = snaps[0];
    if (rt >= snaps[snaps.length - 1].k) { a = b = snaps[snaps.length - 1]; }
    else {
      for (let i = snaps.length - 1; i > 0; i--) {
        if (snaps[i - 1].k <= rt) { a = snaps[i - 1]; b = snaps[i]; break; }
      }
    }
    const f = b.k > a.k ? Math.max(0, Math.min(1, (rt - a.k) / (b.k - a.k))) : 1;
    const out = [];
    for (const eb of b.ents.values()) {
      const ea = a.ents.get(eb.id);
      if (!ea || Math.abs(ea.x - eb.x) + Math.abs(ea.z - eb.z) > 6 || (ea.flags & 4) !== (eb.flags & 4)) {
        out.push(entOut(eb, eb));
        continue;
      }
      const e = entOut(eb, f < 0.5 ? ea : eb);
      e.x = ea.x + (eb.x - ea.x) * f; e.y = ea.y + (eb.y - ea.y) * f; e.z = ea.z + (eb.z - ea.z) * f;
      e.yaw = lerpAngle(ea.yaw, eb.yaw, f); e.pitch = ea.pitch + (eb.pitch - ea.pitch) * f;
      e.h = ea.h + (eb.h - ea.h) * f;
      out.push(e);
    }
    return out;
  }

  remotes() {
    const list = this.interpolated().filter((e) => e.id !== this.myId);
    const teamOf = (id) => this.room.players.find((p) => p.id === id)?.team ?? 0;
    for (const e of list) {
      e.team = this.teams ? teamOf(e.id) : (e.id === this.myId ? 0 : 1);
      // Footsteps for remote players
      let st = this.remoteSteps.get(e.id);
      if (!st) { st = { x: e.x, z: e.z, d: 0 }; this.remoteSteps.set(e.id, st); }
      const moved = Math.hypot(e.x - st.x, e.z - st.z);
      st.x = e.x; st.z = e.z;
      if (e.alive && e.grounded && !e.sliding && moved < 1) {
        st.d += moved;
        if (st.d > M.footstepDistance) { st.d = 0; sfx.footstep([e.x, e.y, e.z], moved > 0.12); }
      }
    }
    this.lastRemotes = list;
    return list;
  }

  aimTargets() {
    const mine = this.myTeam;
    return (this.lastRemotes || []).filter((e) => e.alive && (!this.teams || e.team !== mine));
  }

  entityPos(id) {
    if (id === this.myId) return this.me.ms;
    return (this.lastRemotes || []).find((e) => e.id === id) || null;
  }

  /** Teammates get a name tag. */
  teamTag(e) {
    if (!this.teams || e.team !== this.myTeam) return null;
    return { name: this.playerName(e.id), color: e.team === 0 ? '#ffb27a' : '#8fd3ff' };
  }

  playerName(id) { return this.room.players.find((p) => p.id === id)?.name ?? '?'; }
  playerTeam(id) { return this.teams ? this.room.players.find((p) => p.id === id)?.team : (id === this.myId ? 0 : 1); }

  scoreText() { return `${this.room.sc[0]} – ${this.room.sc[1]}`; }

  hudInfo() {
    const t = Math.max(0, this.phaseT - (performance.now() - this.phaseAt) / 1000);
    const mm = Math.floor(t / 60), ss = Math.floor(t % 60);
    const timer = this.phase === 'freeze' ? `${Math.ceil(t)}` : `${mm}:${String(ss).padStart(2, '0')}`;
    const r = this.room;
    let round = '';
    if (this.teams) round = this.phase === 'freeze' ? `Round ${r.round} · get ready` : `Round ${r.round}${r.half ? ' · 2nd half' : ''}`;
    else {
      const top = r.players.reduce((a, p) => (p.k > (a?.k ?? -1) ? p : a), null);
      round = `Free-for-all${top ? ` · leader ${top.name} (${top.k})` : ''}`;
    }
    let deadMsg = null;
    if (!this.me.alive && this.ready) deadMsg = this.teams ? 'Eliminated: waiting for the next round' : 'Respawning…';
    if (!this.ready) deadMsg = this.phase === 'live' || this.phase === 'freeze' ? 'Joining. You will spawn next round.' : null;
    const recon = this.net.state === 'reconnecting' ? 'Connection lost. Reconnecting…' : null;
    return {
      top: {
        timer, round,
        a: this.teams ? r.sc[0] : null, b: this.teams ? r.sc[1] : null, myTeam: this.myTeam,
      },
      ping: this.net.rtt,
      freeze: this.phase === 'freeze' ? t : 0,
      deadMsg,
      center: recon,
      perf: `srv tick ${Math.round(this.serverTick())} · corrections ${this.corrections} (last ${this.lastCorrection.toFixed(3)} m) · in ${(this.net.bytesIn / 1024).toFixed(0)} KB`,
    };
  }

  scoreboard() {
    const r = this.room;
    const row = (p) => ({ name: p.name, kills: p.k, deaths: p.d, damage: p.dmg, ping: p.ping, me: p.id === this.myId, alive: p.alive, disc: p.disc });
    if (!this.teams) {
      return { title: `Free-for-all · ${this.map.name}`, groups: [{ team: 'x', label: '', players: r.players.slice().sort((a, b) => b.k - a.k).map(row) }] };
    }
    return {
      title: `${MODES[r.mode].label} · ${this.map.name} · Round ${r.round}`,
      groups: [0, 1].map((t) => ({ team: t, label: TEAM_NAMES[t], score: r.sc[t], players: r.players.filter((p) => p.team === t).sort((a, b) => b.k - a.k).map(row) })),
    };
  }
}

function entOut(src, flagsSrc) {
  return {
    id: src.id, x: src.x, y: src.y, z: src.z, yaw: src.yaw, pitch: src.pitch, h: src.h,
    grounded: !!(flagsSrc.flags & 1), sliding: !!(flagsSrc.flags & 2), alive: !!(flagsSrc.flags & 4),
    weapon: flagsSrc.weapon, hp: flagsSrc.hp,
  };
}
