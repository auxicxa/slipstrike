// Screenshots of the menus for visual review.
import { launch, openPage, sleep } from './lib.mjs';
const browser = await launch();
const { page } = await openPage(browser);
await page.screenshot({ path: 'e2e/out/menu-title.png' });
await page.click('text=Settings & Controls');
await page.screenshot({ path: 'e2e/out/menu-look.png' });
await page.click('button:has-text("Controls")');
await page.screenshot({ path: 'e2e/out/menu-controls.png' });
await page.click('button:has-text("HUD & crosshair")');
await page.screenshot({ path: 'e2e/out/menu-hud.png' });
await page.click('button:has-text("Back")');
await page.fill('input[placeholder="Nickname"]', 'Shots');
await page.click('text=Create Room');
await page.waitForSelector('.lobby-code');
await sleep(300);
await page.screenshot({ path: 'e2e/out/menu-lobby.png' });
await browser.close();
