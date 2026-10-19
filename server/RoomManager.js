// Connections, rooms, quick-play matchmaking, reconnect sessions and the global 60 Hz tick loop.
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Room } from './Room.js';
import { C, S, parseClientMessage } from '../shared/net/protocol.js';
import { sanitizeName, makeRoomCode } from '../shared/util/profanity.js';
import { TICK_RATE, RECONNECT_GRACE } from '../shared/config/game.js';

const FAKE_LAG = Number(process.env.FAKE_LAG_MS) || 0;       // one-way delay added in each direction
const FAKE_JITTER = Number(process.env.FAKE_JITTER_MS) || 0;
const MAX_MSGS_PER_SEC = 150;
const MAX_STRIKES = 40;
const MAX_ROOMS = 200;

/** FIFO with simulated latency + jitter that never reorders messages (like TCP). Testing only. */
class DelayQueue {
  constructor() { this.q = []; this.timer = null; this.last = 0; }
  push(data, fn) {
    const at = Math.max(this.last, performance.now() + FAKE_LAG + Math.random() * FAKE_JITTER);
    this.last = at;
    this.q.push({ at, data, fn });
    if (!this.timer) this.arm();
  }
  arm() {
    this.timer = setTimeout(() => {
      this.timer = null;
      const now = performance.now();
      while (this.q.length && this.q[0].at <= now + 0.5) { const m = this.q.shift(); m.fn(m.data); }
      if (this.q.length) this.arm();
    }, Math.max(0, this.q[0].at - performance.now()));
  }
}

class Conn {
  constructor(ws, id, ip) {
    this.ws = ws;
    this.id = id;
    this.ip = ip;
    this.name = null;
    this.token = null;
    this.room = null;
    this.alive = true;
    this.msgWindow = 0;
    this.msgCount = 0;
    this.strikes = 0;
    this.bytesOut = 0;
    this.outQ = new DelayQueue();
    this.inQ = new DelayQueue();
  }

  send(obj) {
    if (this.ws.readyState !== 1) return;
    const data = JSON.stringify(obj);
    this.bytesOut += data.length;
    if (FAKE_LAG || FAKE_JITTER) this.outQ.push(data, (d) => { if (this.ws.readyState === 1) this.ws.send(d); });
    else this.ws.send(data);
  }
}

