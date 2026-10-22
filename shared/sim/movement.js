// Deterministic player movement. The server and the client prediction both run this exact code.
import { MOVEMENT as M } from '../config/movement.js';
import { BTN } from '../net/protocol.js';

// Per-tick event flags (cleared at the start of every tick), used for sounds and camera effects.
export const FX = { JUMP: 1, LAND: 2, DASH: 4, SLIDE: 8, MANTLE: 16, DJUMP: 32, WALLRUN: 64, WALLJUMP: 128 };

export function createMoveState(x = 0, y = 0, z = 0, yaw = 0) {
  return {
    x, y, z, vx: 0, vy: 0, vz: 0, yaw, pitch: 0,
    grounded: false, crouching: false, h: M.standHeight, eye: M.standEye,
    sliding: false, slideT: 0, slideCd: 0,
    dashCd: 0, dashUsed: false, dashT: 0, airT: 0,
    airJumps: M.doubleJumps,
    // wall run: active flag, time left, wall normal, speed, wall box index, cooldowns
    wallRun: 0, wrT: 0, wrNx: 0, wrNz: 0, wrSpeed: 0, wrBox: -1, wrCd: 0, wrSameCd: 0,
    jumpBuf: 0, jumpHeld: false, crouchHeld: false, dashHeld: false,
    mantleT: 0, m0x: 0, m0y: 0, m0z: 0, m1x: 0, m1y: 0, m1z: 0,
    wallNx: 0, wallNz: 0, wallT: 9,
    fx: 0, landSpeed: 0,
  };
}

/** The fields that make up the full simulated state (used for snapshots and reconciliation). */
export const MOVE_KEYS = Object.keys(createMoveState());

export function copyMoveState(dst, src) {
  for (const k of MOVE_KEYS) dst[k] = src[k];
  return dst;
}

function accelerate(s, wx, wz, wishSpeed, accel, dt) {
  const cur = s.vx * wx + s.vz * wz;
  const add = wishSpeed - cur;
  if (add <= 0) return;
  let a = accel * wishSpeed * dt;
  if (a > add) a = add;
  s.vx += a * wx;
  s.vz += a * wz;
}

/** Source-style air acceleration: the wish speed is capped for the projection test only. */
function airAccelerate(s, wx, wz, wishSpeed, dt) {
  const capped = Math.min(wishSpeed, M.airWishCap);
  const cur = s.vx * wx + s.vz * wz;
  const add = capped - cur;
  if (add <= 0) return;
  let a = M.airAccel * wishSpeed * dt;
  if (a > add) a = add;
  s.vx += a * wx;
  s.vz += a * wz;
}

function applyFriction(s, friction, dt) {
  const speed = Math.hypot(s.vx, s.vz);
  if (speed < 1e-4) { s.vx = s.vz = 0; return; }
  const control = speed < M.stopSpeed ? M.stopSpeed : speed;
  let ns = speed - control * friction * dt;
  if (ns < 0) ns = 0;
  ns /= speed;
  s.vx *= ns; s.vz *= ns;
}

function capHorizontal(s, cap) {
  const sp = Math.hypot(s.vx, s.vz);
  if (sp > cap) { const k = cap / sp; s.vx *= k; s.vz *= k; }
}

/**
 * Advance one tick.
 * @param s     move state (mutated in place)
 * @param b     button bitmask (BTN)
 * @param yaw   view yaw (radians)
 * @param pitch view pitch (radians)
 * @param world CollisionWorld
 * @param dt    fixed timestep
 * @param opt   { speedMult, scoped, frozen }
 */
