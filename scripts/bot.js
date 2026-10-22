#!/usr/bin/env node
// Headless bot clients for testing. They connect over WebSocket like a browser, ready up, and play
// "randomly with intent": wander, strafe, jump, slide, dash, and shoot at visible enemies.
//
//   node scripts/bot.js --count 4 --mode 2v2 --assert            # create a room, play a full match, verify it
//   node scripts/bot.js --count 2 --code ABCD                     # join an existing room (e.g. yours)
//   node scripts/bot.js --count 6 --mode 3v3 --chaos --assert     # with random disconnects/reconnects + junk messages
//   node scripts/bot.js --count 3 --quick                         # quick-play
//
// Options: --url ws://localhost:3000/ws  --count N  --mode 1v1|2v2|3v3|ffa  --map ID  --code XXXX
//          --quick  --duration SEC  --assert  --chaos  --fuzz  --skill 0..1  --rooms N  --quiet
//          --roles hunter,passive,...   (per-bot behaviour, in join order)
import WebSocket from 'ws';
import { CollisionWorld } from '../shared/sim/collision.js';
import { MAPS } from '../shared/maps/index.js';
import { BTN, C, S } from '../shared/net/protocol.js';
import { MOVE_KEYS } from '../shared/sim/movement.js';
import { PRIMARIES, SECONDARIES } from '../shared/config/weapons.js';
import { ROUND, FFA } from '../shared/config/game.js';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  if (i < 0) return def;
  const v = args[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const URL_ = opt('url', 'ws://localhost:3000/ws');
const COUNT = Number(opt('count', 2));
const MODE = opt('mode', COUNT <= 2 ? '1v1' : COUNT <= 4 ? '2v2' : '3v3');
const MAP = opt('map', undefined);
const CODE = opt('code', null);
const QUICK = !!opt('quick', false);
const DURATION = Number(opt('duration', 600));
const ASSERT = !!opt('assert', false);
const CHAOS = !!opt('chaos', false);
const FUZZ = !!opt('fuzz', false);
const SKILL = Number(opt('skill', 0.6));
const ROOMS = Number(opt('rooms', 1));
const QUIET = !!opt('quiet', false);
// --roles hunter,passive,...: per-bot behaviour in join order (bots then join one at a time, so team
// auto-balance is predictable). passive = crouches in spawn and never shoots; hunter = perfect aim,
// always heads for the nearest enemy; walker = heads for the nearest enemy but never shoots.
// Bots without a role play normally.
const ROLES = typeof opt('roles', '') === 'string' ? opt('roles', '').split(',').filter(Boolean) : [];

const log = (...a) => { if (!QUIET) console.log(...a); };
const failures = [];
const fail = (msg) => { failures.push(msg); console.error('  ✗ ' + msg); };

class Bot {
  constructor(i, group) {
    this.i = i;
    this.group = group;
    this.name = `Bot${group.id}${String.fromCharCode(65 + i)}`;
    this.token = null;
    this.id = null;
    this.seq = 0;
    this.room = null;
    this.me = null;
    this.alive = false;
    this.ents = [];
    this.lastTick = 0;
    this.snaps = 0;
    this.wanderYaw = Math.random() * Math.PI * 2;
    this.yaw = 0; this.pitch = 0;
    this.strafe = 0; this.strafeT = 0;
    this.stuckT = 0; this.lastPos = null;
    this.events = [];
    this.connected = false;
    this.reconnects = 0;
    this.closedOnPurpose = false;
    this.role = ROLES[i] || 'normal';
  }

  connect() {
    this.ws = new WebSocket(URL_);
    this.ws.on('open', () => {
      this.connected = true;
      this.send({ t: C.HELLO, name: this.name, token: this.token || undefined });
    });
    this.ws.on('message', (d) => this.onMessage(JSON.parse(d.toString())));
    this.ws.on('close', () => {
      this.connected = false;
      if (this.closedOnPurpose) {
        this.closedOnPurpose = false;
        setTimeout(() => { this.reconnects++; this.connect(); }, 500 + Math.random() * 3000);
      }
    });
    this.ws.on('error', (e) => { if (!this.group.done) log(`${this.name} socket error: ${e.message}`); });
  }

  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(typeof m === 'string' ? m : JSON.stringify(m)); }

  onMessage(m) {
    switch (m.t) {
      case S.WELCOME: {
        const resumed = m.resumed;
        this.id = m.id; this.token = m.token;
        if (resumed) { log(`  ${this.name} reconnected to ${resumed}`); this.group.resumes++; return; }
        if (this.room) { log(`  ${this.name} could not resume (slot gone)`); this.group.lostSlots++; }
        this.group.onWelcome(this);
        break;
      }
      case S.ROOM: this.onRoom(m); break;
      case S.SNAP: this.onSnap(m); break;
      case S.ERROR: log(`  ${this.name} error: ${m.msg}`); break;
      default: break;
    }
  }

  onRoom(r) {
    const first = !this.room;
    this.room = r;
    if (first) {
      this.send({ t: C.LOADOUT, p: PRIMARIES[Math.floor(Math.random() * PRIMARIES.length)], s: SECONDARIES[Math.floor(Math.random() * SECONDARIES.length)] });
      this.group.onJoined(this, r);
    }
    const me = r.players.find((p) => p.id === this.id);
    if ((r.phase === 'lobby' || r.phase === 'countdown') && me && !me.ready && this.group.readyToStart(this, r)) {
      setTimeout(() => this.send({ t: C.READY, ready: true }), 200 + Math.random() * 500);
    }
    this.group.onRoomState(this, r);
  }

  onSnap(m) {
    this.snaps++;
    if (m.k <= this.lastTick) fail(`${this.name}: snapshot ticks went backwards (${m.k} after ${this.lastTick})`);
    this.lastTick = m.k;
    this.ents = m.p;
    if (m.ms) {
      const ms = {};
      MOVE_KEYS.forEach((k, i) => { ms[k] = m.ms[i]; });
      this.me = ms;
      this.alive = true;
    } else this.alive = false;
    if (m.ev) for (const ev of m.ev) this.group.onEvent(this, ev);
  }

  teamOf(id) { return this.room?.players.find((p) => p.id === id)?.team; }

  /** One 60 Hz input. */
  step(coll) {
    if (!this.connected || !this.room || this.room.phase === 'lobby' || this.room.phase === 'countdown') return;
    let b = 0, w = 0;
    if (this.role === 'passive') {
      b = this.alive ? BTN.CROUCH : 0;
    } else if (this.alive && this.me) {
      const hunter = this.role === 'hunter' || this.role === 'walker';
      const skill = hunter ? 1 : SKILL;
      const me = this.me;
      const eye = [me.x, me.y + me.eye, me.z];
      const teams = this.room.mode !== 'ffa';
      const myTeam = this.teamOf(this.id);
      let target = null, td = Infinity;
      for (const e of this.ents) {
        const [id, x, y, z, , , h, flags] = e;
        if (id === this.id || !(flags & 4)) continue;
        if (teams && this.teamOf(id) === myTeam) continue;
        const dx = x - eye[0], dy = y + h * 0.65 - eye[1], dz = z - eye[2];
        const d = Math.hypot(dx, dy, dz);
        if (d > 80 || d >= td) continue;
        const wall = coll.raycast(eye[0], eye[1], eye[2], dx / d, dy / d, dz / d, d);
        if (wall !== Infinity) continue;
        target = { x, y: y + h * 0.65, z, d }; td = d;
      }
      // Hunters head for the nearest living enemy even without line of sight
      let chase = null;
      if (hunter && !target) {
        let cd = Infinity;
        for (const [id, x, , z, , , , flags] of this.ents) {
          if (id === this.id || !(flags & 4) || (teams && this.teamOf(id) === myTeam)) continue;
          const d = Math.hypot(x - me.x, z - me.z);
          if (d < cd) { cd = d; chase = { x, z }; }
        }
      }
      // Movement: forward + periodic strafes, jumps, slides and dashes
      this.strafeT -= 1 / 60;
      if (this.strafeT <= 0) { this.strafe = Math.floor(Math.random() * 3) - 1; this.strafeT = 0.3 + Math.random() * 1.2; }
      b |= BTN.FWD;
      if (this.strafe < 0) b |= BTN.LEFT;
      if (this.strafe > 0) b |= BTN.RIGHT;
      if (Math.random() < 0.6) b |= BTN.SPRINT;
      if (Math.random() < 0.02) b |= BTN.JUMP;
      if (Math.random() < 0.01) b |= BTN.CROUCH | BTN.SPRINT;
      // Air jump: a fresh press while rising or at the top of a jump (the server ignores it once spent)
      if (!me.grounded && !me.wallRun && me.airJumps > 0 && me.vy < 2 && !this.jumpHeld && Math.random() < 0.04) b |= BTN.JUMP;
      // Dash: on the ground now and then, in the air sometimes, toward a target when chasing
      if (me.dashCd <= 0 && Math.random() < (me.grounded ? (chase || target ? 0.012 : 0.004) : 0.02)) b |= BTN.DASH;
      // Wall run: keep forward held next to walls (the sim decides); kick off after a moment
      if (me.wallRun) {
        b |= BTN.FWD;
        if (me.wrT < 0.5 && !this.jumpHeld && Math.random() < 0.08) b |= BTN.JUMP;
      }
      this.jumpHeld = !!(b & BTN.JUMP);
      // Stuck detection
      if (this.lastPos && Math.hypot(me.x - this.lastPos[0], me.z - this.lastPos[1]) < 0.02) this.stuckT += 1 / 60; else this.stuckT = 0;
      this.lastPos = [me.x, me.z];
      if (this.stuckT > 0.6) { this.wanderYaw += Math.PI * (0.5 + Math.random()); this.stuckT = 0; b |= BTN.JUMP; }
      if (Math.random() < 0.005) this.wanderYaw += (Math.random() - 0.5) * 2;
      let goalYaw = this.wanderYaw, goalPitch = 0;
      if (chase && this.stuckT === 0) goalYaw = Math.atan2(-(chase.x - me.x), -(chase.z - me.z));
      if (target) {
        const dx = target.x - eye[0], dz = target.z - eye[2];
        goalYaw = Math.atan2(-dx, -dz);
        goalPitch = Math.atan2(target.y - eye[1], Math.hypot(dx, dz));
        const noise = (1 - skill) * 0.08;
        goalYaw += (Math.random() - 0.5) * noise;
        goalPitch += (Math.random() - 0.5) * noise;
        if (target.d < 25 && Math.random() < 0.5) b &= ~BTN.FWD; // stop and shoot a bit
      }
      const dyaw = Math.atan2(Math.sin(goalYaw - this.yaw), Math.cos(goalYaw - this.yaw));
      this.yaw += dyaw * (target ? 0.25 + skill * 0.3 : hunter ? 0.2 : 0.08);
      this.pitch += (goalPitch - this.pitch) * 0.3;
      if (target && Math.abs(dyaw) < 0.08 && this.role !== 'walker') b |= BTN.FIRE;
      if (!hunter && Math.random() < 0.003) w = 1 + Math.floor(Math.random() * 3);
      if (Math.random() < 0.002) b |= BTN.RELOAD;
    }
    this.seq++;
    this.send({ t: C.INPUT, s: this.seq, b, y: Math.round(this.yaw * 1e4) / 1e4, p: Math.max(-1.5, Math.min(1.5, Math.round(this.pitch * 1e4) / 1e4)), w, v: this.lastTick - 6 });
  }

  chaosDisconnect() {
    if (!this.connected) return;
    this.closedOnPurpose = true;
    this.ws.terminate();
  }

  fuzz() {
    const junk = [
      'not json', '{}', '[]', 'null', '{"t":"in"}', '{"t":"in","s":-1,"b":99999,"y":"x","p":0,"w":0,"v":0}',
      JSON.stringify({ t: 'in', s: 1e12, b: 1, y: 1e300, p: 0, w: 9, v: 0 }), '{"t":"mode","mode":{"a":1}}',
      JSON.stringify({ t: 'hello', name: 'x'.repeat(1500) }), '{"t":"join","code":12}', '{"t":"__proto__"}', '{"t":"constructor"}',
      '{"t":"loadout","p":"nuke","s":"bfg"}', '{"t":"qc","i":99}', '{"t":"ready","ready":"yes"}', '\u0000\u0001',
    ];
    this.send(junk[Math.floor(Math.random() * junk.length)]);
  }
}

