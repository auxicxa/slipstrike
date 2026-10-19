// Settings panel with tabs: Look (trackpad options), Controls (keybinds), Video, Audio, HUD.
import { h, clear } from './dom.js';
import { settings, DEFAULT_SETTINGS } from '../core/Settings.js';
import { binds, ACTIONS, codeLabel, actionLabel } from '../core/Bindings.js';
import { input } from '../core/Input.js';
import { sfx } from '../audio/Sfx.js';

let lastTab = 'look';

export function buildSettingsPanel({ onBack, toast }) {
  const body = h('div');
  const tabs = [['look', 'Look & aim'], ['controls', 'Controls'], ['video', 'Video'], ['audio', 'Audio'], ['hud', 'HUD & crosshair']];
  const tabBar = h('div.tabs');
  const render = (id) => {
    lastTab = id;
    [...tabBar.children].forEach((b) => b.classList.toggle('sel', b.dataset.id === id));
    clear(body);
    body.append(({ look: lookTab, controls: () => controlsTab(toast), video: videoTab, audio: audioTab, hud: hudTab })[id]());
  };
  for (const [id, label] of tabs) {
    const b = h('button.btn.small', { on: { click: () => render(id) } }, label);
    b.dataset.id = id;
    tabBar.append(b);
  }
  const panel = h('div.panel.wide',
    h('div.row', h('h2.grow', { style: { margin: 0 } }, 'Settings'), h('button.btn', { on: { click: () => { input.capture = null; onBack(); } } }, 'Back')),
    tabBar, body,
  );
  render(lastTab);
  return panel;
}

// ---------------------------------------------------------------- widgets
function slider(key, label, min, max, step, fmt = (v) => v, sub) {
  const get = () => (sub ? settings.get(key)[sub] : settings.get(key));
  const val = h('span.val', fmt(get()));
  const inp = h('input', { type: 'range', min, max, step, value: get() });
  inp.addEventListener('input', () => {
    const v = parseFloat(inp.value);
    if (sub) settings.set(key, { ...settings.get(key), [sub]: v }); else settings.set(key, v);
    val.textContent = fmt(v);
  });
  return [h('label', label), h('div', inp, val)];
}

function toggle(key, label, sub, hint) {
  const get = () => (sub ? settings.get(key)[sub] : settings.get(key));
  const b = h('button.toggle' + (get() ? '.on' : ''), { 'aria-label': label });
  b.addEventListener('click', () => {
    const v = !get();
    if (sub) settings.set(key, { ...settings.get(key), [sub]: v }); else settings.set(key, v);
    b.classList.toggle('on', v);
    sfx.click();
  });
  return [h('label', label, hint ? h('div.hint', hint) : null), b];
}

function segmented(key, label, options, sub) {
  const get = () => (sub ? settings.get(key)[sub] : settings.get(key));
  const wrap = h('div.seg');
  for (const [v, txt] of options) {
    const b = h('button' + (get() === v ? '.on' : ''), txt);
    b.addEventListener('click', () => {
      if (sub) settings.set(key, { ...settings.get(key), [sub]: v }); else settings.set(key, v);
      [...wrap.children].forEach((c) => c.classList.remove('on'));
      b.classList.add('on');
      sfx.click();
    });
    wrap.append(b);
  }
  return [h('label', label), wrap];
}

const grid = (...rows) => h('div.set-grid', ...rows.flat());

// ---------------------------------------------------------------- tabs
function lookTab() {
  return h('div',
    h('h3', 'Sensitivity'),
    grid(
      slider('sens', 'Look sensitivity', 0.05, 5, 0.05, (v) => v.toFixed(2)),
      slider('adsSens', 'Aim / scope sensitivity (multiplier)', 0.2, 2, 0.05, (v) => v.toFixed(2)),
      segmented('adsMode', 'Aim / scope key', [['hold', 'Hold'], ['toggle', 'Toggle']]),
      toggle('invertY', 'Invert vertical look'),
    ),
    h('h3', 'Trackpad options'),
    grid(
      toggle('rawInput', 'Raw input (turn off the OS pointer acceleration)', null, 'Chrome and Edge only. With a trackpad most people prefer this OFF.'),
      toggle('lookAccel', 'Extra look acceleration', null, 'Small swipes stay precise, fast swipes turn further. Useful for 180° turns on a trackpad.'),
      slider('lookAccelAmount', 'Acceleration amount', 0.1, 1.5, 0.05, (v) => v.toFixed(2)),
      slider('smoothing', 'Look smoothing', 0, 0.8, 0.05, (v) => (v === 0 ? 'off' : v.toFixed(2))),
      slider('keyLookSpeed', 'Keyboard look speed (°/s, arrow keys by default)', 40, 400, 10, (v) => v),
      toggle('aimAssist', 'Gentle aim assist', null, 'Look speed slows a little while your crosshair is on an enemy. Off by default.'),
    ),
    h('div.hint', { style: { marginTop: '12px' } }, 'Tip: fire is on ', h('span.kbd', binds.label('fire', 1)),
      ' and scope is on ', h('span.kbd', binds.label('ads')), ', so you never need to click the trackpad while moving.'),
  );
}

