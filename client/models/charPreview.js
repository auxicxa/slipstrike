// Scripted character poses for the /viewer page: drives a real PlayerModel with synthetic movement states.
// Seeking is deterministic (replays from 0 in fixed steps), so screenshots are repeatable.
import * as THREE from 'three';
import { PlayerModel } from '../render/PlayerModel.js';
import { MOVEMENT as M } from '../../shared/config/movement.js';

export const CHAR_POSES = ['idle', 'walk', 'run', 'strafe', 'backpedal', 'crouch', 'crouchWalk', 'slide', 'jump', 'fall',
  'wallRun', 'dash', 'knifeRun', 'pistol', 'aimUp', 'aimDown', 'death'];
const STEP = 1 / 60;

function state(pose, t) {
  const s = { speed: 0, moveAngle: 0, grounded: true, vy: 0, sliding: false, wallRun: 0, dashing: false, pitch: 0, alive: true, weapon: 'rifle' };
  let h = M.standHeight;
  switch (pose) {
    case 'walk': s.speed = 3.5; break;
    case 'run': s.speed = 8.5; break;
    case 'strafe': s.speed = 6.5; s.moveAngle = Math.PI / 2; break;
    case 'backpedal': s.speed = 5.8; s.moveAngle = Math.PI; break;
    case 'crouch': h = M.crouchHeight; break;
    case 'crouchWalk': h = M.crouchHeight; s.speed = 3.5; break;
    case 'slide': h = M.crouchHeight; s.speed = 11; s.sliding = true; break;
    case 'jump': s.grounded = false; s.vy = 5; s.speed = 7; break;
    case 'fall': s.grounded = false; s.vy = -6; s.speed = 7; break;
    case 'wallRun': s.grounded = false; s.wallRun = -1; s.speed = 10; break;
    case 'dash': s.grounded = false; s.dashing = true; s.speed = 14; break;
    case 'knifeRun': s.speed = 10.4; s.weapon = 'knife'; break;
    case 'pistol': s.weapon = 'pistol'; s.speed = 2; break;
    case 'aimUp': s.pitch = 0.9; break;
    case 'aimDown': s.pitch = -0.9; break;
    case 'death': s.alive = false; break;
  }
  return { s, h };
}

export function buildCharPreview(outfit, skin, team) {
  const g = new THREE.Group();
  const m = new PlayerModel(g, team === 1 ? 0x3db4ff : 0xff8a3d, 0, { outfit, skin });
  m.shadow.visible = false;
  g.userData.char = { m, pose: null, tt: 0 };
  g.userData.hitboxH = M.standHeight;
  g.userData.statsTris = m.char.mesh.geometry.attributes.position.count / 3; // the body alone (weapon excluded)
  return g;
}

export function seekChar(obj, t, pose) {
  const c = obj.userData.char;
  const period = pose === 'death' ? 4 : 2;
  const tt = t % period;
  if (pose !== c.pose || tt < c.tt) {
    c.pose = pose; c.tt = 0;
    c.m.char.revive();
    c.m.char.started = false;
    c.m.char.phase = 0; c.m.char.t = 0;
    for (const k of Object.keys(c.m.char.w)) c.m.char.w[k] = 0;
    if (pose === 'death') c.m.char.die(1);
    const { s, h } = state(pose, 0);
    for (let i = 0; i < 30; i++) c.m.animate(state(pose, 0).s, h, STEP); // settle into the pose's blend weights
    if (pose === 'death') { c.m.char.deathT = 0; }
    obj.userData.hitboxH = h;
    void s;
  }
  while (c.tt + STEP <= tt) {
    c.tt += STEP;
    const { s, h } = state(pose, c.tt);
    c.m.animate(s, h, STEP);
    obj.userData.hitboxH = h;
  }
}
