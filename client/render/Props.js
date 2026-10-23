// Draws a map's decorative props: one InstancedMesh per prop type and material, so every barrel on
// the map costs the same few draw calls. Also returns the accent lights the props carry (lamps, signs).
import * as THREE from 'three';
import { propParts } from '../models/props.js';

export function buildProps(map) {
  const group = new THREE.Group();
  group.name = 'props';
  const lights = [];
  const byType = new Map();
  for (const p of map.props || []) {
    if (!byType.has(p.type)) byType.set(p.type, []);
    byType.get(p.type).push(p);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (const [type, list] of byType) {
    let def;
    try { def = propParts(type); } catch { console.warn('unknown prop', type); continue; }
    const mats = list.map((p) => m4.compose(v.set(...p.p), q.setFromAxisAngle(up, p.yaw || 0), s.setScalar(p.s || 1)).clone());
    for (const part of def.parts) {
      const im = new THREE.InstancedMesh(part.geometry, part.material, list.length);
      mats.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = true;
      im.receiveShadow = true;
      im.name = `prop:${type}:${part.material.name}`;
      group.add(im);
    }
    if (def.light) {
      for (const m of mats) {
        lights.push({ pos: new THREE.Vector3(...def.light.light).applyMatrix4(m), color: def.light.color, intensity: def.light.intensity, distance: def.light.distance });
      }
    }
  }
  return { group, lights };
}
