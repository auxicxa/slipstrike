import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, MATCH_MAPS } from '../shared/maps/index.js';
import { CollisionWorld } from '../shared/sim/collision.js';
import { createMoveState, simulateMove } from '../shared/sim/movement.js';
import { MOVEMENT as M } from '../shared/config/movement.js';
import { MODES } from '../shared/config/game.js';

for (const [id, map] of Object.entries(MAPS)) {
  test(`map ${id}: spawns are free, grounded and the player lands where expected`, () => {
    const w = new CollisionWorld(map);
    const all = [...map.spawns[0], ...map.spawns[1], ...map.ffa];
    assert.ok(all.length > 0);
    for (const [x, y, z, yaw] of all) {
      assert.ok(w.boxFree(x, y + 0.01, z, M.halfWidth, M.standHeight), `${id} spawn (${x},${y},${z}) is inside geometry`);
      const s = createMoveState(x, y, z, yaw);
      for (let i = 0; i < 30; i++) simulateMove(s, 0, yaw, 0, w, 1 / 60);
      assert.ok(s.grounded && Math.abs(s.y - y) < 0.05, `${id} spawn (${x},${y},${z}) falls to ${s.y}`);
    }
  });
}

for (const id of MATCH_MAPS) {
  test(`map ${id}: team spawns are point-mirrored (fair) and far apart`, () => {
    const map = MAPS[id];
    assert.equal(map.spawns[0].length, map.spawns[1].length);
    map.spawns[0].forEach(([x, y, z], i) => {
      const [x2, y2, z2] = map.spawns[1][i];
      assert.deepEqual([x2, y2, z2], [-x, y, -z]);
      assert.ok(Math.hypot(x - x2, z - z2) > 30, 'spawns far apart');
    });
  });
}

test('every mode has a valid default map and enough spawns', () => {
  for (const m of Object.values(MODES)) {
    assert.ok(MAPS[m.map], m.id);
    if (m.teams) assert.ok(MAPS[m.map].spawns[0].length >= m.teamSize, `${m.map} needs ${m.teamSize} spawns`);
  }
});
