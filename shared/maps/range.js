// Practice Range: a movement playground plus target dummies. Used by offline practice.
import { MapBuilder } from './builder.js';

const WALL = 0x5d6475, CRATE = 0xc98f4a, PLAT = 0x7d8aa6, RAMP = 0x9aa6bf, MANTLE = 0xd9c25b, ACCENT = 0x55b37a;

const m = new MapBuilder('range', 'Range', { sky: 0x9fc6e8, fog: 0xb9d3ea, fogNear: 50, fogFar: 160, ground: 0x7f838e });

m.floor(-45, -60, 45, 40);
m.walls(-45, -60, 45, 40, 7, WALL).run(4); // outer walls are runnable

// Lane markers on the floor (thin, walkable)
for (let z = -50; z <= 30; z += 10) m.decal(-0.1, z - 0.05, 0.1, z + 0.05, 0x9da2ad);

// --- Left: tower with ramp, stairs and a ledge to slide off ---
m.box(-40, 0, -20, -28, 3, -8, PLAT); // platform 3 m high
m.ramp(-28, 0, -20, -18, 3, -14, '-x', RAMP); // ramp rising toward the platform (-x)
for (let i = 0; i < 8; i++) m.box(-40, 0, -8, -36, 0.375 * (i + 1), -8 + (8 - i), PLAT); // stairs down toward +z
m.box(-40, 3, -20, -39, 4, -8, WALL); // little rail on the back
m.box(-27.5, 0, -8, -18, 1.5, 0, PLAT); // lower ledge 1.5 m (slide-off / mantle)
m.ramp(-18, 0, -8, -12, 1.5, 0, '-x', RAMP);

// --- Right: mantle test blocks of increasing height ---
const mh = [0.6, 0.9, 1.2, 1.35, 1.8];
mh.forEach((h, i) => m.block(18 + i * 4.5, -6, 3, 3, h, i === mh.length - 1 ? WALL : MANTLE));
// Wall-run lane: two parallel runnable walls to practise wall runs and wall jumps between them
m.box(36, 0, -30, 37, 7, -12, WALL).run();
m.box(28, 0, -30, 29, 7, -12, WALL).run();

// --- Crates as cover near the dummies ---
m.block(-10, -22, 2, 2, 1.2, CRATE).kind('crate');
m.block(10, -22, 2, 2, 1.2, CRATE).kind('crate');
m.block(0, -30, 4, 1, 2.2, CRATE).kind('crate');
m.block(-18, -40, 3, 3, 3, CRATE).kind('crate');
m.block(18, -40, 3, 3, 3, CRATE).kind('crate');

// Decoration (no collision)
m.prop('floodlight', -43.4, 0, 38.4, -0.8).prop('floodlight', 43.4, 0, 38.4, 0.8).prop('floodlight', 0, 0, -58.5, Math.PI);
m.prop('barrelRed', 43.6, 0, 20).prop('barrelBlue', 43.4, 0, 21, 0.6).prop('pallet', -43, 0, 30, Math.PI / 2);
m.prop('cone', 31, 0, -11).prop('cone', 34, 0, -11, 0.4).prop('cone', 31, 0, -31).prop('cone', 34, 0, -31, 0.4);

// --- Long lane far end: sniper targets on a balcony ---
m.box(-12, 0, -60, 12, 2.5, -54, PLAT);
m.box(-12, 2.5, -60, 12, 2.6, -59.8, ACCENT);

m.spawn(0, 0, 0, 20, 0);
m.spawn(1, 0, 0, -50, Math.PI);
m.ffaSpawn(0, 0, 20, 0);

// Dummies: [x, y, z]; "strafe" dummies move side to side
m.dummy(-6, 0, -16);
m.dummy(-2, 0, -16, { crouch: true });
m.dummy(2, 0, -16);
m.dummy(6, 0, -16, { strafe: 3 });
m.dummy(-14, 0, -32, { strafe: 4 });
m.dummy(14, 0, -32);
m.dummy(-6, 2.5, -57);
m.dummy(6, 2.5, -57, { strafe: 4 });
m.dummy(-34, 3, -14); // on the tower

export default m.build();
