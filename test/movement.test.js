import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CollisionWorld } from '../shared/sim/collision.js';
import { createMoveState, simulateMove } from '../shared/sim/movement.js';
import { MOVEMENT as M } from '../shared/config/movement.js';
import { BTN } from '../shared/net/protocol.js';
import { MapBuilder } from '../shared/maps/builder.js';

const DT = 1 / 60;
const flat = new CollisionWorld(new MapBuilder('t', 't').floor(-500, -500, 500, 500).build());
const hs = (s) => Math.hypot(s.vx, s.vz);

function run(s, world, ticks, b, yaw = 0, opt) {
  for (let i = 0; i < ticks; i++) simulateMove(s, typeof b === 'function' ? b(i, s) : b, typeof yaw === 'function' ? yaw(i, s) : yaw, 0, world, DT, opt);
  return s;
}
function settled(x = 0, z = 0, world = flat) {
  const s = createMoveState(x, 0, z, 0);
  run(s, world, 5, 0);
  return s;
}

test('lands on the floor and walks at walk speed', () => {
  const s = settled();
  assert.equal(s.grounded, true);
  assert.ok(Math.abs(s.y) < 1e-6);
  run(s, flat, 120, BTN.FWD);
  assert.ok(Math.abs(hs(s) - M.walkSpeed) < 0.05, `speed ${hs(s)}`);
  assert.ok(s.z < -5, 'yaw 0 moves toward -z');
});

test('sprint and knife multiplier', () => {
  const s = settled();
  run(s, flat, 120, BTN.FWD | BTN.SPRINT);
  assert.ok(Math.abs(hs(s) - M.sprintSpeed) < 0.05);
  const k = settled();
  run(k, flat, 120, BTN.FWD | BTN.SPRINT, 0, { speedMult: M.knifeSpeedMult });
  assert.ok(Math.abs(hs(k) - M.sprintSpeed * M.knifeSpeedMult) < 0.05);
});

test('friction stops the player', () => {
  const s = settled();
  run(s, flat, 60, BTN.FWD);
  run(s, flat, 60, 0);
  assert.ok(hs(s) < 0.01);
});

test('jump height is about v^2/2g', () => {
  const s = settled();
  let maxY = 0;
  run(s, flat, 1, BTN.JUMP);
  run(s, flat, 60, (i, st) => { maxY = Math.max(maxY, st.y); return 0; });
  const expected = (M.jumpVelocity ** 2) / (2 * M.gravity);
  assert.ok(Math.abs(maxY - expected) < 0.15, `max ${maxY} vs ${expected}`);
  assert.equal(s.grounded, true);
});

test('air strafing gains speed beyond walk speed (but stays under the hard cap)', () => {
  const s = settled();
  run(s, flat, 90, BTN.FWD | BTN.SPRINT);
  // Hold jump (auto-hop), strafe right while turning right
  let yaw = 0;
  run(s, flat, 600, () => BTN.JUMP | BTN.RIGHT, () => (yaw -= 0.035));
  assert.ok(hs(s) > M.sprintSpeed + 0.5, `strafe speed ${hs(s)}`);
  assert.ok(hs(s) <= M.airSpeedHardCap + 1e-6);
});

test('bunnyhop speed is capped on landing', () => {
  const s = settled();
  s.vx = 0; s.vz = -15; s.vy = -1; s.grounded = false; s.y = 0.5;
  run(s, flat, 40, (i, st) => (st.grounded || st.y < 0.3 ? BTN.JUMP : 0));
  assert.ok(hs(s) <= M.sprintSpeed * M.bhopSpeedCapMult + 1e-6, `bhop ${hs(s)}`);
  assert.ok(hs(s) > M.sprintSpeed, 'keeps more speed than sprint');
});

test('slide gives a burst that decays, and needs speed', () => {
  const s = settled();
  run(s, flat, 90, BTN.FWD | BTN.SPRINT);
  const before = hs(s);
  run(s, flat, 1, BTN.FWD | BTN.SPRINT | BTN.CROUCH);
  assert.equal(s.sliding, true);
  assert.ok(hs(s) > before + M.slideBoost * 0.8, `boost ${hs(s)} from ${before}`);
  const peak = hs(s);
  run(s, flat, 30, BTN.FWD | BTN.SPRINT | BTN.CROUCH);
  assert.ok(hs(s) < peak);
  run(s, flat, 60, BTN.FWD | BTN.SPRINT | BTN.CROUCH);
  assert.equal(s.sliding, false, 'slide ends on its own');
  // walking speed is too slow to slide
  const w = settled();
  run(w, flat, 30, BTN.FWD);
  run(w, flat, 1, BTN.FWD | BTN.CROUCH);
  assert.equal(w.sliding, false, 'no slide without sprint');
});

