// Scope / ADS rules: only real scopes show an overlay, the knife never aims, and switching weapons,
// reloading and respawning always drop the sights.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWeaponState, tickWeapon, aimView, canAds } from '../shared/sim/weapons.js';
import { createMoveState } from '../shared/sim/movement.js';
import { WEAPONS, PRIMARIES, SECONDARIES } from '../shared/config/weapons.js';
import { BTN } from '../shared/net/protocol.js';

const DT = 1 / 60;
const ms = createMoveState(0, 0, 0, 0);
ms.grounded = true;
const run = (ws, ticks, b = 0, w = 0) => { for (let i = 0; i < ticks; i++) tickWeapon(ws, b, i === 0 ? w : 0, ms, 1, DT); };

test('aimView returns strict booleans for every weapon in every slot', () => {
  for (const p of PRIMARIES) for (const s of SECONDARIES) {
    const ws = createWeaponState({ p, s });
    for (const slot of [1, 2, 3, 1, 3, 2]) {
      run(ws, 60, 0, slot);       // switch and wait out the swap
      run(ws, 40, BTN.ADS);       // hold aim
      const v = aimView(ws);
      const w = WEAPONS[ws.slots[ws.cur]];
      assert.equal(typeof v.scoped, 'boolean', `${w.id}: scoped must be a boolean`);
      assert.equal(v.scoped, w.scope === true, `${w.id} scoped=${v.scoped}`);
      if (w.kind === 'melee') {
        assert.equal(ws.adsT, 0, 'knife never aims');
        assert.equal(v.zoom, 1, 'knife never zooms');
      } else assert.ok(v.zoom > 1, `${w.id} zooms while aiming`);
    }
  }
});

test('the knife can never ADS, even with the ADS key held through the switch', () => {
  const ws = createWeaponState({ p: 'sniper', s: 'pistol' });
  run(ws, 40, BTN.ADS);
  assert.equal(aimView(ws).scoped, true, 'sniper scoped');
  run(ws, 30, BTN.ADS, 3);  // switch to the knife while still holding ADS
  assert.equal(ws.slots[ws.cur], 'knife');
  assert.equal(ws.adsT, 0);
  assert.deepEqual([aimView(ws).scoped, aimView(ws).zoom], [false, 1]);
  assert.equal(canAds(WEAPONS.knife), false);
});

test('switching weapons always cancels ADS and resets zoom', () => {
  const ws = createWeaponState({ p: 'sniper', s: 'pistol' });
  run(ws, 40, BTN.ADS);
  run(ws, 1, BTN.ADS, 2);
  assert.equal(ws.adsT, 0, 'pistol starts unaimed');
  assert.equal(aimView(ws).zoom, 1);
  run(ws, 1, 0, 4); // quick-switch back to the sniper
  assert.equal(ws.slots[ws.cur], 'sniper');
  assert.equal(aimView(ws).scoped, false, 'not scoped right after switching');
});

test('reloading drops the sights immediately', () => {
  const ws = createWeaponState({ p: 'rifle', s: 'pistol' });
  run(ws, 40, BTN.ADS);
  assert.ok(ws.adsT > 0.9);
  ws.ammo[0] = 3;
  run(ws, 1, BTN.ADS | BTN.RELOAD);
  assert.equal(ws.adsT, 0);
  run(ws, 30, BTN.ADS);
  assert.equal(ws.adsT, 0, 'no aiming while the reload runs');
});

test('a fresh weapon state (death / round start) is never aimed', () => {
  for (const p of PRIMARIES) {
    const v = aimView(createWeaponState({ p, s: 'pistol' }));
    assert.deepEqual([v.scoped, v.ads, v.zoom], [false, 0, 1]);
  }
});
