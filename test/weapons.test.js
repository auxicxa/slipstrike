import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, stepPlayer } from '../shared/sim/world.js';
import { MapBuilder } from '../shared/maps/builder.js';
import { BTN } from '../shared/net/protocol.js';
import { WEAPONS } from '../shared/config/weapons.js';
import { createWeaponState, copyWeaponState, tickWeapon } from '../shared/sim/weapons.js';
import { createMoveState } from '../shared/sim/movement.js';
import { CollisionWorld } from '../shared/sim/collision.js';
import { MOVEMENT as M } from '../shared/config/movement.js';

const DT = 1 / 60;
const map = () => new MapBuilder('t', 't').floor(-100, -100, 100, 100).build();

function duel(dist, loadout = { p: 'rifle', s: 'pistol' }, opts = {}) {
  const w = new World(map());
  const a = w.addPlayer(1, { team: 0, loadout });
  const b = w.addPlayer(2, { team: 1 });
  w.spawnPlayer(a, [0, 0, 0, 0]);
  w.spawnPlayer(b, [0, 0, -dist, 0]);
  if (opts.crouch) b.ms.h = M.crouchHeight;
  for (let i = 0; i < 5; i++) { w.processInput(a, { b: 0, y: 0, p: 0, w: 0 }, DT); w.processInput(b, { b: 0, y: 0, p: 0, w: 0 }, DT); }
  w.takeEvents();
  return { w, a, b };
}

function aimPitch(dist, targetY) { return Math.atan2(targetY - M.standEye, dist); }

function fire(w, a, pitch, extraButtons = 0, wsel = 0) {
  return w.processInput(a, { b: BTN.FIRE | extraButtons, y: 0, p: pitch, w: wsel }, DT);
}

test('rifle body shot does 28, headshot does 1.8x', () => {
  let { w, a, b } = duel(10);
  a.ws.adsT = 1; // precise
  fire(w, a, aimPitch(10, 1.15), BTN.ADS);
  assert.equal(b.hp, 100 - 28);
  ({ w, a, b } = duel(10));
  a.ws.adsT = 1;
  fire(w, a, aimPitch(10, 1.7), BTN.ADS);
  assert.equal(b.hp, 100 - Math.round(28 * 1.8));
  const ev = w.takeEvents();
  assert.ok(ev.some((e) => e.e === 'hit' && e.hs === 1));
});

test('rifle falloff at long range', () => {
  const { w, a, b } = duel(60);
  a.ws.adsT = 1;
  fire(w, a, aimPitch(60, 1.15), BTN.ADS);
  assert.equal(b.hp, 100 - Math.round(28 * WEAPONS.rifle.falloffMin));
});

test('sniper one-shots upper body, not legs', () => {
  let { w, a, b } = duel(40, { p: 'sniper', s: 'pistol' });
  a.ws.adsT = 1;
  fire(w, a, aimPitch(40, 1.2), BTN.ADS);
  assert.equal(b.alive, false, 'upper body kill');
  ({ w, a, b } = duel(40, { p: 'sniper', s: 'pistol' }));
  a.ws.adsT = 1;
  fire(w, a, aimPitch(40, 0.4), BTN.ADS);
  assert.equal(b.alive, true, 'leg shot survives');
  assert.equal(b.hp, 100 - Math.round(110 * WEAPONS.sniper.legMult));
});

test('shotgun is deadly close and weak far', () => {
  let { w, a, b } = duel(4, { p: 'shotgun', s: 'pistol' });
  fire(w, a, aimPitch(4, 1.15));
  assert.ok(b.hp <= 100 - 70, `close hp ${b.hp}`);
  ({ w, a, b } = duel(25, { p: 'shotgun', s: 'pistol' }));
  fire(w, a, aimPitch(25, 1.15));
  assert.ok(b.hp >= 100 - 30, `far hp ${b.hp}`);
});

test('walls block shots', () => {
  const m = new MapBuilder('t', 't').floor(-100, -100, 100, 100).box(-3, 0, -6, 3, 4, -5).build();
  const w = new World(m);
  const a = w.addPlayer(1, { team: 0 }), b = w.addPlayer(2, { team: 1 });
  w.spawnPlayer(a, [0, 0, 0, 0]); w.spawnPlayer(b, [0, 0, -10, 0]);
  a.ws.adsT = 1;
  w.processInput(a, { b: BTN.FIRE | BTN.ADS, y: 0, p: aimPitch(10, 1.15), w: 0 }, DT);
  assert.equal(b.hp, 100);
});

