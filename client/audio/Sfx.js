// All sounds are synthesized with WebAudio, so the game ships no audio files.
import { settings } from '../core/Settings.js';

class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.voices = 0;
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    settings.onChange((k) => { if ((k === 'volume' || k === '*') && this.master) this.master.gain.value = settings.get('volume'); });
  }

  /** Must be called from a user gesture (click/keypress) to satisfy autoplay rules. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = settings.get('volume');
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6;
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setListener(x, y, z, yaw) { const l = this.listener; l.x = x; l.y = y; l.z = z; l.yaw = yaw; }

  /** Output node with optional 3D pan/attenuation. Returns null if too many voices are playing. */
  out(gain = 1, pos = null, dur = 0.5) {
    if (!this.ctx || this.voices > 28) return null;
    const g = this.ctx.createGain();
    let vol = gain;
    let node = g;
    if (pos) {
      const l = this.listener;
      const dx = pos[0] - l.x, dz = pos[2] - l.z, dy = (pos[1] ?? l.y) - l.y;
      const dist = Math.hypot(dx, dy, dz);
      vol *= 1 / (1 + dist / 9);
      if (vol < 0.01) return null;
      if (this.ctx.createStereoPanner) {
        const p = this.ctx.createStereoPanner();
        // right vector of the listener: (cos yaw, 0, -sin yaw)
        const rx = Math.cos(l.yaw), rz = -Math.sin(l.yaw);
        p.pan.value = dist > 0.01 ? Math.max(-0.85, Math.min(0.85, (dx * rx + dz * rz) / dist)) : 0;
        g.connect(p).connect(this.master);
        node = g;
      } else g.connect(this.master);
    } else g.connect(this.master);
    g.gain.value = vol;
    this.voices++;
    setTimeout(() => { this.voices--; }, dur * 1000 + 50);
    return node;
  }

  noiseBurst(dest, t, dur, { type = 'bandpass', freq = 1000, q = 1, freqEnd = null, gain = 1, attack = 0.002 } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  tone(dest, t, dur, { type = 'sine', freq = 440, freqEnd = null, gain = 0.5, attack = 0.003 } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // ---------------- Game sounds ----------------
  shot(weapon, pos = null) {
    const big = { rifle: 0.9, pistol: 0.7, shotgun: 1.2, sniper: 1.4, revolver: 1.0 }[weapon] ?? 0.8;
    const d = this.out(pos ? 1.0 : 0.75, pos, 0.6);
    if (!d) return;
    const t = this.ctx.currentTime;
    if (weapon === 'shotgun') {
      this.noiseBurst(d, t, 0.32, { type: 'lowpass', freq: 3200, freqEnd: 300, gain: 1.0 });
      this.tone(d, t, 0.18, { type: 'triangle', freq: 110, freqEnd: 40, gain: 0.8 });
    } else if (weapon === 'sniper') {
      this.noiseBurst(d, t, 0.5, { type: 'lowpass', freq: 5000, freqEnd: 200, gain: 1.0 });
      this.tone(d, t, 0.35, { type: 'sawtooth', freq: 150, freqEnd: 35, gain: 0.5 });
      this.noiseBurst(d, t + 0.05, 0.6, { type: 'bandpass', freq: 600, q: 0.5, freqEnd: 150, gain: 0.25 });
    } else if (weapon === 'rifle') {
      this.noiseBurst(d, t, 0.13, { type: 'bandpass', freq: 2200, q: 0.7, freqEnd: 600, gain: 0.9 });
      this.tone(d, t, 0.08, { type: 'square', freq: 180, freqEnd: 60, gain: 0.25 });
    } else {
      this.noiseBurst(d, t, 0.12 * big, { type: 'bandpass', freq: 2800, q: 0.8, freqEnd: 700, gain: 0.8 });
      this.tone(d, t, 0.07, { type: 'square', freq: 260, freqEnd: 90, gain: 0.22 });
    }
  }

  dry() { const d = this.out(0.4); if (!d) return; this.tone(d, this.ctx.currentTime, 0.03, { type: 'square', freq: 1800, gain: 0.25 }); }
  swap() { const d = this.out(0.35); if (!d) return; const t = this.ctx.currentTime; this.noiseBurst(d, t, 0.05, { type: 'highpass', freq: 3000, gain: 0.5 }); this.tone(d, t + 0.04, 0.03, { type: 'square', freq: 900, gain: 0.15 }); }
  reload() {
    const d = this.out(0.45, null, 1.5); if (!d) return;
    const t = this.ctx.currentTime;
    this.noiseBurst(d, t + 0.1, 0.06, { type: 'bandpass', freq: 1500, q: 2, gain: 0.6 });
    this.tone(d, t + 0.12, 0.04, { type: 'square', freq: 600, gain: 0.15 });
  }
  reloaded() { const d = this.out(0.45); if (!d) return; const t = this.ctx.currentTime; this.noiseBurst(d, t, 0.05, { type: 'bandpass', freq: 2500, q: 3, gain: 0.7 }); this.tone(d, t + 0.02, 0.05, { type: 'square', freq: 1200, gain: 0.12 }); }
  knife(pos = null, heavy = false) {
    const d = this.out(pos ? 0.6 : 0.5, pos); if (!d) return;
    this.noiseBurst(d, this.ctx.currentTime, heavy ? 0.3 : 0.16, { type: 'bandpass', freq: heavy ? 900 : 1600, q: 1.5, freqEnd: heavy ? 3000 : 4000, gain: 0.5, attack: 0.04 });
  }
  /** A casing hitting the floor: a short metallic tink. */
  casing(pos = null) {
    const d = this.out(0.18, pos, 0.15); if (!d) return;
    const t = this.ctx.currentTime;
    this.tone(d, t, 0.05, { type: 'triangle', freq: 3200 + Math.random() * 1400, freqEnd: 2600, gain: 0.35 });
  }
  /** Mechanical weapon sounds from the viewmodel animation: pump, bolt, magOut, magIn, cylinder. */
  mech(name) {
    const d = this.out(0.4, null, 0.2); if (!d) return;
    const t = this.ctx.currentTime;
    const f = { pump: 900, bolt: 1400, magOut: 1100, magIn: 1700, cylinder: 2200 }[name] || 1200;
    this.noiseBurst(d, t, 0.05, { type: 'bandpass', freq: f, q: 2.5, gain: 0.7 });
    this.tone(d, t + 0.01, 0.03, { type: 'square', freq: f * 0.5, gain: 0.1 });
  }
  knifeHit() { const d = this.out(0.7); if (!d) return; const t = this.ctx.currentTime; this.tone(d, t, 0.12, { type: 'triangle', freq: 180, freqEnd: 70, gain: 0.8 }); this.noiseBurst(d, t, 0.08, { type: 'lowpass', freq: 1200, gain: 0.6 }); }

  footstep(pos = null, sprint = false) {
    const d = this.out(pos ? 0.5 : 0.22, pos, 0.2); if (!d) return;
    this.noiseBurst(d, this.ctx.currentTime, 0.07, { type: 'lowpass', freq: sprint ? 900 : 650, q: 1, gain: 0.9, attack: 0.004 });
  }
  jump(pos = null) { const d = this.out(pos ? 0.4 : 0.25, pos, 0.2); if (!d) return; this.noiseBurst(d, this.ctx.currentTime, 0.1, { type: 'bandpass', freq: 500, q: 1, freqEnd: 900, gain: 0.7 }); }
  land(intensity = 1, pos = null) {
    const d = this.out((pos ? 0.6 : 0.35) * Math.min(1.5, 0.4 + intensity), pos, 0.3); if (!d) return;
    const t = this.ctx.currentTime;
    this.noiseBurst(d, t, 0.14, { type: 'lowpass', freq: 500, gain: 1, attack: 0.003 });
    this.tone(d, t, 0.1, { type: 'sine', freq: 90, freqEnd: 45, gain: 0.5 * Math.min(1, intensity) });
  }
  slide(pos = null) { const d = this.out(pos ? 0.45 : 0.3, pos, 0.8); if (!d) return; this.noiseBurst(d, this.ctx.currentTime, 0.7, { type: 'bandpass', freq: 1800, q: 0.6, freqEnd: 500, gain: 0.5, attack: 0.03 }); }
  dash(pos = null) { const d = this.out(pos ? 0.6 : 0.45, pos, 0.5); if (!d) return; const t = this.ctx.currentTime; this.noiseBurst(d, t, 0.35, { type: 'bandpass', freq: 400, q: 0.8, freqEnd: 2500, gain: 0.7, attack: 0.02 }); this.tone(d, t, 0.25, { type: 'sine', freq: 220, freqEnd: 520, gain: 0.15, attack: 0.02 }); }
  mantle() { const d = this.out(0.3, null, 0.3); if (!d) return; this.noiseBurst(d, this.ctx.currentTime, 0.12, { type: 'bandpass', freq: 700, q: 1, gain: 0.6 }); }

  hit(head = false) {
    const d = this.out(0.55, null, 0.3); if (!d) return;
    const t = this.ctx.currentTime;
    if (head) { this.tone(d, t, 0.18, { type: 'sine', freq: 1950, gain: 0.5 }); this.tone(d, t, 0.12, { type: 'triangle', freq: 2900, gain: 0.25 }); }
    else this.tone(d, t, 0.06, { type: 'square', freq: 1250, freqEnd: 900, gain: 0.25 });
  }
  kill() {
    const d = this.out(0.6, null, 0.6); if (!d) return;
    const t = this.ctx.currentTime;
    this.tone(d, t, 0.12, { type: 'triangle', freq: 880, gain: 0.5 });
    this.tone(d, t + 0.09, 0.25, { type: 'triangle', freq: 1320, gain: 0.5 });
  }
  hurt() { const d = this.out(0.5); if (!d) return; this.tone(d, this.ctx.currentTime, 0.12, { type: 'sawtooth', freq: 160, freqEnd: 90, gain: 0.25 }); }
  death() { const d = this.out(0.6, null, 1); if (!d) return; this.tone(d, this.ctx.currentTime, 0.6, { type: 'sawtooth', freq: 300, freqEnd: 60, gain: 0.3 }); }
  beep(high = false) { const d = this.out(0.5); if (!d) return; this.tone(d, this.ctx.currentTime, 0.12, { type: 'square', freq: high ? 1320 : 660, gain: 0.18 }); }
  roundWin(win = true) {
    const d = this.out(0.6, null, 1.2); if (!d) return;
    const t = this.ctx.currentTime;
    const notes = win ? [523, 659, 784, 1047] : [440, 349, 294];
    notes.forEach((f, i) => this.tone(d, t + i * 0.12, 0.3, { type: 'triangle', freq: f, gain: 0.35 }));
  }
  chat() { const d = this.out(0.4); if (!d) return; const t = this.ctx.currentTime; this.tone(d, t, 0.06, { type: 'sine', freq: 1500, gain: 0.25 }); this.tone(d, t + 0.07, 0.06, { type: 'sine', freq: 2000, gain: 0.2 }); }
  click() { const d = this.out(0.3); if (!d) return; this.tone(d, this.ctx.currentTime, 0.03, { type: 'square', freq: 1000, gain: 0.12 }); }
}

export const sfx = new Sfx();