export function simulateMove(s, b, yaw, pitch, world, dt, opt = {}) {
  s.fx = 0;
  s.yaw = yaw; s.pitch = pitch;
  const speedMult = opt.speedMult || 1;

  if (s.slideCd > 0) s.slideCd = Math.max(0, s.slideCd - dt);
  if (s.dashCd > 0) s.dashCd = Math.max(0, s.dashCd - dt);
  if (s.dashT > 0) s.dashT = Math.max(0, s.dashT - dt);
  if (s.wrCd > 0) s.wrCd = Math.max(0, s.wrCd - dt);
  if (s.wrSameCd > 0) s.wrSameCd = Math.max(0, s.wrSameCd - dt);
  if (s.jumpBuf > 0) s.jumpBuf = Math.max(0, s.jumpBuf - dt);
  s.wallT += dt;

  if (opt.frozen) {
    s.vx = s.vz = 0;
    b = 0;
  }

  const jumpDown = (b & BTN.JUMP) !== 0;
  const jumpPressed = jumpDown && !s.jumpHeld;
  const crouchDown = (b & BTN.CROUCH) !== 0;
  const crouchPressed = crouchDown && !s.crouchHeld;
  const dashDown = (b & BTN.DASH) !== 0;
  const dashPressed = dashDown && !s.dashHeld;
  const sprint = (b & BTN.SPRINT) !== 0;
  s.jumpHeld = jumpDown; s.crouchHeld = crouchDown; s.dashHeld = dashDown;
  if (jumpPressed || (M.autoHop && jumpDown)) s.jumpBuf = Math.max(s.jumpBuf, jumpPressed ? M.jumpBuffer : dt * 1.5);

  // ---- Mantle in progress: scripted motion, no collision needed (the target was checked free) ----
  if (s.mantleT > 0) {
    s.mantleT = Math.max(0, s.mantleT - dt);
    const t = 1 - s.mantleT / M.mantleDuration;
    const up = Math.min(1, t * 1.6); // rise first, then move forward
    const fwd = Math.max(0, (t - 0.35) / 0.65);
    s.x = s.m0x + (s.m1x - s.m0x) * fwd;
    s.z = s.m0z + (s.m1z - s.m0z) * fwd;
    s.y = s.m0y + (s.m1y - s.m0y) * up;
    s.vx = s.vz = s.vy = 0;
    if (s.mantleT === 0) {
      const dx = s.m1x - s.m0x, dz = s.m1z - s.m0z, l = Math.hypot(dx, dz) || 1;
      s.vx = (dx / l) * M.mantleExitSpeed; s.vz = (dz / l) * M.mantleExitSpeed;
      s.grounded = true; s.dashUsed = false; s.airJumps = M.doubleJumps;
    }
    updateEye(s, dt);
    return s;
  }

  // ---- Wish direction ----
  let fmove = 0, smove = 0;
  if (b & BTN.FWD) fmove += 1;
  if (b & BTN.BACK) fmove -= 1;
  if (b & BTN.RIGHT) smove += 1;
  if (b & BTN.LEFT) smove -= 1;
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  // forward = (-sin, -cos), right = (cos, -sin)
  let wx = -sy * fmove + cy * smove;
  let wz = -cy * fmove - sy * smove;
  const wl = Math.hypot(wx, wz);
  if (wl > 0) { wx /= wl; wz /= wl; }

  // ---- Crouch / stand ----
  const wantLow = crouchDown || s.sliding;
  if (wantLow && !s.crouching) {
    s.crouching = true; s.h = M.crouchHeight;
  } else if (!wantLow && s.crouching) {
    if (world.boxFree(s.x, s.y, s.z, M.halfWidth, M.standHeight)) { s.crouching = false; s.h = M.standHeight; }
  }

  let base = sprint && fmove > 0 ? M.sprintSpeed : M.walkSpeed;
  if (s.crouching && !s.sliding) base = M.crouchSpeed;
  if (opt.scoped) base *= M.scopedSpeedMult;
  if (fmove < 0 && smove === 0) base *= M.backpedalMult;
  const wishSpeed = wl > 0 ? base * speedMult : 0;

  let hs = Math.hypot(s.vx, s.vz);
  let jumped = false;

  // ---- Dash (ground or air): a short burst along the keys (or the view) that keeps your momentum
  if (dashPressed && s.dashCd <= 0 && (s.grounded || !s.dashUsed)) {
    startDash(s, wl > 0 ? wx : -sy, wl > 0 ? wz : -cy);
    hs = Math.hypot(s.vx, s.vz);
  }

  if (s.grounded) {
    s.airT = 0;
    s.airJumps = M.doubleJumps;
    if (s.wallRun) endWallRun(s);
    // Start a slide: crouch pressed while sprinting (or dashing) fast enough
    if (!s.sliding && crouchPressed && (sprint || s.dashT > 0) && hs >= M.slideMinSpeed && s.slideCd <= 0) {
      startSlide(s, hs, wx, wz, wl);
      hs = Math.hypot(s.vx, s.vz);
    }

    if (s.sliding) {
      s.slideT -= dt;
      const sp0 = Math.hypot(s.vx, s.vz);
      if (sp0 > 0) { const k = Math.max(0, sp0 - M.slideDecel * dt) / sp0; s.vx *= k; s.vz *= k; }
      if (wl > 0) { // slight steering: rotate velocity toward the wish direction
        const sp = Math.hypot(s.vx, s.vz);
        if (sp > 0.01) {
          const nx = s.vx / sp + wx * M.slideSteer * dt, nz = s.vz / sp + wz * M.slideSteer * dt;
          const nl = Math.hypot(nx, nz);
          s.vx = (nx / nl) * sp; s.vz = (nz / nl) * sp;
        }
      }
      if (s.slideT <= 0 || Math.hypot(s.vx, s.vz) < M.slideEndSpeed || !crouchDown) endSlide(s);
    }

    if (s.jumpBuf > 0) {
      // Mantle from the ground onto a low ledge instead of jumping, if one is right in front of us.
      if (!tryMantle(s, world, wx, wz, fmove, true)) {
        s.vy = M.jumpVelocity;
        s.grounded = false;
        s.jumpBuf = 0;
        jumped = true;
        s.fx |= FX.JUMP;
        if (s.sliding) { s.vx *= M.slideJumpMult; s.vz *= M.slideJumpMult; endSlide(s); }
      }
    } else if (!s.sliding) {
      if (s.dashT <= 0) applyFriction(s, M.friction, dt); // no friction during the dash burst
      accelerate(s, wx, wz, wishSpeed, M.groundAccel, dt);
    }
  }

  if (!s.grounded) {
    s.airT += dt;
    let acted = jumped;
    if (!acted && s.wallRun) {
      if (jumpPressed) { wallJump(s); acted = true; }
      else updateWallRun(s, world, fmove, crouchDown, sy, cy, dt);
    } else if (!acted && fmove > 0 && s.wrCd <= 0 && s.airT >= M.wallRunMinAirTime) {
      tryWallRun(s, world, sy, cy);
    }
    if (!acted && !s.wallRun) {
      // Double jump: a fresh press in the air. A press just before landing is left for the bunnyhop.
      if (jumpPressed && s.airJumps > 0 && s.airT >= M.doubleJumpMinAirTime && !aboutToLand(s, world)) {
        doubleJump(s, wx, wz, wl);
      } else {
        airAccelerate(s, wx, wz, wishSpeed, dt);
      }
      // Wall slide: pushing into a wall we touched recently
      if (s.wallT < 0.1 && wl > 0 && (wx * -s.wallNx + wz * -s.wallNz) > 0.3 && s.vy < -M.wallSlideMaxFall) {
        s.vy = -M.wallSlideMaxFall;
      }
    }
    const g = s.wallRun ? M.wallRunGravityMult : s.dashT > 0 ? M.dashGravityMult : 1;
    s.vy -= M.gravity * g * dt;
    if (s.vy < -M.terminalVelocity) s.vy = -M.terminalVelocity;
  }

  capHorizontal(s, M.airSpeedHardCap);

  // ---- Move and collide ----
  const wasGrounded = s.grounded;
  const vyBefore = s.vy;
  const blocked = moveHorizontal(s, world, s.vx * dt, s.vz * dt, wasGrounded);

  // Mantle while airborne: blocked by a ledge we can climb while pressing forward
  if (!s.grounded && blocked && fmove > 0 && s.mantleT === 0) {
    if (tryMantle(s, world, wx, wz, fmove, false)) { updateEye(s, dt); return s; }
  }

  moveVertical(s, world, dt, wasGrounded && !jumped);

  if (!wasGrounded && s.grounded) {
    s.fx |= FX.LAND;
    s.landSpeed = -vyBefore;
    s.dashUsed = false;
    s.airJumps = M.doubleJumps;
    if (s.wallRun) endWallRun(s);
    // Landed while holding crouch + sprint (or dashing) with speed: go straight into a slide
    if (crouchDown && (sprint || s.dashT > 0) && !s.sliding && s.slideCd <= 0 && Math.hypot(s.vx, s.vz) >= M.slideMinSpeed) {
      startSlide(s, Math.hypot(s.vx, s.vz), wx, wz, wl);
    }
    // Bunnyhop: jump buffered before landing → jump this same tick, so friction never applies
    if (s.jumpBuf > 0 && !s.sliding) {
      capHorizontal(s, Math.max(M.sprintSpeed * M.bhopSpeedCapMult * speedMult, 0));
      s.vy = M.jumpVelocity;
      s.grounded = false;
      s.jumpBuf = 0;
      s.fx |= FX.JUMP;
    }
  }
  if (!s.grounded && s.sliding) {
    // Sliding off a ledge: keep all momentum, end the slide state
    endSlide(s);
  }

  updateEye(s, dt);
  return s;
}

