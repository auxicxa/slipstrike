// Helpers for writing maps as data. Maps are plain objects:
//   { id, name, boxes: [{min,max,c}], ramps: [{min,max,dir,c}], spawns: {0:[[x,y,z,yaw]], 1:[...]}, ffa:[...] }
// Colours are hex numbers. Use mirror() to build one half of a map and get a point-symmetric
// (180° rotated) copy for the other team, which keeps both sides fair.

export class MapBuilder {
  constructor(id, name, opts = {}) {
    this.map = {
      id, name,
      sky: opts.sky ?? 0x9fc6e8,
      fog: opts.fog ?? 0xb9d3ea,
      fogNear: opts.fogNear ?? 40,
      fogFar: opts.fogFar ?? 140,
      ground: opts.ground ?? 0x8c8f99,
      boxes: [], ramps: [],
      spawns: { 0: [], 1: [] },
      ffa: [],
      dummies: [],
      killY: opts.killY ?? -25,
    };
  }

  /** Box from min/max corners. */
  box(x0, y0, z0, x1, y1, z1, c = 0xcccccc) {
    this.map.boxes.push({
      min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)],
      max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)],
      c,
    });
    return this;
  }

  /** Flat floor marking with no collision. */
  decal(x0, z0, x1, z1, c, y = 0.01) {
    this.map.boxes.push({ min: [Math.min(x0, x1), 0, Math.min(z0, z1)], max: [Math.max(x0, x1), y, Math.max(z0, z1)], c, noclip: true });
    return this;
  }

  /** Block centred on (cx, cz), sitting on y0, size w × d, height h. */
  block(cx, cz, w, d, h, c, y0 = 0) {
    return this.box(cx - w / 2, y0, cz - d / 2, cx + w / 2, y0 + h, cz + d / 2, c);
  }

  /** Ramp in a box, rising toward dir ('+x','-x','+z','-z'). */
  ramp(x0, y0, z0, x1, y1, z1, dir, c = 0xbbbbbb) {
    this.map.ramps.push({
      min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)],
      max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)],
      dir, c,
    });
    return this;
  }

  /** Floor slab with its top at y = 0. */
  floor(x0, z0, x1, z1, c) {
    return this.box(x0, -1, z0, x1, 0, z1, c ?? this.map.ground);
  }

  /** Outer boundary walls. */
  walls(x0, z0, x1, z1, h, c, t = 1) {
    this.box(x0 - t, 0, z0 - t, x1 + t, h, z0, c);
    this.box(x0 - t, 0, z1, x1 + t, h, z1 + t, c);
    this.box(x0 - t, 0, z0, x0, h, z1, c);
    this.box(x1, 0, z0, x1 + t, h, z1, c);
    return this;
  }

  spawn(team, x, y, z, yaw) { this.map.spawns[team].push([x, y, z, yaw]); return this; }
  ffaSpawn(x, y, z, yaw) { this.map.ffa.push([x, y, z, yaw]); return this; }
  dummy(x, y, z, opts = {}) { this.map.dummies.push({ pos: [x, y, z], ...opts }); return this; }

  /**
   * Point-mirror everything added so far through the origin (x→-x, z→-z).
   * Team 0 spawns become team 1 spawns, FFA spawns are duplicated too.
   */
  mirror() {
    const m = this.map;
    const boxes = m.boxes.slice();
    for (const b of boxes) {
      m.boxes.push({ min: [-b.max[0], b.min[1], -b.max[2]], max: [-b.min[0], b.max[1], -b.min[2]], c: b.c, noclip: b.noclip });
    }
    const flip = { '+x': '-x', '-x': '+x', '+z': '-z', '-z': '+z' };
    for (const r of m.ramps.slice()) {
      m.ramps.push({ min: [-r.max[0], r.min[1], -r.max[2]], max: [-r.min[0], r.max[1], -r.min[2]], dir: flip[r.dir], c: r.c });
    }
    m.spawns[1] = m.spawns[0].map(([x, y, z, yaw]) => [-x, y, -z, yaw + Math.PI]);
    m.ffa = m.ffa.concat(m.ffa.map(([x, y, z, yaw]) => [-x, y, -z, yaw + Math.PI]));
    return this;
  }

  build() {
    // Remove exact duplicates (e.g. centre pieces mirrored onto themselves)
    const seen = new Set();
    this.map.boxes = this.map.boxes.filter((b) => {
      const k = b.min.concat(b.max).map((v) => v.toFixed(3)).join(',');
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return this.map;
  }
}
