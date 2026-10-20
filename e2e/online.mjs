// Phase 3: browser client vs a bot in a 1v1 room, through the real server.
// Checks: lobby flow, match start, prediction corrections, remote interpolation, ping, server-confirmed hits.
import { spawn } from 'node:child_process';
import { launch, openPage, sleep, check, WS_URL } from './lib.mjs';

const label = process.argv[2] || 'no added lag';
const browser = await launch();
const { page, errors } = await openPage(browser, '?nolock&netdebug');
console.log(`online 1v1 vs bot (${label}):`);
await page.fill('input[placeholder="Nickname"]', 'Tester');
await page.click('text=Create Room');
await page.waitForSelector('.lobby-code', { timeout: 8000 });
const code = (await page.textContent('.lobby-code')).trim();
check(/^[A-Z]{4}$/.test(code), `room created with code ${code}`);
const bot = spawn('node', ['scripts/bot.js', '--url', WS_URL, '--count', '1', '--code', code, '--duration', '90', '--quiet', '--skill', '0.2'], { stdio: 'inherit' });
await page.waitForFunction(() => window.__slip.room?.players.length === 2, null, { timeout: 8000 });
check(true, 'bot joined the room');
await page.click('button:has-text("Ready")');
await page.waitForFunction(() => window.__slip.online?.ready, null, { timeout: 15000 });
check(true, 'match started, local player spawned');
await page.click('text=Click to play');
const snapInfo = () => page.evaluate(() => {
  const o = window.__slip.online;
  return { phase: o.phase, corrections: o.corrections, last: o.lastCorrection, ping: window.__slip.net.rtt, remotes: (o.lastRemotes || []).length, x: o.me.ms.x, z: o.me.ms.z, hist: o.history.length };
});
await page.waitForFunction(() => window.__slip.online.phase === 'live', null, { timeout: 15000 });
const a = await snapInfo();
// Move around: sprint, slide, jump, strafe
await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft'); await sleep(700);
await page.keyboard.down('KeyC'); await sleep(300); await page.keyboard.up('KeyC');
await page.keyboard.press('Space'); await sleep(400);
await page.keyboard.down('KeyA'); await sleep(500); await page.keyboard.up('KeyA');
await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW');
await sleep(500);
const b = await snapInfo();
check(Math.hypot(b.x - a.x, b.z - a.z) > 3, `local player moved ${Math.hypot(b.x - a.x, b.z - a.z).toFixed(1)} m`);
console.log(`    corrections during movement: ${b.corrections - a.corrections} (last size ${b.last.toFixed(4)} m), unacked inputs: ${b.hist}, ping ${b.ping.toFixed(0)} ms`);
check(b.last < 0.25, 'prediction errors stay small');
check(b.remotes === 1, 'remote player visible (interpolated)');
const pingText = await page.textContent('.ping');
check(/\d+ ms/.test(pingText), `HUD shows ping "${pingText}"`);
// Quick-chat wheel: hold T, flick up (first item), release
await page.keyboard.down('KeyT');
await sleep(100);
await page.mouse.move(640, 400);
await page.mouse.move(640, 300, { steps: 5 });
await sleep(100);
await page.keyboard.up('KeyT');
await page.waitForSelector('.chatfeed .cm', { timeout: 3000 }).catch(() => {});
const chat = await page.textContent('.chatfeed').catch(() => '');
check(/Nice shot!/.test(chat), `quick-chat wheel sent "${chat.trim()}"`);
// Hunt the bot: aim at it every frame and fire with F
let hits = 0;
await page.exposeFunction('__hit', () => { hits++; });
await page.evaluate(() => {
  const g = window.__slip.game;
  const orig = g.hud.hitMarker.bind(g.hud);
  g.hud.hitMarker = (...a) => { window.__hit(); orig(...a); };
  window.__aimer = setInterval(() => {
    const o = window.__slip.online; if (!o || !o.me.alive) return;
    const t = (o.lastRemotes || []).find((e) => e.alive); if (!t) return;
    const me = o.me.ms; const dx = t.x - me.x, dz = t.z - me.z, dy = t.y + 1.15 - (me.y + me.eye);
    g.yaw = Math.atan2(-dx, -dz) + o.me.ws.recY; g.pitch = Math.atan2(dy, Math.hypot(dx, dz)) - o.me.ws.recP;
  }, 16);
});
await page.keyboard.down('KeyE'); // aim down sights for tighter spread
for (let i = 0; i < 25 && hits === 0; i++) {
  await page.keyboard.down('KeyF'); await sleep(700); await page.keyboard.up('KeyF'); await sleep(200);
  const alive = await page.evaluate(() => window.__slip.online?.me.alive);
  if (!alive) await page.waitForFunction(() => window.__slip.online?.me.alive, null, { timeout: 20000 }).catch(() => {});
}
await page.keyboard.up('KeyE');
check(hits > 0, `server confirmed ${hits} hit(s) on the bot`);
await page.screenshot({ path: `e2e/out/online-${label.replace(/\W+/g, '_')}.png` });
const final = await snapInfo();
console.log(`    total corrections: ${final.corrections}, last ${final.last.toFixed(4)} m`);
const mp = await page.evaluate(() => window.__slip.online?.mispredicts || []);
if (mp.length) console.log('    mispredictions:', JSON.stringify(mp.slice(0, 6)));
check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
bot.kill();
await browser.close();
