// WebSocket connection with automatic reconnect, ping/RTT measurement and message dispatch.
import { C, S } from '../../shared/net/protocol.js';

const TOKEN_KEY = 'slipstrike.session';

export class Net {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.state = 'idle'; // idle | connecting | open | reconnecting | closed
    this.name = '';
    this.id = null;
    this.rtt = 0;
    this.rttSamples = [];
    this.wantOpen = false;
    this.retry = 0;
    this.retryStart = 0;
    this.pingTimer = null;
    this.outQueue = [];
    this.lastMsgAt = 0;
    this.bytesIn = 0;
  }

  url() {
    const q = new URLSearchParams(location.search).get('server');
    if (q) return q;
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type).delete(fn);
  }

  emit(type, m) {
    const hs = this.handlers.get(type);
    if (hs) for (const fn of hs) fn(m);
  }

  get token() { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } }
  set token(v) { try { if (v) sessionStorage.setItem(TOKEN_KEY, v); else sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } }

  /** Connect (or reuse the connection) and say hello. Resolves after the welcome message. */
  connect(name) {
    this.name = name;
    this.wantOpen = true;
    if (this.state === 'open') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const offW = this.on(S.WELCOME, () => { offW(); offE(); resolve(); });
      const offE = this.on('fail', (e) => { offW(); offE(); reject(e); });
      this.open();
    });
  }

  open() {
    this.state = this.retry ? 'reconnecting' : 'connecting';
    this.emit('state', this.state);
    let ws;
    try { ws = new WebSocket(this.url()); } catch (e) { this.emit('fail', e); return; }
    this.ws = ws;
    ws.onopen = () => {
      this.state = 'open';
      this.retry = 0;
      ws.send(JSON.stringify({ t: C.HELLO, name: this.name, token: this.token || undefined }));
      for (const m of this.outQueue) ws.send(m);
      this.outQueue = [];
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.ping(), 1000);
      this.ping();
      this.emit('state', 'open');
    };
    ws.onmessage = (ev) => {
      this.lastMsgAt = performance.now();
      this.bytesIn += ev.data.length;
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (!m || typeof m.t !== 'string') return;
      if (m.t === S.PONG) {
        const rtt = performance.now() - m.c;
        this.rttSamples.push(rtt);
        if (this.rttSamples.length > 8) this.rttSamples.shift();
        const sorted = this.rttSamples.slice().sort((a, b) => a - b);
        this.rtt = sorted[Math.floor(sorted.length / 2)];
        return;
      }
      if (m.t === S.WELCOME) {
        this.id = m.id;
        this.token = m.token;
        this.name = m.name;
      }
      this.emit(m.t, m);
    };
    ws.onclose = (ev) => {
      clearInterval(this.pingTimer);
      const was = this.state;
      this.state = 'closed';
      if (this.ws !== ws) return;
      this.ws = null;
      if (ev.code === 1008 || ev.code === 4000) { this.wantOpen = false; this.emit('kicked', ev.reason); }
      if (this.wantOpen) {
        // Reconnect with backoff for up to ~30 s
        if (!this.retry) this.retryStart = performance.now();
        if (performance.now() - this.retryStart > 30000) {
          this.wantOpen = false;
          this.emit('lost');
          this.emit('fail', new Error('Connection lost'));
          return;
        }
        this.retry++;
        this.state = 'reconnecting';
        this.emit('state', 'reconnecting');
        setTimeout(() => { if (this.wantOpen) this.open(); }, Math.min(4000, 250 * 2 ** this.retry));
      } else if (was === 'connecting') {
        this.emit('fail', new Error('Could not connect to the server'));
      }
    };
    ws.onerror = () => { /* onclose follows */ };
  }

  ping() { this.send({ t: C.PING, c: performance.now(), r: Math.round(this.rtt) }); }

  send(obj) {
    const data = JSON.stringify(obj);
    if (this.ws && this.ws.readyState === 1) this.ws.send(data);
    else if (obj.t !== C.INPUT && obj.t !== C.PING && this.outQueue.length < 20) this.outQueue.push(data);
  }

  close() {
    this.wantOpen = false;
    this.token = null;
    clearInterval(this.pingTimer);
    if (this.ws) { const ws = this.ws; this.ws = null; ws.close(1000); }
    this.state = 'idle';
  }
}

export const net = new Net();
