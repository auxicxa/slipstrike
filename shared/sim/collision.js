// AABB world collision and raycasts. Maps hold two kinds of solid:
//   boxes: axis-aligned boxes
//   ramps: wedges inside an AABB whose top surface rises toward `dir` (+x, -x, +z or -z)

const EPS = 1e-4;

export class CollisionWorld {
  constructor(map) {
    this.boxes = map.boxes.map((b) => ({
      minx: b.min[0], miny: b.min[1], minz: b.min[2],
      maxx: b.max[0], maxy: b.max[1], maxz: b.max[2],
      noclip: !!b.noclip, // decorative only (e.g. a floor stripe)
      run: !!b.run,       // wall running allowed on its sides
    })).filter((b) => !b.noclip);
    this.ramps = (map.ramps || []).map((r) => {
      const R = {
        minx: r.min[0], miny: r.min[1], minz: r.min[2],
        maxx: r.max[0], maxy: r.max[1], maxz: r.max[2],
        dir: r.dir,
      };
      const rise = R.maxy - R.miny;
      // Plane n·p <= c describes the solid below the slope.
      if (r.dir === '+x') { const k = rise / (R.maxx - R.minx); R.n = [-k, 1, 0]; R.c = R.miny - k * R.minx; }
      else if (r.dir === '-x') { const k = rise / (R.maxx - R.minx); R.n = [k, 1, 0]; R.c = R.miny + k * R.maxx; }
      else if (r.dir === '+z') { const k = rise / (R.maxz - R.minz); R.n = [0, 1, -k]; R.c = R.miny - k * R.minz; }
      else { const k = rise / (R.maxz - R.minz); R.n = [0, 1, k]; R.c = R.miny + k * R.maxz; }
      return R;
    });
  }

  /** Highest ramp surface height under a square footprint centred on (x,z). */
  rampHeight(R, x, z, half) {
    if (x + half <= R.minx || x - half >= R.maxx || z + half <= R.minz || z - half >= R.maxz) return -Infinity;
    const rise = R.maxy - R.miny;
    let t;
    switch (R.dir) {
      case '+x': t = (Math.min(x + half, R.maxx) - R.minx) / (R.maxx - R.minx); break;
      case '-x': t = (R.maxx - Math.max(x - half, R.minx)) / (R.maxx - R.minx); break;
      case '+z': t = (Math.min(z + half, R.maxz) - R.minz) / (R.maxz - R.minz); break;
      default: t = (R.maxz - Math.max(z - half, R.minz)) / (R.maxz - R.minz);
    }
    return R.miny + rise * Math.max(0, Math.min(1, t));
  }

  /** Does the AABB (feet x,y,z; half-width; height) overlap any solid? */
  boxFree(x, y, z, half, h) {
    for (const b of this.boxes) {
      if (x + half > b.minx && x - half < b.maxx && z + half > b.minz && z - half < b.maxz &&
          y + h > b.miny + EPS && y < b.maxy - EPS) return false;
    }
    for (const R of this.ramps) {
      const s = this.rampHeight(R, x, z, half);
      if (s > y + EPS && y + h > R.miny) return false;
    }
    return true;
  }

  /** Highest supporting surface at or below maxY under the footprint (or -Infinity). */
  supportHeight(x, z, half, maxY) {
    let best = -Infinity;
    for (const b of this.boxes) {
      if (b.maxy <= maxY + EPS && b.maxy > best &&
          x + half > b.minx && x - half < b.maxx && z + half > b.minz && z - half < b.maxz) best = b.maxy;
    }
    for (const R of this.ramps) {
      const s = this.rampHeight(R, x, z, half);
      if (s <= maxY + 0.05 && s > best) best = Math.min(s, maxY + 0.05);
    }
    return best;
  }