class Group {
  constructor(id, count) {
    this.id = id;
    this.bots = Array.from({ length: count }, (_, i) => new Bot(i, this));
    this.code = CODE;
    this.done = false;
    this.rounds = 0;
    this.roundEnds = [];
    this.halftimeSeen = false;
    this.matchEnds = 0;
    this.kills = 0;
    this.resumes = 0;
    this.lostSlots = 0;
    this.sides = new Map(); // round → spawn z sign of the host bot
    this.lastResult = null;
  }

  host() { return this.bots[0]; }

  start() { this.host().connect(); }

  onWelcome(bot) {
    if (bot === this.host()) {
      if (CODE) bot.send({ t: C.JOIN, code: CODE });
      else if (QUICK) bot.send({ t: C.QUICK });
      else bot.send({ t: C.CREATE, pub: false });
    } else if (QUICK) bot.send({ t: C.QUICK });
    else bot.send({ t: C.JOIN, code: this.code });
  }

  onJoined(bot, r) {
    if (bot === this.host()) {
      this.code = r.code;
      log(`[room ${r.code}] ${bot.name} joined (${QUICK ? 'quick play' : CODE ? 'join' : 'created'})`);
      if (!CODE && !QUICK && r.host === bot.id) bot.send({ t: C.SET_MODE, mode: MODE, map: MAP });
      // Bring in the rest (one at a time when roles are used, so team assignment is predictable)
      if (!ROLES.length) for (const other of this.bots.slice(1)) setTimeout(() => other.connect(), 100 + Math.random() * 300);
    }
    if (ROLES.length) {
      const next = this.bots[this.bots.indexOf(bot) + 1];
      if (next) setTimeout(() => next.connect(), 150);
    }
  }

