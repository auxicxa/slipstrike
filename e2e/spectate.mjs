// Phase 4: after dying in 3v3, the camera follows a living teammate and the fire key cycles targets.
import { spawn } from 'node:child_process';
import { launch, openPage, sleep, check, WS_URL } from './lib.mjs';

const browser = await launch();
const { page, errors } = await openPage(browser);
console.log('spectator mode (3v3):');
await page.fill('input[placeholder="Nickname"]', 'Watcher');
await page.click('text=Create Room');
await page.waitForSelector('.lobby-code');
await page.click('button:has-text("3v3")');
await page.waitForFunction(() => window.__slip.room?.mode === '3v3');
await page.selectOption('select.field', 'kiln'); // compact map: the bots find us quickly
await page.waitForFunction(() => window.__slip.room?.map === 'kiln');
const code = (await page.textContent('.lobby-code')).trim();
const bots = spawn('node', ['scripts/bot.js', '--url', WS_URL, '--count', '5', '--code', code, '--duration', '300', '--quiet', '--roles', 'hunter,passive,hunter,passive,hunter'], { stdio: 'ignore' });
await page.waitForFunction(() => window.__slip.room?.players.length === 6, null, { timeout: 10000 });
await page.click('button:text-is("Ready")');
await page.waitForFunction(() => window.__slip.online?.ready, null, { timeout: 15000 });
await page.click('text=Click to play');
// Enemies are hunters, our two teammates are passive bots hiding in spawn: walk out and get caught
await page.waitForFunction(() => window.__slip.online?.phase === 'live' && window.__slip.online.me.alive, null, { timeout: 60000 });
const teamsOk = await page.evaluate(() => { const r = window.__slip.room; const me = r.players.find((p) => p.id === window.__slip.net.id); return r.players.filter((p) => p.team === me.team).length === 3; });
check(teamsOk, 'three players per team');
await page.keyboard.down('KeyW');
const died = await page.waitForFunction(() => !window.__slip.online.me.alive && window.__slip.online.phase === 'live', null, { timeout: 60000 }).then(() => true, () => false);
await page.keyboard.up('KeyW');
check(died, 'eliminated by the enemy hunters');
await sleep(250);
const s1 = await page.evaluate(() => { const v = window.__slip.online.spectateView(); return v && { name: v.name, n: window.__slip.online.spectateCandidates().length }; });
const label = (await page.textContent('.spectate')).trim();
check(!!s1 && /Spectating/.test(label), `spectating "${s1?.name}" (${s1?.n} living teammate(s)), label "${label}"`);
const cam = await page.evaluate(() => { const c = window.__slip.game.r.camera.position; const v = window.__slip.online.spectateView(); return v ? Math.hypot(c.x - v.x, c.z - v.z) : 99; });
check(cam < 1.5, `camera is at the teammate's position (${cam.toFixed(2)} m)`);
await page.screenshot({ path: 'e2e/out/spectate.png' });
if (s1 && s1.n > 1) {
  await page.keyboard.press('KeyF');
  await sleep(200);
  const { s2, left } = await page.evaluate(() => ({ s2: window.__slip.online.spectateView()?.name, left: window.__slip.online.spectateCandidates().length }));
  // (the enemy bots keep hunting meanwhile: if only one teammate is left there is nobody to cycle to)
  if (left > 1) check(s2 && s2 !== s1.name, `fire key cycles to the next teammate (${s1.name} → ${s2})`);
  else console.log(`    (only ${left} teammate left by then: cycling not checked)`);
}
check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
bots.kill();
await browser.close();