test('sliding off a ledge keeps momentum', () => {
  const map = new MapBuilder('t', 't').floor(-100, -100, 100, 100).box(-5, 0, -25, 5, 2, 5).build();
  const w = new CollisionWorld(map);
  const s = createMoveState(0, 2, 0, 0);
  run(s, w, 5, 0);
  assert.ok(Math.abs(s.y - 2) < 1e-6);
  run(s, w, 150, BTN.FWD | BTN.SPRINT); // ~0..-20
  run(s, w, 1, BTN.FWD | BTN.SPRINT | BTN.CROUCH);
  assert.equal(s.sliding, true);
  let offSpeed = 0;
  run(s, w, 90, (i, st) => { if (!st.grounded && !offSpeed) offSpeed = hs(st); return BTN.FWD | BTN.SPRINT | BTN.CROUCH; });
  assert.ok(offSpeed > M.sprintSpeed, `left ledge at ${offSpeed}`);
});

test('air dash once per airtime with cooldown', () => {
  const s = settled();
  run(s, flat, 1, BTN.JUMP);
  run(s, flat, 10, 0);
  run(s, flat, 1, BTN.DASH | BTN.FWD);
  assert.ok(hs(s) >= M.dashSpeed - 0.5, `dash ${hs(s)}`);
  assert.equal(s.dashUsed, true);
  run(s, flat, 1, 0);
  const v = hs(s);
  run(s, flat, 1, BTN.DASH | BTN.LEFT);
  assert.ok(Math.abs(hs(s) - v) < 1, 'second dash ignored');
  run(s, flat, 50, 0);
  assert.equal(s.dashUsed, false, 'reset on landing');
  assert.ok(s.dashCd > 0, 'cooldown still running');
});

test('steps up small ledges, blocked by tall walls', () => {
  const map = new MapBuilder('t', 't').floor(-50, -50, 50, 50).box(-5, 0, -6, 5, 0.3, -4).box(-5, 0, -16, 5, 3, -14).build();
  const w = new CollisionWorld(map);
  const s = createMoveState(0, 0, 0, 0);
  run(s, w, 5, 0);
  run(s, w, 50, BTN.FWD);
  assert.ok(s.z < -4 && s.z > -6 && Math.abs(s.y - 0.3) < 1e-6, `on step y=${s.y} z=${s.z}`);
  run(s, w, 200, BTN.FWD);
  assert.ok(s.z > -14 + M.halfWidth - 0.01 && s.z < -13, `stopped by wall z=${s.z}`);
});

test('jump-mantles onto 1.2 m and 2.2 m ledges, not a 3 m wall', () => {
  for (const [h, expect] of [[1.2, true], [2.2, true], [3.0, false]]) {
    const map = new MapBuilder('t', 't').floor(-50, -50, 50, 50).box(-5, 0, -10, 5, h, -4).build();
    const w = new CollisionWorld(map);
    const s = createMoveState(0, 0, 0, 0);
    run(s, w, 5, 0);
    run(s, w, 90, (i) => (i > 20 && i < 40 ? BTN.FWD | BTN.JUMP : BTN.FWD));
    assert.equal(Math.abs(s.y - h) < 0.05, expect, `h=${h} y=${s.y}`);
  }
});

test('walks up and down a ramp', () => {
  const map = new MapBuilder('t', 't').floor(-50, -50, 50, 50).ramp(-3, 0, -12, 3, 3, -2, '-z').box(-3, 0, -22, 3, 3, -12).build();
  const w = new CollisionWorld(map);
  const s = createMoveState(0, 0, 0, 0);
  run(s, w, 5, 0);
  run(s, w, 150, BTN.FWD);
  assert.ok(Math.abs(s.y - 3) < 1e-3 && s.z < -12, `top y=${s.y} z=${s.z}`);
  run(s, w, 5, 0);
  // walk back down: stays grounded the whole way
  let airTicks = 0;
  run(s, w, 260, (i, st) => { if (!st.grounded) airTicks++; return BTN.BACK; });
  assert.ok(s.y < 0.01 && airTicks < 5, `down y=${s.y} air=${airTicks}`);
});

test('deterministic: same inputs give identical states', () => {
  const a = settled(), b = settled();
  const seq = Array.from({ length: 300 }, (_, i) => ((i * 7919) % 2048) & (BTN.FWD | BTN.LEFT | BTN.JUMP | BTN.SPRINT | BTN.CROUCH | BTN.DASH));
  run(a, flat, 300, (i) => seq[i], (i) => i * 0.01);
  run(b, flat, 300, (i) => seq[i], (i) => i * 0.01);
  assert.deepEqual(a, b);
});

