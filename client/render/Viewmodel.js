// First-person weapon rig: the detailed weapon models (client/models/weapons.js), gloved arms that hold
// them by their sockets, and procedural animation driven by the simulated weapon state:
//   equip / holster, reload (magazine out and in, pump racks, bolt cycles, cylinder swing), fire recoil,
//   pistol slide blowback and slide lock, revolver hammer and cylinder, sprint and slide poses, and for
//   the knife an idle sway, quick stab, heavy wind-up and swing.
// Effects line up with the model: the muzzle flash sits on the 'muzzle' socket and casings leave from
// the 'eject' socket (reported through `onEject`, the game turns them into world-space casings).
import * as THREE from 'three';
import { WEAPONS } from '../../shared/config/weapons.js';
import { aimView } from '../../shared/sim/weapons.js';
import { MOVEMENT as M } from '../../shared/config/movement.js';
import { weaponModel, findPart } from '../models/weapons.js';
import { Arm } from '../models/arms.js';

/**
 * Per weapon: rig scale, hip position of the bore (camera space), eye distance to the sight when aiming,
 * recoil [push back, muzzle climb], reload style, hand shapes, and the casing it ejects.
 */
const RIG = {
  rifle: { scale: 0.56, hip: [0.14, -0.118, -0.39], yaw: 0.06, ads: 0.155, kick: [0.03, 0.045], reload: 'mag', left: 'support', casing: 'rifle' },
  shotgun: { scale: 0.55, hip: [0.14, -0.115, -0.39], yaw: 0.06, ads: 0.12, kick: [0.07, 0.17], reload: 'shells', left: 'support', casing: 'shell' },
  sniper: { scale: 0.53, hip: [0.14, -0.118, -0.37], yaw: 0.06, ads: 0.11, kick: [0.08, 0.15], reload: 'bolt', left: 'support', casing: 'sniper' },
  pistol: { scale: 0.78, hip: [0.1, -0.085, -0.36], yaw: 0.06, ads: 0.3, elbows: [[0.13, -0.3, -0.2], [-0.08, -0.3, -0.22]], kick: [0.025, 0.12], reload: 'mag', left: 'pistol2', casing: 'pistol' },
  revolver: { scale: 0.78, hip: [0.1, -0.085, -0.36], yaw: 0.06, ads: 0.3, elbows: [[0.13, -0.3, -0.2], [-0.08, -0.3, -0.22]], kick: [0.04, 0.3], reload: 'cylinder', left: 'pistol2', casing: 'pistol' },
  knife: { scale: 0.85, hip: [0.14, -0.13, -0.3], yaw: 0, ads: 0, kick: [0, 0], reload: null, left: null, casing: null },
};
export const VM_RIG = RIG;

// Elbows stay fixed in camera space (below and behind the view); forearms stretch from wrist to elbow.
const ELBOW_R = new THREE.Vector3(0.21, -0.3, -0.13);
const ELBOW_L = new THREE.Vector3(-0.12, -0.3, -0.24);

// Hand placement relative to each socket (hand space: grip point at the origin, forward -Z)
const HAND_FIX = {
  grip: new THREE.Matrix4().makeRotationX(-0.32),
  support: new THREE.Matrix4(),
  pistol2: new THREE.Matrix4().makeRotationX(-0.25),
  knife: new THREE.Matrix4(),
};

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** 0 before a, 1 after b, smooth in between. */
const seg = (p, a, b) => smooth((p - a) / (b - a));
/** Rises a→b, holds, falls c→d. */
const bump = (p, a, b, c, d) => seg(p, a, b) * (1 - seg(p, c, d));
const lerp = (a, b, t) => a + (b - a) * t;

const HOLSTER = 0.12; // seconds spent lowering the old weapon before the new one comes up
const MIN_DRAW = 0.25;

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _inv = new THREE.Matrix4();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);

/** Matrix of `obj` relative to `root` (its ancestor), from local matrices. */
function relMatrix(obj, root, out) {
  out.identity();
  for (let o = obj; o && o !== root; o = o.parent) { o.updateMatrix(); out.premultiply(o.matrix); }
  return out;
}

/** Blend two transforms (position lerp, rotation slerp). */
function blendMatrix(a, b, t, out) {
  if (t <= 0) return out.copy(a);
  if (t >= 1) return out.copy(b);
  a.decompose(_v, _q, _s);
  b.decompose(_v2, _q2, _s);
  _v.lerp(_v2, t);
  _q.slerp(_q2, t);
  return out.compose(_v, _q, _s.set(1, 1, 1));
}

