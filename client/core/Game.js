// Client game shell: frame loop, look handling, camera feel, effects and HUD wiring.
// A "session" (OfflinePractice or OnlineMatch) owns the simulation and provides states to draw.
import * as THREE from 'three';
import { input } from './Input.js';
import { settings } from './Settings.js';
import { Renderer } from '../render/Renderer.js';
import { Viewmodel } from '../render/Viewmodel.js';
import { Effects } from '../render/Effects.js';
import { PlayerModel } from '../render/PlayerModel.js';
import { sfx } from '../audio/Sfx.js';
import { Hud } from '../ui/Hud.js';
import { MOVEMENT as M } from '../../shared/config/movement.js';
import { WEAPONS } from '../../shared/config/weapons.js';
import { TEAM_COLORS } from '../../shared/config/game.js';
import { BTN, WSEL_LAST } from '../../shared/net/protocol.js';
import { FX } from '../../shared/sim/movement.js';
import { WFX, currentWeapon } from '../../shared/sim/weapons.js';
import { rayVsPlayer } from '../../shared/sim/hitscan.js';
import { DEG, clamp, dirFromAngles, wrapAngle } from '../../shared/sim/math.js';

const BASE_SENS = 0.0022; // radians per pointer count at sensitivity 1.0

export class Game {
  constructor(container) {
    this.container = container;
    this.r = new Renderer(container);
    this.vm = new Viewmodel(this.r.vmScene);
    this.fx = new Effects(this.r.scene);
    this.hud = new Hud(this);
    this.models = new Map();
    this.session = null;
    this.yaw = 0; this.pitch = 0;
    this.smX = 0; this.smY = 0;
    this.lastMouse = [0, 0];
    this.paused = true;
    this.running = false;
    this.fov = settings.get('fov');
    this.landDip = 0; this.dipVel = 0;
    this.tilt = 0;
    this.stepDist = 0;
    this.fovKick = 0;
    this.camShake = 0;
    this.frameTimes = [];
    this.lastFrame = performance.now();
    this.spectating = null;
    this.onPauseChange = null;
    this.qualityScale();
    settings.onChange((k) => { if (k === 'quality' || k === '*') this.qualityScale(); });

    input.on('lock', (locked) => this.setPaused(!locked));
    input.on('action', (a, down) => this.onAction(a, down));
    requestAnimationFrame((t) => this.frame(t));
  }

  qualityScale() {
    const q = settings.get('quality');
    this.fx.scale = q === 'low' ? 0.4 : q === 'med' ? 0.75 : 1;
  }

  // ------------------------------------------------------------------ session
  start(session) {
    if (this.session) this.stop();
    this.session = session;
    this.r.setMap(session.map);
    const spawnYaw = session.initialYaw?.() ?? 0;
    this.yaw = spawnYaw; this.pitch = 0;
    this.running = true;
    input.enabled = true;
    input.resetToggles();
    this.hud.show(true);
    this.setPaused(!input.locked);
  }

  stop() {
    if (this.session) this.session.dispose?.();
    this.session = null;
    this.running = false;
    input.enabled = false;
    for (const m of this.models.values()) m.dispose();
    this.models.clear();
    this.hud.show(false);
    input.exitLock();
  }

  requestPlay() {
    sfx.unlock();
    input.requestLock(this.r.renderer.domElement);
  }

  setPaused(p) {
    this.paused = p;
    if (this.onPauseChange) this.onPauseChange(p);
  }

  /** Called when the session (re)spawns the local player. */
  setView(yaw, pitch = 0) { this.yaw = yaw; this.pitch = pitch; }

  onAction(a, down) {
    if (!this.running) return;
    if (a === 'stats' && down) settings.set('showFps', !settings.get('showFps'));
    if (a === 'pause' && down && !this.paused) input.exitLock();
    if (a === 'escape' && input.noLock && !this.paused) input.exitLock();
    if (a === 'scoreboard') this.hud.showScoreboard(down);
    if (a === 'chatWheel') this.hud.chatWheel(down);
    this.session?.onAction?.(a, down);
  }

