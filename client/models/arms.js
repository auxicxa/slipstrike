// First-person arms: gloved hands shaped for each grip, and forearms that stretch from the wrist to an
// elbow point behind the camera (so they follow the weapon through every animation).
import * as THREE from 'three';
import { Assembly, cbox, cyl, mat } from './kit.js';

const glove = () => mat('gloveTan');
const knuckle = () => mat('rubber');

/**
 * Hand shapes, in the hand's own space (the held bar through the origin, forward = -Z):
 *  'grip'    right fist around a pistol grip (the bar runs along Y): back of the hand on the right, fingers
 *            wrapped round the front, thumb over the left side, index finger along the frame
 *  'support' left hand under a handguard (bar along Z just above the palm), fingers up the right side
 *  'knife'   right fist around a handle along Z, thumb on the spine
 *  'pistol2' left hand cupping the right fist from the left and below (two-handed pistol grip)
 */
export function buildHand(kind) {
  const a = new Assembly('hand-' + kind);
  const g = glove(), k = knuckle();
  let wrist = [0, 0, 0.07];
  if (kind === 'grip') {
    a.add(cbox(0.02, 0.075, 0.066, 0.007), g, [0.026, -0.004, 0.004]);                  // back of the hand
    for (let i = 0; i < 3; i++) a.add(cbox(0.005, 0.012, 0.012, 0.002), k, [0.037, -0.012 - i * 0.02, -0.022]); // knuckles
    a.add(cbox(0.044, 0.062, 0.02, 0.007), g, [0.004, -0.006, 0.03]);                    // palm heel behind the grip
    for (let i = 0; i < 3; i++) {
      const y = -0.012 - i * 0.02;
      a.add(cbox(0.05, 0.017, 0.018, 0.005), g, [0.004, y, -0.03]);                      // fingers round the front
      a.add(cbox(0.014, 0.016, 0.034, 0.005), g, [-0.022, y, -0.014]);                   // fingertips on the left
    }
    a.add(cbox(0.016, 0.016, 0.055, 0.005), g, [0.016, 0.026, -0.042]);                  // index finger along the frame
    a.add(cbox(0.016, 0.017, 0.056, 0.005), g, [-0.024, 0.024, -0.012], [0.1, 0, 0]);     // thumb over the left side
    a.add(cbox(0.048, 0.05, 0.05, 0.01), g, [0.012, -0.012, 0.05]);                     // wrist (back, towards the forearm)
    wrist = [0.012, -0.016, 0.07];
  } else if (kind === 'support') {
    a.add(cbox(0.046, 0.02, 0.085, 0.007), g, [0.002, -0.034, 0]);                       // palm under the bar
    for (let i = 0; i < 4; i++) {
      a.add(cbox(0.016, 0.034, 0.017, 0.005), g, [0.03, -0.015, -0.032 + i * 0.019]);     // fingers up the right side
      a.add(cbox(0.014, 0.014, 0.016, 0.004), g, [0.024, 0.006, -0.032 + i * 0.019]);     // fingertips curled over
    }
    a.add(cbox(0.015, 0.018, 0.06, 0.005), g, [-0.028, -0.014, -0.012]);                  // thumb along the left side
    a.add(cbox(0.048, 0.045, 0.05, 0.01), g, [-0.004, -0.05, 0.05]);                      // wrist
    wrist = [-0.004, -0.055, 0.07];
  } else if (kind === 'knife') {
    a.add(cbox(0.022, 0.05, 0.085, 0.007), g, [0.024, -0.004, 0.0]);                     // back of the hand
    a.add(cbox(0.006, 0.034, 0.07, 0.002), k, [0.036, -0.002, 0.0]);
    for (let i = 0; i < 4; i++) {
      a.add(cbox(0.044, 0.016, 0.018, 0.005), g, [0.004, -0.019, -0.03 + i * 0.02]);     // fingers under the handle
      a.add(cbox(0.014, 0.024, 0.017, 0.005), g, [-0.018, -0.006, -0.03 + i * 0.02]);    // fingertips on the left
    }
    a.add(cbox(0.016, 0.015, 0.05, 0.005), g, [-0.004, 0.018, -0.028]);                  // thumb on the spine
    a.add(cbox(0.048, 0.05, 0.05, 0.01), g, [0.016, 0.0, 0.06]);
    wrist = [0.016, 0.0, 0.075];
  } else {
    a.add(cbox(0.02, 0.07, 0.06, 0.007), g, [-0.034, -0.012, -0.004]);                   // palm on the left of the grip
    for (let i = 0; i < 3; i++) a.add(cbox(0.05, 0.017, 0.018, 0.005), g, [-0.008, -0.006 - i * 0.02, -0.046]); // fingers over the right hand's
    a.add(cbox(0.016, 0.017, 0.055, 0.005), g, [-0.03, 0.02, -0.03]);                    // thumb forward along the frame
    a.add(cbox(0.048, 0.045, 0.05, 0.01), g, [-0.036, -0.03, 0.045]);
    wrist = [-0.04, -0.035, 0.065];
  }
  const hand = a.build();
  const w = new THREE.Object3D();
  w.name = 'wrist';
  w.position.set(...wrist);
  hand.add(w);
  return hand;
}