/** Dash along (dx, dz): at least dashSpeed that way, half the old sideways velocity kept. */
function startDash(s, dx, dz) {
  const along = s.vx * dx + s.vz * dz;
  const px = s.vx - dx * along, pz = s.vz - dz * along;
  const sp = Math.max(M.dashSpeed, along);
  s.vx = dx * sp + px * M.dashKeepSideways;
  s.vz = dz * sp + pz * M.dashKeepSideways;
  if (!s.grounded) {
    if (s.vy < M.dashUpVelocity) s.vy = M.dashUpVelocity;
    s.dashUsed = true;
  }
  if (s.wallRun) endWallRun(s);
  s.dashT = M.dashDuration;
  s.dashCd = M.dashCooldown;
  s.fx |= FX.DASH;
}

/** Falling and about to touch the ground within the jump buffer window? */
function aboutToLand(s, world) {
  if (s.vy >= 0) return false;
  const floor = world.supportHeight(s.x, s.z, M.halfWidth, s.y + 1e-3);
  return s.y - floor <= -s.vy * M.jumpBuffer + 0.05;
}

function doubleJump(s, wx, wz, wl) {
  s.vy = M.doubleJumpVelocity;
  if (wl > 0) {
    // turn the horizontal velocity part of the way toward the keys, keeping the speed
    const sp = Math.hypot(s.vx, s.vz);
    if (sp > 0.5) {
      let nx = s.vx / sp + (wx - s.vx / sp) * M.doubleJumpSteer, nz = s.vz / sp + (wz - s.vz / sp) * M.doubleJumpSteer;
      const nl = Math.hypot(nx, nz) || 1;
      s.vx = (nx / nl) * sp; s.vz = (nz / nl) * sp;
    }
  }
  s.airJumps--;
  s.jumpBuf = 0;
  s.fx |= FX.DJUMP;
}

