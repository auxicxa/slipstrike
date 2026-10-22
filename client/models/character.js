// Low-poly humanoid characters: blocky parts rigidly skinned to a bone hierarchy, so a whole player is
// ONE SkinnedMesh (three draw calls: body, team accent, team glow) while every limb still moves on its
// own. Geometry is built once per outfit/skin variant and shared by every player wearing it.
//
//   root → hips → spine → chest → neck → head
//                              chest → upperArm{L,R} → forearm{L,R} → hand{L,R}
//                              chest → aim (weapon mount, follows the aim pitch)
//               hips → thigh{L,R} → shin{L,R} → foot{L,R}
//
// Dimensions match the hitboxes in shared/config/weapons.js (HITBOX): legs up to 0.47 h, body to
// 0.80 h, head above; the model is posed and then scaled so its head top sits at the player height h.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { cbox, sphere } from './kit.js';

// ------------------------------------------------------------------ skeleton (rest pose, parent space)
const BONES = [
  ['root', null, [0, 0, 0]],
  ['hips', 'root', [0, 0.93, 0]],
  ['spine', 'hips', [0, 0.09, 0]],
  ['chest', 'spine', [0, 0.2, 0]],
  ['neck', 'chest', [0, 0.22, 0]],
  ['head', 'neck', [0, 0.05, 0]],
  ['upperArmL', 'chest', [-0.215, 0.17, 0]],
  ['forearmL', 'upperArmL', [0, -0.28, 0]],
  ['handL', 'forearmL', [0, -0.25, 0]],
  ['upperArmR', 'chest', [0.215, 0.17, 0]],
  ['forearmR', 'upperArmR', [0, -0.28, 0]],
  ['handR', 'forearmR', [0, -0.25, 0]],
  ['thighL', 'hips', [-0.1, -0.03, 0]],
  ['shinL', 'thighL', [0, -0.42, 0]],
  ['footL', 'shinL', [0, -0.41, 0]],
  ['thighR', 'hips', [0.1, -0.03, 0]],
  ['shinR', 'thighR', [0, -0.42, 0]],
  ['footR', 'shinR', [0, -0.41, 0]],
];
const BONE_INDEX = Object.fromEntries(BONES.map((b, i) => [b[0], i]));
const UPPER = 0.28, LOWER = 0.25 + 0.05; // arm segment lengths (lower includes the palm)
export const HEAD_TOP = 1.8;

/** Rest-pose world position of every bone. */
const REST_WORLD = (() => {
  const out = {};
  for (const [name, parent, p] of BONES) {
    const base = parent ? out[parent] : [0, 0, 0];
    out[name] = [base[0] + p[0], base[1] + p[1], base[2] + p[2]];
  }
  return out;
})();

// ------------------------------------------------------------------ outfits
export const OUTFITS = [
  { name: 'Operator', fabric: 0x3a3f47, fabric2: 0x30353c, armor: 0x262a31, boot: 0x1b1c20, glove: 0x23262c, head: 'helmet' },
  { name: 'Scout', fabric: 0x4f5440, fabric2: 0x41452f, armor: 0x8a7556, boot: 0x3a2f25, glove: 0x6b5a43, head: 'cap' },
  { name: 'Heavy', fabric: 0x2f3a4a, fabric2: 0x27313f, armor: 0x3b4250, boot: 0x1b1c20, glove: 0x23262c, head: 'mask' },
];
export const SKINS = [0xe0b48f, 0xa8714a, 0x6b4630];

const ACCENT = 'accent', GLOW = 'glow';

