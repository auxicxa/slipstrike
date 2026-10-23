// Builds a map's visuals from its collision boxes and ramps, plus visual-only detail:
//   'map'     ONE lit mesh (vertex colours with baked ambient occlusion, a world-space grid texture),
//             including trims per box kind: container ribs, crate frames, wall caps and pilasters
//   'runGlow' the green glowing stripes on wall-runnable walls
//   'ao'      soft dark contact strips on the floor around every box base (fake ambient occlusion)
// Collision never sees any of this: it only uses the boxes and ramps themselves.
import * as THREE from 'three';

let gridTex = null;
export function getGridTexture() {
  if (gridTex) return gridTex;
  const s = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, s, s);
  g.fillStyle = 'rgba(0,0,0,0.10)';
  g.fillRect(0, 0, s, 2); g.fillRect(0, 0, 2, s);
  g.fillStyle = 'rgba(0,0,0,0.045)';
  g.fillRect(0, s / 2 - 1, s, 1); g.fillRect(s / 2 - 1, 0, 1, s);
  gridTex = new THREE.CanvasTexture(cv);
  gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
  gridTex.anisotropy = 4;
  gridTex.colorSpace = THREE.SRGBColorSpace;
  gridTex.generateMipmaps = true;
  gridTex.minFilter = THREE.LinearMipmapLinearFilter;
  return gridTex;
}

let aoTex = null;
function getAoTexture() {
  if (aoTex) return aoTex;
  const cv = document.createElement('canvas');
  cv.width = 4; cv.height = 64;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.35, '#7a7a7a'); grad.addColorStop(1, '#000000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 64);
  aoTex = new THREE.CanvasTexture(cv);
  return aoTex;
}

const UV_SCALE = 0.5; // one grid cell = 2 m

/** Geometry accumulator: quads/boxes with per-vertex colour (albedo × baked AO) and world UVs. */
class Builder {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.uv = []; }

  quad(a, b, c, d, n, color, baseY, ao = true) {
    const col = new THREE.Color(color);
    for (const p of [a, b, c, a, c, d]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      let k = 1;
      if (ao) {
        if (n[1] < -0.5) k = 0.55;
        else if (Math.abs(n[1]) < 0.5) k = 0.7 + 0.3 * Math.min(1, Math.max(0, (p[1] - baseY) / 1.4)); // darker at the foot
      }
      this.col.push(col.r * k, col.g * k, col.b * k);
      if (Math.abs(n[1]) > 0.5) this.uv.push(p[0] * UV_SCALE, p[2] * UV_SCALE);
      else if (Math.abs(n[0]) > 0.5) this.uv.push(p[2] * UV_SCALE, p[1] * UV_SCALE);
      else this.uv.push(p[0] * UV_SCALE, p[1] * UV_SCALE);
    }
  }

  tri(a, b, c, n, color, baseY) {
    const col = new THREE.Color(color);
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      const k = Math.abs(n[1]) < 0.5 ? 0.7 + 0.3 * Math.min(1, Math.max(0, (p[1] - baseY) / 1.4)) : 1;
      this.col.push(col.r * k, col.g * k, col.b * k);
      if (Math.abs(n[0]) > 0.5) this.uv.push(p[2] * UV_SCALE, p[1] * UV_SCALE);
      else this.uv.push(p[0] * UV_SCALE, p[1] * UV_SCALE);
    }
  }

  /** Axis-aligned box from corners; `skip` = set of faces to leave out ('top','bottom','+x','-x','+z','-z'). */
  box(x0, y0, z0, x1, y1, z1, c, baseY = y0, skip = null) {
    const has = (f) => !skip || !skip.has(f);
    if (has('top')) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], c, baseY);
    if (has('bottom') && y0 > -0.5) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], c, baseY);
    if (has('+z')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], c, baseY);
    if (has('-z')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], c, baseY);
    if (has('+x')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], c, baseY);
    if (has('-x')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], c, baseY);
  }

  geometry(withUv = true) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (withUv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.computeBoundingSphere();
    return geo;
  }
}

const shadeHex = (c, k) => new THREE.Color(c).multiplyScalar(k).getHex();