/** Height range of the body that a wall must cover. */
function wallOverlap(s, b) {
  return Math.min(s.y + s.h - 0.1, b.maxy) - Math.max(s.y + 0.1, b.miny);
}

/**
 * Gap between the side of the body and a box face, for a wall whose normal is (nx, nz), or Infinity if
 * we're not alongside that face.
 */
function wallGap(s, b, nx, nz, margin) {
  const half = M.halfWidth;
  if (nx) {
    if (!(s.z > b.minz - margin && s.z < b.maxz + margin)) return Infinity;
    return nx > 0 ? (s.x - half) - b.maxx : b.minx - (s.x + half);
  }
  if (!(s.x > b.minx - margin && s.x < b.maxx + margin)) return Infinity;
  return nz > 0 ? (s.z - half) - b.maxz : b.minz - (s.z + half);
}

/** Look for a runnable wall beside us that we're moving along, and start running on it. */
function tryWallRun(s, world, sy, cy) {
  const fx = -sy, fz = -cy;
  let best = -1, bestSp = 0, bnx = 0, bnz = 0;
  const boxes = world.boxes;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (!b.run || (i === s.wrBox && s.wrSameCd > 0)) continue;
    if (wallOverlap(s, b) < M.wallRunMinOverlap) continue;
    for (const [nx, nz] of SIDES) {
      const gap = wallGap(s, b, nx, nz, -0.1);
      if (!(gap > -0.02 && gap < M.wallRunProbe)) continue;
      let tx = -nz, tz = nx;
      let along = s.vx * tx + s.vz * tz;
      if (along < 0) { tx = -tx; tz = -tz; along = -along; }
      if (along < M.wallRunMinSpeed || fx * tx + fz * tz < M.wallRunMinLook) continue;
      if (along > bestSp) { bestSp = along; best = i; bnx = nx; bnz = nz; }
    }
  }
  if (best < 0) return false;
  s.wallRun = 1;
  s.wrT = M.wallRunMaxTime;
  s.wrNx = bnx; s.wrNz = bnz;
  s.wrBox = best;
  s.wrSpeed = Math.min(Math.max(bestSp, M.wallRunSpeed), M.wallRunMaxSpeed);
  s.vy = Math.min(Math.max(s.vy, M.wallRunStartUp), M.wallRunStartUpMax);
  wallRunVelocity(s);
  s.airJumps = M.doubleJumps;
  s.dashUsed = false;
  s.fx |= FX.WALLRUN;
  return true;
}
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function updateWallRun(s, world, fmove, crouchDown, sy, cy, dt) {
  s.wrT -= dt;
  const b = world.boxes[s.wrBox];
  let ok = !!b && s.wrT > 0 && fmove > 0 && !crouchDown;
  if (ok) {
    if (wallOverlap(s, b) < M.wallRunMinOverlap * 0.6) ok = false; // ran past the top or bottom
    else if (!(wallGap(s, b, s.wrNx, s.wrNz, M.halfWidth * 0.5) < M.wallRunProbe + 0.05)) ok = false; // wall ended
    else if (-sy * s.wrNx + -cy * s.wrNz > M.wallRunReleaseLook) ok = false; // turned away from the wall
  }
  if (!ok) { endWallRun(s); return; }
  wallRunVelocity(s);
}

