// Phase 4: after dying in 3v3, the camera follows a living teammate and the fire key cycles targets.
import { spawn } from 'node:child_process';
import { launch, openPage, sleep, check } from './lib.mjs';

const browser = await launch();
const { page, errors } = await openPage(browser);
console.log('spectator mode (3v3):');
await page.fill('input[placeholder="Nickname"]', 'Watcher');
await page.click('text=Create Room');
await page.waitForSelector('.lobby-code');
await page.click('button:has-text("3v3")');
await page.waitForFunction(() => window.__slip.room?.mode === '3v3');
const code = (await page.textContent('.lobby-code')).trim();
const bots = spawn('node', ['scripts/bot.js', '--count', '5', '--code', code, '--duration', '300', '--quiet', '--skill', '0.5'], { stdio: 'ignore' });
await page.waitForFunction(() => window.__slip.room?.players.length === 6, null, { timeout: 10000 });
await page.click('button:has-text("Ready")');
await page.waitForFunction(() => window.__slip.online?.ready, null, { timeout: 15000 });
await page.click('text=Click to play');
let ok = false;
for (let attempt = 0; attempt < 6 && !ok; attempt++) {
  await page.waitForFunction(() => window.__slip.online.phase === 'live' && window.__slip.online.me.alive, null, { timeout: 60000 });
  // Walk toward the enemy side to get killed quickly
  await page.keyboard.down('KeyW');
  const died = await page.waitForFunction(() => !window.__slip.online.me.alive && window.__slip.online.phase === 'live', null, { timeout: 45000 }).then(() => true, () => false);
  await page.keyboard.up('KeyW');
  if (!died) continue;
  await sleep(250);
  const s1 = await page.evaluate(() => { const v = window.__slip.online.spectateView(); return v && { name: v.name, n: window.__slip.online.spectateCandidates().length }; });
  if (!s1) continue;
  const label = (await page.textContent('.spectate')).trim();
  const cam = await page.evaluate(() => { const c = window.__slip.game.r.camera.position; const v = window.__slip.online.spectateView(); return Math.hypot(c.x - v.x, c.z - v.z); });
  check(/Spectating/.test(label), `spectating "${s1.name}" (${s1.n} living teammate(s)), label "${label}"`);
  check(cam < 1.5, `camera is at the teammate's position (${cam.toFixed(2)} m)`);
  await page.screenshot({ path: 'e2e/out/spectate.png' });
  if (s1.n > 1) {
    await page.keyboard.press('KeyF');
    await sleep(200);
    const s2 = await page.evaluate(() => window.__slip.online.spectateView()?.name);
    check(s2 && s2 !== s1.name, `fire key cycles to the next teammate (${s1.name} → ${s2})`);
  }
  ok = true;
}
check(ok, 'observed spectator mode');
check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
bots.kill();
await browser.close();