/** Visual detail for one box, by kind. Everything sits slightly proud of the box faces. */
function trims(B, b, kind) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, c = b.c, by = y0 < 0 ? 0 : y0;
  const w = x1 - x0, d = z1 - z0, h = y1 - Math.max(y0, 0);
  const dark = shadeHex(c, 0.72), light = shadeHex(c, 1.12);
  if (kind === 'container') {
    // corrugated long sides, top and bottom rails, door bars on one end
    const e = 0.03;
    const along = w >= d ? 'x' : 'z';
    const L = along === 'x' ? w : d;
    const n = Math.max(2, Math.floor(L / 0.32));
    for (let i = 1; i < n; i++) {
      const t = (along === 'x' ? x0 : z0) + (i * L) / n;
      if (along === 'x') {
        B.box(t - 0.05, y0 + 0.12, z1, t + 0.05, y1 - 0.12, z1 + e, dark, by);
        B.box(t - 0.05, y0 + 0.12, z0 - e, t + 0.05, y1 - 0.12, z0, dark, by);
      } else {
        B.box(x1, y0 + 0.12, t - 0.05, x1 + e, y1 - 0.12, t + 0.05, dark, by);
        B.box(x0 - e, y0 + 0.12, t - 0.05, x0, y1 - 0.12, t + 0.05, dark, by);
      }
    }
    for (const y of [y0 + 0.06, y1 - 0.06]) B.box(x0 - 0.04, y - 0.06, z0 - 0.04, x1 + 0.04, y + 0.06, z1 + 0.04, dark, by);
    if (along === 'x') {
      for (const f of [0.3, 0.7]) B.box(x1, y0 + 0.2, z0 + d * f - 0.03, x1 + 0.05, y1 - 0.2, z0 + d * f + 0.03, light, by);
    } else {
      for (const f of [0.3, 0.7]) B.box(x0 + w * f - 0.03, y0 + 0.2, z1, x0 + w * f + 0.03, y1 - 0.2, z1 + 0.05, light, by);
    }
  } else if (kind === 'crate') {
    // frame along every edge
    const t = Math.min(0.1, Math.min(w, d, h) * 0.08), e = 0.02;
    for (const y of [y0, y1 - t]) {
      B.box(x0 - e, y, z0 - e, x1 + e, y + t, z0 + t, dark, by);
      B.box(x0 - e, y, z1 - t, x1 + e, y + t, z1 + e, dark, by);
      B.box(x0 - e, y, z0, x0 + t, y + t, z1, dark, by);
      B.box(x1 - t, y, z0, x1 + e, y + t, z1, dark, by);
    }
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
      B.box(x - (x === x0 ? e : t), y0, z - (z === z0 ? e : t), x + (x === x1 ? e : t), y1, z + (z === z1 ? e : t), dark, by);
    }
  } else if (kind === 'wall') {
    // overhanging cap, skirting at the base, pilasters along long faces
    const o = 0.07;
    B.box(x0 - o, y1, z0 - o, x1 + o, y1 + 0.16, z1 + o, dark, by);
    B.box(x0 - 0.04, by, z0 - 0.04, x1 + 0.04, by + 0.28, z1 + 0.04, dark, by, new Set(['top', 'bottom']));
    const along = w >= d ? 'x' : 'z';
    const L = along === 'x' ? w : d;
    const n = Math.floor(L / 4.5);
    for (let i = 1; i <= n; i++) {
      const t = (along === 'x' ? x0 : z0) + (i * L) / (n + 1);
      if (along === 'x') B.box(t - 0.22, by, z0 - 0.1, t + 0.22, y1, z1 + 0.1, light, by);
      else B.box(x0 - 0.1, by, t - 0.22, x1 + 0.1, y1, t + 0.22, light, by);
    }
  } else if (h > 0.6 && y0 >= 0) {
    // plain block: a thin lighter lip around the top edge gives it a readable silhouette
    const e = 0.025;
    B.box(x0 - e, y1 - 0.05, z0 - e, x1 + e, y1 + 0.005, z1 + e, light, by, new Set(['bottom']));
  }
}