// ------------------------------------------------------------------ double jump, dash, wall running
const jumpTap = (i) => (i === 0 ? BTN.JUMP : 0);

test('double jump: one extra jump in the air, refilled on landing', () => {
  const s = settled();
  run(s, flat, 1, BTN.JUMP);
  run(s, flat, 12, 0);
  const vyBefore = s.vy;
  run(s, flat, 1, BTN.JUMP);
  assert.ok(Math.abs(s.vy - (M.doubleJumpVelocity - M.gravity * DT)) < 1e-6, `air jump vy ${s.vy} (was ${vyBefore})`);
  assert.equal(s.airJumps, 0);
  run(s, flat, 1, 0);
  const vy = s.vy;
  run(s, flat, 1, BTN.JUMP);
  assert.ok(s.vy < vy, 'no third jump');
  run(s, flat, 120, 0);
  assert.equal(s.grounded, true);
  assert.equal(s.airJumps, M.doubleJumps, 'refilled on landing');
});

test('double jump reaches higher than a single jump', () => {
  const peak = (double) => {
    const s = settled();
    let top = 0;
    run(s, flat, 40, (i) => (i === 0 || (double && i === 20) ? BTN.JUMP : 0));
    run(s, flat, 60, (i, st) => { top = Math.max(top, st.y); return 0; });
    return top;
  };
  // (peak of the run is measured over the whole jump)
  const one = (() => { const s = settled(); let t = 0; run(s, flat, 100, (i, st) => { t = Math.max(t, st.y); return jumpTap(i); }); return t; })();
  const two = (() => { const s = settled(); let t = 0; run(s, flat, 120, (i, st) => { t = Math.max(t, st.y); return i === 0 || i === 20 ? BTN.JUMP : 0; }); return t; })();
  assert.ok(two > one + 0.6, `double ${two.toFixed(2)} vs single ${one.toFixed(2)}`);
  void peak;
});

test('a jump pressed just before landing is a bunnyhop, not the air jump', () => {
  const s = settled();
  run(s, flat, 1, BTN.JUMP);
  // fall until just above the floor
  run(s, flat, 200, (i, st) => 0, 0);
  const t = settled();
  run(t, flat, 1, BTN.JUMP);
  let n = 0;
  while (!(t.vy < 0 && t.y < 0.08) && n++ < 200) simulateMove(t, 0, 0, 0, flat, DT);
  simulateMove(t, BTN.JUMP, 0, 0, flat, DT);
  assert.equal(t.airJumps, M.doubleJumps, 'air jump kept');
  for (let i = 0; i < 4 && !t.grounded; i++) simulateMove(t, BTN.JUMP, 0, 0, flat, DT);
  assert.ok(t.vy > 0 || t.fx, 'hopped on landing');
});

test('ground dash: burst of speed, cooldown, momentum kept afterwards', () => {
  const s = settled();
  run(s, flat, 60, BTN.FWD | BTN.SPRINT);
  run(s, flat, 1, BTN.DASH | BTN.FWD | BTN.SPRINT);
  assert.ok(hs(s) >= M.dashSpeed - 0.01, `dash speed ${hs(s)}`);
  assert.ok(s.dashT > 0 && s.dashCd > 0);
  const v0 = hs(s);
  run(s, flat, Math.round(M.dashDuration / DT) - 1, BTN.FWD | BTN.SPRINT);
  assert.ok(hs(s) > v0 - 0.3, 'no friction during the burst');
  run(s, flat, 1, BTN.DASH | BTN.FWD);
  assert.ok(s.dashCd > M.dashCooldown - M.dashDuration - 2 * DT, 'second dash blocked by the cooldown');
  run(s, flat, Math.ceil(M.dashCooldown / DT), BTN.FWD | BTN.SPRINT);
  assert.equal(s.dashCd, 0);
});

test('sideways dash keeps half the old momentum', () => {
  const s = settled();
  run(s, flat, 90, BTN.FWD | BTN.SPRINT); // moving toward -z
  const vz = s.vz;
  run(s, flat, 1, BTN.DASH | BTN.RIGHT);
  assert.ok(s.vx >= M.dashSpeed - 0.01, `dashed right ${s.vx}`);
  assert.ok(Math.abs(s.vz - vz * M.dashKeepSideways) < 0.5, `kept forward speed ${s.vz} vs ${vz}`);
});

