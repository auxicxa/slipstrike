// Deterministic weapon state machine, run inside the tick on both the server and the client prediction.
import { WEAPONS, DEFAULT_LOADOUT } from '../config/weapons.js';
import { MOVEMENT as M } from '../config/movement.js';
import { BTN, WSEL_LAST } from '../net/protocol.js';
import { DEG, dirFromAngles } from './math.js';
import { hash32, makeRng } from './rng.js';

export const WFX = { FIRE: 1, RELOAD: 2, SWAP: 4, DRY: 8, STAB: 16, HEAVY_START: 32, HEAVY: 64, RELOADED: 128 };

export function createWeaponState(loadout = DEFAULT_LOADOUT) {
  const slots = [loadout.p, loadout.s, 'knife'];
  return {
    slots,
    cur: 0, last: 1,
    ammo: slots.map((id) => WEAPONS[id].mag || 0),
    swapT: 0, reloadT: 0, cooldown: 0,
    adsT: 0, recP: 0, recY: 0, shotIdx: 0, sinceShot: 9, bloom: 0,
    shots: 0, fireHeld: false, adsHeld: false, queued: 0,
    windupT: 0, // knife heavy windup remaining
    fx: 0,
  };
}

export const WEAPON_KEYS = Object.keys(createWeaponState());

export function copyWeaponState(dst, src) {
  for (const k of WEAPON_KEYS) {
    const v = src[k];
    dst[k] = Array.isArray(v) ? v.slice() : v;
  }
  return dst;
}

export function currentWeapon(ws) { return WEAPONS[ws.slots[ws.cur]]; }

/** Movement speed multiplier for the held weapon (the knife is the fast one). */
export function weaponSpeedMult(ws) {
  const w = currentWeapon(ws);
  if (w.kind === 'melee') return M.knifeSpeedMult;
  return w.moveMult || 1;
}

/** Can this weapon aim down sights at all? (The knife never can.) */
export function canAds(w) {
  return w.kind === 'gun' && (w.adsZoom ?? 1) >= 1;
}

export function isScoped(ws) {
  return canAds(currentWeapon(ws)) && ws.adsT > 0.5;
}

/**
 * The one place that decides what aiming looks like, used by the HUD (scope overlay), the viewmodel
 * (hidden while scoped), the camera (zoom/FOV) and look sensitivity. Always strict booleans/numbers:
 * only a weapon whose config says `scope: true` can ever show a scope overlay.
 */
export function aimView(ws) {
  const w = currentWeapon(ws);
  if (!canAds(w)) return { weapon: w, ads: 0, scoped: false, zoom: 1 };
  const a = Math.max(0, Math.min(1, ws.adsT || 0));
  const scope = w.scope === true;
  const scoped = scope && a > 0.85;
  // Scoped rifles snap to full zoom once the scope is up; other guns zoom smoothly with ADS
  const zoom = 1 + (w.adsZoom - 1) * (scope ? (scoped ? 1 : a * 0.3) : a);
  return { weapon: w, ads: a, scoped, zoom };
}

function switchTo(ws, slot) {
  if (slot === ws.cur || slot < 0 || slot > 2) return;
  ws.last = ws.cur;
  ws.cur = slot;
  ws.swapT = WEAPONS[ws.slots[slot]].swap;
  ws.reloadT = 0;
  ws.adsT = 0;
  ws.windupT = 0;
  ws.cooldown = Math.max(ws.cooldown, 0);
  if (WEAPONS[ws.slots[slot]].kind === 'melee') ws.cooldown = 0;
  ws.fx |= WFX.SWAP;
}

/** Current spread cone half-angle in radians. */
export function currentSpread(ws, ms) {
  const w = currentWeapon(ws);
  if (w.kind !== 'gun') return 0;
  const a = ws.adsT;
  let s = w.spreadHip * (1 - a) + w.spreadAds * a;
  const hs = Math.hypot(ms.vx, ms.vz);
  s += Math.max(0, hs - 1.5) * w.spreadMove * (1 - 0.5 * a);
  if (!ms.grounded) s += w.spreadAir;
  if (ms.crouching && ms.grounded && !ms.sliding) s *= w.spreadCrouch;
  s += ws.bloom;
  if (w.scope && a >= 1) s = w.spreadAds + Math.max(0, hs - 1.5) * w.spreadMove * 0.5 + (ms.grounded ? 0 : w.spreadAir * 0.5);
  return s * DEG;
}

/**
 * Advance one tick. Returns null, or a fire action:
 *   { kind: 'gun', weapon, origin:[x,y,z], dirs:[[x,y,z]...] }  or  { kind: 'melee', weapon, origin, dir, damage, range, heavy }
 */
