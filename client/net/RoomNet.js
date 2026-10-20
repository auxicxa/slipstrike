// Multiplayer without a game server: a drop-in replacement for Net (same on/send/connect surface)
// that runs over a claude.ai page's `room` capability. The player who creates a game hosts it: their
// browser runs the authoritative match (HostServer) and everyone exchanges state through presence.
// The lobby room carries game adverts ({ g: {c: code, m, n, cap, ph, pub} }) for join-by-code and quick play.
import { C, S } from '../../shared/net/protocol.js';
import { makeRoomCode } from '../../shared/util/profanity.js';
import { HostServer } from './HostServer.js';
import { createLocalRoom } from './LocalRoom.js';

const TOKEN_KEY = 'slipstrike.session';
const UNAVAILABLE = 'Multiplayer needs you to be signed in to claude.ai, and the page owner has to share this page with you (Share button). Practice works without it.';

function fail(msg) { const e = new Error(msg); e.userMessage = msg; return e; }

export class RoomNet {
  constructor() {
    this.handlers = new Map();
    this.state = 'idle';
    this.id = null;
    this.rtt = 0;
    this.bytesIn = 0;
    this.name = '';
    this.cap = null;
    this.game = null;
    this.host = null;
    this.myPeer = null;
    this.reset();
  }