/** Constant speed along the wall in the direction of travel, pressed lightly into it so contact holds. */
function wallRunVelocity(s) {
  let tx = -s.wrNz, tz = s.wrNx;
  if (s.vx * tx + s.vz * tz < 0) { tx = -tx; tz = -tz; }
  s.vx = tx * s.wrSpeed - s.wrNx * 0.6;
  s.vz = tz * s.wrSpeed - s.wrNz * 0.6;
}

function endWallRun(s) {
  s.wallRun = 0;
  s.wrCd = M.wallRunCooldown;
  s.wrSameCd = M.wallRunSameWallCooldown;
}

/** Jump off the wall: out and up, keeping the run speed; refills the air jump and dash. */
function wallJump(s) {
  const tx = -s.wrNz, tz = s.wrNx;
  const along = (s.vx * tx + s.vz * tz) * M.wallJumpKeep;
  s.vx = tx * along + s.wrNx * M.wallJumpOut;
  s.vz = tz * along + s.wrNz * M.wallJumpOut;
  s.vy = M.wallJumpUp;
  endWallRun(s);
  s.wrCd = M.wallJumpReattach;
  s.airJumps = M.doubleJumps;
  s.dashUsed = false;
  s.jumpBuf = 0;
  s.fx |= FX.WALLJUMP;
}

function startSlide(s, hs, wx, wz, wl) {
  let dx = s.vx / hs, dz = s.vz / hs;
  if (wl > 0 && dx * wx + dz * wz > 0.5) { dx = wx; dz = wz; }
  const sp = Math.min(hs + M.slideBoost, Math.max(hs, M.slideMaxStartSpeed));
  s.vx = dx * sp; s.vz = dz * sp;
  s.sliding = true;
  s.slideT = M.slideDuration;
  s.crouching = true; s.h = M.crouchHeight;
  s.fx |= FX.SLIDE;
}

function endSlide(s) {
  s.sliding = false;
  s.slideCd = M.slideCooldown;
}

function updateEye(s, dt) {
  const target = s.crouching ? M.crouchEye : M.standEye;
  const k = Math.min(1, M.eyeLerpSpeed * dt);
  s.eye += (target - s.eye) * k;
}

/**
 * Check for a climbable ledge in the wish direction and start a mantle if there is one.
 */
function tryMantle(s, world, wx, wz, fmove, fromGround) {
  if (fmove <= 0) return false;
  const half = M.halfWidth;
  const sy = Math.sin(s.yaw), cy = Math.cos(s.yaw);
  const fx = -sy, fz = -cy; // mantle along the view forward
  const probe = half + 0.25;
  const px = s.x + fx * probe, pz = s.z + fz * probe;
  // Find the ledge top under the probe point
  const top = world.supportHeight(px, pz, 0.05, s.y + M.mantleMaxHeight);
  const rise = top - s.y;
  if (!(rise >= (fromGround ? M.mantleMinHeight : 0.02) && rise <= M.mantleMaxHeight)) return false;
  // The ledge must actually be blocking us (a wall at body height in front)
  if (world.boxFree(s.x + fx * 0.12, s.y + 0.05, s.z + fz * 0.12, half, Math.min(rise, s.h) - 0.1)) {
    if (fromGround) return false;
  }
  const tx = s.x + fx * (M.mantleForwardPush + half * 0.5), tz = s.z + fz * (M.mantleForwardPush + half * 0.5);
  const ty = top + 0.01;
  if (!world.boxFree(tx, ty, tz, half, M.standHeight)) return false;
  if (!world.boxFree(s.x, ty, s.z, half, M.crouchHeight)) return false; // head room to climb
  s.mantleT = M.mantleDuration;
  s.m0x = s.x; s.m0y = s.y; s.m0z = s.z;
  s.m1x = tx; s.m1y = ty; s.m1z = tz;
  s.vx = s.vy = s.vz = 0;
  s.grounded = false;
  s.jumpBuf = 0;
  s.sliding = false;
  s.fx |= FX.MANTLE;
  return true;
}

