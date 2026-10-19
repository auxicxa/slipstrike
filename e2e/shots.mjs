// Visual check: screenshots of each weapon at hip and ADS in practice.
import { launch, openPage, sleep } from './lib.mjs';
const browser = await launch();
const { page, errors } = await openPage(browser);
await page.click('text=Practice Range (offline)');
await sleep(200);
await page.click('text=Click to play');
await sleep(300);
const which = process.argv.slice(2);
for (const [slot, name, lo] of [[1, 'rifle'], [2, 'pistol'], [3, 'knife'], [1, 'shotgun', { p: 'shotgun', s: 'revolver' }], [2, 'revolver'], [1, 'sniper', { p: 'sniper', s: 'pistol' }]]) {
  if (which.length && !which.includes(name)) continue;
  if (lo) await page.evaluate((lo) => { const s = window.__slip.game.session; s.me.loadout = lo; s.respawnMe(); }, lo);
  await sleep(300);
  await page.keyboard.press('Digit' + slot);
  await sleep(900);
  await page.screenshot({ path: `e2e/out/w-${name}-hip.png` });
  if (name !== 'knife') {
    await page.keyboard.down('KeyE');
    await sleep(500);
    await page.screenshot({ path: `e2e/out/w-${name}-ads.png` });
    await page.keyboard.up('KeyE');
  }
}
console.log(errors.length ? errors : 'no errors');
await browser.close();
