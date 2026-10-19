// Phase 2: fire at a practice dummy with the keyboard fire key (F) and check damage + hit marker.
import { launch, openPage, sleep, check } from './lib.mjs';

const browser = await launch();
const { page, errors } = await openPage(browser);
console.log('combat in practice:');
await page.click('text=Practice Range (offline)');
await sleep(200);
await page.click('text=Click to play');
await sleep(300);
const aim = () => page.evaluate(() => {
  const g = window.__slip.game, s = g.session, d = s.dummies[0], me = s.me.ms;
  const dx = d.ms.x - me.x, dz = d.ms.z - me.z, dy = (d.ms.y + 1.15) - (me.y + me.eye);
  g.yaw = Math.atan2(-dx, -dz); g.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  return Math.hypot(dx, dz);
});
// Walk closer first
await page.keyboard.down('KeyW'); await sleep(1500); await page.keyboard.up('KeyW');
await sleep(400);
const dist = await aim();
await page.keyboard.down('KeyE'); await sleep(300);
let hitSeen = false;
const watcher = setInterval(async () => { try { if (await page.evaluate(() => !!document.querySelector('.hitmarker.show'))) hitSeen = true; } catch {} }, 30);
await page.keyboard.down('KeyF');
for (let i = 0; i < 10; i++) { await aim(); await sleep(60); }
await page.keyboard.up('KeyF');
await page.keyboard.up('KeyE');
await sleep(100);
clearInterval(watcher);
const st = await page.evaluate(() => { const s = window.__slip.game.session; return { hp: s.dummies[0].hp, alive: s.dummies[0].alive, ammo: s.me.ws.ammo[0], kills: s.me.kills }; });
check(st.ammo < 30, `fired with the F key (ammo ${st.ammo})`);
check(st.hp < 100 || !st.alive || st.kills > 0, `dummy at ${dist.toFixed(1)} m took damage (hp ${st.hp.toFixed(0)}, kills ${st.kills})`);
check(hitSeen, 'hit marker appeared');
await page.screenshot({ path: 'e2e/out/combat.png' });
// Knife: switch with 3 and check move speed is higher
await page.keyboard.press('Digit3');
await page.keyboard.down('KeyS'); await sleep(300); await page.keyboard.up('KeyS'); await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft');
await sleep(800);
const ks = await page.evaluate(() => { const ms = window.__slip.game.session.me.ms; return Math.hypot(ms.vx, ms.vz); });
await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
check(ks > 9.5, `knife sprint speed ${ks.toFixed(2)} m/s (> rifle 8.5)`);
check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