test('dash never passes through a wall', () => {
  const world = new CollisionWorld(new MapBuilder('w', 'w').floor(-50, -50, 50, 50).box(-5, 0, -3.2, 5, 3, -3, 0).build());
  const s = settled(0, 0, world);
  for (let k = 0; k < 6; k++) {
    run(s, world, 1, BTN.DASH | BTN.FWD);
    run(s, world, 90, BTN.FWD);
  }
  assert.ok(s.z > -3 + M.halfWidth - 0.01, `stopped at the wall (z ${s.z.toFixed(3)})`);
});

// A runnable wall along z (x from 4 to 5), 6 m tall, and a plain wall elsewhere
const wallWorld = (run = true) => {
  const b = new MapBuilder('wr', 'wr').floor(-60, -60, 60, 60).box(4, 0, -40, 5, 6, 10, 0);
  if (run) b.run();
  return new CollisionWorld(b.build());
};
/** Sprint alongside the wall (just beside it), jump, keep holding forward and into the wall. */
function wallRunSetup(world) {
  const s = settled(4 - M.halfWidth - 0.05, 5, world);
  run(s, world, 50, BTN.FWD | BTN.SPRINT);
  run(s, world, 1, BTN.FWD | BTN.SPRINT | BTN.JUMP);
  let started = -1;
  for (let i = 0; i < 40 && started < 0; i++) {
    simulateMove(s, BTN.FWD | BTN.RIGHT | BTN.SPRINT, 0, 0, world, DT);
    if (s.wallRun) started = i;
  }
  return { s, started };
}

test('wall run: starts on a runnable wall, constant speed, low gravity, limited time', () => {
  const world = wallWorld(true);
  const { s, started } = wallRunSetup(world);
  assert.ok(started >= 0, 'wall run started');
  assert.equal(s.wrNx, -1, 'wall normal points away from the wall');
  assert.equal(s.airJumps, M.doubleJumps);
  const y0 = s.y, sp0 = hs(s);
  run(s, world, 30, BTN.FWD | BTN.RIGHT);
  assert.equal(s.wallRun, 1);
  assert.ok(Math.abs(hs(s) - sp0) < 0.7, `speed held (${sp0.toFixed(2)} → ${hs(s).toFixed(2)})`);
  const fallFree = 0.5 * M.gravity * 0.5 ** 2;
  assert.ok(y0 - s.y < fallFree * 0.5, 'falls much slower than free fall');
  run(s, world, Math.ceil(M.wallRunMaxTime / DT), BTN.FWD | BTN.RIGHT);
  assert.equal(s.wallRun, 0, 'peels off after the time limit');
});

test('no wall run on walls that are not tagged runnable', () => {
  const { started } = wallRunSetup(wallWorld(false));
  assert.equal(started, -1);
});

test('wall run needs forward held and ends when released', () => {
  const world = wallWorld(true);
  const { s } = wallRunSetup(world);
  run(s, world, 1, BTN.RIGHT);
  assert.equal(s.wallRun, 0);
});

test('wall jump pushes away from the wall and refills the air jump', () => {
  const world = wallWorld(true);
  const { s } = wallRunSetup(world);
  run(s, world, 10, BTN.FWD | BTN.RIGHT);
  s.airJumps = 0;
  run(s, world, 1, BTN.FWD | BTN.JUMP);
  assert.equal(s.wallRun, 0);
  assert.ok(s.vx < -M.wallJumpOut + 0.5, `pushed off the wall (vx ${s.vx})`);
  assert.ok(s.vy > M.wallJumpUp - 1, `jumped up (vy ${s.vy})`);
  assert.equal(s.airJumps, M.doubleJumps);
  assert.ok(s.fx & 128, 'wall jump event');
  // can't stick straight back onto the same wall
  run(s, world, 10, BTN.FWD | BTN.RIGHT);
  assert.equal(s.wallRun, 0);
});

test('deterministic with the new moves: replaying inputs from a copy gives identical states', () => {
  const world = wallWorld(true);
  const seq = Array.from({ length: 400 }, (_, i) => (((i * 2654435761) >>> 0) % 2048) & (BTN.FWD | BTN.RIGHT | BTN.JUMP | BTN.SPRINT | BTN.CROUCH | BTN.DASH));
  const a = settled(2, 0, world);
  const snap = JSON.parse(JSON.stringify(a));
  run(a, world, 400, (i) => seq[i] | BTN.FWD, (i) => Math.sin(i * 0.05) * 0.8);
  const b = Object.assign(createMoveState(), snap);
  run(b, world, 400, (i) => seq[i] | BTN.FWD, (i) => Math.sin(i * 0.05) * 0.8);
  assert.deepEqual(a, b);
});
