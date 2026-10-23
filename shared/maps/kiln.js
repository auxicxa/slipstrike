// KILN: a tight 1v1 arena. Built as one half and point-mirrored, so both sides are identical.
import { MapBuilder } from './builder.js';

const WALL = 0x8a5a44, FLOOR = 0x9b8b7a, CRATE = 0xc98f4a, PLAT = 0x7a6a5e, RAMP = 0x9c8a7c, LOW = 0xb59a7e, TOWER = 0x6d4c3d;

const m = new MapBuilder('kiln', 'Kiln', {
  sky: 0xf2c79b, fog: 0xe9b98c, fogNear: 45, fogFar: 120, ground: FLOOR,
  // late-afternoon sun low in the west: long warm shadows
  skyTop: 0x6d93c4, sun: 0xffd3a1, sunIntensity: 2.7, sunDir: [-0.55, 0.52, 0.42], groundLight: 0x6a4a38, hemi: 0.85, exposure: 1.0,
});

// Floor and outer walls (the walls are mirrored, so add only the +z half here)
m.floor(-17, 0, 17, 23);
m.box(-18, 0, 23, 18, 8, 24, WALL);
m.box(-18, 0, 0, -17, 8, 23, WALL);
m.box(17, 0, 0, 18, 8, 23, WALL).run(3); // all outer walls are runnable

// Spawn cover
m.block(-5, 15.5, 3.2, 1.2, 1.3, LOW);
m.block(5, 15.5, 3.2, 1.2, 1.3, LOW);
m.block(0, 12.5, 2, 2, 2.2, CRATE).kind('crate');

// Left raised walkway with a ramp up from the spawn side; its front edge is a ledge to slide off
m.box(-17, 0, 4, -11, 2.5, 13, PLAT);
m.ramp(-17, 0, 13, -12, 2.5, 19, '-z', RAMP);
m.box(-11, 2.5, 7, -10.6, 3.5, 13, WALL); // little rail

// Right side: stacked crates (a mantle route) and a pillar
m.block(9, 9, 2.2, 2.2, 1.2, CRATE).kind('crate');
m.block(11.2, 10.4, 2.2, 2.2, 2.3, CRATE).kind('crate');
m.block(12, 3.2, 2, 2, 4.5, TOWER);

// Mid: a tall tower you can't climb, with low ledges either side
m.block(0, 0, 4, 4, 3.4, TOWER).run();
m.block(0, 4.2, 6, 1, 1.0, LOW);
m.block(-6.5, 7, 1, 5, 1.0, LOW);
m.block(6, 13, 4, 1, 1.1, LOW);

// Decoration (no collision): lamps, an awning over the spawn, pipes, kiln clutter, chimneys on the skyline
m.prop('wallLamp', -8, 4.6, 23, 0).prop('wallLamp', 8, 4.6, 23, 0);
m.prop('wallLamp', 17, 4.6, 8, Math.PI / 2).prop('wallLamp', -17, 4.6, 16, -Math.PI / 2);
m.prop('awning', 0, 3.4, 23, 0);
m.prop('pipeRun', -12, 6.2, 23, 0).prop('pipeRun', 3, 6.2, 23, 0).prop('pipeRun', 17, 6.4, 18, Math.PI / 2);
m.prop('pots', -15.6, 0, 21.6, 0.4).prop('pots', 14.6, 0, 21.8, 2.1).prop('pots', 15.8, 0, 14.5, 1.0);
m.prop('brickPile', -15.6, 0, 2.2, Math.PI / 2).prop('brickPile', 7, 0, 22.3, 0);
m.prop('pallet', 10, 0, 22, 0.1).prop('pallet', 10.1, 0.16, 22.1, -0.05);
m.prop('barrelRed', 16.1, 0, 4.5, 0).prop('sandbags', -13.5, 2.5, 4.4, 0);
m.prop('chimney', -25, 0, 31, 0).prop('chimney', 11, 0, 35, 0.6);

// A floor marking for the spawn zone (no collision)
m.decal(-3, 17, 3, 21.5, 0xd97a3a);

m.spawn(0, -2, 0, 20.5, 0);
m.spawn(0, 2, 0, 20.5, 0);
m.spawn(0, 0, 0, 17.5, 0);
m.ffaSpawn(-14, 2.5, 6, -0.5);
m.ffaSpawn(14, 0, 18, 0.6);
m.ffaSpawn(0, 0, 21, 0);
m.ffaSpawn(9, 0, 3, 1.5);

m.mirror();
export default m.build();
