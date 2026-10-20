// Player settings, persisted in localStorage.
const KEY = 'slipstrike.settings.v1';

export const DEFAULT_SETTINGS = {
  name: '',
  // Look
  sens: 1.0,            // look sensitivity multiplier (1.0 ≈ 0.12° per pointer count)
  adsSens: 1.0,         // extra multiplier while zoomed (on top of zoom-proportional scaling)
  invertY: false,
  rawInput: false,      // ask the browser for unaccelerated pointer movement (Chrome/Edge only)
  lookAccel: false,     // extra software acceleration on top of the OS curve
  lookAccelAmount: 0.4,
  smoothing: 0,         // 0 = off; up to 0.8 averages trackpad jitter (adds a little latency)
  keyLookSpeed: 160,    // deg/s for keyboard look (arrow keys by default)
  aimAssist: false,     // gentle slowdown when the crosshair is over an enemy
  adsMode: 'hold',      // 'hold' | 'toggle'
  // Video
  fov: 90,
  quality: 'med',       // 'low' | 'med' | 'high'
  autoQuality: true,    // step quality down automatically if the game runs below ~50 FPS
  showFps: false,
  // Audio
  volume: 0.7,
  // HUD
  damageNumbers: false,
  crosshair: { style: 'cross', color: '#5dff9c', size: 8, thickness: 2, gap: 4, outline: true },
};

function deepMerge(base, over) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  if (!over || typeof over !== 'object') return out;
  for (const k of Object.keys(base)) {
    if (!(k in over)) continue;
    const b = base[k], o = over[k];
    if (b && typeof b === 'object' && !Array.isArray(b)) out[k] = deepMerge(b, o);
    else if (typeof o === typeof b) out[k] = o;
  }
  return out;
}

class SettingsStore {
  constructor() {
    this.data = structuredClone(DEFAULT_SETTINGS);
    this.listeners = new Set();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = deepMerge(DEFAULT_SETTINGS, JSON.parse(raw));
    } catch { /* storage blocked or corrupt: use defaults */ }
  }
  get(k) { return this.data[k]; }
  set(k, v) {
    this.data[k] = v;
    this.save();
    for (const fn of this.listeners) fn(k, v);
  }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ }
  }
  reset() {
    const name = this.data.name;
    this.data = structuredClone(DEFAULT_SETTINGS);
    this.data.name = name;
    this.save();
    for (const fn of this.listeners) fn('*', null);
  }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}

export const settings = new SettingsStore();
