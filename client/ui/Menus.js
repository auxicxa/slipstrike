// Menu screens: title, lobby, pause, results, plus the settings/keybind panels.
import { h, clear } from './dom.js';
import { settings } from '../core/Settings.js';
import { binds } from '../core/Bindings.js';
import { input } from '../core/Input.js';
import { sfx } from '../audio/Sfx.js';
import { buildSettingsPanel } from './SettingsMenu.js';
import { MODES, TEAM_NAMES } from '../../shared/config/game.js';
import { MAPS, MATCH_MAPS } from '../../shared/maps/index.js';
import { WEAPONS, PRIMARIES, SECONDARIES } from '../../shared/config/weapons.js';

export class Menus {
  constructor(app) {
    this.app = app; // { game, startPractice, quickPlay, createRoom, joinRoom, leaveMatch, net }
    this.root = document.getElementById('menus');
    this.screen = null;
    this.toastEl = document.getElementById('toast');
  }

  clear() {
    clear(this.root);
    this.screen = null;
  }

  toast(msg, ms = 2500) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  mount(name, el) {
    clear(this.root);
    this.root.append(el);
    this.screen = name;
    return el;
  }

  // ---------------------------------------------------------------- title
  title(err = '') {
    const nameIn = h('input.field.grow', { maxLength: 16, placeholder: 'Nickname', value: settings.get('name') || '' });
    const codeIn = h('input.field.code-field', { maxLength: 4, placeholder: 'CODE' });
    const errEl = h('div.err', err);
    const getName = () => {
      const n = nameIn.value.trim();
      if (!n) { errEl.textContent = 'Pick a nickname first.'; nameIn.focus(); return null; }
      settings.set('name', n.slice(0, 16));
      return n.slice(0, 16);
    };
    const go = (fn) => () => { sfx.unlock(); sfx.click(); const n = getName(); if (n) fn(n); };
    codeIn.addEventListener('input', () => { codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z]/g, ''); });
    codeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
    const join = go((n) => {
      if (codeIn.value.length !== 4) { errEl.textContent = 'Room codes are 4 letters.'; return; }
      this.app.joinRoom(n, codeIn.value);
    });
    const el = h('div.menu', h('div.panel',
      h('div.logo', 'SLIPSTRIKE'),
      h('div.tagline', 'Slide. Dash. Click heads. First to five.'),
      h('div.row', nameIn),
      h('div.col',
        h('button.btn.primary.big', { on: { click: go((n) => this.app.quickPlay(n)) } }, 'Quick Play'),
        h('div.row',
          h('button.btn.grow', { on: { click: go((n) => this.app.createRoom(n)) } }, 'Create Room'),
          codeIn,
          h('button.btn', { on: { click: join } }, 'Join'),
        ),
        h('button.btn', { on: { click: () => { sfx.unlock(); this.app.startPractice(); } } }, 'Practice Range (offline)'),
        h('button.btn', { on: { click: () => this.settings(() => this.title()) } }, 'Settings & Controls'),
      ),
      errEl,
      h('div.hint',
        'Made for trackpads: ', h('span.kbd', binds.label('fire', 1)), ' fires, ', h('span.kbd', binds.label('ads')), ' scopes, ',
        h('span.kbd', binds.label('dash')), ' air-dashes. Every key can be rebound in Settings.'),
    ));
    this.mount('title', el);
    if (!nameIn.value) setTimeout(() => nameIn.focus(), 50);
  }

  // ---------------------------------------------------------------- pause / click to play
  pause({ first = false, onResume, onLeave, extra = null } = {}) {
    const lockErr = h('div.err');
    const off = input.on('lockError', (m) => { lockErr.textContent = m; });
    const resume = () => { sfx.unlock(); lockErr.textContent = ''; onResume(); };
    const el = h('div.menu.clear', h('div.panel',
      h('h2', first ? 'Ready?' : 'Paused'),
      first ? h('div.dim', 'The match keeps running for everyone else while you are in menus.') : h('div.dim', 'You are still in the match. Your player stands still while paused.'),
      h('div.col', { style: { marginTop: '14px' } },
        h('button.btn.primary.big', { on: { click: resume } }, first ? 'Click to play' : 'Resume'),
        extra,
        h('button.btn', { on: { click: () => this.settings(() => this.pause({ first, onResume, onLeave, extra })) } }, 'Settings & Controls'),
        h('button.btn', { on: { click: onLeave } }, 'Leave'),
      ),
      lockErr,
      h('div.hint', 'Your pointer gets locked to the game. Press ', h('span.kbd', 'Esc'), ' (or ', h('span.kbd', binds.label('pause')), ') to get it back.'),
    ));
    el.addEventListener('click', (e) => { if (e.target === el) resume(); });
    this.mount('pause', el);
    this.cleanup = off;
  }

  hide() {
    if (this.cleanup) { this.cleanup(); this.cleanup = null; }
    this.clear();
  }

  // ---------------------------------------------------------------- settings
  settings(onBack) {
    const panel = buildSettingsPanel({ onBack, toast: (m) => this.toast(m) });
    this.mount('settings', h('div.menu', panel));
  }

  // ---------------------------------------------------------------- lobby
  /**
   * room: server room state. act: { setMode(mode,map), swap(), ready(bool), loadout(p,s), leave() }
   */
  lobby(room, myId, act) {
    const me = room.players.find((p) => p.id === myId);
    const isHost = room.host === myId;
    const def = MODES[room.mode];
    const modeBtns = Object.values(MODES).map((m) => h('button.btn.small' + (room.mode === m.id ? '.sel' : ''), {
      disabled: !isHost, on: { click: () => act.setMode(m.id) },
    }, m.label));
    const mapSel = h('select.field', { disabled: !isHost, on: { change: (e) => act.setMode(room.mode, e.target.value) } },
      ...MATCH_MAPS.map((id) => h('option', { value: id, selected: id === room.map }, MAPS[id].name)));
    const pl = (p) => h('div.pl' + (p.id === myId ? '.me' : ''),
      h('span', (p.id === room.host ? '★ ' : '') + p.name + (p.disc ? ' (reconnecting)' : '')),
      h('span' + (p.ready ? '.rdy' : '.nrdy'), p.ready ? 'READY' : 'not ready'));
    let teams;
    if (def.teams) {
      teams = h('div.teams', ...[0, 1].map((t) => h('div.team-col.t' + t,
        h('h4', `${TEAM_NAMES[t]} (${room.players.filter((p) => p.team === t).length}/${def.teamSize})`),
        ...room.players.filter((p) => p.team === t).map(pl))));
    } else {
      teams = h('div.teams', h('div.team-col', { style: { gridColumn: '1 / -1' } }, h('h4', `Players (${room.players.length}/${def.teamSize})`), ...room.players.map(pl)));
    }
    const lo = me?.lo || { p: 'rifle', s: 'pistol' };
    const loSel = (list, cur, fn) => h('div.seg', ...list.map((id) => h('button' + (cur === id ? '.on' : ''), { on: { click: () => fn(id) } }, WEAPONS[id].name)));
    let status = '';
    if (room.phase === 'countdown') status = h('div.countdown', `Starting in ${Math.ceil(room.pt)}…`);
    else if (def.teams && (room.players.filter((p) => p.team === 0).length === 0 || room.players.filter((p) => p.team === 1).length === 0)) status = h('div.dim', 'Waiting for players on both teams. Share the room code!');
    else if (room.players.some((p) => !p.ready)) status = h('div.dim', 'The match starts when everyone is ready.');
    const el = h('div.menu', h('div.panel.wide',
      h('div.row', h('div.grow',
        h('div.dim', room.pub ? 'Public room (quick play)' : 'Private room. Share this code:'),
        h('div.lobby-code', room.code)),
        h('button.btn', { on: { click: act.leave } }, 'Leave')),
      h('h3', 'Mode' + (isHost ? '' : ' (host picks)')),
      h('div.row', ...modeBtns, h('span.grow'), mapSel),
      teams,
      h('h3', 'Loadout'),
      h('div.row', h('span.dim', 'Primary'), loSel(PRIMARIES, lo.p, (p) => act.loadout(p, lo.s)), h('span.dim', 'Secondary'), loSel(SECONDARIES, lo.s, (s) => act.loadout(lo.p, s))),
      h('div.row', { style: { marginTop: '16px' } },
        def.teams ? h('button.btn', { on: { click: act.swap } }, 'Swap team') : null,
        h('button.btn.big.grow' + (me?.ready ? '' : '.primary'), { on: { click: () => act.ready(!me?.ready) } }, me?.ready ? 'Not ready' : 'Ready'),
      ),
      status,
      h('div.hint', 'First to 5 rounds. No respawns mid-round. Sides swap at halftime. Free-for-all has instant respawns.'),
    ));
    this.mount('lobby', el);
  }

  // ---------------------------------------------------------------- results
  results(room, myId, onLeave) {
    const r = room.result;
    if (!r) return;
    const def = MODES[r.mode];
    let winner;
    if (def.teams) {
      const mine = r.players.find((p) => p.id === myId)?.team;
      winner = h('div.winner' + (r.winner === mine ? '.t' + mine : ''), r.winner === mine ? 'VICTORY' : 'DEFEAT');
    } else {
      const w = r.players.find((p) => p.id === r.winner);
      winner = h('div.winner', w ? (w.id === myId ? 'YOU WIN' : `${w.name} wins`) : 'Match over');
    }
    const row = (p) => h('tr' + (p.id === myId ? '.me' : ''), h('td.nm', p.name), h('td', p.k), h('td', p.d), h('td', (p.d ? p.k / p.d : p.k).toFixed(2)), h('td', p.dmg));
    const table = (list) => h('table', h('tr', h('th', 'Player'), h('th', 'K'), h('th', 'D'), h('th', 'K/D'), h('th', 'Damage')), ...list.sort((a, b) => b.k - a.k).map(row));
    const groups = def.teams
      ? [0, 1].map((t) => h('div.sb-group.t' + t, h('div.sb-label', TEAM_NAMES[t], h('span', r.scores[t])), table(r.players.filter((p) => p.team === t))))
      : [table(r.players.slice())];
    const el = h('div.menu.clear', h('div.panel.results',
      winner,
      def.teams ? h('div.final-score', `${r.scores[0]} – ${r.scores[1]}`) : null,
      r.reason === 'forfeit' ? h('div.dim', { style: { textAlign: 'center' } }, 'The other team left the match.') : null,
      ...groups,
      h('div.row', { style: { marginTop: '14px' } }, this.backT = h('div.dim.grow', ''), h('button.btn', { on: { click: onLeave } }, 'Leave room')),
    ));
    this.mount('results', el);
  }

  // ---------------------------------------------------------------- connecting
  message(title, sub = '', buttons = []) {
    this.mount('msg', h('div.menu', h('div.panel', h('h2', title), sub ? h('div.dim', sub) : null,
      h('div.row', { style: { marginTop: '14px' } }, ...buttons.map(([label, fn, cls]) => h('button.btn' + (cls ? '.' + cls : ''), { on: { click: fn } }, label))))));
  }
}
