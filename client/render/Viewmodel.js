// First-person weapon models (built from boxes) and their animations.
import * as THREE from 'three';
import { boxesGeometry, flatMat } from './geo.js';
import { WEAPONS } from '../../shared/config/weapons.js';
import { MOVEMENT as M } from '../../shared/config/movement.js';

const DARK = 0x2b2f38, MID = 0x4a505c, LIGHT = 0x8a93a3, ACC = 0xff8a3d, WOOD = 0x8a5a33, GLOVE = 0x23262d, STEEL = 0xd6dbe3;

const VM_SCALE = 0.55;

const MODELS = {
  rifle: {
    parts: [
      { s: [0.06, 0.08, 0.42], p: [0, 0, -0.05], c: DARK },
      { s: [0.03, 0.03, 0.26], p: [0, 0.01, -0.38], c: MID },
      { s: [0.05, 0.12, 0.06], p: [0, -0.09, -0.06], c: ACC, r: [0.25, 0, 0] },
      { s: [0.045, 0.1, 0.05], p: [0, -0.08, 0.08], c: DARK, r: [-0.3, 0, 0] },
      { s: [0.05, 0.07, 0.16], p: [0, -0.01, 0.22], c: MID },
      { s: [0.02, 0.035, 0.07], p: [0, 0.06, -0.04], c: LIGHT },
      { s: [0.07, 0.07, 0.16], p: [0.0, -0.1, 0.12], c: GLOVE },
    ],
    hip: [0.13, -0.135, -0.36], ads: [0, -0.045, -0.3], muzzle: [0, 0.01, -0.52],
  },
  shotgun: {
    parts: [
      { s: [0.065, 0.08, 0.36], p: [0, 0, 0], c: DARK },
      { s: [0.04, 0.04, 0.38], p: [0, 0.015, -0.34], c: MID },
      { s: [0.06, 0.05, 0.16], p: [0, -0.04, -0.3], c: WOOD },
      { s: [0.05, 0.08, 0.2], p: [0, -0.03, 0.24], c: WOOD, r: [-0.12, 0, 0] },
      { s: [0.045, 0.09, 0.05], p: [0, -0.08, 0.1], c: DARK, r: [-0.3, 0, 0] },
      { s: [0.07, 0.07, 0.15], p: [0, -0.1, 0.14], c: GLOVE },
    ],
    hip: [0.13, -0.14, -0.36], ads: [0, -0.028, -0.3], muzzle: [0, 0.015, -0.54],
  },
  sniper: {
    parts: [
      { s: [0.06, 0.075, 0.46], p: [0, 0, 0], c: 0x3c4a3a },
      { s: [0.028, 0.028, 0.42], p: [0, 0.01, -0.42], c: DARK },
      { s: [0.05, 0.05, 0.22], p: [0, 0.075, -0.02], c: DARK },
      { s: [0.06, 0.06, 0.03], p: [0, 0.075, -0.14], c: MID },
      { s: [0.02, 0.02, 0.05], p: [0.045, 0.02, 0.06], c: LIGHT },
      { s: [0.05, 0.09, 0.2], p: [0, -0.02, 0.3], c: 0x3c4a3a },
      { s: [0.07, 0.07, 0.15], p: [0, -0.1, 0.15], c: GLOVE },
    ],
    hip: [0.13, -0.145, -0.36], ads: [0, -0.07, -0.26], muzzle: [0, 0.01, -0.64],
  },
  pistol: {
    parts: [
      { s: [0.045, 0.055, 0.2], p: [0, 0, -0.02], c: DARK },
      { s: [0.04, 0.11, 0.055], p: [0, -0.075, 0.05], c: MID, r: [-0.25, 0, 0] },
      { s: [0.015, 0.015, 0.02], p: [0, 0.035, -0.1], c: ACC },
      { s: [0.065, 0.065, 0.12], p: [0, -0.12, 0.1], c: GLOVE, r: [-0.25, 0, 0] },
    ],
    hip: [0.11, -0.115, -0.32], ads: [0, -0.026, -0.34], muzzle: [0, 0.005, -0.13],
  },
  revolver: {
    parts: [
      { s: [0.045, 0.05, 0.16], p: [0, 0.005, -0.1], c: STEEL },
      { s: [0.06, 0.06, 0.07], p: [0, -0.005, 0.0], c: MID },
      { s: [0.04, 0.11, 0.05], p: [0, -0.08, 0.06], c: WOOD, r: [-0.3, 0, 0] },
      { s: [0.065, 0.065, 0.12], p: [0, -0.12, 0.11], c: GLOVE, r: [-0.3, 0, 0] },
    ],
    hip: [0.11, -0.115, -0.32], ads: [0, -0.022, -0.34], muzzle: [0, 0.005, -0.19],
  },
  knife: {
    parts: [
      { s: [0.012, 0.035, 0.2], p: [0, 0, -0.12], c: STEEL },
      { s: [0.006, 0.02, 0.04], p: [0, 0.02, -0.22], c: STEEL, r: [0.5, 0, 0] },
      { s: [0.04, 0.025, 0.02], p: [0, 0, -0.02], c: DARK },
      { s: [0.03, 0.035, 0.1], p: [0, 0, 0.04], c: ACC },
      { s: [0.065, 0.065, 0.12], p: [0, -0.01, 0.1], c: GLOVE },
    ],
    hip: [0.12, -0.13, -0.3], ads: [0.12, -0.13, -0.3], muzzle: [0, 0, -0.2],
  },
};

