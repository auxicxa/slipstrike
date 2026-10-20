// claude.ai-room multiplayer without a browser: real RoomNet + HostServer code over an in-memory room
// that enforces the platform's presence rules (one merged object per participant, max 4096 bytes).
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.location = { search: '' };
const store = new Map();
globalThis.sessionStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
globalThis.window = {};

const { RoomNet } = await import('../client/net/RoomNet.js');
const { C, S, BTN } = await import('../shared/net/protocol.js');
const { ROUND } = await import('../shared/config/game.js');
Object.assign(ROUND, { freezeTime: 1, roundTime: 20, roundEndTime: 1, halftimeExtra: 0, matchEndTime: 2, countdown: 1 });

const MAX = 4096;
function makeHub() {
  const hub = { scopes: new Map(), maxSize: 0, rejected: 0 };
  hub.scope = (name) => { if (!hub.scopes.has(name)) hub.scopes.set(name, { peers: new Map(), listeners: new Set() }); return hub.scopes.get(name); };
  let n = 0;
  hub.connect = () => {
    const me = 'peer' + (++n).toString().padStart(12, '0');
    const api = (name) => {
      const sc = hub.scope(name);
      sc.peers.set(me, {});
      const notify = () => setTimeout(() => { for (const fn of sc.listeners) fn({}); }, 0);
      notify();
      return {
        presence(patch) {
          const merged = { ...(sc.peers.get(me) || {}) };
          for (const [k, v] of Object.entries(patch)) { if (v === null) delete merged[k]; else merged[k] = JSON.parse(JSON.stringify(v)); }
          const size = JSON.stringify(merged).length;
          if (size > MAX) { hub.rejected++; return Promise.reject({ code: 'invalid_argument' }); }
          hub.maxSize = Math.max(hub.maxSize, size);
          sc.peers.set(me, merged);
          notify();
          return Promise.resolve();
        },
        peers: () => [...sc.peers].map(([peer, presence]) => ({ peer, presence, isMe: peer === me, sameTab: peer === me, kind: 'viewer', guest: false, by: null })),
        onPeers(fn) { sc.listeners.add(fn); return () => sc.listeners.delete(fn); },
        connected: () => true,
        onConnection(fn) { setTimeout(() => fn(true), 0); return () => {}; },
        leave() { sc.peers.delete(me); notify(); return Promise.resolve(); },
        join: (g) => Promise.resolve(api('g:' + g)),
      };
    };
    return api('');
  };
  return hub;
}

let tokens = 0;
class TestNet extends RoomNet {
  constructor(hub) { super(); this.hub = hub; this.tk = (++tokens).toString(16).padStart(32, '0'); }
  get token() { return this.tk; } // each player has their own tab, so their own session token
  async getRoom() { return this.hub.connect(); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('3v3 over a claude.ai room: lobby, match start, inputs, snapshots within the 4 KiB presence limit', { timeout: 60000 }, async (t) => {
  const hub = makeHub();
  const nets = Array.from({ length: 6 }, () => new TestNet(hub));
  t.after(() => { for (const net of nets) net.close(); });
  const got = nets.map(() => ({ room: null, snaps: 0, priv: 0, ev: 0, welcome: null }));
  nets.forEach((net, i) => {
    net.on(S.WELCOME, (m) => { got[i].welcome = m; });
    net.on(S.ROOM, (m) => { got[i].room = m; });
    net.on(S.SNAP, (m) => { got[i].snaps++; if (!m.partial) got[i].priv++; if (m.ev) got[i].ev += m.ev.length; });
  });
  for (const [i, net] of nets.entries()) await net.connect('P' + i);
  nets[0].send({ t: C.CREATE, pub: false });
  await sleep(50);
  nets[0].send({ t: C.SET_MODE, mode: '3v3' });
  await sleep(50);
  const code = got[0].room.code;
  for (const net of nets.slice(1)) net.send({ t: C.JOIN, code });
  await sleep(1500);
  assert.equal(got[0].room.players.length, 6, 'host sees six players');
  for (const g of got) assert.ok(g.welcome && g.room, 'everyone got a welcome and the lobby state');
  const teams = got[0].room.players.map((p) => p.team).sort().join('');
  assert.equal(teams, '000111', 'teams auto-balanced 3v3');
  for (const net of nets) net.send({ t: C.READY, ready: true });
  // Everyone sends inputs at 60 Hz: forward + fire
  let seq = 0;
  const inputTimer = setInterval(() => {
    seq++;
    nets.forEach((net, i) => net.send({ t: C.INPUT, s: seq, b: BTN.FWD | (i % 2 ? BTN.FIRE : 0), y: i < 3 ? 0 : Math.PI, p: 0, w: 0, v: 0 }));
  }, 1000 / 60);
  await sleep(6000);
  clearInterval(inputTimer);
  console.log(`    after 6 s: phase ${got[1].room.phase}, snapshots ${got.map((g) => g.snaps).join(',')}, own-state ${got.map((g) => g.priv).join(',')}, max presence ${hub.maxSize}, rejected ${hub.rejected}`);
  const phase = got[1].room.phase;
  assert.ok(['freeze', 'live', 'roundEnd', 'matchEnd'].includes(phase), `match running (phase ${phase})`);
  for (const [i, g] of got.entries()) {
    assert.ok(g.snaps > 60, `player ${i} got ${g.snaps} snapshots`);
    if (i > 0) assert.ok(g.priv > 20, `player ${i} got its own state ${g.priv} times (round-robin)`);
  }
  // The host's view of the joiners' positions moved (their inputs arrived)
  const host = nets[0].host;
  const moved = [...host.room.slots.values()].filter((s) => s.ent && Math.abs(s.ent.ms.z - (s.team === 0 ? 20.5 : -20.5)) > 1).length;
  assert.ok(moved >= 4, `${moved} players moved on the host`);
  assert.ok(hub.maxSize <= MAX && hub.rejected === 0, `largest presence ${hub.maxSize} bytes, ${hub.rejected} rejected`);
  console.log(`    largest presence ${hub.maxSize} B; snapshots per player ${got.map((g) => g.snaps).join(',')}; own-state updates ${got.map((g) => g.priv).join(',')}`);
  for (const net of nets) net.close();
});

test('a malicious player cannot break the host with junk presence', { timeout: 20000 }, async (t) => {
  const hub = makeHub();
  const host = new TestNet(hub), bad = new TestNet(hub);
  t.after(() => { host.close(); bad.close(); });
  await host.connect('Host'); await bad.connect('Bad');
  host.send({ t: C.CREATE, pub: true });
  await sleep(50);
  const code = host.host.code;
  bad.send({ t: C.JOIN, code });
  await sleep(300);
  // Junk in every field the host reads
  await bad.game.presence({ in: [[1e12, -5, 'x', null, 99, {}], 'junk', [1, 2]], rdy: 'yes', lo: { p: 'nuke', s: 7 }, mode: { q: 5, m: { a: 1 } }, swap: 'x', chat: { q: 9, i: 999 }, pg: 'now' });
  await sleep(300);
  await bad.game.presence({ n: 5, pl: 'yes', tk: '../../etc' });
  await sleep(300);
  assert.ok(host.host.room.slots.size >= 1, 'host still running');
  const slot = [...host.host.room.slots.values()].find((s) => s.id !== host.host.local.id);
  if (slot) assert.deepEqual(slot.loadout, { p: 'rifle', s: 'pistol' }, 'bad loadout ignored');
  host.close(); bad.close();
});
