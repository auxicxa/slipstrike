// Hold W through the freeze → live switch at a round start. With phase-aware prediction the player
// starts moving the instant the round goes live, with no snap-back. Most meaningful when the server
// runs with FAKE_LAG_MS (e.g. 60) and FAKE_JITTER_MS.
import { spawn } from 'node:child_process';
import { launch, openPage, sleep, check, WS_URL } from './lib.mjs';

const browser = await launch();
const { page, errors } = await openPage(browser, '?nolock&netdebug');
console.log('round start prediction:');
await page.fill('input[placeholder="Nickname"]', 'Starter');
await page.click('text=Create Room');
await page.waitForSelector('.lobby-code');
const code = (await page.textContent('.lobby-code')).trim();
const bot = spawn('node', ['scripts/bot.js', '--url', WS_URL, '--count', '1', '--code', code, '--duration', '60', '--quiet', ...(process.env.BOT_ROLE ? ['--roles', process.env.BOT_ROLE] : ['--skill', '0'])], { stdio: 'ignore' });
await page.waitForFunction(() => window.__slip.room?.players.length === 2, null, { timeout: 8000 });
await page.click('button:text-is("Ready")');
await page.waitForFunction(() => window.__slip.online?.ready && window.__slip.online.phase === 'freeze', null, { timeout: 15000 });
await page.click('text=Click to play');
await page.keyboard.down('KeyW');
const before = await page.evaluate(() => { const o = window.__slip.online; o.mispredicts.length = 0; return { c: o.corrections, ping: window.__slip.net.rtt, x: o.me.ms.x, z: o.me.ms.z }; });
await page.waitForFunction(() => window.__slip.online.phase === 'live', null, { timeout: 15000 });
await sleep(1500);
await page.keyboard.up('KeyW');
const after = await page.evaluate(() => { const o = window.__slip.online; const sizes = o.mispredicts.filter((m) => m.correction).map((m) => m.correction); return { c: o.corrections, max: sizes.length ? Math.max(...sizes) : 0, x: o.me.ms.x, z: o.me.ms.z }; });
const moved = Math.hypot(after.x - before.x, after.z - before.z);
console.log(`    ping ${before.ping.toFixed(0)} ms, corrections across the round start: ${after.c - before.c}, largest ${after.max.toFixed(3)} m, moved ${moved.toFixed(1)} m`);
if (process.env.DUMP) console.log(JSON.stringify(await page.evaluate(() => ({ mp: window.__slip.online.mispredicts.slice(0, 8), pe: window.__slip.online.phaseEnd, offs: window.__slip.online.seqOffs }))));
check(moved > 3, 'player started moving when the round went live');
check(after.max < 0.1, `no visible snap at the round start (largest correction ${after.max.toFixed(3)} m)`);
check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
bot.kill();
await browser.close();