function buildGeometry(outfit, skin) {
  const o = OUTFITS[outfit];
  const groups = { body: [], [ACCENT]: [], [GLOW]: [] };
  const col = new THREE.Color();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  /** Add a piece to `bone` at a position relative to the bone's rest position. */
  const add = (bone, geo, paint, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) => {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const w = REST_WORLD[bone];
    e.set(rot[0], rot[1], rot[2]);
    m4.compose(p.set(w[0] + pos[0], w[1] + pos[1], w[2] + pos[2]), q.setFromEuler(e), s.set(scl[0], scl[1], scl[2]));
    g.applyMatrix4(m4);
    const n = g.attributes.position.count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), c = new Float32Array(n * 3);
    col.set(typeof paint === 'number' ? paint : 0xffffff);
    for (let i = 0; i < n; i++) {
      si[i * 4] = BONE_INDEX[bone]; sw[i * 4] = 1;
      c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    groups[typeof paint === 'number' ? 'body' : paint].push(g);
  };
  const heavy = o.head === 'mask';

  // Hips: pelvis, belt with buckle, side pouches
  add('hips', cbox(0.31, 0.17, 0.2, 0.03), o.fabric2, [0, -0.01, 0]);
  add('hips', cbox(0.33, 0.05, 0.22, 0.012), o.armor, [0, 0.07, 0]);
  add('hips', cbox(0.06, 0.04, 0.02, 0.006), ACCENT, [0, 0.07, -0.115]);
  for (const sx of [-1, 1]) add('hips', cbox(0.06, 0.08, 0.08, 0.012), o.armor, [sx * 0.17, 0.02, 0.02]);
  // Abdomen and chest with a plate carrier
  add('spine', cbox(0.28, 0.2, 0.18, 0.03), o.fabric, [0, 0.1, 0]);
  add('chest', cbox(0.36, 0.25, 0.22, 0.04), o.fabric, [0, 0.11, 0]);
  const vest = heavy ? 0.065 : 0.045;
  add('chest', cbox(0.32, 0.25, vest, 0.012), o.armor, [0, 0.09, -0.11 - vest / 2 + 0.01]);
  add('chest', cbox(0.32, 0.26, vest, 0.012), o.armor, [0, 0.1, 0.11 + vest / 2 - 0.01]);
  for (const sx of [-1, 1]) add('chest', cbox(0.08, 0.08, 0.03, 0.01), o.fabric2, [sx * 0.09, 0.0, -0.14 - vest / 2]); // mag pouches
  add('chest', cbox(0.33, 0.032, 0.012), ACCENT, [0, 0.19, -0.115 - vest + 0.005]);
  add('chest', cbox(0.14, 0.022, 0.01), GLOW, [0, 0.06, -0.12 - vest - 0.002]);
  add('chest', cbox(0.2, 0.022, 0.01), GLOW, [0, 0.17, 0.12 + vest - 0.004]);
  add('chest', cbox(0.2, 0.05, 0.16, 0.015), o.fabric2, [0, 0.235, 0]); // collar
  const pad = heavy ? 1.3 : 1;
  for (const sx of [-1, 1]) add('chest', cbox(0.13 * pad, 0.06 * pad, 0.15 * pad, 0.015), ACCENT, [sx * 0.215, 0.2, 0], [0, 0, -sx * 0.3]);
  // Neck and head
  add('neck', cbox(0.1, 0.08, 0.1, 0.02), heavy ? o.fabric2 : skin, [0, 0.02, 0]);
  add('head', cbox(0.19, 0.21, 0.21, 0.04), heavy ? o.armor : skin, [0, 0.12, 0]);
  if (o.head === 'helmet') {
    add('head', sphere(0.13, 8, 5), o.armor, [0, 0.18, 0.012], [0, 0, 0], [1.02, 0.82, 1.06]);
    add('head', cbox(0.25, 0.03, 0.25, 0.008), o.armor, [0, 0.15, 0.012]);
    add('head', cbox(0.2, 0.06, 0.04, 0.01), GLOW, [0, 0.135, -0.1]); // visor
    add('head', cbox(0.03, 0.02, 0.22, 0.004), ACCENT, [0, 0.276, 0.01]);
    for (const sx of [-1, 1]) add('head', cbox(0.035, 0.07, 0.07, 0.01), o.fabric2, [sx * 0.115, 0.115, 0.01]);
  } else if (o.head === 'cap') {
    add('head', cbox(0.21, 0.07, 0.22, 0.02), o.fabric2, [0, 0.245, 0.005]);
    add('head', cbox(0.19, 0.012, 0.09, 0.004), o.fabric2, [0, 0.215, -0.13]); // brim
    add('head', cbox(0.2, 0.05, 0.035, 0.01), GLOW, [0, 0.15, -0.1]); // goggles
    add('head', cbox(0.215, 0.02, 0.2, 0.004), ACCENT, [0, 0.15, 0.015]); // goggle strap
    add('head', cbox(0.03, 0.06, 0.06, 0.01), o.armor, [0.11, 0.12, 0.01]); // radio earpiece
  } else {
    add('head', sphere(0.135, 8, 5), o.armor, [0, 0.17, 0.01], [0, 0, 0], [1.02, 0.95, 1.08]);
    add('head', cbox(0.22, 0.085, 0.05, 0.012), GLOW, [0, 0.14, -0.11]); // wide visor
    add('head', cbox(0.16, 0.06, 0.05, 0.012), o.fabric2, [0, 0.06, -0.1]); // respirator
    add('head', cbox(0.03, 0.02, 0.24, 0.004), ACCENT, [0, 0.29, 0.01]);
  }
  // Arms
  for (const L of ['L', 'R']) {
    const sx = L === 'L' ? -1 : 1;
    add('upperArm' + L, cbox(0.11, 0.27, 0.12, 0.025), o.fabric, [0, -0.13, 0]);
    add('upperArm' + L, cbox(0.118, 0.03, 0.128, 0.006), ACCENT, [0, -0.06, 0]);
    add('forearm' + L, cbox(0.1, 0.24, 0.105, 0.022), o.fabric, [0, -0.12, 0]);
    add('forearm' + L, cbox(0.108, 0.1, 0.112, 0.015), o.armor, [0, -0.16, 0]);
    add('hand' + L, cbox(0.08, 0.1, 0.095, 0.02), o.glove, [0, -0.05, 0]);
    // Legs
    add('thigh' + L, cbox(0.16, 0.42, 0.18, 0.035), o.fabric2, [0, -0.2, 0]);
    if (L === 'R') add('thighR', cbox(0.05, 0.14, 0.1, 0.012), o.armor, [0.1, -0.13, 0]); // holster
    add('shin' + L, cbox(0.13, 0.36, 0.15, 0.03), o.fabric2, [0, -0.17, 0]);
    add('shin' + L, cbox(0.12, 0.11, 0.05, 0.015), o.armor, [0, -0.03, -0.085]); // knee pad
    add('shin' + L, cbox(0.012, 0.05, 0.02, 0.003), ACCENT, [sx * 0.0, -0.03, -0.112]);
    add('shin' + L, cbox(0.145, 0.12, 0.165, 0.025), o.boot, [0, -0.34, 0]);
    add('foot' + L, cbox(0.14, 0.09, 0.27, 0.025), o.boot, [0, -0.025, -0.05]);
  }

  const parts = [groups.body, groups[ACCENT], groups[GLOW]].map((list) => mergeGeometries(list, false));
  for (const list of Object.values(groups)) for (const g of list) g.dispose();
  const merged = mergeGeometries(parts, true); // groups: 0 body, 1 accent, 2 glow
  for (const g of parts) g.dispose();
  merged.computeBoundingSphere();
  merged.boundingSphere.radius += 0.6; // poses reach outside the rest-pose bounds
  return merged;
}

