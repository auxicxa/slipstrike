// Phase 5: keybind menu (rebind, conflict, persistence, reset), ADS hold/toggle, keyboard look, settings persistence.
import { launch, openPage, sleep, check, WS_URL } from './lib.mjs';

const browser = await launch();
const { page, errors } = await openPage(browser);
console.log('settings & keybinds:');
const binds = () => page.evaluate(() => JSON.parse(localStorage.getItem('slipstrike.binds.v1') || '{}'));
await page.click('text=Settings & Controls');
await page.click('button:has-text("Controls")');
// Rebind "Fire" second slot (F) to G
const fireRow = page.locator('tr', { has: page.locator('td.act', { hasText: /^Fire \/ quick stab$/ }) });
await fireRow.locator('button.bind-btn').nth(1).click();
await sleep(50);
check(await fireRow.locator('button.bind-btn.listening').count() === 1, 'binding button waits for a key');
await page.keyboard.press('KeyG');
await sleep(100);
let b = await binds();
check(JSON.stringify(b.fire) === '["Mouse0","KeyG"]', `fire rebound to click + G (${JSON.stringify(b.fire)})`);
// Conflict: bind Reload to W (used by Move forward)
const reloadRow = page.locator('tr', { has: page.locator('td.act', { hasText: /^Reload$/ }) });
await reloadRow.locator('button.bind-btn').first().click();
await sleep(50);
await page.keyboard.press('KeyW');
await sleep(150);
b = await binds();
const toast = await page.textContent('#toast');
check(b.reload[0] === 'KeyW' && !b.forward.includes('KeyW'), `conflict resolved: W moved to Reload, Move forward now ${JSON.stringify(b.forward)}`);
check(/moved from "Move forward"/.test(toast), `conflict reported to the player: "${toast}"`);
// Mouse button binding: bind Scope second slot to right click (already) -> bind Dash to Mouse 4 (button 3)
const dashRow = page.locator('tr', { has: page.locator('td.act', { hasText: /^Dash \(ground and air\)$/ }) });
await dashRow.locator('button.bind-btn').nth(1).click();
await sleep(50);
await page.mouse.down({ button: 'middle' }); await page.mouse.up({ button: 'middle' });
await sleep(100);
b = await binds();
check(b.dash.includes('Mouse1'), `mouse button bound (dash: ${JSON.stringify(b.dash)})`);
// Persistence across reload
await page.reload();
await page.waitForFunction(() => !!window.__slip);
b = await binds();
check(b.fire[1] === 'KeyG' && b.reload[0] === 'KeyW', 'keybinds persist after reload');
// Reset to defaults
await page.click('text=Settings & Controls');
await page.click('button:has-text("Controls")');
await page.click('button:has-text("Reset to default")');
await sleep(100);
b = await binds();
check(b.fire[1] === 'KeyF' && b.forward[0] === 'KeyW' && b.reload[0] === 'KeyR', 'reset to default restores F / W / R');
// Settings: sensitivity slider + ADS toggle mode, persisted
await page.click('button:has-text("Look & aim")');
await page.locator('.set-grid input[type=range]').first().evaluate((el) => { el.value = '2.5'; el.dispatchEvent(new Event('input')); });
await page.click('.seg button:has-text("Toggle")');
await page.reload();
await page.waitForFunction(() => !!window.__slip);
const st = await page.evaluate(() => JSON.parse(localStorage.getItem('slipstrike.settings.v1')));
check(st.sens === 2.5 && st.adsMode === 'toggle', `settings persist (sens ${st.sens}, ADS ${st.adsMode})`);
// In practice: ADS toggle behaviour, keyboard look, keyboard fire
await page.click('text=Practice Range (offline)');
await sleep(200);
await page.click('text=Click to play');
await sleep(300);
const ads = () => page.evaluate(() => window.__slip.game.session.me.ws.adsT);
await page.keyboard.press('KeyE');
await sleep(500);
const a1 = await ads();
await sleep(300);
const a2 = await ads();
await page.keyboard.press('KeyE');
await sleep(500);
const a3 = await ads();
check(a1 > 0.95 && a2 > 0.95 && a3 < 0.05, `ADS toggle: tap E → scoped (${a1.toFixed(2)}), stays (${a2.toFixed(2)}), tap again → off (${a3.toFixed(2)})`);
// switch to hold mode through the settings store
await page.evaluate(() => window.__slip.settings.set('adsMode', 'hold'));
await page.keyboard.down('KeyE'); await sleep(400);
const h1 = await ads();
await page.keyboard.up('KeyE'); await sleep(400);
const h2 = await ads();
check(h1 > 0.95 && h2 < 0.05, `ADS hold: held → ${h1.toFixed(2)}, released → ${h2.toFixed(2)}`);
const y0 = await page.evaluate(() => window.__slip.game.yaw);
await page.keyboard.down('ArrowLeft'); await sleep(500); await page.keyboard.up('ArrowLeft');
const y1 = await page.evaluate(() => window.__slip.game.yaw);
check(y1 - y0 > 0.5, `keyboard look turns the camera (yaw +${(y1 - y0).toFixed(2)} rad)`);
const ammo0 = await page.evaluate(() => window.__slip.game.session.me.ws.ammo[0]);
await page.keyboard.down('KeyF'); await sleep(350); await page.keyboard.up('KeyF');
const ammo1 = await page.evaluate(() => window.__slip.game.session.me.ws.ammo[0]);
check(ammo1 < ammo0, `F fires without touching the trackpad (ammo ${ammo0} → ${ammo1})`);
// Tab must not move browser focus away
await page.keyboard.press('Tab');
const focus = await page.evaluate(() => document.activeElement?.tagName);
check(focus === 'BODY', `Tab is captured by the game (focus stays on ${focus})`);
check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
await browser.close();
