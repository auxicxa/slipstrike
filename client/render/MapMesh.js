// Builds a whole map as ONE merged mesh (one draw call). Lighting is baked into vertex colours
// (fake sun plus height-based ambient occlusion), and a tiny procedural grid texture is mapped in
// world space so you can feel your speed.
import * as THREE from 'three';

const SUN = new THREE.Vector3(0.45, 0.85, 0.3).normalize();

function shade(color, nx, ny, nz, y, baseY) {
  const c = new THREE.Color(color);
  const ndl = Math.max(0, nx * SUN.x + ny * SUN.y + nz * SUN.z);
  let k = 0.55 + 0.5 * ndl;
  if (ny < -0.5) k = 0.45;
  // Ambient occlusion: darker near the bottom of vertical faces
  if (Math.abs(ny) < 0.5) k *= 0.78 + 0.22 * Math.min(1, (y - baseY) / 1.6);
  return [c.r * k, c.g * k, c.b * k];
}

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

const UV_SCALE = 0.5; // one grid cell = 2 m
const RUN_STRIPE = 0x46e08a; // marks walls you can run on

export function buildMapMesh(map) {
  const pos = [], nor = [], col = [], uv = [];

  const quad = (a, b, c, d, n, color, baseY) => {
    // a,b,c,d counter-clockwise when viewed from the normal side
    for (const p of [a, b, c, a, c, d]) {
      pos.push(p[0], p[1], p[2]);
      nor.push(n[0], n[1], n[2]);
      const s = shade(color, n[0], n[1], n[2], p[1], baseY);
      col.push(s[0], s[1], s[2]);
      // World-space UVs: pick the two axes the face spans
      if (Math.abs(n[1]) > 0.5) uv.push(p[0] * UV_SCALE, p[2] * UV_SCALE);
      else if (Math.abs(n[0]) > 0.5) uv.push(p[2] * UV_SCALE, p[1] * UV_SCALE);
      else uv.push(p[0] * UV_SCALE, p[1] * UV_SCALE);
    }
  };
  const tri = (a, b, c, n, color, baseY) => {
    for (const p of [a, b, c]) {
      pos.push(p[0], p[1], p[2]);
      nor.push(n[0], n[1], n[2]);
      const s = shade(color, n[0], n[1], n[2], p[1], baseY);
      col.push(s[0], s[1], s[2]);
      if (Math.abs(n[0]) > 0.5) uv.push(p[2] * UV_SCALE, p[1] * UV_SCALE);
      else uv.push(p[0] * UV_SCALE, p[1] * UV_SCALE);
    }
  };

  for (const b of map.boxes) {
    const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, c = b.c, by = y0 < 0 ? 0 : y0;
    quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], c, by); // top
    if (y0 > -0.5) quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], c, by); // bottom
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], c, by); // +z
    quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], c, by); // -z
    quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], c, by); // +x
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], c, by); // -x
    if (b.run) {
      // wall-runnable: a green stripe around the sides at running height
      const e = 0.015, s0 = by + 1.3, s1 = Math.min(y1 - 0.05, by + 1.48), G = RUN_STRIPE;
      if (s1 > s0) {
        quad([x0, s0, z1 + e], [x1, s0, z1 + e], [x1, s1, z1 + e], [x0, s1, z1 + e], [0, 0, 1], G, by);
        quad([x1, s0, z0 - e], [x0, s0, z0 - e], [x0, s1, z0 - e], [x1, s1, z0 - e], [0, 0, -1], G, by);
        quad([x1 + e, s0, z1], [x1 + e, s0, z0], [x1 + e, s1, z0], [x1 + e, s1, z1], [1, 0, 0], G, by);
        quad([x0 - e, s0, z0], [x0 - e, s0, z1], [x0 - e, s1, z1], [x0 - e, s1, z0], [-1, 0, 0], G, by);
      }
    }
  }

  for (const r of map.ramps || []) {
    const [x0, y0, z0] = r.min, [x1, y1, z1] = r.max, c = r.c;
    const h = y1 - y0;
    let A, B, C, D; // slope quad corners (low edge first)
    let n;
    if (r.dir === '+x') {
      A = [x0, y0, z1]; B = [x1, y1, z1]; C = [x1, y1, z0]; D = [x0, y0, z0];
      n = new THREE.Vector3(-h, x1 - x0, 0).normalize();
      tri([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [0, 0, 1], c, y0);
      tri([x1, y0, z0], [x0, y0, z0], [x1, y1, z0], [0, 0, -1], c, y0);
      quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], c, y0);
    } else if (r.dir === '-x') {
      A = [x0, y1, z1]; B = [x1, y0, z1]; C = [x1, y0, z0]; D = [x0, y1, z0];
      n = new THREE.Vector3(h, x1 - x0, 0).normalize();
      tri([x0, y0, z1], [x1, y0, z1], [x0, y1, z1], [0, 0, 1], c, y0);
      tri([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [0, 0, -1], c, y0);
      quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], c, y0);
    } else if (r.dir === '+z') {
      A = [x0, y0, z0]; B = [x0, y1, z1]; C = [x1, y1, z1]; D = [x1, y0, z0];
      n = new THREE.Vector3(0, z1 - z0, -h).normalize();
      // winding for +z: top surface quad (x0,z0 low) → use explicit order below
      A = [x0, y1, z1]; B = [x1, y1, z1]; C = [x1, y0, z0]; D = [x0, y0, z0];
      tri([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [1, 0, 0], c, y0);
      tri([x0, y0, z1], [x0, y0, z0], [x0, y1, z1], [-1, 0, 0], c, y0);
      quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], c, y0);
    } else {
      A = [x0, y0, z1]; B = [x1, y0, z1]; C = [x1, y1, z0]; D = [x0, y1, z0];
      n = new THREE.Vector3(0, z1 - z0, h).normalize();
      tri([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [1, 0, 0], c, y0);
      tri([x0, y0, z0], [x0, y0, z1], [x0, y1, z0], [-1, 0, 0], c, y0);
      quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], c, y0);
    }
    quad(A, B, C, D, [n.x, n.y, n.z], c, y0);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, map: getGridTexture(), side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.matrixAutoUpdate = false;
  mesh.name = 'map';
  return mesh;
}