  // ------------------------------------------------------------------ input → command
  /** Build one tick's input command (called by the session once per fixed tick). */
  buildInput() {
    let b = 0, w = 0;
    const active = this.running && !this.paused && !this.hud.wheelOpen;
    if (active) {
      if (input.active('forward')) b |= BTN.FWD;
      if (input.active('back')) b |= BTN.BACK;
      if (input.active('left')) b |= BTN.LEFT;
      if (input.active('right')) b |= BTN.RIGHT;
      if (input.active('jump')) b |= BTN.JUMP;
      if (input.active('crouch')) b |= BTN.CROUCH;
      if (input.active('sprint')) b |= BTN.SPRINT;
      if (input.active('dash')) b |= BTN.DASH;
      if (input.active('fire')) b |= BTN.FIRE;
      // The knife's heavy attack lives on the ADS key: always treat it as a plain press there
      const lp = this.session?.localPlayer?.();
      const knife = lp?.ws && currentWeapon(lp.ws).kind === 'melee';
      if (knife ? input.active('ads') : input.adsActive()) b |= BTN.ADS;
      if (input.active('reload')) b |= BTN.RELOAD;
      if (input.wasPressed('slot1')) w = 1;
      else if (input.wasPressed('slot2')) w = 2;
      else if (input.wasPressed('slot3') || input.wasPressed('knife')) w = 3;
      else if (input.wasPressed('lastWeapon')) w = WSEL_LAST;
    }
    input.consumeLatched();
    if (w) input.toggles.ads = false;
    return { b, y: this.yaw, p: this.pitch, w };
  }

  // ------------------------------------------------------------------ look
  zoomInfo(ws) {
    if (!ws) return { zoom: 1, ads: 0 };
    const w = currentWeapon(ws);
    const a = ws.adsT || 0;
    const zoom = w.kind === 'gun' ? 1 + (w.adsZoom - 1) * (w.scope ? (a > 0.85 ? 1 : a * 0.3) : a) : 1;
    return { zoom, ads: a, w };
  }

  updateLook(dt, ws) {
    let [mdx, mdy] = input.takeMouse();
    if (this.paused || !this.running || this.hud.wheelOpen) {
      if (this.hud.wheelOpen) this.hud.wheelMove(mdx, mdy);
      this.lastMouse = [0, 0];
      return;
    }
    const sm = clamp(settings.get('smoothing'), 0, 0.85);
    if (sm > 0) {
      this.smX = this.smX * sm + mdx * (1 - sm);
      this.smY = this.smY * sm + mdy * (1 - sm);
      mdx = this.smX; mdy = this.smY;
    }
    this.lastMouse = [mdx, mdy];
    let k = BASE_SENS * settings.get('sens');
    const { zoom } = this.zoomInfo(ws);
    if (zoom > 1.01) {
      // Zoom-proportional: keep the same on-screen speed as at hip fire
      const base = settings.get('fov') * DEG;
      const zf = Math.tan(base / 2) / zoom;
      k *= (zf / Math.tan(base / 2)) * settings.get('adsSens');
    }
    if (settings.get('lookAccel') && dt > 0) {
      const speed = Math.hypot(mdx, mdy) / dt; // counts per second
      k *= 1 + settings.get('lookAccelAmount') * Math.min(3, speed / 800);
    }
    if (settings.get('aimAssist') && this.session?.aimTargets) k *= this.aimAssistFactor();
    const inv = settings.get('invertY') ? -1 : 1;
    this.yaw -= mdx * k;
    this.pitch -= mdy * k * inv;
    // Keyboard look
    const kl = settings.get('keyLookSpeed') * DEG * dt / Math.max(1, zoom * 0.8);
    const lx = (input.isDown('lookLeft') ? 1 : 0) - (input.isDown('lookRight') ? 1 : 0);
    const ly = (input.isDown('lookUp') ? 1 : 0) - (input.isDown('lookDown') ? 1 : 0);
    this.yaw += lx * kl;
    this.pitch += ly * kl * 0.7;
    this.pitch = clamp(this.pitch, -1.55, 1.55);
    if (Math.abs(this.yaw) > 100) this.yaw = wrapAngle(this.yaw);
  }

  /** Gentle aim assist: slow the look speed when the crosshair is near an enemy. Never pulls the aim. */
  aimAssistFactor() {
    const cam = this.r.camera;
    const dir = dirFromAngles(this.yaw, this.pitch);
    const o = [cam.position.x, cam.position.y, cam.position.z];
    for (const e of this.session.aimTargets()) {
      const hit = rayVsPlayer(o, dir, e.x, e.y, e.z, e.h, 80, 0.35);
      if (hit) return 0.55;
    }
    return 1;
  }