test('teammates cannot be damaged, FFA everyone can', () => {
  const w = new World(map());
  const a = w.addPlayer(1, { team: 0 }), b = w.addPlayer(2, { team: 0 });
  w.spawnPlayer(a, [0, 0, 0, 0]); w.spawnPlayer(b, [0, 0, -10, 0]);
  a.ws.adsT = 1;
  w.processInput(a, { b: BTN.FIRE | BTN.ADS, y: 0, p: aimPitch(10, 1.15), w: 0 }, DT);
  assert.equal(b.hp, 100);
  const f = new World(map(), { teams: false });
  const c = f.addPlayer(1, { team: 0 }), d = f.addPlayer(2, { team: 0 });
  f.spawnPlayer(c, [0, 0, 0, 0]); f.spawnPlayer(d, [0, 0, -10, 0]);
  c.ws.adsT = 1;
  f.processInput(c, { b: BTN.FIRE | BTN.ADS, y: 0, p: aimPitch(10, 1.15), w: 0 }, DT);
  assert.ok(d.hp < 100);
});

test('rifle fires 600 rpm and empties its magazine, then auto-reloads', () => {
  const { w, a } = duel(10);
  let shots = 0;
  for (let i = 0; i < 60; i++) { if (w.processInput(a, { b: BTN.FIRE, y: 0, p: 0.5, w: 0 }, DT)) shots++; }
  assert.equal(shots, 10, '10 shots per second');
  for (let i = 0; i < 180; i++) w.processInput(a, { b: BTN.FIRE, y: 0, p: 0.5, w: 0 }, DT);
  assert.ok(a.ws.reloadT > 0 || a.ws.ammo[0] === 30, 'reloading or reloaded');
});

test('semi-auto needs a new press per shot', () => {
  const { w, a } = duel(10);
  w.processInput(a, { b: 0, y: 0, p: 0.5, w: 2 }, DT);
  for (let i = 0; i < 30; i++) w.processInput(a, { b: 0, y: 0, p: 0.5, w: 0 }, DT); // swap time
  let shots = 0;
  for (let i = 0; i < 60; i++) if (w.processInput(a, { b: BTN.FIRE, y: 0, p: 0.5, w: 0 }, DT)) shots++;
  assert.equal(shots, 1);
});

test('knife: instant swap, faster movement, quick stab and heavy hit', () => {
  const { w, a, b } = duel(1.6);
  w.processInput(a, { b: 0, y: 0, p: 0, w: 3 }, DT);
  assert.equal(a.ws.slots[a.ws.cur], 'knife');
  assert.equal(a.ws.swapT, 0, 'instant');
  w.processInput(a, { b: BTN.FIRE, y: 0, p: -0.2, w: 0 }, DT);
  assert.equal(b.hp, 100 - 35);
  for (let i = 0; i < 30; i++) w.processInput(a, { b: 0, y: 0, p: -0.2, w: 0 }, DT);
  w.processInput(a, { b: BTN.ADS, y: 0, p: -0.2, w: 0 }, DT);
  for (let i = 0; i < 25; i++) w.processInput(a, { b: BTN.ADS, y: 0, p: -0.2, w: 0 }, DT);
  assert.equal(b.alive, false, 'heavy hit kills after stab');
});

test('prediction determinism: replaying inputs gives identical weapon state and shot directions', () => {
  const coll = new CollisionWorld(map());
  const mk = () => ({ id: 7, ms: createMoveState(0, 0, 0, 0), ws: createWeaponState() });
  const p1 = mk(), p2 = mk();
  const dirs1 = [], dirs2 = [];
  for (let i = 0; i < 200; i++) {
    const inp = { b: (i % 50 < 30 ? BTN.FIRE : 0) | (i % 7 ? BTN.FWD : 0), y: i * 0.003, p: 0.01 * Math.sin(i), w: i === 120 ? 2 : 0 };
    const r1 = stepPlayer(p1, inp, coll, DT); if (r1) dirs1.push(r1.dirs);
    const r2 = stepPlayer(p2, inp, coll, DT); if (r2) dirs2.push(r2.dirs);
  }
  assert.deepEqual(dirs1, dirs2);
  assert.deepEqual(p1.ws, p2.ws);
  const copy = copyWeaponState({}, p1.ws);
  assert.deepEqual(copy, p1.ws);
  void tickWeapon;
});