  reset() {
    this.lastMid = 0; this.lastRsv = 0; this.lastK = -1; this.lastEid = 0;
    this.inputs = []; this.q = { mode: 0, swap: 0, chat: 0 };
    this.hostPeer = null; this.hostGoneAt = 0; this.pingSent = 0;
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type).delete(fn);
  }
  emit(type, m) { const hs = this.handlers.get(type); if (hs) for (const fn of [...hs]) fn(m); }

  get token() {
    try {
      let t = sessionStorage.getItem(TOKEN_KEY);
      if (!t || !/^[a-f0-9]{32}$/.test(t)) {
        t = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
        sessionStorage.setItem(TOKEN_KEY, t);
      }
      return t;
    } catch { return null; }
  }

  async getRoom() {
    const q = new URLSearchParams(location.search);
    if (q.has('localroom')) return createLocalRoom(Number(q.get('localroom')) || 0);
    try { return window.claude?.use ? await window.claude.use('room') : null; } catch { return null; }
  }

  async connect(name) {
    this.name = name;
    if (!this.cap) {
      this.state = 'connecting';
      this.cap = await this.getRoom();
      if (!this.cap) { this.state = 'idle'; throw fail(UNAVAILABLE); }
      this.cap.onConnection((up) => {
        const s = up ? 'open' : 'reconnecting';
        if (s !== this.state && this.state !== 'idle') { this.state = s; this.emit('state', s); }
      }, () => { this.state = 'closed'; this.emit('lost'); });
    }
    // Wait for the connection and for our own peer label
    const t0 = performance.now();
    while (performance.now() - t0 < 8000) {
      const me = this.cap.peers().find((p) => p.isMe && p.sameTab);
      if (this.cap.connected() && me) { this.myPeer = me.peer; break; }
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!this.myPeer) { this.state = 'idle'; throw fail(UNAVAILABLE); }
    this.state = 'open';
  }

  adverts() {
    return this.cap.peers().filter((p) => !p.isMe && p.presence?.g && typeof p.presence.g.c === 'string').map((p) => p.presence.g);
  }

  // ------------------------------------------------------------------ outgoing
  send(m) {
    switch (m.t) {
      case C.CREATE: this.createGame(!!m.pub); return;
      case C.QUICK: this.quickPlay(); return;
      case C.JOIN: this.joinCode(m.code); return;
      case C.LEAVE: this.leaveGame(); return;
      case C.PING: return; // handled by our own ping timer
      default: break;
    }
    if (this.host) { this.host.handleLocal(m); return; }
    if (!this.game) return;
    const g = this.game;
    switch (m.t) {
      case C.INPUT:
        this.inputs.push([m.s, m.b, Math.round(m.y * 1e4) / 1e4, Math.round(m.p * 1e4) / 1e4, m.w, Math.round(m.v * 100) / 100]);
        if (this.inputs.length > 8) this.inputs.shift();
        g.presence({ in: this.inputs }).catch(() => {});
        break;
      case C.READY: g.presence({ rdy: !!m.ready }).catch(() => {}); break;
      case C.LOADOUT: g.presence({ lo: { p: m.p, s: m.s } }).catch(() => {}); break;
      case C.SET_MODE: g.presence({ mode: { q: ++this.q.mode, m: m.mode, map: m.map ?? null } }).catch(() => {}); break;
      case C.SWAP_TEAM: g.presence({ swap: ++this.q.swap }).catch(() => {}); break;
      case C.CHAT: g.presence({ chat: { q: ++this.q.chat, i: m.i } }).catch(() => {}); break;
      default: break;
    }
  }

  // ------------------------------------------------------------------ hosting
  async createGame(pub) {
    if (this.game) return;
    const taken = new Set(this.adverts().map((a) => a.c));
    const code = makeRoomCode(taken);
    try { this.game = await this.cap.join('g-' + code.toLowerCase()); } catch { this.emit(S.ERROR, { msg: 'Could not open a game room. Try again.' }); return; }
    this.reset();
    this.host = new HostServer(this.game, code, pub, {
      peer: this.myPeer, name: this.name, token: this.token,
      deliver: (msg) => this.deliver(msg),
    });
    this.id = this.host.local.id;
    this.emit(S.WELCOME, { id: this.id, token: this.token, name: this.host.local.name, resumed: null });
    this.advertTimer = setInterval(() => this.cap.presence({ g: this.host.advert() }).catch(() => {}), 1000);
    this.cap.presence({ g: this.host.advert() }).catch(() => {});
  }

  deliver(msg) {
    if (msg.t === S.WELCOME) { this.id = msg.id; }
    this.emit(msg.t, msg);
  }

  // ------------------------------------------------------------------ joining
  /** Other participants show up over a second or two after connecting, so wait briefly for adverts. */
  async waitForAdverts(pred, ms) {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      if (this.adverts().some(pred)) return;
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  async quickPlay() {
    await this.waitForAdverts((a) => a.pub && a.n < a.cap, 2000);
    let best = null, score = -1;
    for (const a of this.adverts()) {
      if (!a.pub || !(a.n < a.cap)) continue;
      const sc = (a.ph === 'lobby' || a.ph === 'countdown' ? 100 : 0) + a.n;
      if (sc > score) { score = sc; best = a; }
    }
    if (best) this.joinCode(best.c);
    else this.createGame(true);
  }

  async joinCode(code) {
    if (this.game) return;
    await this.waitForAdverts((x) => x.c === code, 3000);
    const a = this.adverts().find((x) => x.c === code);
    if (!a) { this.emit(S.ERROR, { msg: `Room ${code} was not found. Check the code, and that its creator still has the page open.` }); return; }
    if (!(a.n < a.cap)) { this.emit(S.ERROR, { msg: `Room ${code} is full.` }); return; }
    try { this.game = await this.cap.join('g-' + code.toLowerCase()); } catch { this.emit(S.ERROR, { msg: 'Could not join that room. Try again.' }); return; }
    this.reset();
    this.joinedAt = performance.now();
    this.game.presence({ pl: 1, n: this.name, tk: this.token, in: [], rdy: false, swap: 0, chat: { q: 0, i: 0 } }).catch(() => {});
    this.offGame = this.game.onPeers(() => this.readHost());
    this.pollTimer = setInterval(() => this.readHost(), 16); // onPeers is per animation frame; keep going in background tabs too
    this.pingTimer = setInterval(() => {
      this.pingSent = Math.round(performance.now());
      this.game?.presence({ pg: this.pingSent, rtt: Math.round(this.rtt) }).catch(() => {});
    }, 1000);
  }

  readHost() {
    if (!this.game) return;
    const hp = this.game.peers().find((p) => p.presence?.h === 1 && !p.isMe);
    const now = performance.now();
    if (!hp) {
      if (this.hostPeer || now - this.joinedAt > 6000) {
        if (!this.hostGoneAt) this.hostGoneAt = now;
        if (now - this.hostGoneAt > 3000) {
          const msg = this.hostPeer ? 'The host left, so the game ended.' : 'Could not reach that room\'s host.';
          this.leaveGame(false);
          this.emit(S.KICK, { msg });
        }
      }
      return;
    }
    this.hostGoneAt = 0;
    this.hostPeer = hp.peer;
    const pr = hp.presence;
    if (pr === this.lastHostPresence) return;
    this.lastHostPresence = pr;
    if (Array.isArray(pr.full) && pr.full.includes(this.myPeer)) {
      this.leaveGame(false);
      this.emit(S.ERROR, { msg: 'That room is full.' });
      return;
    }
    const myId = pr.ids?.[this.myPeer];
    if (myId == null) return;
    // Mail: welcome, errors, quick chat
    const box = pr.mail?.[myId];
    if (Array.isArray(box)) {
      for (const [mid, msg] of box) {
        if (mid <= this.lastMid) continue;
        this.lastMid = mid;
        if (msg?.t === S.WELCOME) this.id = msg.id;
        if (msg && typeof msg.t === 'string') this.emit(msg.t, msg);
      }
    }
    if (this.id == null) return;
    if (pr.rs && pr.rsv > this.lastRsv) { this.lastRsv = pr.rsv; this.emit(S.ROOM, pr.rs); }
    if (pr.pong && pr.pong[myId] === this.pingSent && this.pingSent) { this.rtt = performance.now() - this.pingSent; this.pingSent = 0; }
    const sn = pr.sn;
    if (sn && sn.k > this.lastK) {
      this.lastK = sn.k;
      const msg = { t: S.SNAP, k: sn.k, ph: sn.ph, pt: sn.pt, pe: sn.pe, p: sn.p, partial: true };
      const priv = pr.ps?.[myId];
      if (Array.isArray(priv)) {
        const [ack, life, hp2, ls, ms, ws] = priv;
        msg.partial = false;
        msg.ack = ack; msg.life = life;
        if (ls >= 0) msg.ls = ls;
        if (ms && ws) { msg.ms = ms; msg.ws = ws; msg.hp = hp2; }
      }
      const ev = (pr.ev || []).filter((e) => e[0] > this.lastEid);
      if (ev.length) { this.lastEid = ev[ev.length - 1][0]; msg.ev = ev.map((e) => e[1]); }
      this.emit(S.SNAP, msg);
    }
  }

  leaveGame(announce = true) {
    clearInterval(this.pollTimer); clearInterval(this.pingTimer); clearInterval(this.advertTimer);
    this.offGame?.(); this.offGame = null;
    if (this.host) { this.host.stop(); this.host = null; this.cap?.presence({ g: null }).catch(() => {}); }
    this.game?.leave().catch(() => {});
    this.game = null;
    this.reset();
    if (announce) this.emit(S.LEFT, {});
  }

  close() { this.leaveGame(false); }
}
