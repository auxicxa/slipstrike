// Drives the real first-person Viewmodel with a scripted weapon state, for the /viewer previews.
// Posing is deterministic: seeking to time t replays the script from 0 in fixed steps.
import * as THREE from 'three';
import { Viewmodel } from '../render/Viewmodel.js';
import { WEAPONS } from '../../shared/config/weapons.js';
import { createWeaponState } from '../../shared/sim/weapons.js';

export const FP_POSES = {
  gun: ['idle', 'ads', 'fire', 'reload', 'reloadEmpty', 'equip', 'sprint', 'slide', 'walk'],
  knife: ['idle', 'stab', 'heavy', 'equip', 'sprint', 'walk'],
};
const STEP = 1 / 120;

function period(id, pose) {
  const w = WEAPONS[id];
  return { idle: 4, walk: 2, sprint: 2, slide: 1.5, ads: 1.5, fire: 2.2, reload: (w.reload || 1) + 0.8, reloadEmpty: (w.reload || 1) + 0.8,
    equip: 1.4, stab: 1.4, heavy: 1.6 }[pose] || 2;
}

function freshState(id) {
  const w = WEAPONS[id];
  const ws = createWeaponState({ p: w.slot === 'primary' ? id : 'rifle', s: w.slot === 'secondary' ? id : 'pistol' });
  ws.cur = w.slot === 'primary' ? 0 : w.slot === 'secondary' ? 1 : 2;
  return ws;
}

export function buildFpPreview(id) {
  const g = new THREE.Group();
  const vm = new Viewmodel(g);
  g.userData.fp = { vm, id, pose: null, tt: 0, ws: null };
  return g;
}

function restart(fp, pose) {
  const { vm, id } = fp;
  vm.reset();
  vm.cur = null;
  fp.ws = freshState(id);
  fp.pose = pose;
  fp.tt = 0;
  fp.shotT = -1;
  if (pose === 'equip') {
    vm.setWeapon(id === 'rifle' ? 'pistol' : 'rifle');
    vm.swT = 9;
  } else {
    vm.setWeapon(id);
    vm.swT = 9; // already drawn
  }
}

function step(fp, t, dt) {
  const { vm, id, ws, pose } = fp;
  const w = WEAPONS[id];
  const s = { weapon: vm.cur, ws, speed: 0, grounded: true, sliding: false, sprint: false, mdx: 0, mdy: 0 };
  ws.sinceShot += dt;
  if (ws.swapT > 0) ws.swapT = Math.max(0, ws.swapT - dt);
  if (pose === 'walk') s.speed = 6.5;
  if (pose === 'sprint') { s.speed = 8.5; s.sprint = true; }
  if (pose === 'slide') { s.speed = 10; s.sliding = t > 0.2; }
  if (pose === 'ads') ws.adsT = Math.min(1, Math.max(0, (t - 0.2) / (w.adsTime || 0.2)));
  if (pose === 'fire' && w.kind === 'gun' && t >= 0.2 && t < 1.5 && ws.sinceShot >= w.fireInterval) {
    ws.sinceShot = 0;
    ws.ammo[ws.cur] = Math.max(0, ws.ammo[ws.cur] - 1);
    vm.fire();
  }
  if ((pose === 'reload' || pose === 'reloadEmpty') && w.kind === 'gun') {
    if (t < 0.2) ws.ammo[ws.cur] = pose === 'reloadEmpty' ? 0 : Math.ceil(w.mag / 2);
    ws.reloadT = t >= 0.2 ? Math.max(0, w.reload - (t - 0.2)) : 0;
  }
  if (pose === 'equip' && t >= 0.25 && vm.cur !== id) { vm.setWeapon(id); ws.swapT = w.swap || 0; s.weapon = id; }
  if (pose === 'stab' && (Math.abs(t - 0.2) < dt / 2 || Math.abs(t - 0.8) < dt / 2)) vm.stab();
  if (pose === 'heavy') {
    if (Math.abs(t - 0.2) < dt / 2) { ws.windupT = 0.35; vm.heavyStart(); }
    if (ws.windupT > 0) { ws.windupT -= dt; if (ws.windupT <= 0) { ws.windupT = 0; vm.heavy(); } }
  }
  s.weapon = vm.cur;
  vm.update(dt, s);
}

/** Seek the preview to time t (seconds, looping) in `pose`. */
export function seekFp(obj, t, pose) {
  const fp = obj.userData.fp;
  const tt = t % period(fp.id, pose);
  if (pose !== fp.pose || tt < fp.tt) { restart(fp, pose); step(fp, 0, 1e-4); }
  while (fp.tt + STEP <= tt) { fp.tt += STEP; step(fp, fp.tt, STEP); }
}
