// Low-poly third-person player model: torso+head, two legs, weapon (4 draw calls) and a blob shadow.
import * as THREE from 'three';
import { boxesGeometry, flatMat } from './geo.js';
import { MOVEMENT as M } from '../../shared/config/movement.js';

const geoCache = new Map();
function bodyGeo(color) {
  if (!geoCache.has(color)) {
    const dark = new THREE.Color(color).multiplyScalar(0.55).getHex();
    geoCache.set(color, boxesGeometry([
      { s: [0.6, 0.62, 0.36], p: [0, 1.14, 0], c: color },          // torso
      { s: [0.62, 0.1, 0.38], p: [0, 0.86, 0], c: dark },            // belt
      { s: [0.32, 0.32, 0.32], p: [0, 1.62, 0], c: 0xe9e4da },       // head
      { s: [0.28, 0.1, 0.06], p: [0, 1.65, -0.165], c: 0x1d2330 },   // visor
      { s: [0.16, 0.5, 0.16], p: [-0.38, 1.12, 0], c: dark },        // left arm
    ]));
  }
  return geoCache.get(color);
}
const legGeo = boxesGeometry([{ s: [0.22, 0.82, 0.24], p: [0, -0.41, 0], c: 0x30343d }, { s: [0.24, 0.1, 0.3], p: [0, -0.79, -0.03], c: 0x1b1d22 }]);
const gunGeos = {
  rifle: boxesGeometry([{ s: [0.08, 0.1, 0.7], p: [0, 0, -0.3], c: 0x2b2f38 }, { s: [0.06, 0.14, 0.08], p: [0, -0.1, -0.25], c: 0xff8a3d }]),
  shotgun: boxesGeometry([{ s: [0.09, 0.1, 0.75], p: [0, 0, -0.3], c: 0x2b2f38 }, { s: [0.08, 0.07, 0.2], p: [0, -0.06, -0.45], c: 0x8a5a33 }]),
  sniper: boxesGeometry([{ s: [0.08, 0.09, 0.95], p: [0, 0, -0.4], c: 0x3c4a3a }, { s: [0.06, 0.06, 0.25], p: [0, 0.09, -0.3], c: 0x2b2f38 }]),
  pistol: boxesGeometry([{ s: [0.06, 0.08, 0.24], p: [0, 0, -0.12], c: 0x2b2f38 }]),
  revolver: boxesGeometry([{ s: [0.06, 0.08, 0.3], p: [0, 0, -0.15], c: 0xd6dbe3 }]),
  knife: boxesGeometry([{ s: [0.02, 0.05, 0.26], p: [0, 0, -0.16], c: 0xd6dbe3 }]),
};
const arm = boxesGeometry([{ s: [0.16, 0.16, 0.5], p: [0, 0, -0.2], c: 0x30343d }]);

const shadowTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 2, 16, 16, 16);
  grad.addColorStop(0, 'rgba(0,0,0,0.45)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
})();
const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
const shadowGeo = new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2);

export class PlayerModel {
  constructor(scene, color) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.body = new THREE.Mesh(bodyGeo(color), flatMat);
    this.legL = new THREE.Mesh(legGeo, flatMat);
    this.legR = new THREE.Mesh(legGeo, flatMat);
    this.legL.position.set(-0.15, 0.84, 0);
    this.legR.position.set(0.15, 0.84, 0);
    this.armPivot = new THREE.Group();
    this.armPivot.position.set(0.3, 1.32, 0);
    this.arm = new THREE.Mesh(arm, flatMat);
    this.gun = new THREE.Mesh(gunGeos.rifle, flatMat);
    this.gun.position.set(-0.05, 0.06, -0.35);
    this.armPivot.add(this.arm, this.gun);
    this.upper = new THREE.Group();
    this.upper.add(this.body, this.armPivot);
    this.root.add(this.upper, this.legL, this.legR);
    this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadow.renderOrder = 1;
    scene.add(this.root, this.shadow);
    this.color = color;
    this.weapon = 'rifle';
    this.walk = 0;
    this.lastX = 0; this.lastZ = 0;
  }

  setColor(color) {
    if (color === this.color) return;
    this.color = color;
    this.body.geometry = bodyGeo(color);
  }

  setWeapon(id) {
    if (id === this.weapon || !gunGeos[id]) return;
    this.weapon = id;
    this.gun.geometry = gunGeos[id];
  }

  /** e: { x,y,z,yaw,pitch,h,sliding,grounded, weapon, alive }, floorY for the shadow */
  update(e, dt, floorY) {
    const vis = e.alive !== false;
    this.root.visible = vis;
    this.shadow.visible = vis && floorY > -100;
    if (this.label) this.label.visible = vis;
    if (!vis) return;
    this.setWeapon(e.weapon);
    this.root.position.set(e.x, e.y, e.z);
    this.root.rotation.y = e.yaw;
    const crouch = e.h < M.standHeight - 0.05;
    const s = crouch ? e.h / M.standHeight : 1;
    this.root.scale.set(1, s, 1);
    this.upper.rotation.x = e.sliding ? 0.45 : 0;
    this.armPivot.rotation.x = e.pitch;

    const dx = e.x - this.lastX, dz = e.z - this.lastZ;
    const speed = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
    this.lastX = e.x; this.lastZ = e.z;
    if (e.grounded !== false && speed > 0.5 && speed < 30 && !e.sliding) this.walk += dt * speed * 1.6;
    else this.walk *= 0.85;
    const swing = Math.sin(this.walk) * Math.min(0.7, speed * 0.08);
    this.legL.rotation.x = e.sliding ? -1.2 : swing;
    this.legR.rotation.x = e.sliding ? -1.0 : -swing;
    if (e.grounded === false && !e.sliding) { this.legL.rotation.x = -0.4; this.legR.rotation.x = 0.2; }

    if (this.label) {
      this.label.visible = vis;
      this.label.position.set(e.x, e.y + e.h + 0.35, e.z);
    }
    this.shadow.position.set(e.x, floorY + 0.02, e.z);
    const hgt = Math.max(0, e.y - floorY);
    this.shadow.scale.setScalar(Math.max(0.4, 1 - hgt * 0.15));
  }

  /** Name tag above the head (teammates only; drawn through walls so you can find each other). */
  setLabel(text, color = '#ffffff') {
    const key = text ? text + color : '';
    if (key === this.labelKey) return;
    this.labelKey = key;
    if (this.label) { this.scene.remove(this.label); this.label.material.map.dispose(); this.label.material.dispose(); this.label = null; }
    if (!text) return;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 48;
    const g = c.getContext('2d');
    g.font = 'bold 30px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.7)';
    g.strokeText(text, 128, 24);
    g.fillStyle = color;
    g.fillText(text, 128, 24);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    this.label.scale.set(1.4, 0.26, 1);
    this.label.renderOrder = 10;
    this.scene.add(this.label);
  }

  dispose() {
    this.setLabel(null);
    this.scene.remove(this.root, this.shadow);
  }
}
