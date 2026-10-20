// WebGL renderer, world scene and the separate viewmodel (first-person gun) scene.
import * as THREE from 'three';
import { settings } from '../core/Settings.js';
import { buildMapMesh } from './MapMesh.js';

const QUALITY = {
  low: { ratio: 0.75, aa: false },
  med: { ratio: 1.0, aa: false },
  high: { ratio: 2.0, aa: true },
};

export class Renderer {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(90, 1, 0.05, 400);
    this.camera.rotation.order = 'YXZ';
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(62, 1, 0.01, 10);

    const hemi = new THREE.HemisphereLight(0xdfefff, 0x6b6250, 1.6);
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(0.45, 0.85, 0.3);
    this.scene.add(hemi, sun);
    const vmHemi = new THREE.HemisphereLight(0xdfefff, 0x5a5a66, 1.7);
    const vmSun = new THREE.DirectionalLight(0xffffff, 1.6);
    vmSun.position.set(0.3, 1, 0.6);
    this.vmScene.add(vmHemi, vmSun);

    this.mapMesh = null;
    this.quality = null;
    this.createRenderer();
    settings.onChange((k) => { if (k === 'quality' || k === '*') this.createRenderer(); });
    window.addEventListener('resize', () => this.resize());
  }

  createRenderer() {
    const q = settings.get('quality');
    const cfg = QUALITY[q] || QUALITY.med;
    // Switching antialiasing needs a new WebGL context (a new canvas), which would drop pointer lock
    // mid-game. While playing, only the resolution changes; antialiasing follows on the next menu visit.
    const keepContext = this.renderer && document.pointerLockElement;
    if (this.renderer && this.quality && (QUALITY[this.quality].aa === cfg.aa || keepContext)) {
      this.quality = q;
      this.resize();
      return;
    }
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
    this.quality = q;
    this.renderer = new THREE.WebGLRenderer({ antialias: cfg.aa, powerPreference: 'high-performance', stencil: false });
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.id = 'game-canvas';
    this.container.prepend(this.renderer.domElement);
    this.resize();
  }

  resize() {
    const cfg = QUALITY[this.quality] || QUALITY.med;
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.ratio));
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = w / h;
    this.vmCamera.updateProjectionMatrix();
  }

  setMap(map) {
    if (this.mapMesh) {
      this.scene.remove(this.mapMesh);
      this.mapMesh.geometry.dispose();
    }
    this.mapMesh = buildMapMesh(map);
    this.scene.add(this.mapMesh);
    this.scene.background = new THREE.Color(map.sky);
    this.scene.fog = new THREE.Fog(map.fog, map.fogNear, map.fogFar);
  }

  render(showViewmodel = true) {
    const r = this.renderer;
    r.info.reset();
    r.clear();
    r.render(this.scene, this.camera);
    if (showViewmodel) {
      r.clearDepth();
      r.render(this.vmScene, this.vmCamera);
    }
  }

  get info() { return this.renderer.info; }
}
