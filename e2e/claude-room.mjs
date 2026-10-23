// claude.ai-room multiplayer, end to end, in two tabs: one hosts (runs the match in its browser), the
// other joins by code. Uses the local stand-in for the room capability (?localroom=<latency ms>).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { BASE, sleep, check } from './lib.mjs';

const browser = await chromium.launch({
  executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-networking',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
const q = `/?nolock&localroom=${process.env.ROOM_LATENCY || 40}&fastrounds`;
const errors = [];
const open = async (name) => {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' || /host presence/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  await page.goto(BASE + q);
  await page.waitForFunction(() => !!window.__slip);
  await page.evaluate((q) => window.__slip.settings.set('quality', q), process.env.E2E_QUALITY || 'low'); // software rendering
  await page.fill('input[placeholder="Nickname"]', name);
  return page;
};
console.log('claude.ai room multiplayer (local stand-in):');
const A = await open('Hosty');
const B = await open('Joiner');
await A.click('text=Create Room');
await A.waitForSelector('.lobby-code', { timeout: 10000 });
const code = (await A.textContent('.lobby-code')).trim();
check(/^[A-Z]{4}$/.test(code), `host created room ${code}`);
await B.bringToFront();
await B.fill('input[placeholder="CODE"]', code);
await B.click('button:text-is("Join")');
const joined = await B.waitForSelector('.lobby-code', { timeout: 10000 }).then(() => true, () => false);
check(joined, 'second tab joined by code');
await A.waitForFunction(() => window.__slip.room?.players.length === 2, null, { timeout: 10000 });
check(true, 'host sees both players in the lobby');
await A.bringToFront();
await A.click('button:text-is("Ready")');
await B.bringToFront();
await B.click('button:text-is("Ready")');
await Promise.all([A, B].map((p) => p.waitForFunction(() => window.__slip.online?.ready, null, { timeout: 20000 })));
check(true, 'match started in both tabs');
await A.bringToFront();
await A.click('text=Click to play');
await B.bringToFront();
await B.click('text=Click to play');
await B.waitForFunction(() => window.__slip.online.phase === 'live', null, { timeout: 15000 });
// The joiner moves; the host must see it, and the joiner's prediction must agree with the host
const seen0 = await A.evaluate(() => { const e = window.__slip.online.lastRemotes?.[0]; return e && { x: e.x, z: e.z }; });
await B.bringToFront();
await B.keyboard.down('KeyW'); await sleep(1200); await B.keyboard.up('KeyW');
await sleep(600);
const seen1 = await A.evaluate(() => { const e = window.__slip.online.lastRemotes?.[0]; return e && { x: e.x, z: e.z }; });
const bState = await B.evaluate(() => { const o = window.__slip.online; return { corr: o.corrections, last: o.lastCorrection, x: o.me.ms.x, z: o.me.ms.z, ping: window.__slip.net.rtt }; });
const moved = seen0 && seen1 ? Math.hypot(seen1.x - seen0.x, seen1.z - seen0.z) : 0;
check(moved > 3, `host sees the joiner move (${moved.toFixed(1)} m)`);
check(seen1 && Math.hypot(seen1.x - bState.x, seen1.z - bState.z) < 1, 'host view and joiner prediction agree on the position');
console.log(`    joiner: ping ${bState.ping.toFixed(0)} ms, corrections ${bState.corr}, last ${bState.last.toFixed(3)} m`);
// Rounds: the joiner walks out into the open right lane (Kiln's spawns can't see each other), then the
// host shoots from spawn. Both tabs share one headless window, so the acting tab must be in front.
let bHurt = false;
const hurtWatch = setInterval(async () => { try { if ((await B.evaluate(() => window.__slip.online?.me.hp)) < 100) bHurt = true; } catch { /* page busy */ } }, 200);
await A.evaluate(() => {
  const g = window.__slip.game;
  window.__aimer = setInterval(() => {
    const o = window.__slip.online; if (!o || !o.me.alive) return;
    const t = (o.lastRemotes || []).find((e) => e.alive); if (!t) return;
    const me = o.me.ms; const dx = t.x - me.x, dz = t.z - me.z, dy = t.y + t.h * 0.6 - (me.y + me.eye);
    g.yaw = Math.atan2(-dx, -dz) + o.me.ws.recY; g.pitch = Math.atan2(dy, Math.hypot(dx, dz)) - o.me.ws.recP;
  }, 16);
});
const deadline = Date.now() + 300000;
let resultsA = false, rounds = 0;
while (Date.now() < deadline && !resultsA) {
  await B.bringToFront();
  const live = await B.waitForFunction(() => window.__slip.online?.phase === 'live' && window.__slip.online.me.alive, null, { timeout: 20000 }).then(() => true, () => false);
  resultsA = await A.isVisible('.results');
  if (!live) continue;
  rounds++;
  // Walk to the open spot at (10, -8) on the joiner's side
  await B.keyboard.down('KeyW');
  for (let i = 0; i < 80; i++) {
    const d = await B.evaluate(() => {
      const o = window.__slip.online, me = o.me.ms, tx = 10, tz = -8;
      window.__slip.game.yaw = Math.atan2(-(tx - me.x), -(tz - me.z));
      return Math.hypot(tx - me.x, tz - me.z);
    });
    if (d < 1.5) break;
    await sleep(100);
  }
  await B.keyboard.up('KeyW');
  await A.bringToFront();
  await A.keyboard.down('KeyE');
  for (let i = 0; i < 20; i++) {
    await A.keyboard.down('KeyF'); await sleep(500); await A.keyboard.up('KeyF'); await sleep(100);
    const over = await B.evaluate(() => !window.__slip.online?.me.alive || window.__slip.online.phase !== 'live');
    if (over) break;
  }
  await A.keyboard.up('KeyE');
  await sleep(1500);
  resultsA = await A.isVisible('.results');
}
console.log(`    rounds played: ${rounds}`);
clearInterval(hurtWatch);
check(bHurt, 'the joiner took damage from the host (hits travel through the room)');
check(resultsA, 'match finished: results screen on the host');
const resultsB = await B.waitForSelector('.results', { timeout: 10000 }).then(() => true, () => false);
const winB = resultsB ? (await B.textContent('.results .winner')).trim() : '';
check(resultsB && /DEFEAT/.test(winB), `results screen on the joiner too ("${winB}")`);
const score = resultsB ? (await B.textContent('.results .final-score')).trim() : '';
console.log(`    final score ${score}`);
await Promise.all([A, B].map((p) => p.waitForSelector('.lobby-code', { timeout: 30000 })));
check(true, 'both tabs back in the lobby');
// Host leaves: the joiner is told the game ended
await A.bringToFront();
await A.click('button:has-text("Leave")');
await B.bringToFront();
const kicked = await B.waitForFunction(() => /host left/i.test(document.querySelector('.err')?.textContent || document.querySelector('#toast')?.textContent || ''), null, { timeout: 15000 }).then(() => true, () => false);
check(kicked, 'joiner told when the host leaves');
check(errors.length === 0, 'no errors' + (errors.length ? ': ' + errors.slice(0, 4).join(' | ') : ''));
await browser.close();
