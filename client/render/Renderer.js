// WebGL renderer, world scene and the separate viewmodel (first-person gun) scene.
//
// Lighting: sRGB output with ACES tone mapping, a sky/ground hemisphere light, a sun with soft
// (PCFSoft) shadows whose shadow camera follows the player, a generated environment map for
// reflections, a gradient sky dome, fog, and a few accent point lights from map props (lamps, signs).
// Optional bloom (EffectComposer) and a CSS vignette. Graphics quality picks shadows, shadow
// resolution, bloom, accent lights, particles and pixel ratio.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { settings } from '../core/Settings.js';
import { buildMapMesh } from './MapMesh.js';
import { buildProps } from './Props.js';
import { buildSky } from './Sky.js';
import { configureRenderer, environmentFor } from './lighting.js';

/**
 * Quality presets. shadow: shadow-map size (0 = no real-time shadows), lights: accent point lights,
 * particles: share of the particle budget.
 */
export const QUALITY = {
  low: { ratio: 0.75, aa: false, shadow: 0, bloom: false, lights: 0, particles: 0.4, cheap: true },
  med: { ratio: 1.0, aa: false, shadow: 2048, bloom: false, lights: 3, particles: 0.75, cheap: false },
  high: { ratio: 2.0, aa: true, shadow: 4096, bloom: true, lights: 6, particles: 1, cheap: false },
};
const SHADOW_RANGE = 34; // half-size of the area around the player that gets sun shadows (m)

export class Renderer {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(90, 1, 0.05, 400);
    this.camera.rotation.order = 'YXZ';
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(62, 1, 0.01, 10);

    this.hemi = new THREE.HemisphereLight(0xdfefff, 0x6b6250, 1.0);
    this.sun = new THREE.DirectionalLight(0xfff4e6, 2.4);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 3;
    Object.assign(this.sun.shadow.camera, { left: -SHADOW_RANGE, right: SHADOW_RANGE, top: SHADOW_RANGE, bottom: -SHADOW_RANGE, near: 1, far: 220 });
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.sunDir = new THREE.Vector3(0.45, 0.85, 0.3).normalize();
    this.accent = []; // PointLights in use
    this.lightSpots = []; // candidate accent light positions from the map props
    // The viewmodel is lit by the same sky and sun, turned into camera space every frame so the gun
    // brightens when you face the sun
    this.vmHemi = new THREE.HemisphereLight(0xdfefff, 0x5a5a66, 1.3);
    this.vmSun = new THREE.DirectionalLight(0xfff4e6, 2.0);
    this.vmScene.add(this.vmHemi, this.vmSun, this.vmSun.target);
    this.vmScene.environmentIntensity = 0.5;
    this.scene.environmentIntensity = 0.35;
    this._q = new THREE.Quaternion();

    this.vignette = document.createElement('div');
    this.vignette.className = 'vignette';
    container.append(this.vignette);