// ------------------------------------------------------------------ materials
const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.82, metalness: 0.06 });
const accentMats = new Map(), glowMats = new Map();
export function accentMaterial(color) {
  if (!accentMats.has(color)) {
    accentMats.set(color, new THREE.MeshStandardMaterial({
      color, flatShading: true, roughness: 0.5, metalness: 0.15, emissive: new THREE.Color(color).multiplyScalar(0.18),
    }));
  }
  return accentMats.get(color);
}
export function glowMaterial(color) {
  if (!glowMats.has(color)) {
    const c = new THREE.Color(color);
    // saturated: strong emissive values wash out to white under ACES tone mapping
    glowMats.set(color, new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.9, roughness: 0.4, flatShading: true }));
  }
  return glowMats.get(color);
}

// ------------------------------------------------------------------ templates
const templates = new Map();
function template(outfit, skin) {
  const key = outfit + ':' + skin;
  if (templates.has(key)) return templates.get(key);
  const bones = BONES.map(([name, , p]) => { const b = new THREE.Bone(); b.name = name; b.position.set(p[0], p[1], p[2]); return b; });
  BONES.forEach(([, parent], i) => { if (parent) bones[BONE_INDEX[parent]].add(bones[i]); });
  const mesh = new THREE.SkinnedMesh(buildGeometry(outfit, SKINS[skin]), [bodyMat, accentMaterial(0x888888), glowMaterial(0x888888)]);
  mesh.add(bones[0]);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.name = 'character';
  templates.set(key, mesh);
  return mesh;
}

