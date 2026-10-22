// Procedural modelling kit shared by weapons, characters and map props.
//
// Models are built from a few primitives (chamfered boxes, side-profile extrusions, cylinders, lathes,
// tori), then MERGED per material so a whole weapon or prop costs a handful of draw calls. Parts that
// animate (magazines, bolts, slides, limbs) are built as their own small merged groups. Named empty
// Object3Ds mark sockets: muzzle, eject, grip (right hand), support (left hand), sight (ADS eye line).
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ------------------------------------------------------------------ materials
const matCache = new Map();

/**
 * Shared PBR materials (one instance per look, reused by every model).
 * Low-poly look: flat shading, believable metalness/roughness.
 */
export function mat(name, opts = {}) {
  const key = name + JSON.stringify(opts);
  if (matCache.has(key)) return matCache.get(key);
  const base = MATERIALS[name];
  if (!base) throw new Error('unknown material ' + name);
  const m = new THREE.MeshStandardMaterial({ flatShading: true, ...base, ...opts });
  m.name = name;
  matCache.set(key, m);
  return m;
}

export const MATERIALS = {
  // Weapons
  gunmetal: { color: 0x3d434d, metalness: 0.6, roughness: 0.48 },
  steel: { color: 0xa9b2bd, metalness: 0.85, roughness: 0.4 },
  darksteel: { color: 0x5a616c, metalness: 0.8, roughness: 0.34 },
  polymer: { color: 0x33373e, metalness: 0.05, roughness: 0.68 },
  tan: { color: 0x9c8461, metalness: 0.05, roughness: 0.7 },
  olive: { color: 0x4f5a3d, metalness: 0.1, roughness: 0.65 },
  wood: { color: 0x7a4b2a, metalness: 0.0, roughness: 0.58 },
  rubber: { color: 0x1f2226, metalness: 0.0, roughness: 0.92 },
  brass: { color: 0xc9a14a, metalness: 0.95, roughness: 0.3 },
  accent: { color: 0xff8a3d, metalness: 0.2, roughness: 0.45 },
  lensGlass: { color: 0x6fb7d6, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false },
  lens: { color: 0x2a6f8f, metalness: 0.3, roughness: 0.08, emissive: 0x0e3b52, emissiveIntensity: 0.6 },
  reddot: { color: 0xff3b3b, emissive: 0xff2020, emissiveIntensity: 2.5, metalness: 0, roughness: 0.4 },
  edge: { color: 0xbff4ff, emissive: 0x38d8ff, emissiveIntensity: 1.6, metalness: 0.6, roughness: 0.2 },
  wrap: { color: 0x3b2f2a, metalness: 0.0, roughness: 0.95 },
  // Characters
  fabric: { color: 0x3a3f47, metalness: 0.0, roughness: 0.9 },
  fabric2: { color: 0x4b4f3e, metalness: 0.0, roughness: 0.9 },
  fabric3: { color: 0x2f3a4a, metalness: 0.0, roughness: 0.9 },
  armor: { color: 0x2a2e35, metalness: 0.35, roughness: 0.55 },
  boot: { color: 0x1d1e22, metalness: 0.0, roughness: 0.85 },
  glove: { color: 0x22252a, metalness: 0.0, roughness: 0.8 },
  gloveTan: { color: 0x8a7556, metalness: 0.0, roughness: 0.85 },
  sleeve: { color: 0x2c3442, metalness: 0.0, roughness: 0.9 },
  skin1: { color: 0xe0b48f, metalness: 0.0, roughness: 0.75 },
  skin2: { color: 0xa8714a, metalness: 0.0, roughness: 0.75 },
  skin3: { color: 0x6b4630, metalness: 0.0, roughness: 0.75 },
  visor: { color: 0x10141c, metalness: 0.6, roughness: 0.15 },
  team0: { color: 0xff8a3d, metalness: 0.15, roughness: 0.5, emissive: 0x401800, emissiveIntensity: 0.4 },
  team1: { color: 0x3db4ff, metalness: 0.15, roughness: 0.5, emissive: 0x002a48, emissiveIntensity: 0.4 },
  teamGlow0: { color: 0xffb27a, emissive: 0xff7a1a, emissiveIntensity: 2.2, metalness: 0, roughness: 0.4 },
  teamGlow1: { color: 0x8fd3ff, emissive: 0x1a9bff, emissiveIntensity: 2.2, metalness: 0, roughness: 0.4 },
  dummy: { color: 0x8a8f99, metalness: 0.1, roughness: 0.7 },
  dummyHit: { color: 0xc04a4a, metalness: 0.1, roughness: 0.7 },
  // Map props
  concrete: { color: 0x8b8f96, metalness: 0.0, roughness: 0.92 },
  concreteDark: { color: 0x5d636d, metalness: 0.0, roughness: 0.9 },
  plate: { color: 0x6f7782, metalness: 0.6, roughness: 0.5 },
  crate: { color: 0xa9733d, metalness: 0.0, roughness: 0.75 },
  crateDark: { color: 0x6e4a27, metalness: 0.0, roughness: 0.8 },
  barrelRed: { color: 0xa83a30, metalness: 0.45, roughness: 0.5 },
  barrelBlue: { color: 0x2f5f9e, metalness: 0.45, roughness: 0.5 },
  pipe: { color: 0x7d858f, metalness: 0.75, roughness: 0.4 },
  hazard: { color: 0xe0b23a, metalness: 0.1, roughness: 0.6 },
  lampGlow: { color: 0xfff1d0, emissive: 0xffd9a0, emissiveIntensity: 3, metalness: 0, roughness: 0.5 },
  signTeal: { color: 0x2ad1c0, emissive: 0x16b0a0, emissiveIntensity: 1.6, metalness: 0, roughness: 0.5 },
  signPink: { color: 0xff4f8b, emissive: 0xe0306a, emissiveIntensity: 1.6, metalness: 0, roughness: 0.5 },
  runStripe: { color: 0x5dff9c, emissive: 0x2bd46a, emissiveIntensity: 1.4, metalness: 0, roughness: 0.5 },
};

