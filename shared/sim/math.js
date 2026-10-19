// Small math helpers shared by client and server (no three.js dependency).

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const DEG = Math.PI / 180;

/** Quantize an angle so the client and server simulate on identical values. */
export const qAngle = (a) => Math.round(a * 10000) / 10000;

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function lerpAngle(a, b, t) {
  return a + wrapAngle(b - a) * t;
}

/** Forward unit vector for yaw/pitch. Yaw 0 looks toward -Z, positive yaw turns left (three.js convention). */
export function dirFromAngles(yaw, pitch, out = [0, 0, 0]) {
  const cp = Math.cos(pitch);
  out[0] = -Math.sin(yaw) * cp;
  out[1] = Math.sin(pitch);
  out[2] = -Math.cos(yaw) * cp;
  return out;
}

export function len2(x, z) {
  return Math.sqrt(x * x + z * z);
}
