// Lag compensation: a ring buffer of recent player positions so hits are checked
// against where the shooter actually saw the target.
import { HISTORY_TICKS, LAG_COMP_MAX, INTERP_DELAY, TICK_RATE } from '../shared/config/game.js';

// Total rewind limit: the client's interpolation delay plus up to LAG_COMP_MAX of network latency.
export const MAX_REWIND_TICKS = Math.round((INTERP_DELAY + LAG_COMP_MAX) * TICK_RATE);

export class LagComp {
  constructor() {
    this.hist = new Map(); // id → array of { tick, x, y, z, h } (ring)
  }

  record(tick, players) {
    for (const p of players) {
      if (!p.alive) continue;
      let arr = this.hist.get(p.id);
      if (!arr) { arr = []; this.hist.set(p.id, arr); }
      arr.push({ tick, x: p.ms.x, y: p.ms.y, z: p.ms.z, h: p.ms.h });
      if (arr.length > HISTORY_TICKS) arr.shift();
    }
  }

  forget(id) { this.hist.delete(id); }
  clear() { this.hist.clear(); }

  /** Position of `target` at (fractional) tick `viewTick`, clamped to the allowed rewind window. */
  at(target, viewTick, nowTick) {
    const arr = this.hist.get(target.id);
    const cur = target.ms;
    if (!arr || !arr.length || !Number.isFinite(viewTick)) return cur;
    const t = Math.max(nowTick - MAX_REWIND_TICKS, Math.min(nowTick, viewTick));
    if (t >= arr[arr.length - 1].tick) return cur;
    let i = arr.length - 1;
    while (i > 0 && arr[i - 1].tick > t) i--;
    if (i === 0) return arr[0].tick > t ? arr[0] : arr[0];
    const a = arr[i - 1], b = arr[i];
    // Don't interpolate across a respawn/teleport
    if (Math.abs(a.x - b.x) + Math.abs(a.z - b.z) > 5) return t - a.tick < b.tick - t ? a : b;
    const f = (t - a.tick) / Math.max(1e-6, b.tick - a.tick);
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f, h: f < 0.5 ? a.h : b.h };
  }
}
