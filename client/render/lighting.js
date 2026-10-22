// Lighting rigs shared by the game and the /viewer page, so models are judged under the light they
// will actually be seen in.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const envCache = new WeakMap();
/**
 * A soft studio environment map (generated once, no image files). Metals and glossy surfaces need
 * something to reflect, or they render almost black. Returns the texture to use as scene.environment.
 */
export function environmentFor(renderer) {
  if (envCache.has(renderer)) return envCache.get(renderer);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  envCache.set(renderer, tex);
  return tex;
}

/** Renderer colour pipeline: sRGB output with ACES filmic tone mapping. */
export function configureRenderer(renderer, exposure = 1.0) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
}

/**
 * Adds a lighting rig to `scene` and returns { lights, sun, update(dt) }.
 * presets: 'game' (map lighting: sky hemisphere + warm sun with soft shadows),
 *          'studio' (key / fill / rim, for inspecting models), 'dusk' (low sun + coloured accents).
 */
export function addLighting(scene, preset = 'game', opts = {}) {
  const lights = [];
  const add = (l) => { scene.add(l); if (l.target) scene.add(l.target); lights.push(l); return l; };
  let sun = null;
  const sky = opts.sky ?? 0xcfe4ff, ground = opts.ground ?? 0x5a5148;
  if (preset === 'studio') {
    add(new THREE.HemisphereLight(0xe8eef8, 0x30343c, 0.9));
    sun = add(new THREE.DirectionalLight(0xffffff, 2.6)); sun.position.set(3, 5, 4);
    const fill = add(new THREE.DirectionalLight(0xbcd2ff, 0.8)); fill.position.set(-4, 2, 2);
    const rim = add(new THREE.DirectionalLight(0xffe2c8, 1.6)); rim.position.set(-1, 3, -5);
  } else if (preset === 'dusk') {
    add(new THREE.HemisphereLight(0x6f86c9, 0x2a2026, 0.7));
    sun = add(new THREE.DirectionalLight(0xffa868, 2.4)); sun.position.set(6, 2.5, 3);
    const a = add(new THREE.PointLight(0x2ad1c0, 6, 8, 2)); a.position.set(-1.5, 1.6, 1.5);
    const b = add(new THREE.PointLight(0xff4f8b, 5, 8, 2)); b.position.set(1.8, 1.2, -1.5);
  } else {
    add(new THREE.HemisphereLight(sky, ground, opts.hemi ?? 1.15));
    sun = add(new THREE.DirectionalLight(opts.sunColor ?? 0xfff2df, opts.sunIntensity ?? 2.4));
    sun.position.set(30, 55, 22);
  }
  if (sun && opts.shadows) {
    sun.castShadow = true;
    const size = opts.shadowSize ?? 2048;
    sun.shadow.mapSize.set(size, size);
    const r = opts.shadowRange ?? 6;
    Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 0.5, far: opts.shadowFar ?? 40 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 3;
    sun.shadow.camera.updateProjectionMatrix();
  }
  return { lights, sun, dispose() { for (const l of lights) { scene.remove(l); if (l.target) scene.remove(l.target); l.dispose?.(); } } };
}
