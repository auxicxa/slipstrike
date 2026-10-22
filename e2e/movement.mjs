// Movement abilities with real key presses in the practice range: wall run on the lane (and its HUD
// timer and camera roll), wall jump, double jump, ground dash on X with the cooldown ring.
import { launch, openPage, sleep } from './lib.mjs';

const browser = await launch();
const { page, errors } = await openPage(browser);
let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗'} ${msg}`); if (!ok) failed++; };
console.log('movement abilities:');

await page.click('text=Practice Range (offline)');
await sleep(200);
await page.click('text=Click to play');
await sleep(500);

const ms = () => page.evaluate(() => {
  const m = window.__slip.game.session.me.ms;
  return { x: m.x, y: m.y, z: m.z, vx: m.vx, vy: m.vy, vz: m.vz, grounded: m.grounded, wallRun: m.wallRun, airJumps: m.airJumps, dashCd: m.dashCd, fx: m.fx };
});
const waitFor = (fn, arg, timeout = 3000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
const place = (x, z, yaw) => page.evaluate(({ x, z, yaw }) => {
  const g = window.__slip.game, m = g.session.me.ms;
  m.x = x; m.y = 0; m.z = z; m.vx = m.vy = m.vz = 0; m.grounded = true;
  g.yaw = yaw; g.pitch = 0;
}, { x, z, yaw });

// --- Wall run on the range lane: the runnable wall x 28–29 is on our left while facing -z
await place(29.45, -12.5, 0);
await sleep(300);
await page.keyboard.down('KeyW');
await page.keyboard.down('ShiftLeft');
await sleep(500);
await page.keyboard.down('KeyA');
await page.keyboard.press('Space');
const ran = await waitFor(() => window.__slip.game.session.me.ms.wallRun === 1, null, 2500);
check(ran, 'wall run started on the striped wall');
if (ran) {
  await sleep(150);
  const hud = await page.evaluate(() => ({ wr: document.querySelector('.wr')?.classList.contains('show'), tilt: window.__slip.game.r.camera.rotation.z }));
  check(hud.wr, 'HUD shows the wall-run timer');
  check(hud.tilt < -0.05, `camera rolls away from the wall (${(hud.tilt * 57.3).toFixed(1)}°)`);
  await page.screenshot({ path: 'e2e/out/wallrun.png' });
  await page.keyboard.up('KeyA');
  await page.keyboard.press('Space');
  const jumped = await waitFor(() => { const m = window.__slip.game.session.me.ms; return !m.wallRun && m.vx > 3; }, null, 1500);
  const s = await ms();
  check(jumped, `wall jump pushed off the wall (vx ${s.vx.toFixed(1)}, vy ${s.vy.toFixed(1)})`);
}
await page.keyboard.up('KeyA');
await page.keyboard.up('ShiftLeft');
await page.keyboard.up('KeyW');
await waitFor(() => window.__slip.game.session.me.ms.grounded, null, 4000);

// --- Double jump
await place(0, 10, 0);
await sleep(300);
await page.keyboard.press('Space');
await waitFor(() => { const m = window.__slip.game.session.me.ms; return !m.grounded && m.y > 0.6; }, null, 2000);
await page.keyboard.press('Space');
const dj = await waitFor(() => window.__slip.game.session.me.ms.airJumps === 0, null, 1500);
const top = await page.evaluate(() => new Promise((res) => {
  let best = 0;
  const t0 = performance.now();
  const f = () => { const m = window.__slip.game.session.me.ms; best = Math.max(best, m.y); if (m.grounded || performance.now() - t0 > 2500) res(best); else requestAnimationFrame(f); };
  f();
}));
check(dj, 'second Space in the air spent the air jump');
check(top > 1.6, `double jump peak ${top.toFixed(2)} m (single jump ≈ ${(7 * 7 / 40).toFixed(2)} m)`);
await waitFor(() => window.__slip.game.session.me.ms.grounded, null, 3000);
const refilled = await page.evaluate(() => window.__slip.game.session.me.ms.airJumps);
check(refilled === 1, 'air jump refilled on landing');

// --- Dash on X (the default key)
await place(0, 10, 0);
await sleep(300);
await page.keyboard.down('KeyW');
await sleep(250);
await page.keyboard.press('KeyX');
const dashed = await waitFor(() => { const m = window.__slip.game.session.me.ms; return Math.hypot(m.vx, m.vz) > 12; }, null, 1500);
const s2 = await ms();
check(dashed, `X dashes on the ground (${Math.hypot(s2.vx, s2.vz).toFixed(1)} m/s)`);
const ring = await page.evaluate(() => ({ ready: document.querySelector('.dash-ring')?.classList.contains('ready'), key: document.querySelector('.dash-ring .key')?.textContent }));
check(ring.ready === false && /\d/.test(ring.key), `dash ring shows the cooldown ("${ring.key}")`);
await page.keyboard.up('KeyW');
const back = await waitFor(() => document.querySelector('.dash-ring')?.classList.contains('ready'), null, 3000);
check(back, 'dash ring ready again after the cooldown');

check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
process.exit(failed ? 1 : 0);
