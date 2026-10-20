// Runs a game room inside the HOST player's browser, for builds without a game server (claude.ai pages).
// It is the same authoritative match logic as the Node server (server/Room.js); only the transport
// differs. Players talk to the host through room "presence" objects (one JSON object per participant,
// at most 4 KiB, shared about 30 times a second):
//   player → host: { pl: 1, n: name, tk: token, in: [recent inputs], rdy, lo, mode, swap, chat, pg }
//   host → all:    { h: 1, ids, rs, sn, ps, ev, mail, pong }
// Everything a player sends is untrusted and goes through the same validators as WebSocket messages.
import { Room } from '../../server/Room.js';
import { C, S, parseClientMessage } from '../../shared/net/protocol.js';
import { sanitizeName } from '../../shared/util/profanity.js';
import { TICK_RATE } from '../../shared/config/game.js';
import { startTicker } from './ticker.js';

const BUDGET = 3900; // bytes of presence JSON (the platform's limit is 4096)
const r4 = (v) => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v);

/** Compact private state of one player: [ack, life, hp, liveSeq, ms[], ws[]] (ms/ws null when dead). */
function packPrivate(m) {
  return [m.ack, m.life, m.ms ? Math.round(m.hp * 10) / 10 : 0, m.ls ?? -1, m.ms ? m.ms.map(r4) : null, m.ws || null];
}

export class HostServer {
  /**
   * @param game  the named room (presence API) everyone in this game joined
   * @param code  room code
   * @param pub   listed for quick play
   * @param me    { peer, name, token, deliver(msg) } — the host's own player (messages delivered locally)
   */
  constructor(game, code, pub, me) {
    this.game = game;
    this.me = me;
    this.sessions = new Map(); // token → player id
    this.nextId = 1;
    this.byPeer = new Map();   // peer → conn
    this.room = new Room({
      bindSession: (token, _code, id) => { if (token) this.sessions.set(token, id); },
      unbindSession: (id) => { for (const [t, v] of this.sessions) if (v === id) this.sessions.delete(t); },
    }, code, pub);
    this.eid = 0;
    this.evLog = [];      // [eid, event]
    this.lastEvArr = null;
    this.mail = new Map(); // id → [[mid, msg]]
    this.mid = 0;
    this.rs = null; this.rsv = 0;
    this.snaps = new Map(); // id → latest snapshot msg
    this.rr = 0;
    this.pongs = {};
    this.lastPublish = 0;
    this.published = null;

    // The host's own player
    this.local = this.makeConn(me.peer, me.name, me.token, (msg) => queueMicrotask(() => me.deliver(msg)));
    this.room.addPlayer(this.local);

    this.peersDirty = true;
    this.offPeers = game.onPeers(() => { this.peersDirty = true; });
    this.stopTicker = startTicker(TICK_RATE, () => this.tick());
  }

  get code() { return this.room.code; }

  makeConn(peer, name, token, sendFn) {
    const c = {
      id: this.nextId++, peer, name: sanitizeName(name), token, room: null,
      send: sendFn || ((msg) => this.onSend(c, msg)),
      seen: {}, // last values read from this player's presence
    };
    return c;
  }

  /** Messages the Room sends to a remote player end up in the host's presence. */
  onSend(conn, msg) {
    if (msg.t === S.ROOM) { this.rs = msg; this.rsv++; return; }
    if (msg.t === S.SNAP) {
      this.snaps.set(conn.id, msg);
      if (msg.ev && msg.ev !== this.lastEvArr) this.logEvents(msg.ev);
      return;
    }
    this.queueMail(conn.id, msg);
  }

  logEvents(arr) {
    this.lastEvArr = arr;
    for (const e of arr) this.evLog.push([++this.eid, e]);
    if (this.evLog.length > 40) this.evLog.splice(0, this.evLog.length - 40);
  }

