// Auto graphics fallback: headless Chromium renders at ~10 FPS, so with auto quality on (forced via
// ?autoq) the game should step Medium → Low after the warm-up and tell the player.
import { launch, openPage, check } from './lib.mjs';

const browser = await launch();
const { page, errors } = await openPage(browser, '?nolock&autoq');
console.log('auto graphics quality:');
await page.evaluate(() => { window.__slip.settings.set('quality', 'med'); window.__slip.settings.set('autoQuality', true); });
await page.click('text=Practice Range (offline)');
await page.click('text=Click to play');
const dropped = await page.waitForFunction(() => window.__slip.settings.get('quality') === 'low', null, { timeout: 25000 }).then(() => true, () => false);
const toast = await page.textContent('#toast');
check(dropped, `quality lowered to Low on a slow machine (toast: "${toast}")`);
check(/lowered graphics to Low/.test(toast), 'player is told why');
// With auto quality off, nothing changes
await page.evaluate(() => { window.__slip.settings.set('quality', 'med'); window.__slip.settings.set('autoQuality', false); });
await new Promise((r) => setTimeout(r, 9000));
check(await page.evaluate(() => window.__slip.settings.get('quality')) === 'med', 'setting off: quality left alone');
check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
await browser.close();
