// Shared Playwright helpers for the end-to-end checks (uses the preinstalled Chromium).
import { chromium } from 'playwright-core';
import fs from 'node:fs';

export const BASE = process.env.BASE_URL || 'http://localhost:3000';
const EXEC = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

export async function launch() {
  return chromium.launch({
    executablePath: EXEC,
    args: ['--disable-background-networking', '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
}

export async function openPage(browser, query = '?nolock', viewport = { width: 1280, height: 800 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(BASE + '/' + query);
  await page.waitForFunction(() => !!window.__slip);
  return { page, ctx, errors };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function check(cond, msg) {
  if (!cond) { console.error('  ✗ ' + msg); process.exitCode = 1; return false; }
  console.log('  ✓ ' + msg);
  return true;
}

export async function hold(page, key, ms) {
  await page.keyboard.down(key);
  await sleep(ms);
  await page.keyboard.up(key);
}
