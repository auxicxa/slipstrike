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

  // --- Air dash --------------------------------------------------------------
  dashSpeed: 11,            // horizontal speed set by the dash
  dashUpVelocity: 1.5,      // small upward pop so dashes don't feel like falling
  dashCooldown: 2.0,
  dashMinAirTime: 0.08,     // can't dash on the first frames of a jump (prevents accidental double taps)

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
  bobAmount: 0.012,
  bobFreq: 1.6,             // bob cycles per metre travelled (×π)
  swayAmount: 0.0018,
  footstepDistance: 2.4,    // metres between footstep sounds at full speed
};
