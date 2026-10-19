// Player hitboxes and ray tests.
import { HITBOX } from '../config/weapons.js';
import { rayAabb } from './collision.js';

export const PART = { LEGS: 0, BODY: 1, HEAD: 2 };

const boxes = [{}, {}, {}];

/** Three stacked AABBs for a player whose feet are at (x,y,z) with current height h. */
export function playerHitboxes(x, y, z, h, pad = 0) {
  const lt = y + h * HITBOX.legsTop, bt = y + h * HITBOX.bodyTop, top = y + h;
  set(boxes[0], x, z, HITBOX.legsHalf + pad, y, lt);
  set(boxes[1], x, z, HITBOX.bodyHalf + pad, lt, bt);
  set(boxes[2], x, z, HITBOX.headHalf + pad, bt, top + pad * 0.5);
  return boxes;
}

function set(b, x, z, half, y0, y1) {
  b.minx = x - half; b.maxx = x + half;
  b.minz = z - half; b.maxz = z + half;
  b.miny = y0; b.maxy = y1;
}

/** Returns { t, part } for the nearest hitbox the ray enters within maxDist, or null. */
export function rayVsPlayer(o, d, x, y, z, h, maxDist, pad = 0) {
  const ix = 1 / (d[0] || 1e-12), iy = 1 / (d[1] || 1e-12), iz = 1 / (d[2] || 1e-12);
  const hb = playerHitboxes(x, y, z, h, pad);
  let best = maxDist, part = -1;
  for (let i = 2; i >= 0; i--) { // head first so ties favour headshots
    const t = rayAabb(o[0], o[1], o[2], ix, iy, iz, hb[i], best);
    if (t >= 0 && t < best) { best = t; part = i; }
  }
  return part < 0 ? null : { t: best, part };
}