export class Viewmodel {
  constructor(scene) {
    this.root = new THREE.Group();
    scene.add(this.root);
    this.models = {};
    for (const [id, def] of Object.entries(MODELS)) {
      const mesh = new THREE.Mesh(boxesGeometry(def.parts), flatMat);
      mesh.scale.setScalar(VM_SCALE);
      mesh.visible = false;
      this.root.add(mesh);
      this.models[id] = mesh;
    }
    // Muzzle flash: two crossed additive quads
    const fg = new THREE.PlaneGeometry(0.12, 0.12);
    const fm = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.flash = new THREE.Group();
    const a = new THREE.Mesh(fg, fm), b = new THREE.Mesh(fg, fm), c = new THREE.Mesh(fg, fm);
    b.rotation.y = Math.PI / 2; c.rotation.x = Math.PI / 2;
    this.flash.add(a, b, c);
    this.flash.visible = false;
    this.root.add(this.flash);

    this.cur = null;
    this.t = 0;
    this.kick = 0;
    this.flashT = 0;
    this.stabT = 0; this.heavyT = 0; this.heavyWind = 0;
    this.swayX = 0; this.swayY = 0;
    this.bobPhase = 0;
    this.landDip = 0;
    this.visible = true;
  }

  setWeapon(id) {
    if (this.cur === id) return;
    for (const [k, m] of Object.entries(this.models)) m.visible = k === id;
    this.cur = id;
  }

  fire() { this.kick = 1; this.flashT = 0.045; this.flash.rotation.z = Math.random() * Math.PI; }
  stab() { this.stabT = 0.22; }
  heavyStart() { this.heavyWind = 0.35; }
  heavy() { this.heavyT = 0.3; this.heavyWind = 0; }
  land(v) { this.landDip = Math.min(0.06, v * 0.004); }

  /**
   * @param s { weapon, ws, speed, grounded, sliding, mdx, mdy }
   */
  update(dt, s) {
    this.setWeapon(s.weapon);
    const def = MODELS[s.weapon];
    const mesh = this.models[s.weapon];
    const w = WEAPONS[s.weapon];
    const ws = s.ws;
    this.t += dt;

    // ADS blend (sniper hides the model when scoped)
    const a = ws.adsT;
    const ease = a * a * (3 - 2 * a);
    const px = def.hip[0] + (def.ads[0] - def.hip[0]) * ease;
    const py = def.hip[1] + (def.ads[1] - def.hip[1]) * ease;
    const pz = def.hip[2] + (def.ads[2] - def.hip[2]) * ease;
    mesh.visible = this.visible && !(w.scope && a > 0.85);

    // Bob
    const moving = s.grounded && s.speed > 0.5 && !s.sliding;
    if (moving) this.bobPhase += dt * s.speed * M.bobFreq * 1.4;
    const bobAmt = moving ? Math.min(1, s.speed / 8) * (1 - ease * 0.85) : 0;
    const bx = Math.cos(this.bobPhase) * 0.012 * bobAmt;
    const by = -Math.abs(Math.sin(this.bobPhase)) * 0.014 * bobAmt;

    // Sway (lags behind look movement)
    const k = 1 - ease * 0.8;
    this.swayX += ((-s.mdx * 0.00035) * k - this.swayX) * Math.min(1, dt * 10);
    this.swayY += ((s.mdy * 0.00035) * k - this.swayY) * Math.min(1, dt * 10);
    this.swayX = Math.max(-0.05, Math.min(0.05, this.swayX));
    this.swayY = Math.max(-0.05, Math.min(0.05, this.swayY));

    // Fire kick
    this.kick = Math.max(0, this.kick - dt * 14);
    const kickZ = this.kick * (w.kind === 'gun' ? (w.id === 'sniper' || w.id === 'shotgun' ? 0.09 : 0.04) : 0);
    const kickRot = this.kick * (w.id === 'sniper' || w.id === 'shotgun' || w.id === 'revolver' ? 0.22 : 0.06);

    // Swap: come up from below
    const swapFrac = w.swap > 0 ? ws.swapT / w.swap : 0;
    // Reload: dip and roll
    let rl = 0;
    if (ws.reloadT > 0 && w.reload) rl = Math.sin((1 - ws.reloadT / w.reload) * Math.PI);

    // Knife animations
    let kz = 0, kRotX = 0, kRotY = 0;
    if (this.stabT > 0) { this.stabT -= dt; const t = 1 - this.stabT / 0.22; kz = -Math.sin(t * Math.PI) * 0.18; kRotX = -Math.sin(t * Math.PI) * 0.2; }
    if (this.heavyWind > 0) { this.heavyWind -= dt; const t = 1 - this.heavyWind / 0.35; kz = t * 0.06; kRotY = -t * 0.6; kRotX = t * 0.3; }
    if (this.heavyT > 0) { this.heavyT -= dt; const t = 1 - this.heavyT / 0.3; kz = -Math.sin(t * Math.PI) * 0.22; kRotY = -0.6 + t * 1.4; kRotX = 0.3 - t * 0.5; }

    this.landDip = Math.max(0, this.landDip - dt * 0.25);

    mesh.position.set(px + bx + this.swayX, py + by + this.swayY - swapFrac * 0.25 - rl * 0.1 - this.landDip, pz + kickZ + kz);
    mesh.rotation.set(kickRot + rl * 0.35 - swapFrac * 0.6 + kRotX, this.swayX * 2 + kRotY, rl * 0.6 + (s.sliding ? 0.12 : 0));

    // Flash at the muzzle
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flash.visible = mesh.visible || w.scope ? !(w.scope && a > 0.85) : false;
      const m = def.muzzle;
      const v = new THREE.Vector3(m[0], m[1], m[2]).multiplyScalar(VM_SCALE).applyEuler(mesh.rotation).add(mesh.position);
      this.flash.position.copy(v);
      this.flash.scale.setScalar(w.id === 'shotgun' || w.id === 'sniper' ? 1.6 : 1);
    } else this.flash.visible = false;
  }
}
