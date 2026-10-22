// In-game HUD built with DOM/CSS (cheaper than drawing it in WebGL).
import * as THREE from 'three';
import { h, clear } from './dom.js';
import { settings } from '../core/Settings.js';
import { binds } from '../core/Bindings.js';
import { WEAPONS } from '../../shared/config/weapons.js';
import { MOVEMENT as M } from '../../shared/config/movement.js';
import { MAX_HP, QUICK_CHAT, TEAM_NAMES } from '../../shared/config/game.js';
import { aimView } from '../../shared/sim/weapons.js';

const WEAPON_ICONS = { rifle: 'AR', shotgun: 'SG', sniper: 'SR', pistol: 'PS', revolver: 'RV', knife: 'KN' };

export class Hud {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('hud');
    this.root.innerHTML = '';
    const R = this.root;
    this.crosshair = R.appendChild(h('div.crosshair'));
    this.hitm = R.appendChild(h('div.hitmarker', h('i'), h('i'), h('i'), h('i')));
    this.scope = R.appendChild(h('div.scope', h('div.scope-ring'), h('div.scope-h'), h('div.scope-v')));
    this.dmgWrap = R.appendChild(h('div.dmg-wrap'));
    this.dmgNums = R.appendChild(h('div.dmg-nums'));
    this.feed = R.appendChild(h('div.killfeed'));
    this.chatFeed = R.appendChild(h('div.chatfeed'));
    this.top = R.appendChild(h('div.topbar',
      this.scoreA = h('div.score.team0', '0'),
      h('div.mid', this.timer = h('div.timer', ''), this.roundLbl = h('div.round-lbl', '')),
      this.scoreB = h('div.score.team1', '0'),
    ));
    this.net = R.appendChild(h('div.netinfo', this.pingEl = h('span.ping', ''), this.perf = h('div.perf')));
    this.health = R.appendChild(h('div.health', this.hpNum = h('div.hp-num', '100'), h('div.hp-bar', this.hpFill = h('div.hp-fill'))));
    this.ammo = R.appendChild(h('div.ammo', this.ammoNum = h('div.ammo-num', ''), this.wlist = h('div.wlist')));
    this.dash = R.appendChild(h('div.dash', this.dashFill = h('div.dash-fill'), this.dashLbl = h('span.dash-lbl', 'DASH')));
    this.banner = R.appendChild(h('div.banner', this.bannerMain = h('div.banner-main'), this.bannerSub = h('div.banner-sub')));
    this.spec = R.appendChild(h('div.spectate'));
    this.center = R.appendChild(h('div.center-msg'));
    this.wheel = R.appendChild(h('div.wheel'));
    this.board = R.appendChild(h('div.scoreboard'));
    this.loadout = R.appendChild(h('div.loadout-panel'));
    this.flash = R.appendChild(h('div.hurt-flash'));
    QUICK_CHAT.forEach((txt, i) => {
      const a = (i / QUICK_CHAT.length) * Math.PI * 2;
      this.wheel.append(h('div.wheel-item', { style: { left: `${50 + Math.sin(a) * 38}%`, top: `${50 - Math.cos(a) * 38}%` } }, txt));
    });
    this.wheel.append(h('div.wheel-hint', 'Move to pick, release to send'));
    this.wheelOpen = false;
    this.wheelVec = [0, 0];
    this.wheelSel = -1;
    this.indicators = [];
    this.numbers = [];
    this.hitT = 0;
    this.feedItems = [];
    this.lastWeaponKey = '';
    this.boardOpen = false;
    this.buildCrosshair();
    settings.onChange((k) => { if (k === 'crosshair' || k === '*') this.buildCrosshair(); });
    binds.onChange(() => { this.lastWeaponKey = ''; });
    this.show(false);
  }

  show(v) { this.root.classList.toggle('hidden', !v); }

  buildCrosshair() {
    const c = settings.get('crosshair');
    const el = this.crosshair;
    clear(el);
    el.style.setProperty('--ch-color', c.color);
    el.style.setProperty('--ch-size', c.size + 'px');
    el.style.setProperty('--ch-thick', c.thickness + 'px');
    el.style.setProperty('--ch-gap', c.gap + 'px');
    el.className = 'crosshair style-' + c.style + (c.outline ? ' outline' : '');
    if (c.style === 'cross' || c.style === 't') {
      for (const d of c.style === 't' ? ['r', 'b', 'l'] : ['t', 'r', 'b', 'l']) el.append(h('i.' + d));
      el.append(h('b.dot-mini'));
    } else if (c.style === 'dot') el.append(h('b.dot'));
    else if (c.style === 'circle') { el.append(h('b.ring')); el.append(h('b.dot-mini')); }
  }

  // ---------------------------------------------------------------- events
  hitMarker(head, kill) {
    this.hitm.className = 'hitmarker show' + (head ? ' head' : '') + (kill ? ' kill' : '');
    this.hitT = kill ? 0.35 : 0.18;
  }

  damageIndicator(ax, az, dmg) {
    const el = h('div.dmg-ind', h('i'));
    this.dmgWrap.append(el);
    this.indicators.push({ el, ax, az, t: 1.3 });
    if (this.indicators.length > 6) { const o = this.indicators.shift(); o.el.remove(); }
    this.flash.style.opacity = String(Math.min(0.5, 0.15 + dmg / 150));
  }

  damageNumber(d, pos, head) {
    const el = h('div.dmg-num' + (head ? '.head' : ''), String(d));
    this.dmgNums.append(el);
    this.numbers.push({ el, pos: new THREE.Vector3(...pos), t: 0.8 });
  }

  killFeed(ev, localId) {
    const s = this.game.session;
    const name = (id) => s?.playerName?.(id) ?? `#${id}`;
    const team = (id) => s?.playerTeam?.(id);
    const mine = ev.a === localId || ev.v === localId;
    const killer = ev.a >= 0 ? h('span.t' + (team(ev.a) ?? 'x'), name(ev.a)) : null;
    const icon = h('span.kf-w', ev.w === 'fall' ? 'FALL' : (WEAPON_ICONS[ev.w] || '✕') + (ev.hs ? ' ⦿' : ''));
    const row = h('div.kf' + (mine ? '.mine' : ''), killer, icon, h('span.t' + (team(ev.v) ?? 'x'), name(ev.v)));
    this.feed.prepend(row);
    this.feedItems.push({ el: row, t: 5 });
    while (this.feed.children.length > 5) this.feed.lastChild.remove();
  }

  chatMessage(name, team, i) {
    const row = h('div.cm', h('span.t' + team, name + ': '), QUICK_CHAT[i] || '');
    this.chatFeed.append(row);
    setTimeout(() => row.remove(), 5000);
    while (this.chatFeed.children.length > 4) this.chatFeed.firstChild.remove();
  }

  setBanner(main, sub = '', cls = '') {
    this.bannerMain.textContent = main || '';
    this.bannerSub.textContent = sub || '';
    this.banner.className = 'banner' + (main ? ' show ' + cls : '');
  }

  // ---------------------------------------------------------------- chat wheel
  chatWheel(down) {
    const s = this.game.session;
    if (!s?.sendChat) return;
    if (down && !this.game.paused) {
      this.wheelOpen = true; this.wheelVec = [0, 0]; this.wheelSel = -1;
      this.wheel.classList.add('show');
      this.updateWheel();
    } else if (!down && this.wheelOpen) {
      this.wheelOpen = false;
      this.wheel.classList.remove('show');
      if (this.wheelSel >= 0) s.sendChat(this.wheelSel);
    }
  }
  wheelMove(dx, dy) {
    this.wheelVec[0] += dx; this.wheelVec[1] += dy;
    const l = Math.hypot(...this.wheelVec);
    if (l > 120) { this.wheelVec[0] *= 120 / l; this.wheelVec[1] *= 120 / l; }
    this.updateWheel();
  }
  updateWheel() {
    const [x, y] = this.wheelVec;
    const n = QUICK_CHAT.length;
    this.wheelSel = Math.hypot(x, y) < 25 ? -1 : Math.round(((Math.atan2(x, -y) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2 / n)) % n;
    [...this.wheel.querySelectorAll('.wheel-item')].forEach((el, i) => el.classList.toggle('sel', i === this.wheelSel));
  }

  showScoreboard(v) { this.boardOpen = v; this.board.classList.toggle('show', v); if (v) this.renderBoard(); }

  renderBoard(final = false, target = this.board) {
    const s = this.game.session;
    const info = s?.scoreboard?.();
    clear(target);
    if (!info) return;
    const row = (p) => h('tr' + (p.me ? '.me' : '') + (p.alive === false ? '.dead' : ''),
      h('td.nm', p.name + (p.bot ? ' [BOT]' : '') + (p.disc ? ' (away)' : '')), h('td', p.kills), h('td', p.deaths),
      h('td', p.deaths ? (p.kills / p.deaths).toFixed(2) : p.kills.toFixed(2)), h('td', p.damage), h('td', p.ping ?? '-'));
    const head = () => h('tr', h('th', 'Player'), h('th', 'K'), h('th', 'D'), h('th', 'K/D'), h('th', 'DMG'), h('th', 'Ping'));
    target.append(h('div.sb-title', info.title || 'Scoreboard'));
    for (const group of info.groups) {
      target.append(h('div.sb-group.t' + (group.team ?? 'x'),
        group.label ? h('div.sb-label', group.label, h('span', group.score ?? '')) : null,
        h('table', head(), ...group.players.map(row))));
    }
    if (final) target.classList.add('final');
  }

  // ---------------------------------------------------------------- loadout
  showLoadout(opts) {
    // opts: { primaries, secondaries, cur:{p,s}, onPick(p,s), time }
    if (!opts) { this.loadout.classList.remove('show'); this.loadoutOpts = null; return; }
    this.loadoutOpts = opts;
    const { cur } = opts;
    clear(this.loadout);
    const card = (id, key, sel, fn) => h('button.lo-card' + (sel ? '.sel' : ''), { on: { click: fn } },
      h('div.lo-key', key), h('div.lo-name', WEAPONS[id].name), h('div.lo-stat', statLine(WEAPONS[id])));
    this.loadout.append(
      h('div.lo-title', 'Choose loadout', this.loTime = h('span.lo-time', '')),
      h('div.lo-row', h('div.lo-lbl', 'Primary'), ...opts.primaries.map((id, i) => card(id, String(i + 1), cur.p === id, () => opts.onPick(id, cur.s)))),
      h('div.lo-row', h('div.lo-lbl', 'Secondary'), ...opts.secondaries.map((id, i) => card(id, String(opts.primaries.length + i + 1), cur.s === id, () => opts.onPick(cur.p, id)))),
      h('div.lo-hint', 'Press the number keys or click. The knife is always in slot 3.'),
    );
    this.loadout.classList.add('show');
  }

  // ---------------------------------------------------------------- per frame
  update(dt, view, ws, spec) {
    const s = this.game.session;
    const info = s?.hudInfo?.() || {};
    const alive = view && view.alive;

    // Health
    const hp = alive ? Math.max(0, Math.ceil(view.hp)) : 0;
    this.hpNum.textContent = String(hp);
    this.hpFill.style.width = `${(hp / MAX_HP) * 100}%`;
    this.health.classList.toggle('low', hp <= 30);
    this.health.style.display = alive ? '' : 'none';

    // Ammo & weapons
    if (alive && ws) {
      const w = WEAPONS[ws.slots[ws.cur]];
      if (w.kind === 'gun') {
        this.ammoNum.textContent = ws.reloadT > 0 ? 'RELOADING' : `${ws.ammo[ws.cur]} / ${w.mag}`;
        this.ammoNum.classList.toggle('low', ws.ammo[ws.cur] <= Math.ceil(w.mag * 0.25));
      } else { this.ammoNum.textContent = 'KNIFE  +SPEED'; this.ammoNum.classList.remove('low'); }
      const key = ws.slots.join(',') + ws.cur;
      if (key !== this.lastWeaponKey) {
        this.lastWeaponKey = key;
        clear(this.wlist);
        ws.slots.forEach((id, i) => this.wlist.append(h('div.wl' + (i === ws.cur ? '.cur' : ''),
          h('span.wl-key', binds.label('slot' + (i + 1))), h('span.wl-name', WEAPONS[id].name))));
      }
      this.ammo.style.display = '';
      // Scope overlay: decided only by aimView(), which is false for anything without a real scope.
      // (Always pass a boolean to classList.toggle: an undefined second argument means "flip".)
      const aim = aimView(ws);
      this.scope.classList.toggle('show', aim.scoped === true);
      this.crosshair.style.display = aim.scoped || (aim.ads > 0.6 && w.id !== 'shotgun') ? 'none' : '';
      // Dash
      const cd = view.dashCd;
      this.dashFill.style.width = `${(1 - cd / M.dashCooldown) * 100}%`;
      this.dash.classList.toggle('ready', cd <= 0 && !view.dashUsed);
      this.dashLbl.textContent = cd > 0 ? `DASH ${cd.toFixed(1)}` : `DASH [${binds.label('dash')}]`;
      this.dash.style.display = '';
    } else {
      this.ammo.style.display = 'none';
      this.scope.classList.remove('show');
      this.dash.style.display = 'none';
      this.crosshair.style.display = spec ? 'none' : '';
    }

    // Hit marker
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) this.hitm.className = 'hitmarker'; }

    // Damage indicators (rotate with the camera)
    const cam = this.game.r.camera;
    for (let i = this.indicators.length - 1; i >= 0; i--) {
      const d = this.indicators[i];
      d.t -= dt;
      if (d.t <= 0) { d.el.remove(); this.indicators.splice(i, 1); continue; }
      const dx = d.ax - cam.position.x, dz = d.az - cam.position.z;
      const yaw = cam.rotation.y;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const ang = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
      d.el.style.transform = `rotate(${ang}rad)`;
      d.el.style.opacity = String(Math.min(1, d.t));
    }
    const fo = parseFloat(this.flash.style.opacity || '0');
    if (fo > 0) this.flash.style.opacity = String(Math.max(0, fo - dt * 1.2));

    // Damage numbers
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.t -= dt;
      n.pos.y += dt * 0.8;
      if (n.t <= 0) { n.el.remove(); this.numbers.splice(i, 1); continue; }
      const p = n.pos.clone().project(cam);
      if (p.z > 1) { n.el.style.display = 'none'; continue; }
      n.el.style.display = '';
      n.el.style.left = `${(p.x * 0.5 + 0.5) * 100}%`;
      n.el.style.top = `${(-p.y * 0.5 + 0.5) * 100}%`;
      n.el.style.opacity = String(Math.min(1, n.t * 2));
    }

    // Kill feed fade
    for (let i = this.feedItems.length - 1; i >= 0; i--) {
      const f = this.feedItems[i];
      f.t -= dt;
      if (f.t <= 0) { f.el.remove(); this.feedItems.splice(i, 1); }
    }

    // Top bar
    if (info.top) {
      this.top.style.display = '';
      this.timer.textContent = info.top.timer ?? '';
      this.roundLbl.textContent = info.top.round ?? '';
      this.scoreA.textContent = info.top.a ?? '';
      this.scoreB.textContent = info.top.b ?? '';
      this.scoreA.style.display = info.top.a == null ? 'none' : '';
      this.scoreB.style.display = info.top.b == null ? 'none' : '';
      this.scoreA.title = TEAM_NAMES[0]; this.scoreB.title = TEAM_NAMES[1];
      this.top.classList.toggle('me1', info.top.myTeam === 1);
    } else this.top.style.display = 'none';

    this.pingEl.textContent = info.ping != null ? `${Math.round(info.ping)} ms` : '';
    this.pingEl.className = 'ping' + (info.ping > 150 ? ' bad' : info.ping > 80 ? ' meh' : '');
    if (settings.get('showFps')) {
      const f = this.game.fps;
      const ri = this.game.r.info.render;
      this.perf.textContent = `${f.avg.toFixed(0)} fps · worst ${f.worstMs.toFixed(1)} ms · ${ri.calls} calls · ${(ri.triangles / 1000).toFixed(1)}k tris${info.perf ? ' · ' + info.perf : ''}`;
      this.perf.style.display = '';
    } else this.perf.style.display = 'none';

    // Spectating
    if (spec) {
      const fk = binds.binds.fire.find((c) => !c.startsWith('Mouse')) ? binds.label('fire', binds.binds.fire.findIndex((c) => !c.startsWith('Mouse'))) : binds.label('fire');
      this.spec.textContent = `Spectating ${spec.name}  ·  [${fk}] next  ·  [${binds.label('jump')}] previous`;
      this.spec.style.display = '';
    }
    else if (info.deadMsg && !alive) { this.spec.textContent = info.deadMsg; this.spec.style.display = ''; }
    else this.spec.style.display = 'none';

    this.center.textContent = info.center || '';
    this.center.style.display = info.center ? '' : 'none';
    if (this.loadoutOpts && this.loTime) this.loTime.textContent = info.freeze ? `${Math.ceil(info.freeze)}s` : '';
    if (this.boardOpen) { this.boardT = (this.boardT || 0) - dt; if (this.boardT <= 0) { this.boardT = 0.5; this.renderBoard(); } }
  }
}

function statLine(w) {
  if (w.kind === 'melee') return 'Always equipped';
  const dmg = w.pellets > 1 ? `${w.pellets}×${w.damage}` : w.damage;
  return `${dmg} dmg · ${w.auto ? 'auto' : 'semi'} · ${w.mag} rds`;
}
