// Graphics quality presets: what each level turns on, the draw-call budget per level, the FPS counter.
import { launch, openPage, sleep, check } from './lib.mjs';

const BUDGET = { low: 90, med: 130, high: 150 }; // draw calls in the practice range (9 animated dummies)
const browser = await launch();
const { page, errors } = await openPage(browser);
console.log('graphics quality:');
await page.click('text=Practice Range (offline)');
await sleep(300);
await page.click('text=Click to play');
await sleep(600);
await page.evaluate(() => window.__slip.settings.set('showFps', true));
for (const q of ['low', 'med', 'high']) {
  await page.evaluate((q) => window.__slip.settings.set('quality', q), q);
  await sleep(1200);
  const s = await page.evaluate(() => {
    const r = window.__slip.game.r;
    return { calls: r.info.render.calls, tris: r.info.render.triangles, shadows: r.renderer.shadowMap.enabled, size: r.sun.shadow.mapSize.x,
      lights: r.accent.length, bloom: !!r.bloomOn, ratio: r.renderer.getPixelRatio(), particles: window.__slip.game.fx.scale,
      perf: document.querySelector('.perf')?.textContent || '' };
  });
  console.log(`    ${q}: ${s.calls} calls, ${(s.tris / 1000).toFixed(0)}k tris, shadows ${s.shadows ? s.size : 'off'}, ${s.lights} lamp lights, bloom ${s.bloom}, particles ${s.particles}`);
  check(s.calls > 0 && s.calls <= BUDGET[q], `${q}: ${s.calls} draw calls (budget ${BUDGET[q]})`);
  if (q === 'low') check(!s.shadows && !s.bloom && s.lights === 0 && s.particles < 0.5, 'low: no shadows, bloom or accent lights, fewer particles');
  if (q === 'med') check(s.shadows && s.size === 2048 && !s.bloom && s.lights > 0, 'medium: 2048 soft shadows and lamp lights, no bloom');
  if (q === 'high') check(s.shadows && s.size === 4096 && s.bloom && s.particles === 1, 'high: 4096 shadows, bloom, full particles');
  check(/fps/.test(s.perf) && /calls/.test(s.perf), `FPS counter shows "${s.perf.slice(0, 60)}"`);
}
await page.evaluate(() => window.__slip.settings.set('bloom', 'off'));
await sleep(300);
check(await page.evaluate(() => !window.__slip.game.r.bloomOn), 'bloom can be switched off at high');
await page.evaluate(() => { window.__slip.settings.set('bloom', 'auto'); window.__slip.settings.set('vignette', false); });
await sleep(200);
check(await page.evaluate(() => document.querySelector('.vignette').style.display === 'none'), 'vignette toggle hides the vignette');
await page.evaluate(() => { window.__slip.settings.set('vignette', true); window.__slip.settings.set('showFps', false); });
check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
await browser.close();