  queueMail(id, msg) {
    if (!this.mail.has(id)) this.mail.set(id, []);
    const box = this.mail.get(id);
    box.push([++this.mid, msg, performance.now()]);
    if (box.length > 8) box.shift();
  }

  /** Host-local actions (the host's own lobby buttons, chat, inputs). */
  handleLocal(m) { this.dispatch(this.local, m); }

  dispatch(conn, m) {
    const r = this.room;
    switch (m.t) {
      case C.SET_MODE: r.setMode(conn, m.mode, m.map); break;
      case C.SWAP_TEAM: r.swapTeam(conn); break;
      case C.READY: r.setReady(conn, m.ready); break;
      case C.LOADOUT: r.setLoadout(conn, m.p, m.s); break;
      case C.INPUT: r.queueInput(conn, m); break;
      case C.CHAT: r.chat(conn, m.i); break;
      default: break;
    }
  }

  /** Read every player's presence: joins, leaves, and the fields they changed. */
  readPeers() {
    const peers = this.game.peers();
    const present = new Set();
    for (const p of peers) {
      if (p.isMe || p.peer === this.me.peer) continue;
      const pr = p.presence || {};
      if (pr.pl !== 1 || typeof pr.n !== 'string') continue;
      present.add(p.peer);
      let conn = this.byPeer.get(p.peer);
      if (!conn) conn = this.admit(p.peer, pr);
      if (!conn) continue;
      if (conn.lastPresence === pr) continue; // unchanged since we last read it
      conn.lastPresence = pr;
      this.readFields(conn, pr);
    }
    for (const [peer, conn] of this.byPeer) {
      if (!present.has(peer)) {
        this.byPeer.delete(peer);
        this.room.disconnect(conn.id);
      }
    }
  }

  admit(peer, pr) {
    const token = typeof pr.tk === 'string' && /^[a-f0-9]{32}$/.test(pr.tk) ? pr.tk : null;
    // Rejoining after a reload: same token → same slot
    // (Presence is visible to everyone in the room, so a token alone can only reclaim a slot whose
    // player has actually dropped, and never the host's own.)
    const prev = token && this.sessions.get(token);
    const prevSlot = prev && this.room.slots.get(prev);
    if (prevSlot && prevSlot.disc && prev !== this.local.id) {
      const conn = this.makeConn(peer, pr.n, token);
      if (this.room.reattach(conn, prev)) {
        this.byPeer.set(peer, conn);
        this.queueMail(prev, { t: S.WELCOME, id: prev, name: conn.name, resumed: this.room.code });
        return conn;
      }
    }
    const conn = this.makeConn(peer, pr.n, token);
    if (!this.room.addPlayer(conn)) {
      this.refused = this.refused || {};
      this.refused[peer] = 'full';
      return null;
    }
    this.byPeer.set(peer, conn);
    this.queueMail(conn.id, { t: S.WELCOME, id: conn.id, name: conn.name, resumed: null });
    return conn;
  }