function flashTexture(kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.translate(32, 32);
  if (kind === 'star') {
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, 30);
    grad.addColorStop(0, 'rgba(255,255,240,1)');
    grad.addColorStop(0.25, 'rgba(255,214,120,0.95)');
    grad.addColorStop(1, 'rgba(255,120,30,0)');
    g.fillStyle = grad;
    g.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, r = i % 2 ? 11 : 30;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.fill();
  } else {
    // Flame tongue, base at the bottom edge of the texture
    const grad = g.createLinearGradient(0, 32, 0, -32);
    grad.addColorStop(0, 'rgba(255,250,220,1)');
    grad.addColorStop(0.4, 'rgba(255,190,90,0.85)');
    grad.addColorStop(1, 'rgba(255,110,30,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(-12, 32); g.quadraticCurveTo(-14, -4, 0, -32); g.quadraticCurveTo(14, -4, 12, 32);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildFlash() {
  const add = (map) => new THREE.MeshBasicMaterial({ map, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const starMat = add(flashTexture('star')), flameMat = add(flashTexture('flame'));
  const g = new THREE.Group();
  const star = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), starMat); // faces the camera (XY plane)
  const flameGeo = new THREE.PlaneGeometry(0.55, 1.4).translate(0, 0.7, 0).rotateX(-Math.PI / 2); // along -Z
  const f1 = new THREE.Mesh(flameGeo, flameMat), f2 = new THREE.Mesh(flameGeo, flameMat);
  f2.rotation.z = Math.PI / 2;
  g.add(star, f1, f2);
  g.visible = false;
  for (const m of [star, f1, f2]) m.renderOrder = 5;
  return g;
}

export class Viewmodel {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = 'viewmodel';
    scene.add(this.root);
    this.rig = new THREE.Group();
    this.root.add(this.rig);

    this.guns = {};
    for (const id of Object.keys(RIG)) {
      const model = weaponModel(id);
      model.visible = false;
      this.rig.add(model);
      const parts = {};
      for (const n of ['mag', 'bolt', 'pump', 'slide', 'hammer', 'cyl', 'bipod']) {
        const p = findPart(model, n);
        if (p) parts[n] = { obj: p, pos: p.position.clone(), quat: p.quaternion.clone() };
      }
      const sockets = {};
      model.traverse((o) => { if (!o.isMesh && o.type === 'Object3D' && o.name) sockets[o.name] = o; });
      model.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
      this.guns[id] = { id, model, parts, sockets };
    }
    this.right = new Arm(this.rig, 'grip', [0, 0, 0]);
    this.left = new Arm(this.rig, 'support', [0, 0, 0]);
    this.rig.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });

    this.flash = buildFlash();
    this.flashLight = new THREE.PointLight(0xffb060, 0, 1.6, 2);
    this.root.add(this.flashLight);
    // A shotgun shell the left hand carries while loading
    this.shell = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.05, 8).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xc23a2a, roughness: 0.5, flatShading: true }));
    this.shell.visible = false;

    this.visible = true;
    this.onEject = null; // (posCam: Vector3, velCam: Vector3, kind) → void
    this.onSound = null; // (name: pump|bolt|magOut|magIn|cylinder) → void
    this.cur = null;
    this.reset();
  }

  /** Clear every animation timer and spring (respawn, or the viewer seeking). */
  reset() {
    this.t = 0;
    this.kick = 0; this.kickVel = 0; this.kickYaw = 0;
    this.flashT = 0;
    this.slideKick = 0;
    this.stabT = 0; this.heavyT = 0; this.heavyWind = 0;
    this.swayX = 0; this.swayY = 0;
    this.bobPhase = 0;
    this.landDip = 0;
    this.sprintT = 0; this.slideT = 0; this.airT = 0;
    this.prev = null; this.swT = 9; this.drawDur = MIN_DRAW;
    this.cylAngle = 0;
    this.lastReloadP = -1; this.lastCycle = 9; this.ejectArmed = false;
    this.shellCount = 0;
  }

  setWeapon(id) {
    if (this.cur === id) return;
    this.prev = this.cur;
    this.cur = id;
    const w = WEAPONS[id];
    this.drawDur = Math.max(w.swap || 0, MIN_DRAW);
    this.swT = 0;
    this.stabT = this.heavyT = this.heavyWind = 0;
    this.ejectArmed = false;
    const gun = this.guns[id];
    gun.sockets.muzzle.add(this.flash);
    this.flash.visible = false;
    this.flashT = 0;
  }

  /** Play the equip animation again (spawn, round start). */
  draw() { this.prev = null; this.swT = 0.0; this.drawDur = Math.max(WEAPONS[this.cur]?.swap || 0, 0.35) + HOLSTER; }

  fire() {
    const cfg = RIG[this.cur];
    this.kickVel += 34;
    this.kickYaw = (Math.random() - 0.5) * 2;
    this.flashT = 0.05;
    this.flash.rotation.z = Math.random() * Math.PI;
    const big = this.cur === 'shotgun' || this.cur === 'sniper' || this.cur === 'revolver';
    this.flash.scale.setScalar((big ? 0.16 : 0.11) * (0.85 + Math.random() * 0.3));
    this.flashLight.intensity = big ? 2.2 : 1.4;
    if (this.cur === 'pistol') this.slideKick = 1;
    if (this.cur === 'rifle' || this.cur === 'pistol') this.eject(cfg.casing);
    else if (this.cur === 'shotgun' || this.cur === 'sniper') this.ejectArmed = true; // on the pump / bolt stroke
  }
  stab() { this.stabT = 0.24; this.heavyT = 0; this.heavyWind = 0; this.swT = Math.max(this.swT, 9); }
  heavyStart() { this.heavyWind = 0.35; this.swT = Math.max(this.swT, 9); }
  heavy() { this.heavyT = 0.32; this.heavyWind = 0; }
  land(v) { this.landDip = Math.min(0.05, v * 0.0035); }

  /** Report a casing leaving the eject socket (camera-space position and velocity). */
  eject(kind, n = 1) {
    if (!this.onEject || !kind) return;
    const s = this.guns[this.cur].sockets.eject;
    if (!s) return;
    this.rig.updateMatrix();
    for (let i = 0; i < n; i++) {
      relMatrix(s, this.root, _m);
      const pos = new THREE.Vector3().setFromMatrixPosition(_m);
      const vel = new THREE.Vector3(1.4 + Math.random() * 0.6, 1.1 + Math.random() * 0.6, 0.35 + Math.random() * 0.3);
      if (kind === 'revolver') vel.set((Math.random() - 0.5) * 0.4, -0.6 - Math.random() * 0.5, (Math.random() - 0.5) * 0.4);
      else vel.applyQuaternion(this.rig.quaternion);
      this.onEject(pos, vel, kind === 'revolver' ? 'pistol' : kind);
    }
  }

  sound(name) { this.onSound?.(name); }

  /** Muzzle position in camera space (for tracers). */
  muzzleCam(out = new THREE.Vector3()) {
    const s = this.guns[this.cur]?.sockets.muzzle;
    if (!s) return out.set(0.1, -0.08, -0.6);
    relMatrix(s, this.root, _m);
    return out.setFromMatrixPosition(_m);
  }

  /** Move an animated part by a local offset/rotation from its rest pose. */
  partPose(gun, name, dx = 0, dy = 0, dz = 0, rx = 0, ry = 0, rz = 0) {
    const p = gun.parts[name];
    if (!p) return;
    _v.set(dx, dy, dz).applyQuaternion(p.quat);
    p.obj.position.copy(p.pos).add(_v);
    p.obj.quaternion.copy(p.quat);
    if (rx || ry || rz) p.obj.quaternion.multiply(_q.setFromEuler(new THREE.Euler(rx, ry, rz)));
  }

  /**
   * @param s { weapon, ws, speed, grounded, sliding, sprint, mdx, mdy }
   */
  update(dt, s) {
    this.setWeapon(s.weapon);
    const ws = s.ws;
    this.t += dt;
    this.swT += dt;

    // Which model is on screen: the old one while it is being put away, then the new one
    const holstering = this.prev && this.swT < HOLSTER;
    const id = holstering ? this.prev : this.cur;
    const gun = this.guns[id];
    const cfg = RIG[id];
    const w = WEAPONS[id];
    for (const g of Object.values(this.guns)) g.model.visible = g === gun;

    const aim = aimView(ws);
    const a = holstering ? 0 : aim.ads;
    const ease = a * a * (3 - 2 * a);
    const shown = this.visible && !aim.scoped;
    this.root.visible = shown;

    // ---- base pose: hip → aiming down the sights (the 'sight' socket on the eye line)
    const sc = cfg.scale;
    const sight = gun.sockets.sight;
    const adsX = sight ? -sight.position.x * sc : cfg.hip[0];
    const adsY = sight ? -sight.position.y * sc : cfg.hip[1];
    const adsZ = sight ? -cfg.ads - sight.position.z * sc : cfg.hip[2];
    let px = lerp(cfg.hip[0], adsX, ease), py = lerp(cfg.hip[1], adsY, ease), pz = lerp(cfg.hip[2], adsZ, ease);
    let rx = 0, ry = cfg.yaw * (1 - ease), rz = 0;

    // ---- movement: bob, sway, landing dip, sprint and slide poses
    const moving = s.grounded && s.speed > 0.5 && !s.sliding;
    if (moving) this.bobPhase += dt * s.speed * M.bobFreq * 1.4;
    const knife = w.kind === 'melee';
    const bobAmt = moving ? Math.min(1, s.speed / 8) * (1 - ease * 0.85) * (knife ? 1.6 : 1) : 0;
    px += Math.cos(this.bobPhase) * 0.011 * bobAmt;
    py -= Math.abs(Math.sin(this.bobPhase)) * 0.013 * bobAmt;
    rz += Math.cos(this.bobPhase) * 0.02 * bobAmt;

    const k = 1 - ease * 0.8;
    this.swayX += ((-s.mdx * 0.00035) * k - this.swayX) * Math.min(1, dt * 10);
    this.swayY += ((s.mdy * 0.00035) * k - this.swayY) * Math.min(1, dt * 10);
    this.swayX = Math.max(-0.04, Math.min(0.04, this.swayX));
    this.swayY = Math.max(-0.04, Math.min(0.04, this.swayY));
    px += this.swayX; py += this.swayY; ry += this.swayX * 2; rx -= this.swayY * 1.2;

    this.landDip = Math.max(0, this.landDip - dt * 0.2);
    py -= this.landDip;

    const sprinting = s.sprint && moving && s.speed > M.walkSpeed * 0.92 && ws.sinceShot > 0.35 && a < 0.05 && ws.reloadT <= 0;
    this.sprintT += ((sprinting ? 1 : 0) - this.sprintT) * Math.min(1, dt * 9);
    this.slideT += ((s.sliding ? 1 : 0) - this.slideT) * Math.min(1, dt * 10);
    this.airT += ((!s.grounded && !s.sliding ? 1 : 0) - this.airT) * Math.min(1, dt * 6);
    const sp = this.sprintT * (1 - ease);
    if (knife) {
      // Knife run: the arm pumps with the stride
      py += sp * (0.01 + Math.sin(this.bobPhase * 2) * 0.012);
      rx += sp * (0.25 + Math.sin(this.bobPhase * 2) * 0.12);
    } else {
      px -= sp * 0.01; py -= sp * 0.03;
      rx -= sp * 0.35; ry += sp * 0.45; rz += sp * 0.6;
    }
    const sl = this.slideT * (1 - ease * 0.7);
    px -= sl * 0.012; py -= sl * 0.022; rz += sl * 0.32; ry += sl * 0.06;
    py += this.airT * 0.008 * (1 - ease); rx += this.airT * 0.04 * (1 - ease);

    // ---- fire kick: a damped spring (slight overshoot), less while aiming
    // (fixed substeps keep the spring stable at any frame rate)
    for (let n = Math.min(40, Math.ceil(dt / (1 / 240))), h = dt / Math.max(1, n), i = 0; i < n; i++) {
      this.kickVel += (-this.kick * 330 - this.kickVel * 25) * h;
      this.kick += this.kickVel * h;
    }
    const kk = this.kick * (1 - ease * 0.45);
    pz += kk * cfg.kick[0];
    rx += kk * cfg.kick[1];
    ry += kk * this.kickYaw * cfg.kick[1] * 0.15;
    py += kk * cfg.kick[1] * 0.04;

    // ---- equip / holster
    if (holstering) {
      const h = smooth(this.swT / HOLSTER);
      py -= h * h * 0.22; rx -= h * 0.8; rz += h * 0.25;
    } else if (this.swT < this.drawDur + (this.prev ? HOLSTER : 0)) {
      const start = this.prev ? HOLSTER : 0;
      const e = 1 - smooth((this.swT - start) / this.drawDur);
      py -= e * e * 0.24; rx -= e * 0.75; rz -= e * 0.35; px += e * 0.03;
    }

    // ---- knife: idle sway, stab, heavy wind-up and swing
    if (knife) {
      px += Math.sin(this.t * 1.3) * 0.004; py += Math.sin(this.t * 2.1) * 0.003;
      rz += Math.sin(this.t * 0.9) * 0.035; rx += Math.sin(this.t * 1.7) * 0.02;
      // resting hold: tip forward and a little up/left, edge down
      rx += 0.12; ry += 0.22; rz -= 0.18;
      if (this.stabT > 0) {
        this.stabT -= dt;
        const t = 1 - Math.max(0, this.stabT) / 0.24;
        const out = t < 0.35 ? smooth(t / 0.35) : 1 - smooth((t - 0.35) / 0.65);
        pz -= out * 0.17; py += out * 0.02; px -= out * 0.04; ry -= out * 0.2; rx -= out * 0.08;
      }
      if (this.heavyWind > 0 || ws.windupT > 0) {
        this.heavyWind = Math.max(0, this.heavyWind - dt);
        const t = smooth(1 - Math.max(this.heavyWind, ws.windupT || 0) / 0.35);
        px += t * 0.05; py += t * 0.09; pz += t * 0.05; rx += t * 0.95; rz -= t * 0.55; ry -= t * 0.25;
      } else if (this.heavyT > 0) {
        this.heavyT -= dt;
        const t = 1 - Math.max(0, this.heavyT) / 0.32;
        const sw = smooth(Math.min(1, t / 0.55)); // the slash
        const back = smooth((t - 0.55) / 0.45); // recover to the resting hold
        const f = (v0, v1) => lerp(lerp(v0, v1, sw), 0, back);
        px += f(0.05, -0.2); py += f(0.09, -0.12); pz += f(0.05, -0.08);
        rx += f(0.95, -0.4); ry += f(-0.25, 1.0); rz += f(-0.55, 0.7);
      }
    }

    // ---- reloads and action cycling
    const reloading = !holstering && ws.reloadT > 0 && w.reload > 0;
    const p = reloading ? 1 - ws.reloadT / w.reload : -1;
    let leftW = 0, leftTarget = null, rightW = 0, rightTarget = null, leftAway = 0;
    for (const n of Object.keys(gun.parts)) this.partPose(gun, n); // rest
    this.shell.visible = false;

    if (reloading) {
      const tilt = bump(p, 0, 0.14, 0.82, 0.97);
      if (cfg.reload === 'mag' || cfg.reload === 'bolt') {
        // roll the magwell towards the camera and bring the gun in
        rz -= tilt * 0.55; rx += tilt * 0.22; ry += tilt * 0.3; px -= tilt * 0.05; py += tilt * 0.02; pz += tilt * 0.03;
        const m0 = cfg.reload === 'bolt' ? 0.24 : 0.15;
        let my;
        if (p < 0.4) my = -0.24 * seg(p, m0, m0 + 0.16);
        else my = lerp(-0.24, -0.03, seg(p, 0.42, 0.6)) * (1 - seg(p, 0.63, 0.69));
        this.partPose(gun, 'mag', 0, my, 0, -my * (id === 'pistol' ? 0.3 : 1.2), 0, 0);
        leftW = bump(p, m0 - 0.08, m0, 0.7, 0.8);
        leftTarget = 'magHand';
        py += bump(p, 0.62, 0.66, 0.67, 0.73) * 0.012; // magazine seated
        if (this.lastReloadP < m0 && p >= m0) this.sound('magOut');
        if (this.lastReloadP < 0.66 && p >= 0.66) this.sound('magIn');
        if (id === 'rifle') { rx -= bump(p, 0.75, 0.79, 0.8, 0.86) * 0.06; } // bolt release slap
        if (id === 'pistol') {
          const locked = ws.ammo[ws.cur] === 0 && p < 0.78;
          this.partPose(gun, 'slide', 0, 0, locked ? 0.028 : 0);
          if (p > 0.78) py += bump(p, 0.78, 0.8, 0.8, 0.86) * 0.01;
        }
        if (cfg.reload === 'bolt') {
          const open = seg(p, 0.04, 0.12), back = seg(p, 0.12, 0.2), fwd = seg(p, 0.74, 0.8), down = seg(p, 0.8, 0.86);
          this.partPose(gun, 'bolt', 0, 0, 0.07 * (back - fwd), 0, 0, 1.1 * (open - down));
          rightW = Math.max(bump(p, 0.0, 0.05, 0.2, 0.26), bump(p, 0.68, 0.74, 0.86, 0.92));
          rightTarget = 'boltHand';
          if ((this.lastReloadP < 0.12 && p >= 0.12) || (this.lastReloadP < 0.8 && p >= 0.8)) this.sound('bolt');
        }
      } else if (cfg.reload === 'shells') {
        rz -= tilt * 0.6; rx += tilt * 0.12; ry += tilt * 0.2; px -= tilt * 0.04; py += tilt * 0.02;
        const n = Math.max(1, Math.min(6, w.mag - ws.ammo[ws.cur]));
        const L = 0.62 / n;
        if (p > 0.12 && p < 0.12 + 0.62) {
          const u = ((p - 0.12) % L) / L;
          leftTarget = 'load';
          leftW = 1;
          leftAway = 1 - bump(u, 0.05, 0.5, 0.62, 1.0);
          this.shell.visible = u < 0.58;
          py += bump(u, 0.45, 0.52, 0.55, 0.62) * 0.006;
        } else {
          leftW = 0;
          leftAway = bump(p, 0.04, 0.12, 0.74, 0.8);
        }
        if (p > 0.12 && p < 0.74 && this.lastReloadP > 0.12) {
          const u0 = ((this.lastReloadP - 0.12) % L) / L, u1 = ((p - 0.12) % L) / L;
          if (u0 < 0.5 && u1 >= 0.5) this.sound('magIn');
        }
        const back = seg(p, 0.82, 0.87), fwd = seg(p, 0.88, 0.93);
        this.partPose(gun, 'pump', 0, 0, 0.075 * (back - fwd));
        rx -= bump(p, 0.82, 0.86, 0.88, 0.94) * 0.04;
        if (this.lastReloadP < 0.82 && p >= 0.82) this.sound('pump');
      } else if (cfg.reload === 'cylinder') {
        rz += tilt * 0.6; rx += tilt * 0.2;
        rx += bump(p, 0.22, 0.3, 0.38, 0.46) * 0.75; // muzzle up so the empties fall out
        const open = seg(p, 0.1, 0.2) * (1 - seg(p, 0.72, 0.8));
        this.partPose(gun, 'cyl', -0.032 * open, -0.006 * open, 0, 0, 0, this.cylAngle);
        if (this.lastReloadP < 0.33 && p >= 0.33) this.eject('revolver', Math.max(1, w.mag - ws.ammo[ws.cur]));
        leftTarget = 'load';
        leftW = Math.max(bump(p, 0.18, 0.26, 0.34, 0.4), bump(p, 0.5, 0.6, 0.68, 0.74));
        leftAway = bump(p, 0.38, 0.44, 0.5, 0.58);
        if (this.lastReloadP < 0.79 && p >= 0.79) { this.cylAngle = 0; this.sound('cylinder'); }
        if (this.lastReloadP < 0.12 && p >= 0.12) this.sound('cylinder');
        if (this.lastReloadP < 0.58 && p >= 0.58) this.sound('magIn');
      }
    }
    this.lastReloadP = p;

    // Pump and bolt strokes after a shot; pistol slide blowback; revolver hammer and cylinder
    if (!holstering && !reloading && w.kind === 'gun') {
      const c = ws.sinceShot / w.fireInterval;
      const c0 = this.lastCycle;
      this.lastCycle = c;
      if (id === 'shotgun' && c0 < 0.22 && c >= 0.22) this.sound('pump');
      if (id === 'sniper' && c0 < 0.3 && c >= 0.3) this.sound('bolt');
      if (id === 'shotgun' && c < 1) {
        const back = seg(c, 0.22, 0.36), fwd = seg(c, 0.4, 0.54);
        this.partPose(gun, 'pump', 0, 0, 0.075 * (back - fwd));
        pz += 0.008 * (back - fwd); rx -= 0.025 * bump(c, 0.22, 0.36, 0.4, 0.54);
        if (this.ejectArmed && c >= 0.36) { this.ejectArmed = false; this.eject('shell'); }
      }
      if (id === 'sniper' && c < 1) {
        const lift = seg(c, 0.25, 0.34), back = seg(c, 0.34, 0.44), fwd = seg(c, 0.48, 0.58), down = seg(c, 0.58, 0.67);
        this.partPose(gun, 'bolt', 0, 0, 0.07 * (back - fwd), 0, 0, 1.1 * (lift - down));
        rightW = bump(c, 0.12, 0.24, 0.68, 0.82);
        rightTarget = 'boltHand';
        rz += 0.1 * bump(c, 0.15, 0.3, 0.6, 0.8);
        if (this.ejectArmed && c >= 0.43) { this.ejectArmed = false; this.eject('sniper'); }
      }
      if (id === 'revolver') {
        const target = -(w.mag - ws.ammo[ws.cur]) * (Math.PI / 3);
        this.cylAngle += (target - this.cylAngle) * Math.min(1, dt * 18);
        this.partPose(gun, 'cyl', 0, 0, 0, 0, 0, this.cylAngle);
        const cocked = seg(c, 0.3, 0.7);
        this.partPose(gun, 'hammer', 0, 0, 0, -0.5 * cocked, 0, 0);
      }
    }
    if (id === 'revolver' && reloading) this.partPose(gun, 'hammer', 0, 0, 0, -0.5, 0, 0);
    if (id === 'pistol' && !reloading) {
      this.slideKick = Math.max(0, this.slideKick - dt / 0.07);
      const locked = ws.ammo[ws.cur] === 0 && !holstering;
      const kick = Math.sin(this.slideKick * Math.PI) * 0.028;
      this.partPose(gun, 'slide', 0, 0, locked ? 0.028 : kick);
      this.partPose(gun, 'hammer', 0, 0, 0, -0.5 * Math.min(1, this.slideKick * 2 + (locked ? 1 : 0)), 0, 0);
    }

    // ---- apply the rig transform
    this.rig.position.set(px, py, pz);
    this.rig.rotation.set(rx, ry, rz);
    this.rig.scale.setScalar(sc);
    this.rig.updateMatrix();
    this.rig.updateMatrixWorld(true);
    _inv.copy(this.rig.matrix).invert();

    // ---- hands on the sockets
    const handM = (name, kind, out) => {
      const so = gun.sockets[name];
      if (!so) return null;
      relMatrix(so, this.rig, out);
      return out.multiply(HAND_FIX[kind] || HAND_FIX.support);
    };
    const rKind = knife ? 'knife' : 'grip';
    this.right.setKind(rKind);
    if (cfg.elbows) this.right.elbow.set(...cfg.elbows[0]).applyMatrix4(_inv);
    else this.right.elbow.copy(ELBOW_R).applyMatrix4(_inv);
    const rm = handM('grip', rKind, new THREE.Matrix4());
    if (rm) {
      if (rightW > 0 && rightTarget && gun.sockets[rightTarget]) {
        const t = handM(rightTarget, 'support', new THREE.Matrix4());
        blendMatrix(rm, t, rightW, rm);
      }
      this.right.place(rm);
    } else this.right.hide();

    if (cfg.left && !knife) {
      this.left.setKind(cfg.left);
      if (cfg.elbows) this.left.elbow.set(...cfg.elbows[1]).applyMatrix4(_inv);
      else this.left.elbow.copy(ELBOW_L).applyMatrix4(_inv);
      const lm = handM('support', cfg.left, new THREE.Matrix4());
      if (lm) {
        if (leftW > 0 && leftTarget && gun.sockets[leftTarget]) blendMatrix(lm, handM(leftTarget, cfg.left, _m2), leftW, lm);
        if (leftAway > 0) {
          // hand drops out of view (to a pouch) and comes back
          _m.makeTranslation(-0.06 * leftAway, -0.32 * leftAway, 0.12 * leftAway);
          lm.premultiply(_m);
        }
        this.left.place(lm);
        if (this.shell.visible) { this.left.hand.add(this.shell); this.shell.position.set(0.0, 0.03, -0.03); }
      } else this.left.hide();
    } else this.left.hide();

    // ---- muzzle flash
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flash.visible = shown && !holstering;
      this.flash.updateMatrixWorld(true);
      this.flash.getWorldPosition(this.flashLight.position);
      this.root.worldToLocal(this.flashLight.position);
    } else {
      this.flash.visible = false;
    }
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 40);
  }
}
