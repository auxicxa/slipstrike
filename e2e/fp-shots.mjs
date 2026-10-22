// First-person viewmodel screenshots from the dev /viewer page (needs `npm run dev`): every weapon
// through its animation poses, sampled at a few moments, as one labelled contact sheet per weapon.
//   node e2e/fp-shots.mjs                    all weapons, all poses
//   node e2e/fp-shots.mjs rifle knife        only these weapons
//   POSES=reload,fire node e2e/fp-shots.mjs  only these poses
import { launch, BASE } from './lib.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { WEAPONS } from '../shared/config/weapons.js';

const only = process.argv.slice(2);
const posesOnly = process.env.POSES ? process.env.POSES.split(',') : null;
mkdirSync('e2e/out/fp', { recursive: true });

function samples(id, pose) {
  const w = WEAPONS[id];
  const r = (f) => +(0.2 + (w.reload || 1) * f).toFixed(3);
  switch (pose) {
    case 'idle': return [1.0];
    case 'ads': return [0.3, 1.0];
    case 'walk': return [0.6, 0.95];
    case 'sprint': case 'slide': return [1.0];
    case 'fire': return w.id === 'shotgun' || w.id === 'sniper' ? [0.24, 0.5, 0.6, 0.75] : [0.24, 0.3, 0.6];
    case 'reload': case 'reloadEmpty': return [r(0.07), r(0.22), r(0.4), r(0.55), r(0.68), r(0.85)];
    case 'equip': return [0.3, 0.4, 0.5, 0.7];
    case 'stab': return [0.24, 0.28, 0.34];
    case 'heavy': return [0.35, 0.5, 0.6, 0.66, 0.74];
    default: return [0.5];
  }
}

const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 1180, height: 560 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(BASE + '/viewer/?model=fp-rifle');
await page.waitForFunction(() => !!window.__viewer);
const list = (await page.evaluate(() => window.__viewer.list())).filter((m) => m.id.startsWith('fp-'));
for (const m of list) {
  const id = m.id.slice(3);
  if (only.length && !only.includes(id)) continue;
  await page.evaluate((id) => window.__viewer.show(id), m.id);
  const rows = [];
  for (const pose of m.poses) {
    if (posesOnly && !posesOnly.includes(pose)) continue;
    const files = [];
    for (const t of samples(id, pose)) {
      await page.evaluate(({ pose, t }) => { window.__viewer.pose(pose, t); window.__viewer.render(); }, { pose, t });
      const f = `e2e/out/fp/${id}-${pose}-${t}.png`;
      await page.locator('#stage').screenshot({ path: f });
      files.push([f, `${pose} @${t}s`]);
    }
    rows.push(files);
  }
  const sheet = `e2e/out/fp/${id}.png`;
  execFileSync('python3', ['-c', `
import sys, json
from PIL import Image, ImageDraw
rows = json.loads(sys.argv[2])
ims = [[(Image.open(f), lab) for f, lab in r] for r in rows]
w, h = ims[0][0][0].size
s = 0.42
cols = max(len(r) for r in ims)
out = Image.new('RGB', (int(w * s) * cols, int(h * s) * len(ims)), (30, 30, 34))
d = ImageDraw.Draw(out)
for y, r in enumerate(ims):
  for x, (im, lab) in enumerate(r):
    out.paste(im.resize((int(w * s), int(h * s))), (x * int(w * s), y * int(h * s)))
    d.text((x * int(w * s) + 6, y * int(h * s) + 4), lab, fill=(255, 255, 255))
out.save(sys.argv[1])`, sheet, JSON.stringify(rows)]);
  console.log('wrote', sheet);
}
if (errors.length) console.log('ERRORS:', [...new Set(errors)].slice(0, 6).join(' | '));
await browser.close();