    this.mapMesh = null;
    this.props = null;
    this.sky = null;
    this.quality = null;
    this.createRenderer();
    settings.onChange((k) => {
      if (k === 'quality' || k === '*') this.createRenderer();
      if (k === 'bloom' || k === 'vignette' || k === '*') this.applyQuality();
    });
    window.addEventListener('resize', () => this.resize());
  }

  get cfg() { return QUALITY[this.quality] || QUALITY.med; }

  createRenderer() {
    const q = settings.get('quality');
    const cfg = QUALITY[q] || QUALITY.med;
    // Switching antialiasing needs a new WebGL context (a new canvas), which would drop pointer lock
    // mid-game. While playing, only the other options change; antialiasing follows on the next menu visit.
    const keepContext = this.renderer && document.pointerLockElement;
    if (this.renderer && this.quality && (QUALITY[this.quality].aa === cfg.aa || keepContext)) {
      this.quality = q;
      this.applyQuality();
      this.resize();
      return;
    }
    if (this.renderer) {
      this.composer?.dispose?.();
      this.composer = null;
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
    this.quality = q;
    this.renderer = new THREE.WebGLRenderer({ antialias: cfg.aa, powerPreference: 'high-performance', stencil: false });
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    configureRenderer(this.renderer, this.exposure || 1.15);
    // Metals need something to reflect: one generated studio environment for both scenes
    const env = environmentFor(this.renderer);
    this.scene.environment = env;
    this.vmScene.environment = env;
    this.renderer.domElement.id = 'game-canvas';
    this.container.prepend(this.renderer.domElement);
    this.applyQuality();
    this.resize();
  }

  /** Shadows, bloom, accent lights and vignette for the current quality and settings. */
  applyQuality() {
    if (!this.renderer) return;
    const cfg = this.cfg;
    const shadows = cfg.shadow > 0;
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      this.scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
    }
    this.sun.castShadow = shadows;
    if (shadows && this.sun.shadow.mapSize.x !== cfg.shadow) {
      this.sun.shadow.mapSize.set(cfg.shadow, cfg.shadow);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    const b = settings.get('bloom');
    this.bloomOn = b === 'on' || (b === 'auto' && cfg.bloom);
    if (this.bloomOn && !this.composer) this.buildComposer();
    this.vignette.style.display = settings.get('vignette') ? '' : 'none';
    this.applyMapMaterial();
    this.placeAccentLights();
  }

  /** Low quality: the map (most of the screen) uses a cheaper material without reflections. */
  applyMapMaterial() {
    const m = this.mapMesh?.getObjectByName('map');
    if (m) m.material = this.cfg.cheap ? m.userData.cheap : m.userData.full;
    if (this.sky) this.sky.material.uniforms.sunOn.value = this.cfg.cheap ? 0 : 1;
  }

  buildComposer() {
    const r = this.renderer;
    const c = new EffectComposer(r);
    c.addPass(new RenderPass(this.scene, this.camera));
    const vm = new RenderPass(this.vmScene, this.vmCamera);
    vm.clear = false;
    vm.clearDepth = true;
    c.addPass(vm);
    this.vmPass = vm;
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.55, 0.88);
    c.addPass(this.bloomPass);
    c.addPass(new OutputPass());
    this.composer = c;
    this.resize();
  }

  resize() {
    if (!this.renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.cfg.ratio));
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.cfg.ratio));
      this.composer.setSize(w, h);
    }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = w / h;
    this.vmCamera.updateProjectionMatrix();
  }

  setMap(map) {
    for (const o of [this.mapMesh, this.props, this.sky]) {
      if (!o) continue;
      this.scene.remove(o);
      o.traverse((m) => { if (m.geometry && !m.isInstancedMesh) m.geometry.dispose(); });
    }
    this.mapMesh = buildMapMesh(map);
    this.scene.add(this.mapMesh);
    this.applyMapMaterial();
    const props = buildProps(map);
    this.props = props.group;
    this.scene.add(this.props);
    this.lightSpots = props.lights;

    const L = map.light || {};
    this.sunDir.set(...(L.sunDir || [0.45, 0.85, 0.3])).normalize();
    this.sun.color.setHex(L.sun ?? 0xfff2df);
    this.sun.intensity = L.sunIntensity ?? 2.4;
    this.hemi.color.setHex(map.sky);
    this.hemi.groundColor.setHex(L.ground ?? 0x5a5148);
    this.hemi.intensity = L.hemi ?? 1.0;
    this.vmSun.color.copy(this.sun.color);
    this.vmHemi.color.setHex(map.sky);
    this.vmHemi.groundColor.setHex(L.ground ?? 0x5a5148);
    this.exposure = L.exposure ?? 1.15;
    this.renderer.toneMappingExposure = this.exposure;

    this.sky = buildSky({ top: L.skyTop ?? 0x5f8fc7, horizon: map.fog, bottom: L.ground ?? 0x5a5148, sunDir: this.sunDir.toArray(), sunColor: L.sun ?? 0xfff2df });
    this.scene.add(this.sky);
    this.applyMapMaterial();
    this.scene.background = new THREE.Color(map.fog);
    this.scene.fog = new THREE.Fog(map.fog, map.fogNear, map.fogFar);
    this.placeAccentLights();
    // Compile the map's shaders now (in parallel where the GPU driver allows), not on the first frames
    // of the round
    this.renderer.compileAsync?.(this.scene, this.camera).catch(() => {});
    this.renderer.compileAsync?.(this.vmScene, this.vmCamera).catch(() => {});
  }

  /** Point lights for the first few lamp/sign props (how many depends on the quality). */
  placeAccentLights() {
    const n = Math.min(this.cfg.lights, this.lightSpots.length);
    while (this.accent.length > n) this.scene.remove(this.accent.pop());
    while (this.accent.length < n) { const l = new THREE.PointLight(0xffffff, 1, 10, 2); this.accent.push(l); this.scene.add(l); }
    this.accent.forEach((l, i) => {
      const s = this.lightSpots[i];
      l.position.copy(s.pos);
      l.color.setHex(s.color);
      l.intensity = s.intensity;
      l.distance = s.distance;
    });
  }

  /**
   * A camera-space point of the viewmodel → the world point drawn at the same pixel and distance
   * (the two cameras have different FOVs, so a plain transform would be off-screen-position).
   */
  vmToWorld(v, out = new THREE.Vector3()) {
    const d = v.length();
    this.camera.updateMatrixWorld();
    out.copy(v).applyMatrix4(this.vmCamera.projectionMatrix);
    out.applyMatrix4(this.camera.projectionMatrixInverse).normalize().multiplyScalar(d);
    return out.applyMatrix4(this.camera.matrixWorld);
  }

  render(showViewmodel = true) {
    const r = this.renderer;
    const cam = this.camera;
    // Sun shadows cover a square around the player, snapped to shadow texels to avoid shimmering
    if (this.sun.castShadow) {
      const texel = (2 * SHADOW_RANGE) / this.sun.shadow.mapSize.x;
      const cx = Math.round(cam.position.x / texel) * texel, cz = Math.round(cam.position.z / texel) * texel;
      this.sun.target.position.set(cx, 0, cz);
      this.sun.position.set(cx + this.sunDir.x * 90, this.sunDir.y * 90, cz + this.sunDir.z * 90);
    } else {
      this.sun.position.copy(this.sunDir).multiplyScalar(90);
      this.sun.target.position.set(0, 0, 0);
    }
    this.sun.target.updateMatrixWorld();
    if (this.sky) this.sky.position.copy(cam.position);
    // Sun and sky in camera space for the viewmodel
    this._q.copy(cam.quaternion).invert();
    this.vmSun.position.copy(this.sunDir).applyQuaternion(this._q);
    this.vmHemi.position.set(0, 1, 0).applyQuaternion(this._q);
    r.info.reset();
    if (this.bloomOn && this.composer) {
      this.vmPass.enabled = showViewmodel;
      this.composer.render();
      return;
    }
    r.setRenderTarget(null);
    r.clear();
    r.render(this.scene, cam);
    if (showViewmodel) {
      r.clearDepth();
      r.render(this.vmScene, this.vmCamera);
    }
  }

  get info() { return this.renderer.info; }
}
