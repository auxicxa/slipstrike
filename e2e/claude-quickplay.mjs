// claude.ai-room build: two tabs pressing Quick Play end up in the same public room.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { BASE, check } from './lib.mjs';

const browser = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-networking'] });
const ctx = await browser.newContext({ viewport: { width: 900, height: 600 } });
console.log('claude.ai room quick play (local stand-in):');
const open = async (n) => { const p = await ctx.newPage(); await p.goto(BASE + '/?nolock&localroom=40'); await p.fill('input[placeholder="Nickname"]', n); return p; };
const A = await open('First'), B = await open('Second');
await A.bringToFront(); await A.click('text=Quick Play');
await A.waitForSelector('.lobby-code', { timeout: 10000 });
const codeA = (await A.textContent('.lobby-code')).trim();
await B.bringToFront(); await B.click('text=Quick Play');
await B.waitForSelector('.lobby-code', { timeout: 10000 });
const codeB = (await B.textContent('.lobby-code')).trim();
check(codeA === codeB, `both players in public room ${codeA} (${codeB})`);
check(/Public room/.test(await B.textContent('.panel')), 'room is listed as public');
await browser.close();
