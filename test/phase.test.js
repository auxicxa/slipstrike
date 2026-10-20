import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/Room.js';
import { predictPhaseOpts, LIVE_SEQ_EARLIEST } from '../shared/net/phase.js';
import { BTN } from '../shared/net/protocol.js';

const mgr = { bindSession() {}, unbindSession() {} };

/**
 * Run a 1v1 room with a simulated client that has `delay` ticks of one-way latency (plus optional
 * jitter), and compare the rules it predicted for each input with the rules the server applied.
 */
function runRoundStart(delay, jitter = 0, predict = predictPhaseOpts) {
  const room = new Room(mgr, 'TEST', false);
  const snaps = [];
  const mk = (id) => ({ id, name: 'P' + id, token: 't' + id, room: null, send: (m) => { if (id === 1 && m.t === 'snap') snaps.push(m); } });
  const a = mk(1), b = mk(2);
  room.addPlayer(a); room.addPlayer(b);
  room.setReady(a, true); room.setReady(b, true);

  const applied = new Map();   // seq → frozen flag the server used
  const predicted = new Map(); // seq → frozen flag the client predicted
  const inFlight = [];         // { at, inp }
  const snapFlight = [];       // { at, m }
  const client = { phase: 'freeze', pe: 0, offs: [], ls: null };
  let seq = 0, liveTick = null;

  for (let T = 0; T < 1200; T++) {
    // Server side
    for (let i = inFlight.length - 1; i >= 0; i--) if (inFlight[i].at <= T) { room.queueInput(a, inFlight[i].inp); inFlight.splice(i, 1); }
    if (room.world && !room.world.__wrapped) {
      const orig = room.world.processInput.bind(room.world);
      room.world.processInput = (p, inp, dt, opt) => { if (p.id === 1) applied.set(inp.s, opt.frozen); return orig(p, inp, dt, opt); };
      room.world.__wrapped = true;
    }
    room.update();
    if (room.phase === 'live' && liveTick === null) liveTick = room.tick;
    while (snaps.length) snapFlight.push({ at: T + delay + Math.floor(Math.random() * (jitter + 1)), m: snaps.shift() });
    // Client side: receive snapshots (in order), then send this tick's input
    snapFlight.sort((x, y) => x.at - y.at);
    while (snapFlight.length && snapFlight[0].at <= T) {
      const m = snapFlight.shift().m;
      client.phase = m.ph; client.pe = m.pe; client.ls = m.ls ?? null;
      if (m.ack >= 0) { client.offs.push(m.k - m.ack); if (client.offs.length > 9) client.offs.shift(); }
    }
    if (room.world) {
      seq++;
      predicted.set(seq, predict(client.phase, client.pe, client.offs, seq, client.ls).frozen);
      const at = T + delay + Math.floor(Math.random() * (jitter + 1));
      const last = inFlight.length ? inFlight[inFlight.length - 1].at : 0;
      inFlight.push({ at: Math.max(at, last), inp: { t: 'in', s: seq, b: BTN.FWD, y: 0, p: 0, w: 0, v: 0 } });
    }
    if (liveTick !== null && room.tick > liveTick + 120) break;
  }
  let mismatches = 0, live = 0;
  for (const [s, frozen] of applied) {
    if (!frozen) live++;
    if (predicted.has(s) && predicted.get(s) !== frozen) mismatches++;
  }
  return { mismatches, live, liveTick };
}

test('round start: the client predicts exactly which input is the first unfrozen one', () => {
  for (const delay of [0, 3, 6, 9]) {
    const r = runRoundStart(delay);
    assert.ok(r.liveTick !== null && r.live > 50, `round went live (delay ${delay})`);
    assert.equal(r.mismatches, 0, `delay ${delay} ticks: ${r.mismatches} mispredicted inputs`);
  }
});

test('sanity: the old rule (use the last phase heard about) mispredicts with latency', () => {
  const naive = (phase) => ({ frozen: phase === 'freeze', canFight: phase === 'live' });
  const r = runRoundStart(6, 0, naive);
  assert.ok(r.mismatches >= 10, `naive rule mispredicted ${r.mismatches} inputs`);
});

test('round start with heavy jitter: still exact (the switch is decided by input number)', () => {
  for (let i = 0; i < 5; i++) {
    const r = runRoundStart(4, 6);
    assert.equal(r.mismatches, 0, `${r.mismatches} mispredicted inputs`);
  }
});

test('skipping ahead in sequence numbers does not unfreeze a player early', () => {
  const room = new Room(mgr, 'CHEAT', false);
  const mk = (id) => ({ id, name: 'P' + id, token: 't' + id, room: null, send() {} });
  const a = mk(1), b = mk(2);
  room.addPlayer(a); room.addPlayer(b);
  room.setReady(a, true); room.setReady(b, true);
  while (room.phase !== 'freeze') room.update();
  const start = { ...room.slots.get(1).ent.ms };
  let seq = 0;
  // Send inputs with huge sequence jumps all through the freeze
  while (room.phase === 'freeze' && room.tick < room.phaseEndTick - LIVE_SEQ_EARLIEST - 1) {
    seq += 50;
    room.queueInput(a, { t: 'in', s: seq, b: BTN.FWD, y: 0, p: 0, w: 0, v: 0 });
    room.update();
  }
  const ms = room.slots.get(1).ent.ms;
  assert.equal(ms.z, start.z, 'still in spawn until the last few ticks of the freeze');
});

test('predictPhaseOpts basics', () => {
  assert.deepEqual(predictPhaseOpts('freeze', 100, [5, 5, 5], 95), { frozen: true, canFight: false }); // runs on tick 100
  assert.deepEqual(predictPhaseOpts('freeze', 100, [5, 5, 5], 96), { frozen: false, canFight: true }); // tick 101
  assert.deepEqual(predictPhaseOpts('freeze', 100, [4, 9, 5], 96), { frozen: false, canFight: true }); // median offset
  assert.deepEqual(predictPhaseOpts('freeze', 0, [], 1000), { frozen: true, canFight: false });
  assert.deepEqual(predictPhaseOpts('live', 100, [5], 200), { frozen: false, canFight: false });
  assert.deepEqual(predictPhaseOpts('live', 1000, [5], 200), { frozen: false, canFight: true });
  assert.deepEqual(predictPhaseOpts('freeze', 100, [5], 50, 60), { frozen: true, canFight: false }); // liveSeq wins
  assert.deepEqual(predictPhaseOpts('freeze', 100, [5], 60, 60), { frozen: false, canFight: true });
  assert.deepEqual(predictPhaseOpts('live', 1000, [5], 59, 60), { frozen: true, canFight: false }); // late input of the freeze
});
