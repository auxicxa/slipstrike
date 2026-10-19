// Weapon tuning. Angles are in degrees, times in seconds, distances in metres.
// Recoil patterns list the view kick per shot as [pitchUp, yawRight] in degrees. The full pattern
// moves your view: pull down/sideways to control it. After the pattern ends, the last entry repeats.
// Reserve ammo is unlimited (rounds are short); only the magazine matters.

const rifleRecoil = [
  [0.0, 0.0], [0.55, 0.05], [0.6, 0.08], [0.65, 0.05], [0.7, -0.05], [0.7, -0.15], [0.6, -0.25], [0.5, -0.3],
  [0.4, -0.2], [0.35, 0.1], [0.3, 0.3], [0.3, 0.4], [0.25, 0.35], [0.25, 0.2], [0.2, -0.1], [0.2, -0.3],
  [0.2, -0.4], [0.2, -0.3], [0.2, 0.0], [0.2, 0.3], [0.2, 0.4], [0.2, 0.3], [0.2, -0.1], [0.2, -0.35],
];

export const WEAPONS = {
  rifle: {
    id: 'rifle', name: 'Assault Rifle', slot: 'primary', kind: 'gun',
    auto: true, damage: 28, headMult: 1.8, legMult: 0.8, pellets: 1,
    fireInterval: 0.1, mag: 30, reload: 2.0, swap: 0.45, range: 220,
    falloffStart: 25, falloffEnd: 45, falloffMin: 0.7,
    spreadHip: 1.1, spreadAds: 0.15, spreadMove: 0.18, spreadAir: 3.0, spreadCrouch: 0.75,
    bloomPerShot: 0.18, bloomMax: 2.0, bloomRecover: 5,
    recoil: rifleRecoil, recoilRecover: 7, adsRecoilMult: 0.75,
    adsZoom: 1.35, adsTime: 0.18, scope: false, moveMult: 1.0,
  },
  shotgun: {
    id: 'shotgun', name: 'Shotgun', slot: 'primary', kind: 'gun',
    auto: false, damage: 12, headMult: 1.5, legMult: 0.85, pellets: 8, pelletSpread: 4.2,
    fireInterval: 0.8, mag: 6, reload: 2.2, swap: 0.45, range: 60,
    falloffStart: 6, falloffEnd: 16, falloffMin: 0.25,
    spreadHip: 0.6, spreadAds: 0.3, spreadMove: 0.05, spreadAir: 0.6, spreadCrouch: 1,
    bloomPerShot: 0, bloomMax: 0, bloomRecover: 1,
    recoil: [[3.5, 0.3]], recoilRecover: 6, adsRecoilMult: 0.9, adsPelletMult: 0.8,
    adsZoom: 1.1, adsTime: 0.15, scope: false, moveMult: 1.0,
  },
  sniper: {
    id: 'sniper', name: 'Sniper', slot: 'primary', kind: 'gun',
    auto: false, damage: 110, headMult: 1.6, legMult: 0.68, pellets: 1,
    fireInterval: 1.2, mag: 5, reload: 2.6, swap: 0.7, range: 400,
    falloffStart: 999, falloffEnd: 1000, falloffMin: 1,
    spreadHip: 6.0, spreadAds: 0.0, spreadMove: 0.25, spreadAir: 6.0, spreadCrouch: 1,
    bloomPerShot: 0, bloomMax: 0, bloomRecover: 1,
    recoil: [[4.5, 0.4]], recoilRecover: 5, adsRecoilMult: 1,
    adsZoom: 4.0, adsTime: 0.28, scope: true, moveMult: 0.92,
  },
  pistol: {
    id: 'pistol', name: 'Pistol', slot: 'secondary', kind: 'gun',
    auto: false, damage: 24, headMult: 2.0, legMult: 0.8, pellets: 1,
    fireInterval: 0.15, mag: 12, reload: 1.4, swap: 0.2, range: 160,
    falloffStart: 15, falloffEnd: 35, falloffMin: 0.65,
    spreadHip: 0.55, spreadAds: 0.12, spreadMove: 0.1, spreadAir: 2.0, spreadCrouch: 0.8,
    bloomPerShot: 0.35, bloomMax: 1.6, bloomRecover: 6,
    recoil: [[1.3, 0.12]], recoilRecover: 9, adsRecoilMult: 0.8,
    adsZoom: 1.25, adsTime: 0.12, scope: false, moveMult: 1.04,
  },
  revolver: {
    id: 'revolver', name: 'Revolver', slot: 'secondary', kind: 'gun',
    auto: false, damage: 45, headMult: 2.0, legMult: 0.75, pellets: 1,
    fireInterval: 0.5, mag: 6, reload: 2.0, swap: 0.3, range: 180,
    falloffStart: 20, falloffEnd: 40, falloffMin: 0.7,
    spreadHip: 0.9, spreadAds: 0.08, spreadMove: 0.2, spreadAir: 3.0, spreadCrouch: 0.8,
    bloomPerShot: 0, bloomMax: 0, bloomRecover: 1,
    recoil: [[3.2, 0.25]], recoilRecover: 7, adsRecoilMult: 0.8,
    adsZoom: 1.35, adsTime: 0.16, scope: false, moveMult: 1.0,
  },
  knife: {
    id: 'knife', name: 'Knife', slot: 'melee', kind: 'melee',
    swap: 0, moveMult: 1.22, // see MOVEMENT.knifeSpeedMult (kept equal)
    stab: { damage: 35, range: 2.0, interval: 0.35, windup: 0 },
    heavy: { damage: 70, range: 2.2, interval: 1.0, windup: 0.35 },
    headMult: 1, legMult: 1,
  },
};

export const PRIMARIES = ['rifle', 'shotgun', 'sniper'];
export const SECONDARIES = ['pistol', 'revolver'];
export const DEFAULT_LOADOUT = { p: 'rifle', s: 'pistol' };

export function sanitizeLoadout(l) {
  return {
    p: PRIMARIES.includes(l?.p) ? l.p : DEFAULT_LOADOUT.p,
    s: SECONDARIES.includes(l?.s) ? l.s : DEFAULT_LOADOUT.s,
  };
}

// Hitbox layout as fractions of the player's current height (standing 1.8 m)
export const HITBOX = {
  legsTop: 0.47,    // 0 to 0.47 h  → legs
  bodyTop: 0.80,    // to 0.80 h    → upper body
  // above → head
  bodyHalf: 0.32,
  legsHalf: 0.26,
  headHalf: 0.17,
};