  readFields(conn, pr) {
    const seen = conn.seen;
    const feed = (raw) => { const m = parseClientMessage(JSON.stringify(raw)); if (m) this.dispatch(conn, m); };
    if (Array.isArray(pr.in)) {
      const last = this.room.slots.get(conn.id)?.lastQueued ?? -1;
      for (const a of pr.in.slice(-12)) {
        if (!Array.isArray(a) || a.length !== 6 || !(a[0] > last)) continue;
        feed({ t: C.INPUT, s: a[0], b: a[1], y: a[2], p: a[3], w: a[4], v: a[5] });
      }
    }
    if (pr.rdy !== seen.rdy) { seen.rdy = pr.rdy; feed({ t: C.READY, ready: pr.rdy === true }); }
    const lo = pr.lo && typeof pr.lo === 'object' ? pr.lo.p + '/' + pr.lo.s : null;
    if (lo && lo !== seen.lo) { seen.lo = lo; feed({ t: C.LOADOUT, p: pr.lo.p, s: pr.lo.s }); }
    if (pr.mode && typeof pr.mode === 'object' && pr.mode.q !== seen.mode) { seen.mode = pr.mode.q; feed({ t: C.SET_MODE, mode: pr.mode.m, map: pr.mode.map }); }
    if (Number.isInteger(pr.swap) && pr.swap !== seen.swap) { if (seen.swap !== undefined) feed({ t: C.SWAP_TEAM }); seen.swap = pr.swap; }
    if (pr.chat && typeof pr.chat === 'object' && pr.chat.q !== seen.chat) { if (seen.chat !== undefined) feed({ t: C.CHAT, i: pr.chat.i }); seen.chat = pr.chat.q; }
    if (typeof pr.pg === 'number' && pr.pg !== seen.pg) {
      seen.pg = pr.pg;
      this.pongs[conn.id] = pr.pg;
      if (typeof pr.rtt === 'number') { const s = this.room.slots.get(conn.id); if (s) s.ping = Math.max(0, Math.min(9999, Math.round(pr.rtt))); }
    }
  }

  tick() {
    // Presence can change many times between ticks; read it once per tick. (Polling peers() also keeps
    // inputs flowing if the host's tab is in the background, where change callbacks may pause.)
    this.readPeers();
    this.peersDirty = false;
    const before = this.rsv;
    const t0 = this.room.tick;
    this.room.update();
    // Publish after every snapshot tick, and when the lobby state changed
    const snapTick = this.snaps.size && [...this.snaps.values()][0].k === this.room.tick;
    if (snapTick || this.rsv !== before || t0 % 30 === 0) this.publish();
  }

  publish() {
    const now = performance.now();
    // Presence MERGES into the previous object, so every field is always written (null clears it);
    // otherwise stale fields (old mail) would linger and push the object past the size limit.
    const out = { h: 1, ids: {}, pong: this.pongs, full: null, rs: null, rsv: null, sn: null, mail: null, ps: {}, ev: [] };
    for (const [peer, c] of this.byPeer) out.ids[peer] = c.id;
    if (this.refused) out.full = Object.keys(this.refused);
    if (this.rs) { out.rs = this.rs; out.rsv = this.rsv; }
    const any = this.snaps.get([...this.snaps.keys()][0]);
    if (any && this.room.world) out.sn = { k: any.k, ph: any.ph, pt: any.pt, pe: any.pe, p: any.p };
    // Mail (errors, chat, welcomes) for a couple of seconds, so it survives coalescing
    const mail = {};
    for (const [id, box] of this.mail) {
      const live = box.filter((x) => now - x[2] < 2500);
      if (live.length) mail[id] = live.map(([mid, msg]) => [mid, msg]);
      else this.mail.delete(id);
    }
    if (Object.keys(mail).length) out.mail = mail;

    // Fill the rest of the budget: private player states (round-robin), then recent events.
    const size = () => JSON.stringify(out).length;
    const ids = [...this.snaps.keys()].filter((id) => id !== this.local.id && this.room.slots.has(id));
    const start = this.rr;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[(start + i) % ids.length];
      out.ps[id] = packPrivate(this.snaps.get(id));
      if (size() > BUDGET - 600) { delete out.ps[id]; break; }
      this.rr = (start + i + 1) % ids.length;
    }
    for (let i = this.evLog.length - 1; i >= 0; i--) {
      out.ev.unshift(this.evLog[i]);
      if (size() > BUDGET) { out.ev.shift(); break; }
    }
    this.game.presence(out).catch((e) => console.warn('host presence', e?.message || e?.code || e));
    this.lastPublish = now;
  }

  /** Lobby advert for quick play / join by code. */
  advert() {
    const r = this.room;
    return { c: r.code, m: r.mode, n: r.slots.size, cap: r.capacity, ph: r.phase, pub: r.pub };
  }

  stop() {
    this.stopTicker?.();
    this.offPeers?.();
  }
}

