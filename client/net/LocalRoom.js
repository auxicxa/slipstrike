// A stand-in for claude.ai's `room` capability, for development and automated tests: tabs of the same
// origin talk over a BroadcastChannel. It follows the parts of the real contract the game relies on:
// presence is one merged object per participant (at most 4 KiB of JSON), sent coalesced about 30 times
// a second, delivered to everyone in the same (named) room, with optional one-way latency.
// Enable with ?localroom (or ?localroom=80 for 80 ms of latency).

const MAX_PRESENCE = 4096;
const SEND_EVERY = 33;

function makeScope(hub, name) {
  const scope = {
    name,
    mine: {},
    peers: new Map(), // peer → { peer, presence, updatedAt, isMe, sameTab, kind, guest, by }
    listeners: new Set(),
    dirty: false,
    pendingChange: false,
  };
  scope.self = { peer: hub.peer, by: null, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: Object.freeze({}), updatedAt: Date.now() };
  scope.peers.set(hub.peer, scope.self);
  const notify = () => {
    if (scope.pendingChange) return;
    scope.pendingChange = true;
    setTimeout(() => {
      scope.pendingChange = false;
      const peers = Object.freeze([...scope.peers.values()]);
      for (const fn of scope.listeners) fn({ peers, joined: [], left: [], updated: [] });
    }, 0);
  };
  scope.notify = notify;
  const api = {
    name,
    presence(patch) {
      const merged = { ...scope.mine };
      for (const [k, v] of Object.entries(patch)) { if (v === null) delete merged[k]; else merged[k] = v; }
      if (JSON.stringify(merged).length > MAX_PRESENCE) return Promise.reject({ code: 'invalid_argument', message: `presence over ${MAX_PRESENCE} bytes` });
      scope.mine = merged;
      scope.self = { ...scope.self, presence: Object.freeze(merged), updatedAt: Date.now() };
      scope.peers.set(hub.peer, scope.self);
      scope.dirty = true;
      notify();
      return Promise.resolve();
    },
    peers: () => Object.freeze([...scope.peers.values()]),
    onPeers(fn) { scope.listeners.add(fn); setTimeout(() => fn({ peers: api.peers(), joined: api.peers(), left: [], updated: [] }), 0); return () => scope.listeners.delete(fn); },
    connected: () => true,
    onConnection(fn) { setTimeout(() => fn(true), 0); return () => {}; },
    emit: () => Promise.resolve(),
    on: () => () => {},
    leave() { hub.leave(name); return Promise.resolve(); },
  };
  scope.api = api;
  return scope;
}

export function createLocalRoom(latency = 0) {
  const ch = new BroadcastChannel('slipstrike-localroom');
  const hub = { peer: Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10), scopes: new Map() };
  const post = (msg) => { if (latency) setTimeout(() => ch.postMessage(msg), latency); else ch.postMessage(msg); };

  hub.scope = (name) => {
    if (!hub.scopes.has(name)) {
      const s = makeScope(hub, name);
      hub.scopes.set(name, s);
      post({ t: 'hello', room: name, peer: hub.peer, presence: s.mine });
    }
    return hub.scopes.get(name);
  };
  hub.leave = (name) => {
    if (!hub.scopes.has(name)) return;
    hub.scopes.delete(name);
    post({ t: 'bye', room: name, peer: hub.peer });
  };

  // Coalesced presence sends, plus a keepalive so silent peers time out like a dropped connection
  let ka = 0;
  setInterval(() => {
    ka++;
    for (const s of hub.scopes.values()) {
      if (s.dirty || ka % 30 === 0) { s.dirty = false; post({ t: 'p', room: s.name, peer: hub.peer, presence: s.mine }); }
      const now = Date.now();
      for (const [peer, p] of s.peers) if (peer !== hub.peer && now - p.seenAt > 3000) { s.peers.delete(peer); s.notify(); }
    }
  }, SEND_EVERY);
  addEventListener('pagehide', () => { for (const name of hub.scopes.keys()) ch.postMessage({ t: 'bye', room: name, peer: hub.peer }); });

  ch.onmessage = (ev) => {
    const m = ev.data;
    const s = hub.scopes.get(m.room);
    if (!s || m.peer === hub.peer) return;
    if (m.t === 'bye') { if (s.peers.delete(m.peer)) s.notify(); return; }
    const prev = s.peers.get(m.peer);
    s.peers.set(m.peer, { peer: m.peer, by: null, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: Object.freeze(m.presence || {}), updatedAt: Date.now(), seenAt: Date.now() });
    if (m.t === 'hello') post({ t: 'p', room: m.room, peer: hub.peer, presence: s.mine });
    if (!prev || prev.presence !== m.presence) s.notify();
  };

  const lobby = hub.scope('');
  return Object.freeze({
    ...lobby.api,
    join: (name) => Promise.resolve(hub.scope('g:' + name).api),
  });
}