  // ------------------------------------------------------------------ frame
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    let dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    if (dt > 0.25) dt = 0.25;
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 60) this.frameTimes.shift();
    if (!this.session) return;
    this.autoQuality(dt);

    const s = this.session;
    const localBefore = s.localPlayer?.();
    this.updateLook(dt, localBefore?.alive ? localBefore.ws : null);
    s.update(dt, this);

    const view = s.localView();     // interpolated local state (or null)
    const remotes = s.remotes();    // entities to draw
    this.drawRemotes(remotes, dt, view);

    let ws = null;
    const cam = this.r.camera;
    const spec = !view || !view.alive ? s.spectateView?.() : null;
    if (view && view.alive) {
      ws = view.ws;
      this.updateCamera(dt, view, ws);
    } else if (spec) {
      cam.position.set(spec.x, spec.y + spec.eye, spec.z);
      cam.rotation.set(spec.pitch, spec.yaw, 0);
      cam.fov = settings.get('fov');
      cam.updateProjectionMatrix();
    } else if (view) {
      // Dead with nobody to watch: slowly look at where we died from above
      cam.position.set(view.x, view.y + 3, view.z + 2);
      cam.rotation.set(-0.9, 0, 0);
    }
    sfx.setListener(cam.position.x, cam.position.y, cam.position.z, cam.rotation.y);

    const showVm = !!(view && view.alive);
    if (showVm) {
      const w = currentWeapon(ws);
      this.vm.update(dt, {
        weapon: w.id, ws, speed: Math.hypot(view.vx, view.vz), grounded: view.grounded, sliding: view.sliding,
        mdx: this.lastMouse[0], mdy: this.lastMouse[1],
      });
    }
    this.fx.update(dt);
    this.r.render(showVm);
    this.hud.update(dt, view, ws, spec);
  }

  /**
   * If the game runs below ~50 FPS for 4 s (after a 3 s warm-up, while actually playing), lower the
   * graphics quality one step. Never raises it again on its own.
   */
  autoQuality(dt) {
    const a = this.autoQ || (this.autoQ = { warm: 0, sum: 0, n: 0, cooldown: 0 });
    const testing = input.noLock && !new URLSearchParams(location.search).has('autoq');
    if (!settings.get('autoQuality') || testing || this.paused || !this.running) { a.warm = 0; a.sum = 0; a.n = 0; return; }
    a.cooldown -= dt;
    a.warm += dt;
    if (a.warm < 3) return;
    a.sum += dt; a.n++;
    if (a.sum < 4) return;
    const fps = a.n / a.sum;
    a.sum = 0; a.n = 0;
    if (fps >= 50 || a.cooldown > 0) return;
    const next = { high: 'med', med: 'low' }[settings.get('quality')];
    if (!next) return;
    settings.set('quality', next);
    a.cooldown = 10; a.warm = 0;
    this.onToast?.(`Running at ${fps.toFixed(0)} FPS: lowered graphics to ${next === 'med' ? 'Medium' : 'Low'} (Settings → Video)`);
  }

  updateCamera(dt, v, ws) {
    const cam = this.r.camera;
    const speed = Math.hypot(v.vx, v.vz);
    // Landing dip: a damped spring pulled down on landing
    this.dipVel += (-this.landDip * 120 - this.dipVel * 16) * dt;
    this.landDip += this.dipVel * dt;
    // Slide tilt
    const tiltTarget = v.sliding ? M.slideTiltDeg * DEG : 0;
    this.tilt += (tiltTarget - this.tilt) * Math.min(1, dt * 10);
    // FOV widening with speed
    const { zoom } = this.zoomInfo(ws);
    const sp = clamp((speed - M.fovSpeedMin) / (M.fovSpeedMax - M.fovSpeedMin), 0, 1);
    const targetFov = settings.get('fov') + M.fovSpeedBonus * sp + this.fovKick;
    this.fov += (targetFov - this.fov) * Math.min(1, dt * M.fovLerp);
    this.fovKick = Math.max(0, this.fovKick - dt * 10);
    const effFov = 2 * Math.atan(Math.tan((this.fov * DEG) / 2) / zoom) / DEG;
    if (Math.abs(cam.fov - effFov) > 0.01) { cam.fov = effFov; cam.updateProjectionMatrix(); }
    // Head bob (tiny, off while aiming)
    let bob = 0;
    if (v.grounded && !v.sliding && speed > 0.5) {
      this.stepDist += speed * dt;
      bob = Math.sin(this.stepDist * M.bobFreq * Math.PI * 0.5) * M.bobAmount * Math.min(1, speed / 8) * (1 - (ws?.adsT || 0));
      if (this.stepDist > M.footstepDistance) { this.stepDist -= M.footstepDistance; sfx.footstep(null, speed > 7.5); }
    }
    cam.position.set(v.x, v.y + v.eye + this.landDip + bob, v.z);
    const recP = ws ? ws.recP : 0, recY = ws ? ws.recY : 0;
    this.camShake = Math.max(0, this.camShake - dt * 8);
    const sh = this.camShake * 0.01;
    cam.rotation.set(this.pitch + recP + (Math.random() - 0.5) * sh, this.yaw - recY + (Math.random() - 0.5) * sh, this.tilt);
  }

  drawRemotes(list, dt, view) {
    const seen = new Set();
    const coll = this.session.coll;
    for (const e of list) {
      seen.add(e.id);
      let m = this.models.get(e.id);
      const color = e.dummy ? (e.hp < 100 ? 0xc04a4a : 0x8a8f99) : TEAM_COLORS[e.team] ?? 0xffffff;
      if (!m) { m = new PlayerModel(this.r.scene, color); this.models.set(e.id, m); }
      m.setColor(color);
      const tag = this.session.teamTag?.(e);
      m.setLabel(tag ? tag.name : null, tag?.color);
      const floor = coll ? coll.supportHeight(e.x, e.z, 0.3, e.y + 0.1) : e.y;
      m.update(e, dt, floor);
    }
    for (const [id, m] of this.models) if (!seen.has(id)) { m.dispose(); this.models.delete(id); }
  }

  // ------------------------------------------------------------------ effects hooks
  /** After each NEW predicted local tick (not reconciliation replays). */
  onLocalTick(p, act) {
    const ms = p.ms, ws = p.ws;
    if (ms.fx & FX.JUMP) sfx.jump();
    if (ms.fx & FX.LAND) {
      const v = ms.landSpeed;
      if (v > 3) { this.dipVel -= Math.min(M.landDipMax * 16, v * M.landDipScale * 16); sfx.land(v / 12); this.vm.land(v); }
    }
    if (ms.fx & FX.DASH) { sfx.dash(); this.fovKick = 6; }
    if (ms.fx & FX.SLIDE) sfx.slide();
    if (ms.fx & FX.MANTLE) sfx.mantle();
    if (ws.fx & WFX.SWAP) { sfx.swap(); this.vm.setWeapon(currentWeapon(ws).id); }
    if (ws.fx & WFX.RELOAD) sfx.reload();
    if (ws.fx & WFX.RELOADED) sfx.reloaded();
    if (ws.fx & WFX.DRY) sfx.dry();
    if (ws.fx & WFX.STAB) { this.vm.stab(); sfx.knife(null, false); }
    if (ws.fx & WFX.HEAVY_START) this.vm.heavyStart();
    if (ws.fx & WFX.HEAVY) { this.vm.heavy(); sfx.knife(null, true); }
    if (act && act.kind === 'gun') {
      this.vm.fire();
      sfx.shot(act.weapon);
      const w = WEAPONS[act.weapon];
      if (w.id === 'sniper' || w.id === 'shotgun') this.camShake = 1;
      this.localTracers(act, p.id);
    }
  }

  /** Predicted tracers and impacts for our own shots. */
  localTracers(act, selfId) {
    const coll = this.session.coll;
    const w = WEAPONS[act.weapon];
    const o = act.origin;
    const cam = this.r.camera;
    // Tracers start at the viewmodel muzzle (roughly: right/down of the eye)
    const yaw = cam.rotation.y;
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const fwd = dirFromAngles(cam.rotation.y, cam.rotation.x);
    const muzzle = [o[0] + rx * 0.15 + fwd[0] * 0.5, o[1] - 0.12 + fwd[1] * 0.5, o[2] + rz * 0.15 + fwd[2] * 0.5];
    const n = [0, 0, 0];
    const targets = this.session.aimTargets ? this.session.aimTargets() : [];
    act.dirs.forEach((d, i) => {
      let dist = coll.raycast(o[0], o[1], o[2], d[0], d[1], d[2], w.range, n);
      let onPlayer = false;
      for (const e of targets) {
        if (e.id === selfId) continue;
        const h = rayVsPlayer(o, d, e.x, e.y, e.z, e.h, Math.min(dist, w.range));
        if (h) { dist = h.t; onPlayer = true; }
      }
      const end = dist === Infinity ? w.range : dist;
      const p = [o[0] + d[0] * end, o[1] + d[1] * end, o[2] + d[2] * end];
      if (i < 4 || w.pellets <= 4) this.fx.tracer(muzzle, p, w.id === 'sniper' ? [0.7, 0.9, 1] : [1, 0.85, 0.5], w.id === 'sniper' ? 0.25 : 0.08);
      if (dist !== Infinity) this.fx.impact(p, onPlayer ? [-d[0], -d[1], -d[2]] : n, onPlayer ? [0.9, 0.2, 0.2] : [0.95, 0.85, 0.6], w.pellets > 1 ? 2 : 6);
    });
  }

  /** Authoritative events (server, or the offline world). */
  handleEvents(events, localId) {
    for (const ev of events) {
      if (ev.e === 'shot') {
        if (ev.id === localId) continue; // predicted locally
        const o = ev.o;
        const w = WEAPONS[ev.w];
        for (let i = 0; i < ev.h.length; i++) {
          const h = ev.h[i];
          if (i < 3 || w.pellets <= 4) this.fx.tracer(o, h, ev.w === 'sniper' ? [0.7, 0.9, 1] : [1, 0.8, 0.45], ev.w === 'sniper' ? 0.3 : 0.1);
          if (h[3]) {
            const dx = o[0] - h[0], dy = o[1] - h[1], dz = o[2] - h[2], l = Math.hypot(dx, dy, dz) || 1;
            this.fx.impact(h, [dx / l, dy / l, dz / l], h[3] === 1 ? [0.9, 0.2, 0.2] : [0.95, 0.85, 0.6], w.pellets > 1 ? 2 : 5);
          }
        }
        const d0 = ev.h[0];
        const dx = d0[0] - o[0], dy = d0[1] - o[1], dz = d0[2] - o[2], l = Math.hypot(dx, dy, dz) || 1;
        this.fx.muzzle([o[0] + dx / l * 0.7, o[1] - 0.25 + dy / l * 0.7, o[2] + dz / l * 0.7]);
        sfx.shot(ev.w, o);
      } else if (ev.e === 'melee') {
        if (ev.id !== localId) {
          const e = this.session.entityPos?.(ev.id);
          sfx.knife(e ? [e.x, e.y + 1.5, e.z] : null, !!ev.hv);
        } else if (ev.hit) sfx.knifeHit();
      } else if (ev.e === 'hit') {
        if (ev.a === localId && ev.v !== localId) {
          this.hud.hitMarker(!!ev.hs, !!ev.k);
          sfx.hit(!!ev.hs);
          if (settings.get('damageNumbers')) {
            const e = this.session.entityPos?.(ev.v);
            if (e) this.hud.damageNumber(ev.d, [e.x, e.y + 1.9, e.z], !!ev.hs);
          }
          if (ev.k) sfx.kill();
        }
        if (ev.v === localId) {
          this.hud.damageIndicator(ev.ax, ev.az, ev.d);
          if (ev.a !== localId) sfx.hurt();
          this.camShake = Math.max(this.camShake, 0.6);
          if (ev.k) sfx.death();
        }
      } else if (ev.e === 'kill') {
        this.hud.killFeed(ev, localId);
      }
    }
  }

  get fps() {
    const n = this.frameTimes.length;
    if (!n) return 0;
    let s = 0, worst = 0;
    for (const t of this.frameTimes) { s += t; worst = Math.max(worst, t); }
    return { avg: n / s, worstMs: worst * 1000 };
  }
}

export { THREE };
