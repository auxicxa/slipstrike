// OVERPASS: a larger 3v3 map. An elevated road bridge crosses the middle (long sniper sightline),
// with an underpass below, rooftops on each side and parked cars for cover. Point-mirrored.
import { MapBuilder } from './builder.js';

const WALL = 0x6a6470, FLOOR = 0x7e8088, ROAD = 0x55585f, BRIDGE = 0x8c8a86, RAMP = 0x9a978f, PILLAR = 0x6f6a64,
  BLDG = 0xb28e6a, BLDG2 = 0x8f7f9c, ROOF = 0x6c5d4f, CAR1 = 0xc0443a, CAR2 = 0x3d7fc4, CAR3 = 0xe0c04a, BARRIER = 0xd8d4c8, CRATE = 0xc98f4a;

const m = new MapBuilder('overpass', 'Overpass', {
  sky: 0xf0b48a, fog: 0xd9a888, fogNear: 60, fogFar: 170, ground: FLOOR,
  // dusk: a low orange sun, a violet sky, neon signs and street lamps
  skyTop: 0x4d4f86, sun: 0xffab6c, sunIntensity: 2.4, sunDir: [0.74, 0.36, -0.45], groundLight: 0x4a3c42, hemi: 0.8, exposure: 1.0,
});

m.floor(-35, 0, 35, 39);
m.box(-36, 0, 39, 36, 10, 40, WALL);
m.box(-36, 0, 0, -35, 10, 39, WALL);
m.box(35, 0, 0, 36, 10, 39, WALL).run(3); // outer walls are runnable
m.decal(-35, 6, 35, 9, ROAD); // street under the bridge side

// The bridge: deck at 4 m across the middle, ramps down at the east end (mirrored to the west)
m.box(-24, 4, -3.5, 24, 4.6, 3.5, BRIDGE);
m.ramp(24, 0, -3.5, 35, 4.6, 3.5, '-x', RAMP);
m.box(-24, 4.6, 3.2, -14, 5.6, 3.5, BARRIER);  // railing with gaps
m.box(-8, 4.6, 3.2, 4, 5.6, 3.5, BARRIER);
m.box(10, 4.6, 3.2, 18, 5.6, 3.5, BARRIER);
m.block(-4, 0, 1.2, 1.2, 1.2, CRATE, 4.6).kind('crate'); // cover on the bridge
m.block(14, -1.5, 2.2, 1.2, 1.1, CAR2, 4.6);
// Pillars under the bridge (the underpass)
m.block(10, 0, 1.4, 1.4, 4, PILLAR);
m.block(20, 0, 1.4, 1.4, 4, PILLAR);

// Team-side buildings with rooftop access
m.box(12, 0, 15, 26, 5, 24, BLDG).run();
m.box(12, 5, 15, 26, 5.4, 24, ROOF);
m.ramp(26, 0, 15, 34, 5, 19, '-x', RAMP);       // ramp up to the roof
m.box(12, 5.4, 15, 26, 6.4, 15.3, BARRIER);    // roof edge (cover facing the bridge)
m.box(-26, 0, 17, -14, 7.5, 27, BLDG2).run(); // tall building (no roof access)
m.box(-30, 0, 10, -22, 2.4, 13, CRATE).kind('crate'); // loading bay crates (mantle-able)
m.box(-22, 0, 10, -19, 1.2, 12, CRATE).kind('crate');

// Street cover: cars and barriers
m.block(-6, 12, 4.2, 2, 1.4, CAR1);
m.block(4, 18, 2, 4.2, 1.4, CAR3);
m.block(-10, 6.5, 3, 0.6, 1.1, BARRIER);
m.block(2, 7.5, 3, 0.6, 1.1, BARRIER);
m.block(30, 9, 2, 4.2, 1.4, CAR2);

// Decoration (no collision): street lamps, neon signs, street clutter, rooftop AC, city blocks outside
m.prop('lampPost', -17, 0, 10.4, 0).prop('lampPost', 8, 0, 10.4, 0).prop('lampPost', 26.5, 0, 12.6, 0);
m.prop('signTeal', 19, 3.4, 15, 0).prop('signPink', -20, 4.6, 17, 0).prop('signTeal', -14, 4.2, 22, -Math.PI / 2);
m.prop('wallLamp', -15, 6, 39, 0).prop('wallLamp', 15, 6, 39, 0);
m.prop('acUnit', 15, 5.4, 22.6, 0).prop('acUnit', 22.5, 5.4, 22.4, 0.1);
m.prop('pipeRun', -14, 6.2, 24, -Math.PI / 2);
m.prop('hydrant', -2.4, 0, 10.4).prop('dumpster', -30, 0, 38.2, 0);
m.prop('trashcan', -24, 0, 38.4).prop('trashcan', 24, 0, 38.4).prop('trashcan', 11, 0, 14.4);
m.prop('cone', -12, 0, 8.6).prop('cone', -11.1, 0, 8.1, 0.5).prop('cone', 14, 0, 7.6);
m.prop('tower', -20, 0, 53, 0).prop('tower', 6, 0, 57, 0.2).prop('tower', 31, 0, 50, -0.15);

// Spawn shelter
m.box(-10, 0, 30, -3, 2.4, 31, BARRIER);
m.box(3, 0, 30, 10, 2.4, 31, BARRIER);
m.decal(-5, 33, 5, 38, 0xd97a3a);

m.spawn(0, -3, 0, 35.5, 0);
m.spawn(0, 0, 0, 35.5, 0);
m.spawn(0, 3, 0, 35.5, 0);
m.ffaSpawn(0, 4.6, 0, Math.PI / 2);
m.ffaSpawn(-30, 0, 30, 0);
m.ffaSpawn(19, 5.4, 20, 0);
m.ffaSpawn(-12, 0, 8, 1.2);
m.ffaSpawn(30, 0, 20, 0.8);
m.ffaSpawn(0, 0, 25, 0);

m.mirror();
export default m.build();