  /**
   * Ray vs world. Returns the distance to the first hit, or Infinity. Writes the hit normal to outN if given.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist, outN) {
    let best = maxDist;
    let hit = false;
    let nx = 0, ny = 0, nz = 0;
    const ix = 1 / (dx || 1e-12), iy = 1 / (dy || 1e-12), iz = 1 / (dz || 1e-12);
    for (const b of this.boxes) {
      const r = rayAabb(ox, oy, oz, ix, iy, iz, b, best);
      if (r >= 0) { best = r; hit = true; nx = _n[0]; ny = _n[1]; nz = _n[2]; }
    }
    for (const R of this.ramps) {
      const r = rayWedge(ox, oy, oz, dx, dy, dz, ix, iy, iz, R, best);
      if (r >= 0) { best = r; hit = true; nx = _n[0]; ny = _n[1]; nz = _n[2]; }
    }
    if (outN) { outN[0] = nx; outN[1] = ny; outN[2] = nz; }
    return hit ? best : Infinity;
  }
}

const _n = [0, 0, 0];

/** Slab test. Returns the entry distance in [0, maxT], or -1. Sets the entry normal in _n. */
export function rayAabb(ox, oy, oz, ix, iy, iz, b, maxT) {
  let t1 = (b.minx - ox) * ix, t2 = (b.maxx - ox) * ix;
  let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2), axis = 0, sgn = t1 < t2 ? -1 : 1;
  t1 = (b.miny - oy) * iy; t2 = (b.maxy - oy) * iy;
  let lo = Math.min(t1, t2);
  if (lo > tmin) { tmin = lo; axis = 1; sgn = t1 < t2 ? -1 : 1; }
  tmax = Math.min(tmax, Math.max(t1, t2));
  t1 = (b.minz - oz) * iz; t2 = (b.maxz - oz) * iz;
  lo = Math.min(t1, t2);
  if (lo > tmin) { tmin = lo; axis = 2; sgn = t1 < t2 ? -1 : 1; }
  tmax = Math.min(tmax, Math.max(t1, t2));
  if (tmax < Math.max(tmin, 0) || tmin > maxT) return -1;
  if (tmin < 0) return -1; // origin inside the box: ignore it (thin walls are never this thick)
  _n[0] = _n[1] = _n[2] = 0; _n[axis] = sgn;
  return tmin;
}

function rayWedge(ox, oy, oz, dx, dy, dz, ix, iy, iz, R, maxT) {
  const t = rayAabb(ox, oy, oz, ix, iy, iz, R, Infinity);
  // Clip the ray by the box slabs, then by the slope half-space n·p <= c.
  let tmin = 0, tmax = Infinity;
  {
    let a = (R.minx - ox) * ix, b = (R.maxx - ox) * ix;
    tmin = Math.max(tmin, Math.min(a, b)); tmax = Math.min(tmax, Math.max(a, b));
    a = (R.miny - oy) * iy; b = (R.maxy - oy) * iy;
    tmin = Math.max(tmin, Math.min(a, b)); tmax = Math.min(tmax, Math.max(a, b));
    a = (R.minz - oz) * iz; b = (R.maxz - oz) * iz;
    tmin = Math.max(tmin, Math.min(a, b)); tmax = Math.min(tmax, Math.max(a, b));
  }
  if (tmax < tmin) return -1;
  const [px, py, pz] = R.n;
  const denom = px * dx + py * dy + pz * dz;
  const num = R.c - (px * ox + py * oy + pz * oz);
  let tEnterSlope = -Infinity;
  if (Math.abs(denom) < 1e-12) {
    if (num < 0) return -1; // parallel and outside
  } else {
    const tp = num / denom;
    if (denom > 0) tmax = Math.min(tmax, tp); // leaving the half-space
    else { tEnterSlope = tp; tmin = Math.max(tmin, tp); }
  }
  if (tmax < tmin || tmin > maxT || tmin <= 0) return -1;
  if (tEnterSlope === tmin) {
    const l = Math.hypot(px, py, pz);
    _n[0] = px / l; _n[1] = py / l; _n[2] = pz / l;
  } else if (t >= 0) {
    // entered through a box face: rayAabb already set _n
  } else {
    _n[0] = 0; _n[1] = 1; _n[2] = 0;
  }
  return tmin;
}