// ------------------------------------------------------------------ primitives
/** Box with every edge chamfered (44 triangles, flat shaded). `b` is the chamfer size. */
export function cbox(w, h, d, b = Math.min(w, h, d) * 0.18) {
  const x = w / 2, y = h / 2, z = d / 2;
  b = Math.min(b, x * 0.95, y * 0.95, z * 0.95);
  const pts = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    pts.push(new THREE.Vector3(sx * (x - b), sy * y, sz * (z - b)));
    pts.push(new THREE.Vector3(sx * x, sy * (y - b), sz * (z - b)));
    pts.push(new THREE.Vector3(sx * (x - b), sy * (y - b), sz * z));
  }
  return new ConvexGeometry(pts);
}

/** Plain box (12 triangles). */
export function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }

/**
 * Side-profile extrusion: `pts` are [forward, up] pairs (metres) describing the silhouette seen from
 * the side; it is extruded `thick` wide, centred on x. Forward maps to -Z (the way weapons point).
 */
export function profile(pts, thick, bevel = 0.0) {
  const shape = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.0001, thick - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: 1, curveSegments: 4, steps: 1,
  });
  g.translate(0, 0, -(thick - bevel * 2) / 2);
  g.rotateY(Math.PI / 2); // shape x (forward) → -z, extrusion → x
  return g;
}

/** Cylinder along Z (forward), centred. */
export function cyl(r, len, seg = 10, r2 = r) {
  const g = new THREE.CylinderGeometry(r2, r, len, seg, 1);
  g.rotateX(-Math.PI / 2); // +y → -z: r2 is the front end
  return g;
}

/** Cylinder standing up (Y axis). */
export function cylY(r, h, seg = 10, rTop = r) { return new THREE.CylinderGeometry(rTop, r, h, seg, 1); }

/** Lathe around Z: pts are [radius, z] pairs, z forward (negative). */
export function latheZ(pts, seg = 10) {
  const g = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), seg);
  g.rotateX(Math.PI / 2); // lathe height (y) → z, so negative values run forward like everything else
  return g;
}

export function torus(r, tube, rs = 6, ts = 12, arc = Math.PI * 2) { return new THREE.TorusGeometry(r, tube, rs, ts, arc); }

export function sphere(r, ws = 8, hs = 6) { return new THREE.SphereGeometry(r, ws, hs); }

// ------------------------------------------------------------------ assembling
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

/**
 * Collects pieces by material and merges them. `add(geometry, material, [x,y,z], [rx,ry,rz], [sx,sy,sz])`.
 * `build()` returns a Group with one Mesh per material (named after it).
 */
export class Assembly {
  constructor(name = '') { this.name = name; this.parts = new Map(); }

  add(geo, material, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    _e.set(r[0], r[1], r[2]);
    _q.setFromEuler(_e);
    _m.compose(_p.set(p[0], p[1], p[2]), _q, _s.set(s[0], s[1], s[2]));
    g.applyMatrix4(_m);
    if (!this.parts.has(material)) this.parts.set(material, []);
    this.parts.get(material).push(g);
    return this;
  }

  build() {
    const group = new THREE.Group();
    group.name = this.name;
    for (const [material, geos] of this.parts) {
      const merged = mergeGeometries(geos, false);
      merged.computeBoundingSphere();
      for (const g of geos) g.dispose();
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = (this.name ? this.name + ':' : '') + material.name;
      group.add(mesh);
    }
    return group;
  }
}

/** Named empty marker (socket). */
export function socket(name, p, r = [0, 0, 0]) {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(p[0], p[1], p[2]);
  o.rotation.set(r[0], r[1], r[2]);
  return o;
}

/** Group with a name and position, for animated parts. */
export function part(name, children = [], p = [0, 0, 0]) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(p[0], p[1], p[2]);
  for (const c of children) g.add(c);
  return g;
}

export function countTriangles(obj) {
  let n = 0;
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    const count = g.index ? g.index.count : g.attributes.position.count;
    n += (count / 3) * (o.isInstancedMesh ? o.count : 1);
  });
  return Math.round(n);
}

export function countMeshes(obj) {
  let n = 0;
  obj.traverse((o) => { if (o.isMesh && o.visible) n++; });
  return n;
}

/**
 * Bake a multi-material model into ONE mesh (vertex colours, one shared material): the same shape
 * for 1 draw call, for things seen at a distance (third-person weapons). Named sockets are kept.
 */
const flatMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.55, metalness: 0.35 });
export function flattenModel(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const geos = [];
  const sockets = [];
  const c = new THREE.Color();
  root.traverse((o) => {
    if (o.isMesh && o.geometry) {
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      const m = o.material;
      c.copy(m.color || c.set(0xffffff));
      if (m.emissive && m.emissiveIntensity) c.add(m.emissive.clone().multiplyScalar(Math.min(1.5, m.emissiveIntensity)));
      const n = g.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geos.push(g);
    } else if (o !== root && o.type === 'Object3D' && o.name) {
      const s = new THREE.Object3D();
      s.name = o.name;
      new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld).decompose(s.position, s.quaternion, s.scale);
      sockets.push(s);
    }
  });
  const mesh = new THREE.Mesh(mergeGeometries(geos, false), flatMaterial);
  mesh.geometry.computeBoundingSphere();
  for (const g of geos) g.dispose();
  mesh.name = root.name + ':flat';
  mesh.add(...sockets);
  return mesh;
}