  readyToStart(bot, r) {
    if (CODE) return true; // joining someone else's room: just ready up
    const want = this.bots.length;
    return r.players.length >= want && r.mode === (QUICK ? r.mode : MODE);
  }

  onRoomState(bot, r) {
    if (bot !== this.host()) return;
    if (r.phase === 'matchEnd' && r.result && this.lastResult !== r.result) this.lastResult = r.result;
  }

  onEvent(bot, ev) {
    if (bot !== this.host()) return;
    if (ev.e === 'round') {
      this.rounds = ev.n;
      setTimeout(() => {
        const me = bot.me;
        if (me) this.sides.set(ev.n, Math.sign(me.z));
      }, 300);
      log(`[room ${this.code}] round ${ev.n}`);
    } else if (ev.e === 'roundEnd') {
      this.roundEnds.push(ev);
      if (ev.ht) this.halftimeSeen = true;
      log(`[room ${this.code}] round over → winner ${ev.w < 0 ? 'draw' : 'team ' + ev.w}, score ${ev.sc.join('-')}${ev.ht ? ' (halftime)' : ''}`);
    } else if (ev.e === 'kill') this.kills++;
    else if (ev.e === 'matchEnd') {
      this.matchEnds++;
      log(`[room ${this.code}] MATCH OVER winner=${ev.w} ${ev.reason || ''}`);
      setTimeout(() => this.verify(), 1500);
    }
  }

