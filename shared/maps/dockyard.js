// DOCKYARD: a medium 2v2 map. Shipping containers, a central crane deck and a side catwalk.
// Built as one half and point-mirrored for fairness.
import { MapBuilder } from './builder.js';

const WALL = 0x5b6670, FLOOR = 0x8d939b, DECK = 0x6f7a86, RAMP = 0x8a96a3, RED = 0xb8483c, BLUE = 0x3f6fa8, GREEN = 0x4f8a5b, YELLOW = 0xd2a73a, CRATE = 0xc98f4a, RAIL = 0x3b434b;

const m = new MapBuilder('dockyard', 'Dockyard', {
  sky: 0xa9cde6, fog: 0xbfd6e6, fogNear: 55, fogFar: 150, ground: FLOOR,
  // bright harbour midday with a cool sky
  skyTop: 0x4f86c2, sun: 0xfff1dc, sunIntensity: 2.3, sunDir: [0.5, 0.66, 0.42], groundLight: 0x4a545e, hemi: 0.8, exposure: 0.88,
});

m.floor(-25, 0, 25, 31);
m.box(-26, 0, 31, 26, 9, 32, WALL);
m.box(-26, 0, 0, -25, 9, 31, WALL);
m.box(25, 0, 0, 26, 9, 31, WALL).run(3); // outer walls are runnable

// Spawn cover: a container lying sideways and two crates
m.box(-3, 0, 22, 3, 2.4, 24.5, RED).kind('container');
m.block(-9, 26, 2, 2, 1.2, CRATE).kind('crate');
m.block(9, 25, 2, 2, 1.2, CRATE).kind('crate');
m.block(10.2, 26.6, 1.6, 1.6, 2.2, CRATE).kind('crate');

// Left catwalk (3 m) with a ramp from the spawn side and a drop/slide-off toward mid
m.box(-25, 0, 6, -19, 3, 19, DECK);
m.ramp(-25, 0, 19, -20, 3, 26, '-z', RAMP);
m.box(-19, 3, 9, -18.7, 4, 19, RAIL);

// Container yard on the right: single (mantle-able, 2.4 m) and stacked (too tall to climb)
m.box(13, 0, 9, 15.5, 2.4, 15, BLUE).kind('container');
m.box(17, 0, 9, 19.5, 2.4, 15, GREEN);
m.box(17, 2.4, 9, 19.5, 4.8, 15, YELLOW).run(2).kind('container', 2); // the stacked containers
m.box(21.5, 0, 16, 25, 2.4, 22, RED).kind('container');
m.block(11, 18.5, 2, 2, 1.2, CRATE).kind('crate');

// Mid-lane cover
m.box(-11, 0, 10, -5, 2.4, 12.5, GREEN).run().kind('container');
m.block(-2, 13, 1, 4, 1.1, CRATE).kind('crate');
m.block(5, 9, 3, 1, 1.2, CRATE).kind('crate');

// Central crane deck (2 m) with ramps on both sides (mirrors onto itself)
m.box(-6, 0, -4, 6, 2, 4, DECK);
m.ramp(6, 0, -2, 11, 2, 2, '-x', RAMP);
m.box(-1, 2, -0.5, 1, 7, 0.5, RAIL); // crane mast (blocks sightlines across the deck)
m.box(-6, 2, 3.7, -2, 3, 4, RAIL);  // deck rail

// Decoration (no collision): floodlights, mooring clutter, buoys, pipes, a crane and container stacks outside
m.prop('floodlight', -23.4, 0, 29.4, -0.67).prop('floodlight', 23.4, 0, 29.4, 0.67);
m.prop('wallLamp', 0, 6.2, 31, 0).prop('wallLamp', 25, 5, 4, Math.PI / 2).prop('wallLamp', -25, 5, 27, -Math.PI / 2);
m.prop('bollard', -24.3, 0, 2.5).prop('bollard', 24.3, 0, 2.5).prop('bollard', 24.3, 0, 24.5);
m.prop('ropeCoil', -22, 0, 28.6).prop('ropeCoil', 16, 0, 29.9, 0.5).prop('tires', 22.8, 0, 28.6);
m.prop('barrelBlue', -20.4, 0, 29.6).prop('barrelRed', -19.6, 0, 30.2, 0.7).prop('pallet', 12.5, 0, 29.9, 0.2);
m.prop('buoy', -12, 2.4, 31, 0).prop('buoy', 14, 2.4, 31, 0);
m.prop('pipeRun', -8, 7.2, 31, 0).prop('pipeRun', 8, 7.2, 31, 0);
m.prop('crane', -14, 0, 44, 0).prop('containerStack', 20, 0, 41, 0.25).prop('containerStack', -33, 0, 18, Math.PI / 2);

m.decal(-4, 26, 4, 30, 0xd97a3a);

m.spawn(0, -5, 0, 28.5, 0);
m.spawn(0, 5, 0, 28.5, 0);
m.spawn(0, -1.5, 0, 27, 0);
m.ffaSpawn(-22, 3, 12, -0.6);
m.ffaSpawn(22, 0, 26, 0.5);
m.ffaSpawn(3.5, 2, 2, 0);
m.ffaSpawn(-14, 0, 22, 0);
m.ffaSpawn(16, 0, 6, 1.6);

m.mirror();
export default m.build();
