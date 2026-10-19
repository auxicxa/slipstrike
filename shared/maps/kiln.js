// KILN: a tight 1v1 arena. Built as one half and point-mirrored, so both sides are identical.
import { MapBuilder } from './builder.js';

const WALL = 0x8a5a44, FLOOR = 0x9b8b7a, CRATE = 0xc98f4a, PLAT = 0x7a6a5e, RAMP = 0x9c8a7c, LOW = 0xb59a7e, TOWER = 0x6d4c3d;

const m = new MapBuilder('kiln', 'Kiln', { sky: 0xf2c79b, fog: 0xe9b98c, fogNear: 45, fogFar: 120, ground: FLOOR });

// Floor and outer walls (the walls are mirrored, so add only the +z half here)
m.floor(-17, 0, 17, 23);
m.box(-18, 0, 23, 18, 8, 24, WALL);
m.box(-18, 0, 0, -17, 8, 23, WALL);
m.box(17, 0, 0, 18, 8, 23, WALL);

// Spawn cover
m.block(-5, 15.5, 3.2, 1.2, 1.3, LOW);
m.block(5, 15.5, 3.2, 1.2, 1.3, LOW);
m.block(0, 19.5, 2, 2, 2.2, CRATE);

// Left raised walkway with a ramp up from the spawn side; its front edge is a ledge to slide off
m.box(-17, 0, 4, -11, 2.5, 13, PLAT);
m.ramp(-17, 0, 13, -12, 2.5, 19, '-z', RAMP);
m.box(-11, 2.5, 7, -10.6, 3.5, 13, WALL); // little rail

// Right side: stacked crates (a mantle route) and a pillar
m.block(9, 9, 2.2, 2.2, 1.2, CRATE);
m.block(11.2, 10.4, 2.2, 2.2, 2.3, CRATE);
m.block(12, 3.2, 2, 2, 4.5, TOWER);

// Mid: a tall tower you can't climb, with low ledges either side
m.block(0, 0, 4, 4, 3.4, TOWER);
m.block(0, 4.2, 6, 1, 1.0, LOW);
m.block(-6.5, 7, 1, 5, 1.0, LOW);
m.block(6, 13, 4, 1, 1.1, LOW);

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