/** Unit-length forearm along +Z (scaled to the wrist–elbow distance each frame): sleeve + cuff. */
export function buildForearm() {
  const a = new Assembly('forearm');
  a.add(cyl(0.032, 0.78, 8, 0.028), mat('sleeve'), [0, 0, 0.5 + 0.11], [0, 0, Math.PI / 8]);
  a.add(cyl(0.034, 0.18, 8, 0.033), mat('armor'), [0, 0, 0.12], [0, 0, Math.PI / 8]); // cuff / bracer
  a.add(cyl(0.035, 0.03, 8), mat('accent'), [0, 0, 0.2], [0, 0, Math.PI / 8]);       // accent band
  return a.build();
}

/**
 * One arm: hand + forearm, both children of `parent` (the viewmodel rig). `place(matrix)` puts the hand
 * at a transform given in the parent's space, then the forearm is aimed from the wrist to `elbow`.
 */
export class Arm {
  constructor(parent, kind, elbow) {
    this.parent = parent;
    this.forearm = buildForearm();
    this.elbow = new THREE.Vector3(...elbow);
    this.hands = {};
    this.kind = null;
    parent.add(this.forearm);
    this.setKind(kind);
    this._w = new THREE.Vector3();
    this._e = new THREE.Vector3();
  }

  setKind(kind) {
    if (kind === this.kind) return;
    if (!this.hands[kind]) { this.hands[kind] = buildHand(kind); this.parent.add(this.hands[kind]); }
    for (const [k, h] of Object.entries(this.hands)) h.visible = k === kind;
    this.hand = this.hands[kind];
    this.wrist = this.hand.getObjectByName('wrist');
    this.kind = kind;
  }

  hide() { this.hand.visible = this.forearm.visible = false; }

  /** m: hand transform in the parent's space. */
  place(m) {
    this.hand.visible = this.forearm.visible = true;
    m.decompose(this.hand.position, this.hand.quaternion, this.hand.scale);
    this.hand.scale.set(1, 1, 1);
    this.hand.updateMatrix();
    this._w.copy(this.wrist.position).applyMatrix4(this.hand.matrix);
    const d = this._w.distanceTo(this.elbow);
    this.forearm.position.copy(this._w);
    // lookAt works in world space: aim at the elbow's world position
    this.parent.updateWorldMatrix(true, false);
    this.forearm.lookAt(this._e.copy(this.elbow).applyMatrix4(this.parent.matrixWorld));
    this.forearm.scale.set(1, 1, Math.max(0.05, d));
  }
}