function videoTab() {
  return h('div', grid(
    slider('fov', 'Field of view', 70, 115, 1, (v) => v + '°'),
    segmented('quality', 'Graphics quality', [['low', 'Low'], ['med', 'Medium'], ['high', 'High']]),
    toggle('showFps', 'Show performance overlay', null, 'Also bound to the ` key.'),
  ), h('div.hint', { style: { marginTop: '12px' } }, 'Medium renders at 1× pixel ratio. That is the best balance on school MacBooks. High renders at Retina resolution with antialiasing.'));
}

function audioTab() {
  return h('div', grid(slider('volume', 'Master volume', 0, 1, 0.05, (v) => Math.round(v * 100) + '%')));
}

function hudTab() {
  const color = h('input', { type: 'color', value: settings.get('crosshair').color });
  color.addEventListener('input', () => settings.set('crosshair', { ...settings.get('crosshair'), color: color.value }));
  return h('div',
    h('h3', 'Crosshair'),
    grid(
      segmented('crosshair', 'Style', [['cross', 'Cross'], ['t', 'T'], ['dot', 'Dot'], ['circle', 'Circle']], 'style'),
      [h('label', 'Colour'), color],
      slider('crosshair', 'Size', 2, 24, 1, (v) => v, 'size'),
      slider('crosshair', 'Thickness', 1, 6, 1, (v) => v, 'thickness'),
      slider('crosshair', 'Gap', 0, 16, 1, (v) => v, 'gap'),
      toggle('crosshair', 'Outline', 'outline'),
    ),
    h('h3', 'Combat'),
    grid(toggle('damageNumbers', 'Show damage numbers')),
    h('div.row', { style: { marginTop: '16px' } }, h('button.btn.small', { on: { click: () => { if (confirm('Reset all settings (not keybinds) to defaults?')) settings.reset(); } } }, 'Reset all settings to defaults')),
  );
}

function controlsTab(toast) {
  const wrap = h('div');
  const draw = () => {
    clear(wrap);
    const conflicts = new Set(binds.conflicts().map(([c]) => c));
    const table = h('table.binds');
    let group = '';
    for (const a of ACTIONS) {
      if (a.group !== group) {
        group = a.group;
        table.append(h('tr', h('td', { colSpan: 3 }, h('h3', group))));
      }
      const cells = [0, 1].map((slot) => {
        const code = binds.binds[a.id][slot];
        const b = h('button.bind-btn' + (code && conflicts.has(code) ? '.conflict' : ''), code ? codeLabel(code) : '—');
        b.title = 'Click, then press a key or mouse button. Esc cancels, Backspace clears.';
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          b.textContent = 'Press a key…';
          b.classList.add('listening');
          // Defer so this click doesn't bind itself as "Left click"
          setTimeout(() => input.captureNext((newCode) => {
            if (newCode === 'Backspace') binds.clear(a.id, slot);
            else if (newCode) {
              const lost = binds.bind(a.id, slot, newCode);
              if (lost.length) toast(`${codeLabel(newCode)} was moved from "${lost.map(actionLabel).join(', ')}" to "${a.label}"`);
            }
            draw();
          }), 0);
        });
        return h('td', b);
      });
      table.append(h('tr', h('td.act', a.label), ...cells));
    }
    wrap.append(
      h('div.row', h('div.dim.grow', 'Click a binding, then press any key or mouse button. Esc cancels, Backspace clears. If a key is already used, it moves to the new action.'),
        h('button.btn.small', { on: { click: () => { binds.resetAll(); draw(); toast('Keybinds reset to defaults'); } } }, 'Reset to default')),
      table,
      h('div.hint', 'Defaults stay away from Ctrl and Cmd: on a Mac those trigger right-click and browser shortcuts. Esc always opens the pause menu (the browser reserves it).'),
    );
  };
  draw();
  return wrap;
}

export { DEFAULT_SETTINGS };
