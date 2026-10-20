// Phase 3: drop the browser's socket mid-match and check it reconnects into the same slot.
import { spawn } from 'node:child_process';
import { launch, openPage, sleep, check, WS_URL } from './lib.mjs';

const browser = await launch();
const { page, errors } = await openPage(browser);
console.log('reconnect mid-match:');
await page.fill('input[placeholder="Nickname"]', 'Reconnector');
await page.click('text=Create Room');
await page.waitForSelector('.lobby-code');
const code = (await page.textContent('.lobby-code')).trim();
const bot = spawn('node', ['scripts/bot.js', '--url', WS_URL, '--count', '1', '--code', code, '--duration', '60', '--quiet', '--skill', '0'], { stdio: 'ignore' });
await page.waitForFunction(() => window.__slip.room?.players.length === 2, null, { timeout: 8000 });
await page.click('button:has-text("Ready")');
await page.waitForFunction(() => window.__slip.online?.ready, null, { timeout: 15000 });
await page.click('text=Click to play');
const before = await page.evaluate(() => ({ id: window.__slip.net.id, code: window.__slip.room.code }));
// Simulate a network drop (abnormal close, like Wi-Fi switching)
await page.evaluate(() => { window.__slip.net.ws.close(4100, 'test drop'); });
await sleep(300);
const st = await page.evaluate(() => window.__slip.net.state);
check(st === 'reconnecting' || st === 'connecting' || st === 'open', `client noticed the drop (state ${st})`);
await page.waitForFunction(() => window.__slip.net.state === 'open', null, { timeout: 10000 });
await sleep(1500);
const after = await page.evaluate(() => ({ id: window.__slip.net.id, code: window.__slip.room?.code, inMatch: !!window.__slip.online, snaps: window.__slip.online?.snaps.length, me: window.__slip.room?.players.find((p) => p.id === window.__slip.net.id) }));
check(after.id === before.id, `same player id after reconnect (${before.id} → ${after.id})`);
check(after.code === before.code && after.inMatch, `still in room ${after.code} and in the match`);
check(after.me && !after.me.disc, 'server shows the player as connected again');
const t0 = await page.evaluate(() => window.__slip.online.snaps.at(-1).k);
await sleep(500);
const t1 = await page.evaluate(() => window.__slip.online.snaps.at(-1).k);
check(t1 > t0, `snapshots flowing again (tick ${t0} → ${t1})`);
check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
bot.kill();
await browser.close();
