// Keyboard, mouse/trackpad and pointer-lock handling, mapped through rebindable actions.
import { binds } from './Bindings.js';
import { settings } from './Settings.js';

const ALWAYS_BLOCK = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Slash', 'Quote']);

export class Input {
  constructor() {
    this.down = new Set();      // codes currently held
    this.latched = new Set();   // actions pressed since the last tick (so quick taps are never lost)
    this.mdx = 0; this.mdy = 0; // accumulated pointer movement since last read
    this.locked = false;
    this.enabled = false;       // game input active (in a match / practice)
    this.lockTarget = null;
    this.capture = null;        // keybind capture callback
    this.listeners = { action: new Set(), lock: new Set(), lockError: new Set() };
    this.toggles = {};          // for toggle-mode actions (ADS)
    this._lastLockExit = 0;
    // ?nolock in the URL: behave as if the pointer were locked (automated tests, or browsers without pointer lock)
    this.noLock = new URLSearchParams(location.search).has('nolock');

    const opts = { capture: true };
    window.addEventListener('keydown', (e) => this.onKeyDown(e), opts);
    window.addEventListener('keyup', (e) => this.onKeyUp(e), opts);
    window.addEventListener('mousedown', (e) => this.onMouseDown(e), opts);
    window.addEventListener('mouseup', (e) => this.onMouseUp(e), opts);
    window.addEventListener('mousemove', (e) => this.onMouseMove(e), opts);
    window.addEventListener('wheel', (e) => this.onWheel(e), { passive: false, capture: true });
    window.addEventListener('contextmenu', (e) => { if (this.enabled || this.capture) e.preventDefault(); });
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });
    document.addEventListener('pointerlockchange', () => this.onLockChange());
    document.addEventListener('pointerlockerror', () => this.emit('lockError', 'The browser refused pointer lock. Click again in a second.'));
    // Block Safari/trackpad pinch-zoom gestures while in game
    for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => { if (this.enabled) e.preventDefault(); });
  }

  on(type, fn) { this.listeners[type].add(fn); return () => this.listeners[type].delete(fn); }
  emit(type, ...a) { for (const fn of this.listeners[type]) fn(...a); }

  releaseAll() {
    for (const code of this.down) this.release(code);
    this.down.clear();
  }

  isFormTarget(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }

  press(code) {
    if (this.down.has(code)) return;
    this.down.add(code);
    for (const a of binds.actionsFor(code)) {
      this.latched.add(a);
      if (a === 'ads') this.toggles.ads = !this.toggles.ads;
      this.emit('action', a, true);
    }
  }

  release(code) {
    if (!this.down.delete(code)) return;
    for (const a of binds.actionsFor(code)) this.emit('action', a, false);
  }

  onKeyDown(e) {
    if (this.capture) {
      e.preventDefault(); e.stopPropagation();
      const cb = this.capture; this.capture = null;
      cb(e.code === 'Escape' ? null : e.code);
      return;
    }
    if (this.isFormTarget(e)) return;
    if (this.enabled) {
      if (binds.isBound(e.code) || ALWAYS_BLOCK.has(e.code)) e.preventDefault();
    }
    if (e.repeat) return;
    if (e.code === 'Escape') this.emit('action', 'escape', true);
    if (e.code === 'MetaLeft' || e.code === 'MetaRight') {
      // macOS doesn't send keyup for keys released while Cmd is held: drop everything to avoid stuck keys
      this.releaseAll();
      return;
    }
    this.press(e.code);
  }

  onKeyUp(e) {
    if (this.enabled && binds.isBound(e.code)) e.preventDefault();
    if (e.code === 'MetaLeft' || e.code === 'MetaRight') this.releaseAll();
    this.release(e.code);
  }

  onMouseDown(e) {
    const code = 'Mouse' + e.button;
    if (this.capture) {
      e.preventDefault(); e.stopPropagation();
      const cb = this.capture; this.capture = null;
      cb(code);
      return;
    }
    if (!this.locked || (this.noLock && e.target?.closest?.('.menu, .overlay-panel'))) return; // clicks in menus are just clicks
    e.preventDefault();
    this.press(code);
  }

  onMouseUp(e) {
    this.release('Mouse' + e.button);
  }

  onMouseMove(e) {
    if (!this.locked) return;
    const dx = e.movementX || 0, dy = e.movementY || 0;
    // Some browser/OS combinations emit one huge bogus delta when the lock starts or the window refocuses
    if (Math.abs(dx) > 500 || Math.abs(dy) > 500) return;
    this.mdx += dx; this.mdy += dy;
  }

  onWheel(e) {
    if (this.capture) {
      e.preventDefault();
      const cb = this.capture; this.capture = null;
      cb(e.deltaY < 0 ? 'WheelUp' : 'WheelDown');
      return;
    }
    if (!this.enabled) return;
    e.preventDefault(); // stop swipe-back / pinch zoom
    if (Math.abs(e.deltaY) < 20) return; // ignore trackpad noise
    const code = e.deltaY < 0 ? 'WheelUp' : 'WheelDown';
    if (!binds.isBound(code)) return;
    this.press(code);
    setTimeout(() => this.release(code), 50);
  }

  /** Is the action held right now? */
  isDown(action) {
    const codes = binds.binds[action];
    if (!codes) return false;
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  /** Held, or tapped since the last consumeLatched(). */
  active(action) { return this.isDown(action) || this.latched.has(action); }
  wasPressed(action) { return this.latched.has(action); }
  consumeLatched() { this.latched.clear(); }

  /** ADS respects the hold/toggle setting. */
  adsActive() {
    if (settings.get('adsMode') === 'toggle') return !!this.toggles.ads;
    return this.active('ads');
  }
  resetToggles() { this.toggles = {}; }

  takeMouse() {
    const r = [this.mdx, this.mdy];
    this.mdx = 0; this.mdy = 0;
    return r;
  }

  captureNext(cb) { this.capture = cb; }

  // ---------------- Pointer lock ----------------
  requestLock(el) {
    this.lockTarget = el;
    if (this.noLock) { this.locked = true; this.emit('lock', true); return; }
    if (!el.requestPointerLock) { this.emit('lockError', 'This browser does not support pointer lock.'); return; }
    const want = settings.get('rawInput');
    const attempt = (raw) => {
      try {
        const p = raw ? el.requestPointerLock({ unadjustedMovement: true }) : el.requestPointerLock();
        if (p && typeof p.catch === 'function') {
          p.catch((err) => {
            if (raw) attempt(false); // raw input unsupported (Safari/Firefox, some macOS setups)
            else this.emit('lockError', (err && err.name === 'SecurityError')
              ? 'Wait a moment, then click again (the browser blocks re-locking right after Esc).'
              : 'Could not lock the pointer. Click again.');
          });
        }
      } catch {
        if (raw) attempt(false);
      }
    };
    attempt(want);
  }

  exitLock() {
    if (this.noLock) { this.locked = false; this.releaseAll(); this.emit('lock', false); return; }
    if (document.pointerLockElement) document.exitPointerLock();
  }

  onLockChange() {
    const was = this.locked;
    this.locked = !!document.pointerLockElement;
    if (!this.locked) { this.releaseAll(); this._lastLockExit = performance.now(); }
    this.mdx = this.mdy = 0;
    if (was !== this.locked) this.emit('lock', this.locked);
  }
}

export const input = new Input();