// ------------------------------------------------------------------ pose channels
// Every animated value lives in one Float32Array so poses can be blended with a single loop.
const ROT_BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'upperArmL', 'forearmL', 'upperArmR', 'forearmR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
const CH = {};
ROT_BONES.forEach((b, i) => { CH[b] = i * 3; });
const EXTRA = ROT_BONES.length * 3;
const HIPS_Y = EXTRA, HIPS_Z = EXTRA + 1, ROOT_ROLL = EXTRA + 2, ROOT_PITCH = EXTRA + 3, N_CH = EXTRA + 4;
const newPose = () => new Float32Array(N_CH);
const setR = (P, bone, x = 0, y = 0, z = 0) => { const i = CH[bone]; P[i] = x; P[i + 1] = y; P[i + 2] = z; };
const addR = (P, bone, x = 0, y = 0, z = 0) => { const i = CH[bone]; P[i] += x; P[i + 1] += y; P[i + 2] += z; };
const blend = (A, B, t) => { if (t <= 0) return; if (t >= 1) { A.set(B); return; } for (let i = 0; i < N_CH; i++) A[i] += (B[i] - A[i]) * t; };
const approach = (cur, target, rate, dt) => cur + (target - cur) * Math.min(1, rate * dt);

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * One animated character. `update(s, dt)` takes the movement/aim state:
 *   { speed, moveAngle (rad, 0 = forward, +π/2 = right), grounded, vy, crouch (0–1), sliding,
 *     wallRun (-1 wall on the left, 1 right, 0 none), dashing, pitch, hold ('long'|'pistol'|'knife'),
 *     alive }
 */
export class Character {
  constructor(outfit = 0, skin = 0, teamColor = 0x888888) {
    this.outfit = outfit % OUTFITS.length;
    this.skin = skin % SKINS.length;
    this.mesh = cloneSkinned(template(this.outfit, this.skin));
    this.mesh.frustumCulled = true;
    this.bones = {};
    this.mesh.traverse((o) => { if (o.isBone) this.bones[o.name] = o; });
    this.aim = new THREE.Object3D(); // weapon mount: at the right shoulder pocket, rotated to the aim
    this.aim.name = 'aim';
    this.aim.position.set(0.13, 0.17, -0.1);
    this.bones.chest.add(this.aim);
    this.setTeamColor(teamColor);
    this.phase = 0; this.t = 0;
    this.w = { run: 0, air: 0, slide: 0, wall: 0, dash: 0, knife: 0 };
    this.wallSide = 0;
    this.hipYaw = 0;
    this.deathT = -1; this.deathDir = 1;
    this.kick = 0;
    this.P = newPose(); this.T = newPose();
    this.ikTargets = { R: null, L: null };
  }

  setTeamColor(color) {
    if (color === this.color) return;
    this.color = color;
    this.mesh.material = [bodyMat, accentMaterial(color), glowMaterial(color)];
  }

  /** Small recoil kick of the upper body when this player fires. */
  fire(strength = 1) { this.kick = Math.min(1.5, this.kick + strength); }

  /** Start the death animation (fall direction: 1 backwards, -1 forwards). */
  die(dir = Math.random() < 0.7 ? 1 : -1) { if (this.deathT < 0) { this.deathT = 0; this.deathDir = dir; } }
  revive() { this.deathT = -1; }
  get dead() { return this.deathT >= 0; }