  verify() {
    if (this.done) return;
    this.done = true;
    if (!ASSERT) return;
    const r = this.lastResult || this.host().room?.result;
    console.log(`[room ${this.code}] verifying match…`);
    if (!r) { fail('no match result received'); return; }
    if (MODE !== 'ffa' && r.reason !== 'forfeit') {
      const max = Math.max(...r.scores);
      if (max !== ROUND.winsNeeded) fail(`winner should have ${ROUND.winsNeeded} rounds, got ${r.scores.join('-')}`);
      else console.log(`  ✓ final score ${r.scores.join('-')}`);
      if (r.rounds !== r.scores[0] + r.scores[1] + r.draws) fail(`round count mismatch: ${r.rounds} rounds vs score ${r.scores.join('-')} + ${r.draws} draws`);
      else console.log(`  ✓ ${r.rounds} rounds played (${r.draws} draws)`);
      if (r.rounds > ROUND.halftimeAfter) {
        if (!this.halftimeSeen && !r.half) fail('halftime never happened');
        const before = this.sides.get(1), after = this.sides.get(ROUND.halftimeAfter + 1);
        if (before !== undefined && after !== undefined) {
          if (before === after) fail(`sides did not swap at halftime (spawn side ${before} → ${after})`);
          else console.log('  ✓ halftime announced and sides swapped');
        } else console.log('  ~ halftime announced (spawn side not sampled)');
      }
    } else if (MODE === 'ffa') {
      const top = Math.max(...r.players.map((p) => p.k));
      console.log(`  ✓ FFA ended, top fragger has ${top} kills (limit ${FFA.killLimit})`);
    }
    const k = r.players.reduce((a, p) => a + p.k, 0), d = r.players.reduce((a, p) => a + p.d, 0);
    if (k > d) fail(`more kills (${k}) than deaths (${d})`);
    else console.log(`  ✓ K/D totals consistent: ${k} kills, ${d} deaths`);
    if (r.players.length !== this.bots.length) console.log(`  ~ ${r.players.length}/${this.bots.length} players in result (chaos may have dropped some)`);
    for (const b of this.bots) {
      if (b.snaps === 0) fail(`${b.name} never received a snapshot`);
    }
  }
}

