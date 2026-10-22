// The third-person models must match the gameplay hitboxes, so a shot at a visible head is a headshot:
// pose the character the way PlayerModel does (including the fit to the player height) and check
// where the head and chest end up against playerHitboxes().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Character, OUTFITS } from '../client/models/character.js';
import { countTriangles } from '../client/models/kit.js';
import { playerHitboxes } from '../shared/sim/hitscan.js';
import { MOVEMENT as M } from '../shared/config/movement.js';

const DT = 1 / 60;

function pose(ch, s, h, frames = 90) {
  s.crouch = (M.standHeight - h) / (M.standHeight - M.crouchHeight);
  for (let i = 0; i < frames; i++) {
    ch.mesh.scale.set(1, 1, 1);
    ch.update(s, DT);
    const top = ch.headTop();
    const k = top > h ? Math.max(0.82, h / top) : 1;
    ch.mesh.scale.set(1, k, 1);
    ch.mesh.updateMatrixWorld(true);
  }
}

const inBox = (p, b, slack = 0) => p.x >= b.minx - slack && p.x <= b.maxx + slack && p.y >= b.miny - slack && p.y <= b.maxy + slack && p.z >= b.minz - slack && p.z <= b.maxz + slack;

const CASES = [
  ['standing', { speed: 0 }, M.standHeight],
  ['running', { speed: 8.5 }, M.standHeight],
  ['crouched', { speed: 0 }, M.crouchHeight],
  ['sliding', { speed: 11, sliding: true }, M.crouchHeight],
  ['aiming up', { speed: 0, pitch: 1.2 }, M.standHeight],
  ['aiming down', { speed: 0, pitch: -1.2 }, M.standHeight],
];

for (let outfit = 0; outfit < OUTFITS.length; outfit++) {
  for (const [name, s, h] of CASES) {
    test(`${OUTFITS[outfit].name} ${name}: head in the head hitbox, chest in the body hitbox`, () => {
      const ch = new Character(outfit, 0, 0xff8a3d);
      pose(ch, { grounded: true, hold: 'long', ...s }, h);
      const [legs, body, head] = playerHitboxes(0, 0, 0, h);
      const headCenter = ch.bones.head.localToWorld(new THREE.Vector3(0, 0.12, 0));
      const chest = ch.bones.chest.localToWorld(new THREE.Vector3(0, 0.1, 0));
      assert.ok(inBox(headCenter, head, 0.06), `head centre ${headCenter.toArray().map((v) => v.toFixed(2))} vs head box y ${head.miny.toFixed(2)}–${head.maxy.toFixed(2)}`);
      assert.ok(inBox(chest, body, 0.06) || inBox(chest, head, 0.0), `chest ${chest.toArray().map((v) => v.toFixed(2))} vs body box y ${body.miny.toFixed(2)}–${body.maxy.toFixed(2)}`);
      assert.ok(ch.headTop() * ch.mesh.scale.y <= h + 0.05, 'model is not taller than the player');
      void legs;
    });
  }
  test(`${OUTFITS[outfit].name}: under 4000 triangles, one skinned mesh`, () => {
    const ch = new Character(outfit, 0, 0xff8a3d);
    assert.ok(countTriangles(ch.mesh) < 4000, `${countTriangles(ch.mesh)} triangles`);
    assert.equal(ch.mesh.isSkinnedMesh, true);
    assert.equal(ch.mesh.geometry.groups.length, 3);
  });
}

test('characters share geometry per outfit/skin and differ only in team materials', () => {
  const a = new Character(1, 2, 0xff8a3d), b = new Character(1, 2, 0x3db4ff);
  assert.equal(a.mesh.geometry, b.mesh.geometry);
  assert.notEqual(a.mesh.material[1], b.mesh.material[1]);
  assert.equal(a.mesh.material[0], b.mesh.material[0]);
});

test('death animation ends lying on the ground', () => {
  const ch = new Character(0, 0, 0xff8a3d);
  pose(ch, { speed: 0, grounded: true, hold: 'long' }, M.standHeight, 10);
  ch.die(1);
  for (let i = 0; i < 90; i++) ch.update({ speed: 0, grounded: true, alive: false }, DT);
  const head = ch.bones.head.getWorldPosition(new THREE.Vector3());
  assert.ok(head.y < 0.5, `head at ${head.y.toFixed(2)} m after falling`);
});
