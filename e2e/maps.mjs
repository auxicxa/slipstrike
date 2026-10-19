// Screenshot every map from a spawn and from an overview angle, and report draw calls.
import { launch, openPage, sleep } from './lib.mjs';
const browser = await launch();
const { page, errors } = await openPage(browser);
for (const id of ['kiln', 'dockyard', 'overpass']) {
  await page.selectOption('select[title="Practice map"]', id);
  await page.click('text=Practice Range (offline)');
  await sleep(300);
  await page.click('text=Click to play');
  await sleep(600);
  await page.screenshot({ path: `e2e/out/map-${id}-spawn.png` });
  // Overview: fly the camera up (teleport the player onto a high vantage point)
  await page.evaluate(() => {
    const s = window.__slip.game.session; const ms = s.me.ms;
    ms.x = 0; ms.y = 22; ms.z = s.map.spawns[0][0][2] + 6; ms.vy = 0;
    window.__slip.game.pitch = -0.75; window.__slip.game.yaw = 0;
  });
  await sleep(150);
  await page.screenshot({ path: `e2e/out/map-${id}-overview.png` });
  const info = await page.evaluate(() => ({ calls: window.__slip.game.r.info.render.calls, tris: window.__slip.game.r.info.render.triangles }));
  console.log(id, JSON.stringify(info));
  await page.keyboard.press('Escape');
  await sleep(200);
  await page.click('button:has-text("Leave")');
  await sleep(200);
}
console.log(errors.length ? errors : 'no errors');
await browser.close();
