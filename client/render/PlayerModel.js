// Third-person player: an animated humanoid (client/models/character.js) holding the same weapon
// models as first person, a blob shadow and an optional name tag. Movement animation is derived from
// the (interpolated) entity stream: velocity from position changes, aim pitch, crouch from the height,
// and the grounded / sliding / wall-run / dash flags from the snapshot.
import * as THREE from 'three';
import { MOVEMENT as M } from '../../shared/config/movement.js';
import { weaponModelFlat } from '../models/weapons.js';
import { Character, lookFor, HEAD_TOP } from '../models/character.js';

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

const HOLD = { rifle: 'long', shotgun: 'long', sniper: 'long', pistol: 'pistol', revolver: 'pistol', knife: 'knife' };
const DEATH_SHOW = 3.2; // seconds a body stays visible

export class PlayerModel {
  constructor(scene, color, id = 0, look = null) {
    this.scene = scene;
    this.root = new THREE.Group();
    const lk = look || lookFor(id);
    this.char = new Character(lk.outfit, lk.skin, color);
    this.root.add(this.char.mesh);
    this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadow.renderOrder = 1;
    scene.add(this.root, this.shadow);
    this.color = color;
    this.guns = {}; // the same weapon models as first person (baked to one mesh each), built on first use
    this.gun = null;
    this.weapon = null;
    this.setWeapon('rifle');
    this.last = null;
    this.vel = new THREE.Vector3();
    this.wasAlive = true;
  }

  setColor(color) {
    if (color === this.color) return;
    this.color = color;
    this.char.setTeamColor(color);
  }

  setWeapon(id) {
    if (id === this.weapon || !HOLD[id]) return;
    if (!this.guns[id]) {
      const g = weaponModelFlat(id);
      const grip = g.getObjectByName('grip');
      const gp = grip ? grip.position : new THREE.Vector3();
      if (HOLD[id] === 'knife') {
        // in the right fist, blade out of the thumb side
        g.position.set(0, -0.06, 0).sub(gp);
        this.char.bones.handR.add(g);
      } else {
        if (!g.geometry.boundingBox) g.geometry.computeBoundingBox();
        if (HOLD[id] === 'long') g.position.set(0, -0.035, -g.geometry.boundingBox.max.z - 0.01); // butt in the shoulder
        else g.position.set(-0.14, -0.07, -0.42).sub(new THREE.Vector3(0, gp.y, gp.z)); // pistols at arm's length
        this.char.aim.add(g);
      }
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.guns[id] = g;
    }
    if (this.gun) this.gun.visible = false;
    this.weapon = id;
    this.gun = this.guns[id];
    this.gun.visible = true;
  }

  /** This player fired (third-person recoil). */
  fire(weapon) { this.char.fire(weapon === 'sniper' || weapon === 'shotgun' ? 1.2 : weapon === 'revolver' ? 0.9 : 0.5); }

  /** World position of the held weapon's muzzle / ejection port (for tracers, flashes, casings). */
  socketWorld(name, out = new THREE.Vector3()) {
    const s = this.gun?.getObjectByName(name);
    if (!s || !this.root.visible || this.char.dead) return null;
    return s.getWorldPosition(out);
  }

  /**
   * e: { x,y,z, yaw, pitch, h, grounded, sliding, crouching, wallRun, dashing, weapon, alive }
   * floorY: ground height under the player (for the shadow)
   */
  update(e, dt, floorY) {
    const alive = e.alive !== false;
    const ch = this.char;
    if (!alive && this.wasAlive) ch.die();
    if (alive && !this.wasAlive) { ch.revive(); this.last = null; }
    this.wasAlive = alive;
    const vis = alive || (ch.dead && ch.deathT < DEATH_SHOW);
    this.root.visible = vis;
    this.shadow.visible = vis && floorY > -100;
    if (this.label) this.label.visible = alive;
    if (!vis) return;
    this.setWeapon(e.weapon);

    // velocity from the position stream (ignoring teleports)
    if (alive) {
      if (this.last && dt > 0) {
        const vx = (e.x - this.last.x) / dt, vy = (e.y - this.last.y) / dt, vz = (e.z - this.last.z) / dt;
        if (Math.hypot(vx, vz) < 30) this.vel.lerp(new THREE.Vector3(vx, vy, vz), Math.min(1, dt * 12));
      }
      this.last = { x: e.x, y: e.y, z: e.z };
      this.root.position.set(e.x, e.y, e.z);
      this.root.rotation.y = e.yaw;
    }
    const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw); // facing
    const rx = Math.cos(e.yaw), rz = -Math.sin(e.yaw);   // right
    const fwd = this.vel.x * fx + this.vel.z * fz, right = this.vel.x * rx + this.vel.z * rz;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const h = e.h ?? M.standHeight;
    const s = {
      speed, moveAngle: speed > 0.4 ? Math.atan2(right, fwd) : 0,
      grounded: e.grounded !== false, vy: this.vel.y, sliding: !!e.sliding,
      crouch: (M.standHeight - h) / (M.standHeight - M.crouchHeight),
      wallRun: e.wallRun || 0, dashing: !!e.dashing, pitch: e.pitch || 0, hold: HOLD[e.weapon] || 'long', alive,
    };
    this.animate(s, h, dt);

    if (this.label) this.label.position.set(e.x, e.y + h + 0.35, e.z);
    const px = this.root.position.x, pz = this.root.position.z;
    this.shadow.position.set(px, floorY + 0.02, pz);
    const hgt = Math.max(0, this.root.position.y - floorY);
    this.shadow.scale.setScalar(Math.max(0.4, 1 - hgt * 0.15) * (ch.dead ? 1.4 : 1));
  }

  /**
   * Pose the character from a movement state (see Character.update), fit its head top to the player
   * height h (crouch and slide poses never stick out of the hitbox), and put the hands on the weapon.
   */
  animate(s, h, dt) {
    const ch = this.char;
    this.setWeapon(s.weapon || this.weapon);
    s.hold = HOLD[this.weapon];
    if (s.crouch === undefined) s.crouch = (M.standHeight - h) / (M.standHeight - M.crouchHeight);
    ch.mesh.scale.set(1, 1, 1);
    ch.update(s, dt);
    if (s.alive !== false && !ch.dead) {
      const top = ch.headTop();
      const k = top > h ? Math.max(0.82, h / top) : 1;
      if (k !== 1) { ch.mesh.scale.set(1, k, 1); ch.mesh.updateMatrixWorld(true); }
      if (s.hold !== 'knife') ch.reach(this.gun.getObjectByName('grip'), this.gun.getObjectByName('support'));
    }
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
export { HEAD_TOP };
