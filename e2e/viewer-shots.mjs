// Screenshots of models in the dev /viewer page (needs `npm run dev`): 3 angles per model, plus stats.
//   node e2e/viewer-shots.mjs                 every model
//   node e2e/viewer-shots.mjs rifle knife     only ids containing these words
//   POSE=run node e2e/viewer-shots.mjs char   a specific pose
import { launch, BASE, sleep } from './lib.mjs';
import { execFileSync } from 'node:child_process';

const filters = process.argv.slice(2);
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(BASE + '/viewer/');
await page.waitForFunction(() => !!window.__viewer);
const list = await page.evaluate(() => window.__viewer.list());
const angles = (process.env.ANGLES || 'three,side,front').split(',');
for (const m of list) {
  if (filters.length && !filters.some((f) => m.id.includes(f))) continue;
  const stats = await page.evaluate(({ id, pose, team }) => {
    window.__viewer.set({ turntable: false, sockets: !!window.__showSockets });
    return window.__viewer.show(id, { pose: pose || undefined, team });
  }, { id: m.id, pose: process.env.POSE || null, team: Number(process.env.TEAM || 0) });
  if (process.env.POSE || m.poses) await page.evaluate((p) => window.__viewer.pose(p || window.__viewer.list().find(() => true) && undefined, 0.35), process.env.POSE || null);
  const files = [];
  for (const a of angles) {
    await page.evaluate((a) => window.__viewer.view(a), a);
    await sleep(250);
    const f = `e2e/out/viewer/${m.id}${process.env.POSE ? '-' + process.env.POSE : ''}-${a}.png`;
    await page.locator('#stage').screenshot({ path: f });
    files.push(f);
  }
  const over = stats.budget && stats.triangles > stats.budget ? '  OVER BUDGET' : '';
  console.log(`${m.id.padEnd(22)} ${String(stats.triangles).padStart(5)} tris${stats.budget ? ' / ' + stats.budget : ''}  ${stats.meshes} meshes  size ${stats.size.join('×')}${over}`);
  // Contact sheet of the three angles
  try {
    execFileSync('python3', ['-c', `
import sys
from PIL import Image
ims=[Image.open(f) for f in sys.argv[2:]]
w,h=ims[0].size
out=Image.new('RGB',(w*len(ims)//2,h//2))
for i,im in enumerate(ims): out.paste(im.resize((w//2,h//2)),(i*w//2,0))
out.save(sys.argv[1])`, `e2e/out/viewer/${m.id}${process.env.POSE ? '-' + process.env.POSE : ''}.png`, ...files]);
  } catch (e) { console.log('contact sheet failed', e.message); }
}
if (errors.length) console.log('ERRORS:', errors.slice(0, 5).join(' | '));
await browser.close();
