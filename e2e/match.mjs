// Phase 4: 2v2 in the browser with 3 bots: loadout during freeze, scoreboard, spectating after death,
// results screen, and the return to the lobby.
import { spawn } from 'node:child_process';
import { launch, openPage, sleep, check, WS_URL } from './lib.mjs';

const browser = await launch();
const { page, errors } = await openPage(browser);
console.log('2v2 match flow:');
await page.fill('input[placeholder="Nickname"]', 'Specter');
await page.click('text=Create Room');
await page.waitForSelector('.lobby-code');
await page.click('button:has-text("2v2")');
await page.waitForFunction(() => window.__slip.room?.mode === '2v2');
await page.selectOption('select.field', 'kiln'); // compact map: the bots find us quickly
await page.waitForFunction(() => window.__slip.room?.map === 'kiln');
const code = (await page.textContent('.lobby-code')).trim();
const bots = spawn('node', ['scripts/bot.js', '--url', WS_URL, '--count', '3', '--code', code, '--duration', '300', '--quiet', '--roles', 'hunter,passive,hunter'], { stdio: 'ignore' });
await page.waitForFunction(() => window.__slip.room?.players.length === 4, null, { timeout: 10000 });
check(true, 'mode set to 2v2 and 3 bots joined');
const teams = await page.evaluate(() => window.__slip.room.players.map((p) => p.team).sort().join(''));
check(teams === '0011', `teams auto-balanced (${teams})`);
await page.click('button:text-is("Ready")');
await page.waitForFunction(() => window.__slip.online?.ready && window.__slip.online.phase === 'freeze', null, { timeout: 15000 });
await page.click('text=Click to play');
await sleep(200);
check(await page.waitForSelector('.loadout-panel.show', { timeout: 2500 }).then(() => true, () => false), 'loadout picker shown during freeze');
await page.keyboard.press('Digit2'); // primary #2 = shotgun
await page.waitForFunction(() => window.__slip.online.me.ws.slots[0] === 'shotgun', null, { timeout: 3000 }).then(() => check(true, 'picked shotgun with key 2 during freeze (server applied it)'), () => check(false, 'loadout pick applied'));
await page.keyboard.down('Tab');
await sleep(300);
const rows = await page.$$eval('.scoreboard.show tr', (r) => r.length);
check(rows >= 6, `scoreboard opens with Tab (${rows} rows)`);
await page.screenshot({ path: 'e2e/out/scoreboard.png' });
await page.keyboard.up('Tab');
// Walk toward the enemy side until the bots get us (may take a few rounds)
let died = false;
for (let i = 0; i < 5 && !died; i++) {
  const live = await page.waitForFunction(() => window.__slip.online?.phase === 'live' && window.__slip.online.me.alive, null, { timeout: 30000 }).then(() => true, () => false);
  if (!live) break;
  await page.keyboard.down('KeyW');
  died = await page.waitForFunction(() => !window.__slip.online.me.alive, null, { timeout: 40000 }).then(() => true, () => false);
  await page.keyboard.up('KeyW');
}
check(died, 'local player was eliminated');
if (died) {
  await sleep(300);
  // Our teammate is a passive bot hiding in spawn, so there is always someone to watch
  const spec = await page.evaluate(() => window.__slip.online.spectateView()?.name ?? null);
  const label = (await page.textContent('.spectate').catch(() => '')).trim();
  check(spec && /Spectating/.test(label), `spectating teammate "${spec}" (${label})`);
  await page.screenshot({ path: 'e2e/out/spectate.png' });
}
// Play out the match (bots finish it; FAST_ROUNDS keeps it short)
await page.waitForSelector('.results', { timeout: 240000 });
const winner = await page.textContent('.results .winner');
const resRows = await page.$$eval('.results tr', (r) => r.length);
check(resRows >= 6, `results screen: "${winner.trim()}" with ${resRows} table rows (K/D)`);
await page.screenshot({ path: 'e2e/out/results.png' });
await page.waitForSelector('.lobby-code', { timeout: 30000 });
check(true, 'returned to the lobby after the match');
check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
bots.kill();
await browser.close();