  /** Build the target pose for this frame. */
  computePose(s, dt) {
    const P = this.T;
    P.fill(0);
    this.t += dt;
    const w = this.w;
    const speed = s.speed || 0;
    const grounded = s.grounded !== false;
    w.run = approach(w.run, grounded && !s.sliding ? Math.min(1, speed / 7) : 0, 8, dt);
    w.air = approach(w.air, !grounded && !s.sliding && !s.wallRun ? 1 : 0, 10, dt);
    w.slide = approach(w.slide, s.sliding ? 1 : 0, 12, dt);
    w.wall = approach(w.wall, s.wallRun ? 1 : 0, 10, dt);
    w.dash = approach(w.dash, s.dashing ? 1 : 0, 14, dt);
    if (s.wallRun) this.wallSide = s.wallRun;
    const knife = s.hold === 'knife';
    const crouch = Math.max(0, Math.min(1, s.crouch || 0)) * (1 - w.slide);

    // ---- locomotion cycle: strafing turns the hips, backpedalling runs the cycle backwards
    let a = s.moveAngle || 0;
    const back = Math.abs(a) > 1.75;
    if (back) a = a - Math.sign(a) * Math.PI;
    const stride = crouch > 0.5 ? 0.9 : 1.5 + speed * 0.05;
    const runningOnWall = w.wall > 0.5;
    if (grounded || runningOnWall) this.phase += ((speed * dt) / stride) * Math.PI * (back ? -1 : 1);
    this.hipYaw = approach(this.hipYaw, w.run > 0.15 ? Math.max(-0.8, Math.min(0.8, a * 0.55)) : 0, 8, dt);
    const ph = this.phase, A = Math.max(w.run, w.wall) * (crouch > 0.5 ? 0.45 : 0.85);
    const sL = Math.sin(ph), cL = Math.cos(ph);
    setR(P, 'thighL', sL * A, 0, -0.03); setR(P, 'thighR', -sL * A, 0, 0.03);
    setR(P, 'shinL', -(0.12 + Math.max(0, cL) * A * 1.5)); setR(P, 'shinR', -(0.12 + Math.max(0, -cL) * A * 1.5));
    setR(P, 'footL', -P[CH.thighL] * 0.3 - P[CH.shinL] * 0.5); setR(P, 'footR', -P[CH.thighR] * 0.3 - P[CH.shinR] * 0.5);
    P[HIPS_Y] = -Math.abs(Math.cos(ph)) * 0.035 * A + 0.01 * A;
    setR(P, 'hips', 0, this.hipYaw, 0);
    // upper body faces the aim: undo the hip turn, lean into the run, breathe
    const lean = -0.14 * w.run - (knife ? 0.12 * w.run : 0);
    setR(P, 'spine', lean, -this.hipYaw * 0.6, Math.sin(ph) * 0.04 * A);
    setR(P, 'chest', Math.sin(this.t * 1.7) * 0.012, -this.hipYaw * 0.4, 0);
    // arms (used by the knife and when dead; guns override them with IK)
    setR(P, 'upperArmL', -sL * 0.7 * A + 0.05, 0, -0.12);
    setR(P, 'forearmL', 0.35 + 0.5 * A + Math.max(0, -sL) * 0.4 * A);
    setR(P, 'upperArmR', sL * 0.6 * A + 0.35, 0, 0.12);
    setR(P, 'forearmR', 1.2 + 0.2 * A);

    // ---- crouch: deep squat, torso leaning forward
    if (crouch > 0) {
      const C = newPose(); C.set(P);
      addR(C, 'thighL', 1.45, 0, -0.08); addR(C, 'thighR', 1.2, 0, 0.1);
      addR(C, 'shinL', -2.2); addR(C, 'shinR', -2.0);
      addR(C, 'footL', 0.75); addR(C, 'footR', 0.8);
      C[HIPS_Y] += -0.56; C[HIPS_Z] = 0.08;
      addR(C, 'spine', -0.5);
      addR(C, 'neck', 0.25);
      blend(P, C, crouch);
    }

    // ---- air: knees tucked while rising, legs reaching down while falling
    if (w.air > 0) {
      const Ar = newPose(); Ar.set(P);
      const up = Math.max(0, Math.min(1, ((s.vy || 0) + 2) / 6));
      setR(Ar, 'thighL', 0.25 + 0.55 * up, 0, -0.05); setR(Ar, 'shinL', -0.4 - 0.8 * up);
      setR(Ar, 'thighR', -0.05 + 0.25 * up, 0, 0.05); setR(Ar, 'shinR', -0.3 - 0.4 * up);
      setR(Ar, 'footL', 0.3); setR(Ar, 'footR', 0.25);
      Ar[HIPS_Y] = 0.02;
      blend(P, Ar, w.air);
    }

    // ---- wall run: fast stride, body leaning away from the wall
    if (w.wall > 0) P[ROOT_ROLL] += -this.wallSide * 0.38 * w.wall;

    // ---- slide: lying back on one hip, lead leg out front
    if (w.slide > 0) {
      const S = newPose(); S.set(P);
      setR(S, 'hips', 0.0, 0.25, 0);
      setR(S, 'thighL', 1.45, 0, -0.1); setR(S, 'shinL', -0.15); setR(S, 'footL', -0.3);
      setR(S, 'thighR', 0.75, 0, 0.25); setR(S, 'shinR', -1.9); setR(S, 'footR', 0.4);
      setR(S, 'spine', 0.5, -0.2, 0); setR(S, 'chest', 0.1, -0.05, 0);
      setR(S, 'neck', -0.45);
      S[HIPS_Y] = -0.6; S[HIPS_Z] = -0.3; // hips forward so the leaning head stays over the hitboxes
      setR(S, 'upperArmL', 0.2, 0, -0.6); setR(S, 'forearmL', 0.3);
      blend(P, S, w.slide);
    }

    // ---- dash: a hard forward lean, legs trailing
    if (w.dash > 0) {
      const D = newPose(); D.set(P);
      setR(D, 'spine', -0.5, P[CH.spine + 1], 0);
      setR(D, 'thighL', 0.7, 0, -0.05); setR(D, 'shinL', -1.1);
      setR(D, 'thighR', -0.55, 0, 0.05); setR(D, 'shinR', -0.6);
      setR(D, 'neck', 0.35);
      D[HIPS_Y] = -0.05;
      blend(P, D, w.dash);
    }

    // ---- aim pitch: shared between chest, neck and head (the weapon gets the exact pitch)
    const pitch = s.pitch || 0;
    // (mostly the head and neck, so a player looking up or down keeps their head over the hitbox)
    addR(P, 'chest', pitch * 0.15);
    addR(P, 'neck', pitch * 0.25);
    addR(P, 'head', pitch * 0.25);
    // ---- recoil
    this.kick = Math.max(0, this.kick - dt * 8);
    addR(P, 'chest', this.kick * 0.06);
    addR(P, 'neck', -this.kick * 0.04);

    // ---- death: knees buckle, then the whole body falls over
    if (this.deathT >= 0) {
      this.deathT += dt;
      const d = this.deathT;
      const k = Math.min(1, d / 0.35);
      const fall = Math.min(1, Math.max(0, (d - 0.12) / 0.55));
      const f = fall * fall; // accelerating fall
      const D = newPose();
      setR(D, 'thighL', 0.5 * k, 0, -0.15); setR(D, 'thighR', 0.3 * k, 0, 0.2);
      setR(D, 'shinL', -1.1 * k); setR(D, 'shinR', -0.8 * k);
      setR(D, 'spine', -0.3 * k * this.deathDir); setR(D, 'neck', 0.5 * k * this.deathDir);
      setR(D, 'upperArmL', 0.4, 0, -0.9 * k); setR(D, 'forearmL', 0.4);
      setR(D, 'upperArmR', 0.6, 0, 0.8 * k); setR(D, 'forearmR', 0.6);
      D[HIPS_Y] = -0.35 * k;
      D[ROOT_PITCH] = this.deathDir * f * 1.45;
      if (d > 2.4) D[HIPS_Y] -= (d - 2.4) * 0.4; // sink away
      P.set(D);
    }
    return P;
  }