// ------------------------------------------------------------------ main
const groups = Array.from({ length: CODE || QUICK ? 1 : ROOMS }, (_, i) => new Group(i + 1, COUNT));
for (const g of groups) g.start();

const colls = new Map();
const collFor = (room) => {
  const id = room?.map || 'kiln';
  if (!colls.has(id)) colls.set(id, new CollisionWorld(MAPS[id] || MAPS.kiln));
  return colls.get(id);
};

const t0 = Date.now();
let next = performance.now();
let inputs = 0;
const loop = () => {
  const now = performance.now();
  while (now >= next) {
    for (const g of groups) for (const b of g.bots) { if (b.room) { b.step(collFor(b.room)); inputs++; } }
    next += 1000 / 60;
  }
  if (now - next > 200) next = now;
  setTimeout(loop, Math.max(0, next - performance.now()));
};
loop();

if (CHAOS) {
  setInterval(() => {
    for (const g of groups) {
      const live = g.bots.filter((b) => b.connected && b.room && b.room.phase !== 'lobby');
      if (live.length && Math.random() < 0.5) {
        const b = live[Math.floor(Math.random() * live.length)];
        log(`  [chaos] ${b.name} drops connection`);
        b.chaosDisconnect();
      }
    }
  }, 7000);
}
if (FUZZ || CHAOS) {
  // --chaos: occasional junk (should be tolerated). --fuzz: a flood (the server should kick, not crash).
  setInterval(() => { for (const g of groups) for (const b of g.bots) if (b.connected && b.room && b.room.phase !== 'lobby') b.fuzz(); }, FUZZ ? 50 : 2500);
}

const status = setInterval(async () => {
  const elapsed = (Date.now() - t0) / 1000;
  const allDone = groups.every((g) => g.done);
  if (allDone || elapsed > DURATION) {
    clearInterval(status);
    try {
      const http = URL_.replace(/^ws/, 'http').replace(/\/ws$/, '');
      const st = await (await fetch(http + '/stats')).json();
      console.log(`server: ${st.conns} conns, ${st.rooms.length} rooms, tick avg ${st.tickMs.avg.toFixed(3)} ms, p99 ${st.tickMs.p99.toFixed(3)} ms, max ${st.tickMs.max.toFixed(2)} ms, malformed msgs ${st.malformed}`);
      if (ASSERT && st.tickMs.p99 > 8) fail(`server tick p99 too high: ${st.tickMs.p99.toFixed(2)} ms`);
    } catch (e) { console.log('could not read /stats:', e.message); }
    for (const g of groups) {
      const snaps = g.bots.map((b) => b.snaps);
      console.log(`[room ${g.code}] rounds=${g.roundEnds.length} kills=${g.kills} matchEnds=${g.matchEnds} resumes=${g.resumes} lostSlots=${g.lostSlots} snapshots/bot=${snaps.join(',')} (${(Math.min(...snaps) / elapsed).toFixed(1)}/s min)`);
      if (ASSERT && !g.done) fail(`room ${g.code}: match did not finish within ${DURATION}s`);
    }
    if (ASSERT) console.log(failures.length ? `FAILED (${failures.length})` : 'ALL CHECKS PASSED');
    for (const g of groups) for (const b of g.bots) { b.closedOnPurpose = false; try { b.ws.close(); } catch { /* ignore */ } }
    setTimeout(() => process.exit(failures.length ? 1 : 0), 300);
  }
}, 1000);
void inputs;