export function tickWeapon(ws, b, wsel, ms, pid, dt, canFight = true) {
  ws.fx = 0;
  if (ws.cooldown > 0) ws.cooldown -= dt;
  if (ws.swapT > 0) ws.swapT = Math.max(0, ws.swapT - dt);
  ws.sinceShot += dt;

  // Weapon select
  if (wsel >= 1 && wsel <= 3) switchTo(ws, wsel - 1);
  else if (wsel === WSEL_LAST) switchTo(ws, ws.last);

  let w = currentWeapon(ws);
  const fireDown = (b & BTN.FIRE) !== 0;
  const firePressed = fireDown && !ws.fireHeld;
  ws.fireHeld = fireDown;
  const adsDown = (b & BTN.ADS) !== 0;
  const adsPressed = adsDown && !ws.adsHeld;
  ws.adsHeld = adsDown;

  // Reload
  if (ws.reloadT > 0) {
    ws.reloadT -= dt;
    if (ws.reloadT <= 0) {
      ws.reloadT = 0;
      ws.ammo[ws.cur] = w.mag;
      ws.fx |= WFX.RELOADED;
    }
  }
  if (w.kind === 'gun' && ws.reloadT <= 0 && ws.swapT <= 0 && ws.ammo[ws.cur] < w.mag &&
      ((b & BTN.RELOAD) || (ws.ammo[ws.cur] === 0 && ws.cooldown <= 0))) {
    ws.reloadT = w.reload;
    ws.adsT = 0; // reloading always drops the sights
    ws.fx |= WFX.RELOAD;
    ws.bloom = 0;
  }

  // ADS
  if (canAds(w)) {
    const want = adsDown && ws.reloadT <= 0 && ws.swapT <= 0 && !ms.sliding;
    const rate = dt / w.adsTime;
    ws.adsT = want ? Math.min(1, ws.adsT + rate) : Math.max(0, ws.adsT - rate * 1.5);
  } else ws.adsT = 0;

  // Recoil recovery and bloom decay
  if (w.kind === 'gun') {
    if (ws.sinceShot > w.fireInterval * 1.2) {
      const k = Math.exp(-w.recoilRecover * dt);
      ws.recP *= k; ws.recY *= k;
      if (ws.sinceShot > w.fireInterval * 2.5) ws.shotIdx = 0;
    }
    if (ws.sinceShot > w.fireInterval) ws.bloom = Math.max(0, ws.bloom - w.bloomRecover * DEG * dt);
  }

  if (!canFight) { ws.queued = 0; return null; }

  if (firePressed) ws.queued = 0.12; // a press shortly before the gun is ready still fires
  else if (ws.queued > 0) ws.queued -= dt;

  const eyeX = ms.x, eyeY = ms.y + ms.eye, eyeZ = ms.z;

  // ---------------- Knife ----------------
  if (w.kind === 'melee') {
    if (ws.windupT > 0) {
      ws.windupT -= dt;
      if (ws.windupT <= 0) {
        ws.windupT = 0;
        ws.fx |= WFX.HEAVY;
        return { kind: 'melee', weapon: w.id, origin: [eyeX, eyeY, eyeZ], dir: dirFromAngles(ms.yaw, ms.pitch), damage: w.heavy.damage, range: w.heavy.range, heavy: true };
      }
      return null;
    }
    if (ws.cooldown > 0 || ws.swapT > 0) return null;
    if (adsPressed) {
      ws.windupT = w.heavy.windup;
      ws.cooldown = w.heavy.interval;
      ws.fx |= WFX.HEAVY_START;
      return null;
    }
    if (fireDown || ws.queued > 0) {
      ws.queued = 0;
      ws.cooldown = w.stab.interval;
      ws.fx |= WFX.STAB;
      return { kind: 'melee', weapon: w.id, origin: [eyeX, eyeY, eyeZ], dir: dirFromAngles(ms.yaw, ms.pitch), damage: w.stab.damage, range: w.stab.range, heavy: false };
    }
    return null;
  }

  // ---------------- Guns ----------------
  const wantsFire = w.auto ? fireDown : (firePressed || ws.queued > 0);
  if (!wantsFire || ws.swapT > 0 || ws.reloadT > 0 || ws.cooldown > 0) return null;
  if (ws.ammo[ws.cur] <= 0) {
    if (firePressed) ws.fx |= WFX.DRY;
    return null;
  }
  ws.queued = 0;
  ws.ammo[ws.cur]--;
  ws.cooldown = (ws.cooldown > -dt ? ws.cooldown : 0) + w.fireInterval;
  ws.shots++;

  const spread = currentSpread(ws, ms);
  const rng = makeRng(hash32(pid + 1, ws.shots));
  const baseYaw = ms.yaw - ws.recY, basePitch = ms.pitch + ws.recP;
  const dirs = [];
  const pellets = w.pellets || 1;
  for (let i = 0; i < pellets; i++) {
    let yawOff = 0, pitchOff = 0;
    if (pellets > 1) {
      // Even ring pattern with a little jitter, so shotgun damage is consistent
      const ring = i === 0 ? 0 : (i <= 3 ? 0.5 : 1);
      const ang = (i / pellets) * Math.PI * 2 + rng() * 0.6;
      const r = (w.pelletSpread * (ws.adsT > 0.5 ? (w.adsPelletMult || 1) : 1)) * DEG * (ring * 0.8 + rng() * 0.35);
      yawOff = Math.cos(ang) * r; pitchOff = Math.sin(ang) * r;
    }
    // Spread cone: uniform over the disc
    const ang = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * spread;
    yawOff += Math.cos(ang) * rr; pitchOff += Math.sin(ang) * rr;
    dirs.push(dirFromAngles(baseYaw + yawOff, basePitch + pitchOff));
  }

  // Apply recoil for the next shot
  const pat = w.recoil;
  const k = pat[Math.min(ws.shotIdx, pat.length - 1)];
  const mult = ws.adsT > 0.5 ? w.adsRecoilMult : 1;
  ws.recP += k[0] * DEG * mult;
  ws.recY += k[1] * DEG * mult * (ws.shotIdx >= pat.length ? (rng() < 0.5 ? -1 : 1) : 1);
  ws.shotIdx++;
  ws.sinceShot = 0;
  ws.bloom = Math.min(w.bloomMax * DEG, ws.bloom + w.bloomPerShot * DEG);
  ws.fx |= WFX.FIRE;

  return { kind: 'gun', weapon: w.id, origin: [eyeX, eyeY, eyeZ], dirs };
}

/** Damage after distance falloff. */
export function falloff(w, dist) {
  if (dist <= w.falloffStart) return 1;
  if (dist >= w.falloffEnd) return w.falloffMin;
  const t = (dist - w.falloffStart) / (w.falloffEnd - w.falloffStart);
  return 1 + (w.falloffMin - 1) * t;
}
