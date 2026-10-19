// Menu screens: title, lobby, pause, results, plus the settings/keybind panels.
import { h, clear } from './dom.js';
import { settings } from '../core/Settings.js';
import { binds } from '../core/Bindings.js';
import { input } from '../core/Input.js';
import { sfx } from '../audio/Sfx.js';
import { buildSettingsPanel } from './SettingsMenu.js';

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

  // ---------------------------------------------------------------- connecting
  message(title, sub = '', buttons = []) {
    this.mount('msg', h('div.menu', h('div.panel', h('h2', title), sub ? h('div.dim', sub) : null,
      h('div.row', { style: { marginTop: '14px' } }, ...buttons.map(([label, fn, cls]) => h('button.btn' + (cls ? '.' + cls : ''), { on: { click: fn } }, label))))));
  }
}
