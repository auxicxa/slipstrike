// ============================================================================
//  MOVEMENT TUNING — every constant that affects how movement feels lives here.
//  Units: metres, seconds, metres/second. The server and the client both read
//  this file, so a change applies everywhere (restart `npm run dev` after editing).
// ============================================================================

export const MOVEMENT = {
  // --- Player body -----------------------------------------------------------
  halfWidth: 0.35,          // half-size of the player's collision box (x and z)
  standHeight: 1.8,         // box height when standing
  crouchHeight: 1.1,        // box height when crouching or sliding
  standEye: 1.62,           // eye height above the feet when standing
  crouchEye: 0.95,          // eye height when crouching or sliding
  eyeLerpSpeed: 14,         // how quickly the eye moves between those heights (per second)
  stepHeight: 0.42,         // highest ledge you walk up without jumping

  // --- Ground speeds ---------------------------------------------------------
  walkSpeed: 6.5,
  sprintSpeed: 8.5,
  crouchSpeed: 3.5,
  knifeSpeedMult: 1.22,     // applies to every speed above while the knife is out
  scopedSpeedMult: 0.7,     // while aiming down sights or scoped
  backpedalMult: 0.9,       // moving mostly backwards

  // --- Source-style acceleration --------------------------------------------
  groundAccel: 10,          // like sv_accelerate: higher means snappier
  friction: 6,              // like sv_friction
  stopSpeed: 2.0,           // below this speed friction acts as if you were at this speed

  // --- Air -------------------------------------------------------------------
  gravity: 20,
  jumpVelocity: 7.0,
  airAccel: 12,             // like sv_airaccelerate
  airWishCap: 0.8,          // the wish-speed cap that makes air-strafing work (Source uses 30u ≈ 0.57 m)
  airSpeedHardCap: 16,      // absolute cap on horizontal speed in any state
  terminalVelocity: 40,

  // --- Bunnyhop --------------------------------------------------------------
  jumpBuffer: 0.10,         // a jump pressed this long before landing still counts
  bhopFrictionlessTicks: 1, // friction is skipped for this many ticks after a buffered landing
  bhopSpeedCapMult: 1.3,    // horizontal speed kept through hops is capped at sprintSpeed × this
  autoHop: true,            // holding jump hops again on landing (kinder on trackpads)

  // --- Slide -----------------------------------------------------------------
  slideMinSpeed: 6.0,       // you need at least this speed (and sprint + crouch) to start a slide
  slideBoost: 3.5,          // speed added when the slide starts
  slideMaxStartSpeed: 13.5, // the boost won't push you above this
  slideDecel: 5.0,          // speed lost per second while sliding (m/s²)
  slideDuration: 0.9,       // the slide ends on its own after this time (or when too slow)
  slideEndSpeed: 3.0,
  slideCooldown: 0.6,
  slideSteer: 2.0,          // a little directional control while sliding
  slideJumpMult: 1.0,       // jumping out of a slide keeps this fraction of horizontal speed

  // --- Double jump -----------------------------------------------------------
  doubleJumps: 1,           // extra jumps in the air; refilled on landing, wall-run start and wall jump
  doubleJumpVelocity: 6.4,  // upward speed set by the air jump
  doubleJumpSteer: 0.55,    // how far the air jump turns your horizontal velocity toward the keys (0–1)
  doubleJumpMinAirTime: 0.06, // a press this soon after take-off doesn't spend the air jump

  // --- Dash (ground and air) -------------------------------------------------
  dashSpeed: 13,            // speed along the dash direction during the burst (never lower than before)
  dashDuration: 0.15,       // the burst: no friction, little gravity
  dashGravityMult: 0.15,    // gravity during the burst
  dashKeepSideways: 0.5,    // fraction of the old sideways velocity kept (momentum carries through)
  dashUpVelocity: 1.2,      // small upward pop when dashing in the air
  dashCooldown: 1.25,
  // one dash per airtime (refilled on landing, wall-run start and wall jump)

  // --- Wall running ----------------------------------------------------------
  // Airborne, holding forward, moving along a wall tagged runnable in the map (run: true).
  wallRunMinSpeed: 5.5,     // speed along the wall needed to start
  wallRunSpeed: 10,         // constant speed while running (faster entries keep up to wallRunMaxSpeed)
  wallRunMaxSpeed: 13,
  wallRunMaxTime: 1.3,      // seconds before you peel off
  wallRunGravityMult: 0.22, // gravity while wall running
  wallRunStartUp: 1.6,      // vertical speed on attach (at least this...)
  wallRunStartUpMax: 3.2,   // ...and at most this, so you can't launch up a wall
  wallRunProbe: 0.2,        // how close the wall must be to the side of your body (m)
  wallRunMinOverlap: 0.7,   // how much of your body height the wall must cover (m)
  wallRunMinAirTime: 0.1,   // in the air at least this long first
  wallRunMinLook: 0.3,      // view must point along the wall: cos of the angle to the wall (0.3 ≈ 72°)
  wallRunReleaseLook: 0.8,  // turning to face away from the wall this much lets go
  wallRunCooldown: 0.35,    // after leaving a wall, before you can attach to another
  wallRunSameWallCooldown: 0.9, // before you can attach to the same wall again
  wallJumpOut: 6.5,         // push away from the wall
  wallJumpUp: 7.2,          // upward speed of the wall jump
  wallJumpKeep: 1.0,        // fraction of the speed along the wall you keep
  wallJumpReattach: 0.2,    // cooldown after a wall jump (lets you chain to the opposite wall)

  // --- Walls -----------------------------------------------------------------
  wallSlideMaxFall: 3.0,    // fall speed is capped at this while pushing into a wall in the air
  mantleMinHeight: 0.42,    // ledge heights above the feet that can be mantled...
  mantleMaxHeight: 1.35,    // ...up to here
  mantleDuration: 0.22,
  mantleForwardPush: 0.45,  // how far over the ledge the mantle carries you
  mantleExitSpeed: 4.5,     // forward speed when the mantle ends

  // --- Camera feel (client only, but tuned alongside movement) --------------
  fovSpeedBonus: 8,         // degrees added at high speed
  fovSpeedMin: 7.0,         // FOV starts widening at this speed...
  fovSpeedMax: 14.0,        // ...and is fully widened here
  fovLerp: 6,
  landDipScale: 0.012,      // landing camera dip per m/s of fall speed
  landDipMax: 0.22,
  slideTiltDeg: 4,
  wallRunTiltDeg: 11,       // camera roll away from the wall while wall running
  dashFovKick: 9,           // degrees added for a moment when you dash
  bobAmount: 0.012,
  bobFreq: 1.6,             // bob cycles per metre travelled (×π)
  swayAmount: 0.0018,
  footstepDistance: 2.4,    // metres between footstep sounds at full speed
};
