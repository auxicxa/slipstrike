// Wire protocol: message types, input bit flags and validators.
// Every message is JSON: { t: <type>, ...fields }.

export const BTN = {
  FWD: 1, BACK: 2, LEFT: 4, RIGHT: 8,
  JUMP: 16, CROUCH: 32, SPRINT: 64, DASH: 128,
  FIRE: 256, ADS: 512, RELOAD: 1024,
};
export const BTN_ALL = 2047;

// Weapon select field in an input: 0 = no change, 1-3 = slot, 4 = quick-switch to last weapon
export const WSEL_LAST = 4;

// Client → server
export const C = {
  HELLO: 'hello',        // { name, token? }
  CREATE: 'create',      // { pub? }
  JOIN: 'join',          // { code }
  QUICK: 'quick',        // {}
  LEAVE: 'leave',
  SET_MODE: 'mode',      // { mode, map? }   (host only)
  SWAP_TEAM: 'swap',     // {}
  READY: 'ready',        // { ready }
  LOADOUT: 'loadout',    // { p, s }
  INPUT: 'in',           // { s: seq, b: buttons, y: yaw, p: pitch, w: weaponSel, v: viewTick }
  PING: 'ping',          // { c: clientTime, r?: measured rtt ms }
  CHAT: 'qc',            // { i: index }
  SPECTATE: 'spec',      // { d: +1/-1 }
};

// Server → client
export const S = {
  WELCOME: 'welcome',    // { id, token, name }
  ERROR: 'err',          // { msg }
  ROOM: 'room',          // room / lobby state
  LEFT: 'left',
  SNAP: 'snap',          // snapshot
  EVENTS: 'ev',          // [ events ]
  PONG: 'pong',          // { c, s: serverTime, tick }
  CHAT: 'qc',            // { from, i }
  KICK: 'kick',
};

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isInt = (v) => Number.isInteger(v);
const isStr = (v, max) => typeof v === 'string' && v.length <= max;

/** Parse and validate a client message. Returns the object or null if malformed. */
export function parseClientMessage(raw) {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  let m;
  try { m = JSON.parse(raw); } catch { return null; }
  if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string') return null;
  switch (m.t) {
    case C.HELLO:
      if (!isStr(m.name, 64)) return null;
      if (m.token !== undefined && !isStr(m.token, 64)) return null;
      return m;
    case C.CREATE:
      return { t: m.t, pub: m.pub === true };
    case C.JOIN:
      if (!isStr(m.code, 8)) return null;
      return { t: m.t, code: m.code.toUpperCase() };
    case C.QUICK: case C.LEAVE: case C.SWAP_TEAM:
      return { t: m.t };
    case C.SET_MODE:
      if (!isStr(m.mode, 8)) return null;
      if (m.map !== undefined && !isStr(m.map, 24)) return null;
      return { t: m.t, mode: m.mode, map: m.map };
    case C.READY:
      return { t: m.t, ready: m.ready === true };
    case C.LOADOUT:
      if (!isStr(m.p, 16) || !isStr(m.s, 16)) return null;
      return { t: m.t, p: m.p, s: m.s };
    case C.INPUT:
      if (!isInt(m.s) || m.s < 0 || !isInt(m.b) || m.b < 0 || m.b > BTN_ALL) return null;
      if (!isNum(m.y) || !isNum(m.p) || Math.abs(m.y) > 1000 || Math.abs(m.p) > 2) return null;
      if (!isInt(m.w) || m.w < 0 || m.w > 4) return null;
      if (!isNum(m.v)) return null;
      return { t: m.t, s: m.s, b: m.b, y: m.y, p: m.p, w: m.w, v: m.v };
    case C.PING:
      if (!isNum(m.c)) return null;
      return { t: m.t, c: m.c, r: isNum(m.r) ? m.r : undefined };
    case C.CHAT:
      if (!isInt(m.i) || m.i < 0 || m.i > 7) return null;
      return { t: m.t, i: m.i };
    case C.SPECTATE:
      return { t: m.t, d: m.d === -1 ? -1 : 1 };
    default:
      return null;
  }
}