  /** Apply the pose to the bones, then put the hands on the weapon (two-bone IK). */
  update(s, dt) {
    const T = this.computePose(s, dt);
    // smooth only the slow parts (the cycle already is smooth); snaps on the first frame
    const P = this.P;
    if (!this.started) { P.set(T); this.started = true; } else blend(P, T, Math.min(1, dt * 18));
    const B = this.bones;
    for (const name of ROT_BONES) {
      const i = CH[name];
      B[name].rotation.set(P[i], P[i + 1], P[i + 2]);
    }
    B.hips.position.set(0, 0.93 + P[HIPS_Y], P[HIPS_Z]);
    B.root.rotation.set(P[ROOT_PITCH], 0, P[ROOT_ROLL]); // pivots at the feet (falling over when dead)
    this.mesh.updateMatrixWorld(true);

    // weapon mount: world orientation = body yaw + aim pitch (independent of spine lean)
    this.mesh.getWorldQuaternion(_q1);
    _e.set(s.pitch || 0, 0, 0);
    _q2.setFromEuler(_e);
    _q1.multiply(_q2);
    B.chest.getWorldQuaternion(_q2);
    this.aim.quaternion.copy(_q2.invert().multiply(_q1));
    this.aim.position.set(0.13, 0.17 - this.kick * 0.01, -0.1 + this.kick * 0.04);
    this.aim.updateMatrixWorld(true);
  }