/** Move along x then z, with step-up and ramps. Returns true if blocked horizontally. */
function moveHorizontal(s, world, dx, dz, grounded) {
  const half = M.halfWidth;
  let blocked = false;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / (half * 0.9)));
  const sx = dx / steps, sz = dz / steps;
  for (let i = 0; i < steps; i++) {
    if (sx !== 0 && moveAxis(s, world, 0, sx, grounded)) { blocked = true; }
    if (sz !== 0 && moveAxis(s, world, 2, sz, grounded)) { blocked = true; }
  }
  return blocked;
}

function moveAxis(s, world, axis, d, grounded) {
  const half = M.halfWidth;
  const ox = s.x, oz = s.z;
  if (axis === 0) s.x += d; else s.z += d;
  const canStep = grounded || s.vy <= 0;
  // Boxes
  for (const b of world.boxes) {
    if (s.x + half > b.minx && s.x - half < b.maxx && s.z + half > b.minz && s.z - half < b.maxz &&
        s.y + s.h > b.miny + 1e-4 && s.y < b.maxy - 1e-4) {
      const rise = b.maxy - s.y;
      if (canStep && grounded && rise <= M.stepHeight && world.boxFree(s.x, b.maxy, s.z, half, s.h)) {
        s.y = b.maxy;
        continue;
      }
      if (axis === 0) s.x = d > 0 ? b.minx - half - 1e-4 : b.maxx + half + 1e-4;
      else s.z = d > 0 ? b.minz - half - 1e-4 : b.maxz + half + 1e-4;
      if (axis === 0) { s.vx = 0; s.wallNx = d > 0 ? -1 : 1; s.wallNz = 0; }
      else { s.vz = 0; s.wallNz = d > 0 ? -1 : 1; s.wallNx = 0; }
      s.wallT = 0;
      return true;
    }
  }
  // Ramps
  for (const R of world.ramps) {
    const surf = world.rampHeight(R, s.x, s.z, half);
    if (surf > s.y + 1e-4 && s.y + s.h > R.miny) {
      const rise = surf - s.y;
      if (rise <= M.stepHeight + 0.25 && world.boxFree(s.x, surf, s.z, half, s.h)) {
        s.y = surf;
        if (s.vy < 0) s.vy = 0;
        continue;
      }
      s.x = ox; s.z = oz;
      if (axis === 0) { s.vx = 0; s.wallNx = d > 0 ? -1 : 1; s.wallNz = 0; }
      else { s.vz = 0; s.wallNz = d > 0 ? -1 : 1; s.wallNx = 0; }
      s.wallT = 0;
      return true;
    }
  }
  return false;
}

function moveVertical(s, world, dt, snapDown) {
  const half = M.halfWidth;
  const dy = s.vy * dt;
  if (s.vy <= 0) {
    const floor = world.supportHeight(s.x, s.z, half, s.y + 1e-3);
    const ny = s.y + dy;
    if (ny <= floor) {
      s.y = floor; s.vy = 0; s.grounded = true;
    } else if (snapDown && s.y - floor <= M.stepHeight) {
      // Stick to stairs and downward ramps instead of floating off them
      s.y = floor; s.vy = 0; s.grounded = true;
    } else {
      s.y = ny; s.grounded = false;
    }
  } else {
    let ny = s.y + dy;
    for (const b of world.boxes) {
      if (s.x + half > b.minx && s.x - half < b.maxx && s.z + half > b.minz && s.z - half < b.maxz &&
          b.miny >= s.y + s.h - 1e-3 && b.miny < ny + s.h) {
        ny = b.miny - s.h - 1e-4; s.vy = 0;
      }
    }
    s.y = ny; s.grounded = false;
  }
}
