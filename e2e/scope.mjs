// Scope overlay rules in the real HUD: cycles every weapon (both loadouts' secondaries), in hold and
// toggle aim modes, and samples the overlay 10 times per state so a flickering overlay is caught.
import { launch, openPage, sleep, check } from './lib.mjs';

const browser = await launch();
const { page, errors } = await openPage(browser);
console.log('scope / ADS rules:');
await page.evaluate(() => localStorage.setItem('slipstrike.loadout', JSON.stringify({ p: 'sniper', s: 'pistol' })));
await page.reload();
await page.waitForFunction(() => !!window.__slip);
await page.click('text=Practice Range (offline)');
await page.click('text=Click to play');
await sleep(300);
const sample = () => page.evaluate(async () => {
  const out = [];
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 25));
    const ws = window.__slip.game.session.me.ws;
    out.push({ w: ws.slots[ws.cur], overlay: document.querySelector('.scope').classList.contains('show'), fov: window.__slip.game.r.camera.fov, adsT: ws.adsT });
  }
  return out;
});
let bad = 0;
const expect = async (label, wantWeapon, wantOverlay) => {
  const s = await sample();
  const ok = s.every((x) => x.w === wantWeapon && x.overlay === wantOverlay);
  if (!ok) bad++;
  check(ok, `${label}: ${wantWeapon}, overlay ${wantOverlay ? 'on' : 'off'} in ${s.filter((x) => x.overlay === wantOverlay).length}/10 samples`);
};
for (const mode of ['hold', 'toggle']) {
  await page.evaluate((m) => window.__slip.settings.set('adsMode', m), mode);
  console.log(`  [${mode} mode]`);
  await page.keyboard.press('Digit1'); await sleep(900);
  if (mode === 'hold') await page.keyboard.down('KeyE'); else await page.keyboard.press('KeyE');
  await sleep(500);
  await expect('sniper aimed', 'sniper', true);
  await page.keyboard.press('Digit3'); await sleep(200);
  await expect('3 while scoped', 'knife', false);
  if (mode === 'hold') await page.keyboard.up('KeyE');
  await page.keyboard.press('KeyE'); await sleep(600);
  await expect('heavy stab (E) with knife', 'knife', false);
  await page.keyboard.press('Digit1'); await sleep(900);
  await expect('back to sniper, not aiming', 'sniper', false);
  await page.keyboard.press('KeyQ'); await sleep(300);
  await expect('Q quick-switch to knife', 'knife', false);
  await page.keyboard.press('Digit2'); await sleep(500);
  await page.keyboard.down('KeyE'); await sleep(400);
  await expect('pistol aimed (iron sights, no scope)', 'pistol', false);
  await page.keyboard.up('KeyE');
  if (mode === 'toggle') { await page.keyboard.press('KeyE'); await sleep(100); }
  await page.keyboard.press('Digit3'); await sleep(300);
  await expect('knife after pistol', 'knife', false);
}
// Reload drops the scope; respawn starts unscoped
await page.evaluate(() => window.__slip.settings.set('adsMode', 'hold'));
await page.keyboard.press('Digit1'); await sleep(900);
await page.keyboard.down('KeyE'); await sleep(500);
await page.keyboard.down('KeyF'); await sleep(150); await page.keyboard.up('KeyF'); await sleep(1300);
await page.keyboard.press('KeyR'); await sleep(200);
await expect('reload while scoped', 'sniper', false);
await page.keyboard.up('KeyE');
await page.evaluate(() => window.__slip.game.session.respawnMe());
await sleep(300);
await expect('after respawn', 'sniper', false);
const fov = await page.evaluate(() => window.__slip.game.r.camera.fov);
check(fov > 80, `FOV back to normal (${fov.toFixed(1)}°)`);
check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
process.exitCode = bad ? 1 : process.exitCode;