export class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.conns = new Set();
    this.sessions = new Map(); // token → { code, id }
    this.byId = new Map();     // player id → token
    this.nextId = 1;
    this.tickTimes = [];
    this.bytes = 0;
    this.started = Date.now();
    this.malformed = 0;
    this.startLoop();
    this.heartbeat = setInterval(() => this.checkAlive(), 10000);
  }

  // ------------------------------------------------------------------ connections
  onConnection(ws, req) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
    const c = new Conn(ws, this.nextId++, ip);
    this.conns.add(c);
    ws.on('pong', () => { c.alive = true; });
    ws.on('message', (data, isBinary) => {
      if (FAKE_LAG || FAKE_JITTER) c.inQ.push(data, (d) => this.safeMessage(c, d, isBinary));
      else this.safeMessage(c, data, isBinary);
    });
    ws.on('close', () => this.onClose(c));
    ws.on('error', () => { /* close follows */ });
  }

  checkAlive() {
    for (const c of this.conns) {
      c.strikes = Math.max(0, c.strikes - 10); // occasional bad messages are forgiven; floods still get kicked
      if (!c.alive) { c.ws.terminate(); continue; }
      c.alive = false;
      try { c.ws.ping(); } catch { /* ignore */ }
    }
  }

  strike(c, why) {
    c.strikes++;
    this.malformed++;
    if (c.strikes > MAX_STRIKES) {
      c.send({ t: S.KICK, msg: 'Too many bad messages' });
      c.ws.close(1008, why);
    }
  }

  safeMessage(c, data, isBinary) {
    try { this.onMessage(c, data, isBinary); } catch (e) {
      console.error('[msg error]', e);
      this.strike(c, 'error');
    }
  }

  onMessage(c, data, isBinary) {
    if (isBinary) return this.strike(c, 'binary');
    const now = Date.now();
    if (now - c.msgWindow > 1000) { c.msgWindow = now; c.msgCount = 0; }
    if (++c.msgCount > MAX_MSGS_PER_SEC) return; // silently drop floods
    const m = parseClientMessage(data.toString());
    if (!m) return this.strike(c, 'malformed');

    if (m.t === C.PING) {
      c.send({ t: S.PONG, c: m.c, s: Date.now() });
      if (c.room) { const s = c.room.slots.get(c.id); if (s && typeof m.r === 'number') s.ping = Math.max(0, Math.min(9999, Math.round(m.r))); }
      return;
    }
    if (m.t === C.HELLO) return c.name ? undefined : this.hello(c, m);
    if (!c.name) return this.strike(c, 'no hello');

    const room = c.room;
    switch (m.t) {
      case C.CREATE: if (!room) this.create(c, m.pub); break;
      case C.JOIN: if (!room) this.join(c, m.code); break;
      case C.QUICK: if (!room) this.quick(c); break;
      case C.LEAVE: if (room) { room.removePlayer(c.id); c.send({ t: S.LEFT }); this.cleanup(room); } break;
      case C.SET_MODE: if (room) room.setMode(c, m.mode, m.map); break;
      case C.SWAP_TEAM: if (room) room.swapTeam(c); break;
      case C.READY: if (room) room.setReady(c, m.ready); break;
      case C.LOADOUT: if (room) room.setLoadout(c, m.p, m.s); break;
      case C.INPUT: if (room) room.queueInput(c, m); break;
      case C.CHAT: if (room) room.chat(c, m.i); break;
      default: break;
    }
  }

  hello(c, m) {
    // Reconnect: the token maps to a held slot in a running match
    if (m.token && this.sessions.has(m.token)) {
      const sess = this.sessions.get(m.token);
      const room = this.rooms.get(sess.code);
      if (room && room.reattach(c, sess.id)) {
        c.token = m.token;
        c.name = room.slots.get(sess.id).name;
        c.send({ t: S.WELCOME, id: c.id, token: c.token, name: c.name, resumed: room.code });
        room.dirty = true;
        return;
      }
    }
    c.name = sanitizeName(m.name);
    c.token = m.token && /^[a-f0-9]{32}$/.test(m.token) && !this.sessions.has(m.token) ? m.token : crypto.randomBytes(16).toString('hex');
    c.send({ t: S.WELCOME, id: c.id, token: c.token, name: c.name, resumed: null });
  }

  bindSession(token, code, id) {
    if (!token) return;
    this.sessions.set(token, { code, id });
    this.byId.set(id, token);
  }

  unbindSession(id) {
    const tok = this.byId.get(id);
    if (tok) { this.sessions.delete(tok); this.byId.delete(id); }
  }

  create(c, pub) {
    if (this.rooms.size >= MAX_ROOMS) return c.send({ t: S.ERROR, msg: 'The server is full. Try again later.' });
    const room = new Room(this, makeRoomCode(new Set(this.rooms.keys())), !!pub);
    this.rooms.set(room.code, room);
    room.addPlayer(c);
    return room;
  }

  join(c, code) {
    const room = this.rooms.get(code);
    if (!room) return c.send({ t: S.ERROR, msg: `Room ${code} was not found.` });
    if (room.isFull()) return c.send({ t: S.ERROR, msg: `Room ${code} is full.` });
    room.addPlayer(c);
  }

  quick(c) {
    // Prefer public lobbies that already have players, then public matches with free slots
    let best = null, bestScore = -1;
    for (const r of this.rooms.values()) {
      if (!r.pub || r.isFull()) continue;
      const score = (r.phase === 'lobby' || r.phase === 'countdown' ? 100 : 0) + r.slots.size;
      if (score > bestScore) { best = r; bestScore = score; }
    }
    if (best) best.addPlayer(c);
    else this.create(c, true);
  }

  onClose(c) {
    this.conns.delete(c);
    const room = c.room;
    if (room && room.slots.get(c.id)?.conn === c) {
      room.disconnect(c.id);
      this.cleanup(room);
    }
  }

  cleanup(room) {
    if (room.connectedCount() === 0 && ![...room.slots.values()].some((s) => s.disc && Date.now() - s.discAt < RECONNECT_GRACE * 1000)) {
      for (const id of room.slots.keys()) this.unbindSession(id);
      this.rooms.delete(room.code);
    }
  }

  // ------------------------------------------------------------------ loop
  startLoop() {
    const step = 1000 / TICK_RATE;
    let next = performance.now();
    const loop = () => {
      const now = performance.now();
      let n = 0;
      while (now >= next && n < 4) {
        const t0 = performance.now();
        for (const room of this.rooms.values()) {
          try { room.update(); } catch (e) { console.error(`[room ${room.code}]`, e); }
        }
        // Remove rooms that emptied out (including after reconnect grace)
        for (const room of [...this.rooms.values()]) if (room.slots.size === 0) this.rooms.delete(room.code);
        this.tickTimes.push(performance.now() - t0);
        if (this.tickTimes.length > 600) this.tickTimes.shift();
        next += step;
        n++;
      }
      if (now - next > 250) next = now; // we fell far behind (e.g. the machine slept): resync
      this.timer = setTimeout(loop, Math.max(0, next - performance.now()));
    };
    loop();
  }

  stats() {
    const t = this.tickTimes.slice().sort((a, b) => a - b);
    const pct = (p) => (t.length ? t[Math.min(t.length - 1, Math.floor(t.length * p))] : 0);
    let bytes = 0;
    for (const c of this.conns) bytes += c.bytesOut;
    return {
      uptime: Math.round((Date.now() - this.started) / 1000),
      conns: this.conns.size,
      rooms: [...this.rooms.values()].map((r) => ({ code: r.code, pub: r.pub, mode: r.mode, map: r.mapId, phase: r.phase, players: r.slots.size, round: r.round, scores: r.scores })),
      tickMs: { avg: t.length ? t.reduce((a, b) => a + b, 0) / t.length : 0, p50: pct(0.5), p99: pct(0.99), max: t[t.length - 1] || 0, samples: t.length },
      bytesOut: bytes,
      malformed: this.malformed,
      fakeLag: FAKE_LAG, fakeJitter: FAKE_JITTER,
    };
  }

  shutdown() {
    clearTimeout(this.timer);
    clearInterval(this.heartbeat);
    for (const c of this.conns) c.ws.close(1001, 'server shutting down');
  }
}
