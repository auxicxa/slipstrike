// Merge a list of coloured boxes into one BufferGeometry (one draw call per model).
import * as THREE from 'three';

/**
 * parts: [{ s:[w,h,d], p:[x,y,z], c: hex, r?:[rx,ry,rz] }]
 */
export function boxesGeometry(parts) {
  const geos = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (const part of parts) {
    const g = new THREE.BoxGeometry(part.s[0], part.s[1], part.s[2]).toNonIndexed();
    e.set(...(part.r || [0, 0, 0]));
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(...part.p), q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    const col = new THREE.Color(part.c);
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.deleteAttribute('uv');
    geos.push(g);
  }
  return mergeGeometries(geos);
}

function mergeGeometries(geos) {
  let total = 0;
  for (const g of geos) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

export const flatMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
