// Rebindable actions. Each action has up to two bindings (KeyboardEvent.code or Mouse0..Mouse4).
const KEY = 'slipstrike.binds.v1';

export const ACTIONS = [
  { id: 'forward', label: 'Move forward', group: 'Movement', def: ['KeyW'] },
  { id: 'back', label: 'Move back', group: 'Movement', def: ['KeyS'] },
  { id: 'left', label: 'Move left', group: 'Movement', def: ['KeyA'] },
  { id: 'right', label: 'Move right', group: 'Movement', def: ['KeyD'] },
  { id: 'jump', label: 'Jump', group: 'Movement', def: ['Space'] },
  { id: 'crouch', label: 'Crouch / slide', group: 'Movement', def: ['KeyC'] },
  { id: 'sprint', label: 'Sprint', group: 'Movement', def: ['ShiftLeft', 'ShiftRight'] },
  { id: 'dash', label: 'Air dash', group: 'Movement', def: ['KeyV'] },
  { id: 'fire', label: 'Fire / quick stab', group: 'Combat', def: ['Mouse0', 'KeyF'] },
  { id: 'ads', label: 'Scope / ADS / heavy stab', group: 'Combat', def: ['KeyE', 'Mouse2'] },
  { id: 'reload', label: 'Reload', group: 'Combat', def: ['KeyR'] },
  { id: 'slot1', label: 'Primary weapon', group: 'Combat', def: ['Digit1'] },
  { id: 'slot2', label: 'Secondary weapon', group: 'Combat', def: ['Digit2'] },
  { id: 'slot3', label: 'Weapon slot 3 (knife)', group: 'Combat', def: ['Digit3'] },
  { id: 'knife', label: 'Knife', group: 'Combat', def: ['KeyX'] },
  { id: 'lastWeapon', label: 'Quick-switch last weapon', group: 'Combat', def: ['KeyQ'] },
  { id: 'scoreboard', label: 'Scoreboard', group: 'Interface', def: ['Tab'] },
  { id: 'chatWheel', label: 'Quick-chat wheel', group: 'Interface', def: ['KeyT'] },
  { id: 'pause', label: 'Pause menu', group: 'Interface', def: ['KeyP'] },
  { id: 'stats', label: 'Performance overlay', group: 'Interface', def: ['Backquote'] },
  { id: 'lookLeft', label: 'Look left (keyboard look)', group: 'Keyboard look', def: ['ArrowLeft'] },
  { id: 'lookRight', label: 'Look right', group: 'Keyboard look', def: ['ArrowRight'] },
  { id: 'lookUp', label: 'Look up', group: 'Keyboard look', def: ['ArrowUp'] },
  { id: 'lookDown', label: 'Look down', group: 'Keyboard look', def: ['ArrowDown'] },
];

const byId = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));

export function defaultBinds() {
  return Object.fromEntries(ACTIONS.map((a) => [a.id, a.def.slice()]));
}

class BindStore {
  constructor() {
    this.binds = defaultBinds();
    this.listeners = new Set();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        for (const a of ACTIONS) {
          if (Array.isArray(saved[a.id])) this.binds[a.id] = saved[a.id].filter((c) => typeof c === 'string').slice(0, 2);
        }
      }
    } catch { /* ignore */ }
    this.rebuild();
  }

  rebuild() {
    /** code → [actionIds] */
    this.codeMap = new Map();
    for (const [id, codes] of Object.entries(this.binds)) {
      for (const c of codes) {
        if (!this.codeMap.has(c)) this.codeMap.set(c, []);
        this.codeMap.get(c).push(id);
      }
    }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.binds)); } catch { /* ignore */ }
    this.rebuild();
    for (const fn of this.listeners) fn();
  }

  actionsFor(code) { return this.codeMap.get(code) || []; }
  isBound(code) { return this.codeMap.has(code); }

  /**
   * Bind `code` to slot `slot` (0/1) of `action`. If another action already uses the code, it is removed there.
   * Returns the list of actions that lost the binding (the conflicts).
   */
  bind(action, slot, code) {
    const lost = [];
    for (const [id, codes] of Object.entries(this.binds)) {
      if (id === action) continue;
      const i = codes.indexOf(code);
      if (i >= 0) { codes.splice(i, 1); lost.push(id); }
    }
    const list = this.binds[action];
    const other = list.indexOf(code);
    if (other >= 0) list.splice(other, 1);
    if (slot >= list.length) list.push(code); else list[slot] = code;
    this.binds[action] = list.slice(0, 2);
    this.save();
    return lost;
  }

  clear(action, slot) {
    this.binds[action].splice(slot, 1);
    this.save();
  }

  resetAll() {
    this.binds = defaultBinds();
    this.save();
  }

  /** Codes used by more than one action (shouldn't happen via bind(), but stored data might). */
  conflicts() {
    return [...this.codeMap.entries()].filter(([, ids]) => ids.length > 1);
  }

  label(action, slot = 0) {
    const c = this.binds[action]?.[slot];
    return c ? codeLabel(c) : '—';
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}

export function actionLabel(id) { return byId[id]?.label || id; }

export function codeLabel(code) {
  if (!code) return '—';
  const mouse = { Mouse0: 'Left click', Mouse1: 'Middle click', Mouse2: 'Right click', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5', WheelUp: 'Wheel up', WheelDown: 'Wheel down' };
  if (mouse[code]) return mouse[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  const names = {
    Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
    AltLeft: 'L-Option', AltRight: 'R-Option', MetaLeft: 'L-Cmd', MetaRight: 'R-Cmd', Tab: 'Tab', CapsLock: 'Caps',
    Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';',
    Quote: "'", Comma: ',', Period: '.', Slash: '/', Enter: 'Enter', Backspace: 'Backspace', Escape: 'Esc',
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', IntlBackslash: '§',
  };
  return names[code] || code;
}

export const binds = new BindStore();