  /** Put the hands on world-space targets (Object3Ds), elbows hinting down and out. */
  reach(targetR, targetL) {
    if (this.deathT >= 0) return;
    if (targetR) this.solveArm('R', targetR);
    if (targetL) this.solveArm('L', targetL);
  }

  solveArm(side, target) {
    const B = this.bones;
    const upper = B['upperArm' + side], fore = B['forearm' + side];
    const S = upper.getWorldPosition(_v1);
    const T = target.getWorldPosition(_v2);
    const sx = side === 'R' ? 1 : -1;
    // pole: down, outwards and slightly back in body space
    this.mesh.getWorldQuaternion(_q1);
    const pole = _v3.set(sx * 0.7, -1, 0.35).applyQuaternion(_q1);
    const dir = _v4.copy(T).sub(S);
    let d = dir.length();
    if (d < 1e-5) return;
    dir.divideScalar(d);
    d = Math.max(Math.abs(UPPER - LOWER) + 0.01, Math.min(UPPER + LOWER - 0.001, d));
    const cosA = (UPPER * UPPER + d * d - LOWER * LOWER) / (2 * UPPER * d);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const elbow = new THREE.Vector3().copy(S).addScaledVector(dir, UPPER * cosA).addScaledVector(pole, UPPER * sinA);
    // upper arm: rest direction is -Y in its parent's space
    const upDir = new THREE.Vector3().copy(elbow).sub(S).normalize();
    upper.parent.getWorldQuaternion(_q2);
    const wq = new THREE.Quaternion().setFromUnitVectors(DOWN, upDir);
    upper.quaternion.copy(_q2.clone().invert().multiply(wq));
    upper.updateMatrixWorld(true);
    const lowDir = new THREE.Vector3().copy(T).sub(elbow).normalize();
    upper.getWorldQuaternion(_q2);
    fore.quaternion.copy(_q2.invert().multiply(new THREE.Quaternion().setFromUnitVectors(DOWN, lowDir)));
    fore.updateMatrixWorld(true);
  }

  /** World height of the top of the head (for fitting the model to the player height). */
  headTop() {
    return this.bones.head.getWorldPosition(_v1).y - this.mesh.getWorldPosition(_v2).y + 0.3;
  }
}

/** Deterministic outfit and skin for a player id (so everyone sees the same look). */
export function lookFor(id) {
  const h = Math.imul((id | 0) + 0x9e37, 0x85ebca6b) >>> 0;
  return { outfit: h % OUTFITS.length, skin: (h >>> 8) % SKINS.length };
}