export function buildMapMesh(map) {
  const B = new Builder();
  for (const b of map.boxes) {
    const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, by = y0 < 0 ? 0 : y0;
    B.box(x0, y0, z0, x1, y1, z1, b.c, by);
    if (b.noclip) continue;
    const h = y1 - Math.max(0, y0);
    const kind = b.kind || (h >= 3 && Math.min(x1 - x0, z1 - z0) <= 1.2 ? 'wall' : null);
    trims(B, b, kind);
  }

  for (const r of map.ramps || []) {
    const [x0, y0, z0] = r.min, [x1, y1, z1] = r.max, c = r.c;
    const h = y1 - y0;
    let A, Bq, C, D, n;
    if (r.dir === '+x') {
      A = [x0, y0, z1]; Bq = [x1, y1, z1]; C = [x1, y1, z0]; D = [x0, y0, z0];
      n = new THREE.Vector3(-h, x1 - x0, 0).normalize();
      B.tri([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [0, 0, 1], c, y0);
      B.tri([x1, y0, z0], [x0, y0, z0], [x1, y1, z0], [0, 0, -1], c, y0);
      B.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], c, y0);
    } else if (r.dir === '-x') {
      A = [x0, y1, z1]; Bq = [x1, y0, z1]; C = [x1, y0, z0]; D = [x0, y1, z0];
      n = new THREE.Vector3(h, x1 - x0, 0).normalize();
      B.tri([x0, y0, z1], [x1, y0, z1], [x0, y1, z1], [0, 0, 1], c, y0);
      B.tri([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [0, 0, -1], c, y0);
      B.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], c, y0);
    } else if (r.dir === '+z') {
      n = new THREE.Vector3(0, z1 - z0, -h).normalize();
      A = [x0, y1, z1]; Bq = [x1, y1, z1]; C = [x1, y0, z0]; D = [x0, y0, z0];
      B.tri([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [1, 0, 0], c, y0);
      B.tri([x0, y0, z1], [x0, y0, z0], [x0, y1, z1], [-1, 0, 0], c, y0);
      B.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], c, y0);
    } else {
      A = [x0, y0, z1]; Bq = [x1, y0, z1]; C = [x1, y1, z0]; D = [x0, y1, z0];
      n = new THREE.Vector3(0, z1 - z0, h).normalize();
      B.tri([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [1, 0, 0], c, y0);
      B.tri([x0, y0, z0], [x0, y0, z1], [x0, y1, z0], [-1, 0, 0], c, y0);
      B.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], c, y0);
    }
    B.quad(A, Bq, C, D, [n.x, n.y, n.z], c, y0);
  }

  const group = new THREE.Group();
  group.name = 'mapVisuals';
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: getGridTexture(), roughness: 0.88, metalness: 0.02 });
  const mesh = new THREE.Mesh(B.geometry(), mat);
  mesh.name = 'map';
  // Low quality swaps in a cheaper material (no reflections or specular), see Renderer.applyQuality
  mesh.userData.full = mat;
  mesh.userData.cheap = new THREE.MeshLambertMaterial({ vertexColors: true, map: getGridTexture() });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  // Wall-run stripes: a glowing band around runnable walls at running height
  const G = new Builder();
  for (const b of map.boxes) {
    if (!b.run) continue;
    const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, by = y0 < 0 ? 0 : y0, e = 0.035;
    const s0 = by + 1.3, s1 = Math.min(y1 - 0.05, by + 1.46);
    if (s1 > s0) G.box(x0 - e, s0, z0 - e, x1 + e, s1, z1 + e, 0xffffff, by, new Set(['top', 'bottom']));
  }
  if (G.pos.length) {
    const glow = new THREE.Mesh(G.geometry(false), new THREE.MeshStandardMaterial({
      color: 0x46e08a, emissive: 0x2bd46a, emissiveIntensity: 1.4, roughness: 0.4,
    }));
    glow.name = 'runGlow';
    group.add(glow);
  }

  // Contact AO: soft dark strips on the ground around the base of every box standing on the ground
  const pos = [], uv = [];
  const strip = (ax, az, bx, bz, ox, oz, y) => {
    const W = 0.6;
    const p = [[ax, az, 0], [bx, bz, 0], [bx + ox * W, bz + oz * W, 1], [ax + ox * W, az + oz * W, 1]];
    // (canvas textures are flipped: v = 1 is the top of the gradient, the dark end at the wall)
    for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(p[i][0], y, p[i][1]); uv.push(0.5, 1 - p[i][2]); }
  };
  for (const b of map.boxes) {
    if (b.noclip || b.min[1] < -0.5 || b.min[1] > 0.01) continue;
    const [x0, , z0] = b.min, [x1, , z1] = b.max, y = 0.012;
    strip(x0, z1, x1, z1, 0, 1, y); strip(x1, z0, x0, z0, 0, -1, y);
    strip(x1, z1, x1, z0, 1, 0, y); strip(x0, z0, x0, z1, -1, 0, y);
  }
  if (pos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeBoundingSphere();
    const ao = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.42, alphaMap: getAoTexture(), depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide,
    }));
    ao.name = 'ao';
    ao.renderOrder = 1;
    group.add(ao);
  }
  group.traverse((o) => { o.matrixAutoUpdate = false; });
  return group;
}
