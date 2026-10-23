// Themed map props (decoration only: they never touch the AABB collision). Each prop is built once
// as a handful of per-material geometries and drawn with one InstancedMesh per material for every
// placement on the map. Origin at the base centre, facing -Z. A prop may name a light socket
// ({ light: [x, y, z], color, intensity, distance }) that the map lighting turns into an accent light.
import * as THREE from 'three';
import { Assembly, cbox, box, cyl, cylY, torus, sphere, mat } from './kit.js';

const P = {};
const def = (name, build, light = null) => { P[name] = { build, light }; };

// ------------------------------------------------------------------ street / industrial
def('barrelRed', () => barrel('barrelRed'));
def('barrelBlue', () => barrel('barrelBlue'));
function barrel(m) {
  const a = new Assembly();
  a.add(cylY(0.29, 0.88, 12), mat(m), [0, 0.44, 0]);
  for (const y of [0.06, 0.3, 0.58, 0.84]) a.add(torus(0.295, 0.018, 4, 12), mat('pipe'), [0, y, 0], [Math.PI / 2, 0, 0]);
  a.add(cylY(0.26, 0.02, 12), mat('pipe'), [0, 0.885, 0]);
  a.add(cylY(0.035, 0.03, 6), mat('hazard'), [0.14, 0.9, 0.05]);
  return a;
}

def('cone', () => {
  const a = new Assembly();
  a.add(box(0.36, 0.04, 0.36), mat('rubber'), [0, 0.02, 0]);
  const g = new THREE.LatheGeometry([new THREE.Vector2(0.15, 0), new THREE.Vector2(0.03, 0.62), new THREE.Vector2(0, 0.62)], 10);
  a.add(g, mat('accent'), [0, 0.04, 0]);
  a.add(cylY(0.105, 0.09, 10, 0.085), mat('steel'), [0, 0.3, 0]); // reflective band
  return a;
});

def('bollard', () => {
  const a = new Assembly();
  a.add(cylY(0.17, 0.08, 10, 0.2), mat('darksteel'), [0, 0.04, 0]);
  a.add(cylY(0.13, 0.5, 10), mat('darksteel'), [0, 0.33, 0]);
  a.add(cylY(0.2, 0.08, 10, 0.16), mat('darksteel'), [0, 0.6, 0]);
  a.add(cylY(0.135, 0.06, 10), mat('hazard'), [0, 0.45, 0]);
  return a;
});

def('pallet', () => {
  const a = new Assembly();
  for (let i = 0; i < 5; i++) a.add(box(1.2, 0.025, 0.14), mat('crate'), [0, 0.14, -0.4 + i * 0.2]);
  for (const x of [-0.5, 0, 0.5]) a.add(box(0.1, 0.1, 1.0), mat('crateDark'), [x, 0.07, 0]);
  for (let i = 0; i < 3; i++) a.add(box(1.2, 0.022, 0.12), mat('crateDark'), [0, 0.011, -0.4 + i * 0.4]);
  return a;
});

def('crateSmall', () => {
  const a = new Assembly();
  a.add(cbox(0.8, 0.8, 0.8, 0.02), mat('crate'), [0, 0.4, 0]);
  for (const s of [-1, 1]) {
    a.add(box(0.84, 0.08, 0.84), mat('crateDark'), [0, 0.4 + s * 0.34, 0]);
    a.add(box(0.08, 0.8, 0.84), mat('crateDark'), [s * 0.38, 0.4, 0]);
  }
  a.add(box(0.82, 0.06, 0.82), mat('crateDark'), [0, 0.4, 0], [0, 0, 0.78]);
  return a;
});

def('tires', () => {
  const a = new Assembly();
  for (let i = 0; i < 3; i++) a.add(torus(0.3, 0.11, 6, 12), mat('rubber'), [0.02 * (i % 2), 0.11 + i * 0.21, 0], [Math.PI / 2, 0, 0]);
  return a;
});

def('ropeCoil', () => {
  const a = new Assembly();
  for (let i = 0; i < 3; i++) a.add(torus(0.32 - i * 0.04, 0.045, 5, 14), mat('tan'), [0, 0.045 + i * 0.07, 0], [Math.PI / 2, 0, 0]);
  return a;
});

def('pipeRun', () => {
  // a 4 m run of two pipes on brackets, to hang along a wall (back of the brackets at z = 0)
  const a = new Assembly();
  for (const [y, r] of [[0, 0.11], [0.3, 0.07]]) a.add(cyl(r, 4, 10), mat('pipe'), [0, y, -0.2], [0, Math.PI / 2, 0]);
  for (const x of [-1.6, 0, 1.6]) {
    a.add(box(0.06, 0.5, 0.24), mat('darksteel'), [x, 0.12, -0.12]);
    a.add(torus(0.115, 0.02, 4, 10), mat('darksteel'), [x, 0, -0.2], [0, Math.PI / 2, 0]);
  }
  a.add(box(0.5, 0.1, 0.02), mat('hazard'), [1.0, 0, -0.32]);
  return a;
});

def('acUnit', () => {
  const a = new Assembly();
  a.add(cbox(1.1, 0.75, 0.8, 0.03), mat('plate'), [0, 0.375, 0]);
  a.add(cylY(0.3, 0.04, 12), mat('rubber'), [0, 0.77, 0]);
  for (let i = 0; i < 3; i++) a.add(box(0.62, 0.012, 0.04), mat('darksteel'), [0, 0.795, -0.2 + i * 0.2]);
  for (let i = 0; i < 6; i++) a.add(box(0.9, 0.025, 0.02), mat('darksteel'), [0, 0.12 + i * 0.09, -0.405]);
  return a;
});

def('dumpster', () => {
  const a = new Assembly();
  a.add(cbox(1.8, 1.05, 1.1, 0.04), mat('olive'), [0, 0.6, 0]);
  a.add(box(1.86, 0.06, 1.16), mat('darksteel'), [0, 1.14, 0], [-0.12, 0, 0]);
  for (const x of [-0.75, 0.75]) a.add(cylY(0.07, 0.12, 8), mat('rubber'), [x, 0.06, 0.4]);
  a.add(box(1.4, 0.12, 0.02), mat('hazard'), [0, 0.85, -0.56]);
  return a;
});

def('trashcan', () => {
  const a = new Assembly();
  a.add(cylY(0.25, 0.85, 10, 0.27), mat('plate'), [0, 0.425, 0]);
  a.add(cylY(0.29, 0.06, 10), mat('darksteel'), [0, 0.88, 0]);
  for (let i = 0; i < 5; i++) a.add(box(0.01, 0.6, 0.05), mat('darksteel'), [Math.cos(i * 1.25) * 0.26, 0.45, Math.sin(i * 1.25) * 0.26], [0, -i * 1.25, 0]);
  return a;
});

def('hydrant', () => {
  const a = new Assembly();
  a.add(cylY(0.13, 0.08, 8), mat('barrelRed'), [0, 0.04, 0]);
  a.add(cylY(0.1, 0.5, 8), mat('barrelRed'), [0, 0.33, 0]);
  a.add(sphere(0.11, 8, 5), mat('barrelRed'), [0, 0.6, 0]);
  for (const s of [-1, 1]) a.add(cyl(0.05, 0.12, 6), mat('barrelRed'), [s * 0.12, 0.4, 0], [0, Math.PI / 2, 0]);
  a.add(cylY(0.04, 0.05, 6), mat('hazard'), [0, 0.71, 0]);
  return a;
});

def('sandbags', () => {
  const a = new Assembly();
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 4 - row; i++) {
      a.add(cbox(0.55, 0.16, 0.32, 0.06), mat('tan'), [(i - (3 - row) / 2) * 0.56, 0.08 + row * 0.15, 0], [0, (i % 2) * 0.06, 0]);
    }
  }
  return a;
});

// ------------------------------------------------------------------ lights
def('lampPost', () => {
  const a = new Assembly();
  a.add(cylY(0.12, 0.25, 8, 0.1), mat('darksteel'), [0, 0.125, 0]);
  a.add(cylY(0.06, 4.6, 8, 0.045), mat('pipe'), [0, 2.55, 0]);
  a.add(box(0.06, 0.06, 1.1), mat('pipe'), [0, 4.8, -0.5]);
  a.add(cbox(0.32, 0.12, 0.5, 0.03), mat('darksteel'), [0, 4.76, -1.0]);
  a.add(box(0.24, 0.03, 0.4), mat('lampGlow'), [0, 4.69, -1.0]);
  return a;
}, { light: [0, 4.5, -1.0], color: 0xffd9a0, intensity: 9, distance: 14 });

def('wallLamp', () => {
  // mounted on a wall facing -Z (back plate at z = 0)
  const a = new Assembly();
  a.add(box(0.26, 0.34, 0.04), mat('darksteel'), [0, 0, -0.02]);
  a.add(box(0.05, 0.05, 0.3), mat('darksteel'), [0, 0.08, -0.17]);
  a.add(cbox(0.36, 0.14, 0.26, 0.03), mat('darksteel'), [0, 0.12, -0.34]);
  a.add(box(0.3, 0.025, 0.2), mat('lampGlow'), [0, 0.05, -0.34]);
  return a;
}, { light: [0, -0.3, -0.6], color: 0xffcf8a, intensity: 6, distance: 10 });

def('floodlight', () => {
  const a = new Assembly();
  a.add(cbox(0.6, 0.3, 0.6, 0.04), mat('concreteDark'), [0, 0.15, 0]);
  a.add(cylY(0.1, 8.5, 8, 0.08), mat('pipe'), [0, 4.55, 0]);
  a.add(box(1.6, 0.08, 0.08), mat('pipe'), [0, 8.7, 0]);
  for (const x of [-0.55, 0, 0.55]) {
    a.add(cbox(0.42, 0.34, 0.2, 0.02), mat('darksteel'), [x, 8.95, -0.08], [-0.45, 0, 0]);
    a.add(box(0.34, 0.26, 0.02), mat('lampGlow'), [x, 8.9, -0.19], [-0.45, 0, 0]);
  }
  return a;
}, { light: [0, 8.2, -1.2], color: 0xe8f1ff, intensity: 22, distance: 26 });

def('signTeal', () => sign('signTeal'));
def('signPink', () => sign('signPink'));
function sign(m) {
  const a = new Assembly();
  a.add(box(2.2, 0.8, 0.08), mat('darksteel'), [0, 0, -0.04]);
  a.add(box(2.0, 0.08, 0.05), mat(m), [0, 0.26, -0.1]);
  a.add(box(2.0, 0.08, 0.05), mat(m), [0, -0.26, -0.1]);
  for (let i = 0; i < 5; i++) a.add(box(0.08, 0.36, 0.05), mat(m), [-0.8 + i * 0.4, 0, -0.1]);
  return a;
}
P.signTeal.light = { light: [0, 0, -0.8], color: 0x2ad1c0, intensity: 4, distance: 8 };
P.signPink.light = { light: [0, 0, -0.8], color: 0xff4f8b, intensity: 4, distance: 8 };

def('buoy', () => {
  const a = new Assembly();
  a.add(torus(0.3, 0.07, 6, 14), mat('barrelRed'), [0, 0, -0.08]);
  for (let i = 0; i < 4; i++) a.add(box(0.1, 0.16, 0.16), mat('steel'), [Math.cos(i * Math.PI / 2 + 0.785) * 0.3, Math.sin(i * Math.PI / 2 + 0.785) * 0.3, -0.08], [0, 0, i * Math.PI / 2 + 0.785]);
  return a;
});

// ------------------------------------------------------------------ kiln
def('pots', () => {
  const a = new Assembly();
  const pot = new THREE.LatheGeometry([[0, 0], [0.16, 0], [0.24, 0.15], [0.22, 0.32], [0.12, 0.42], [0.13, 0.48], [0.1, 0.48]].map(([r, y]) => new THREE.Vector2(r, y)), 10);
  a.add(pot, mat('crate'), [0, 0, 0]);
  a.add(pot, mat('crateDark'), [0.45, 0, 0.15], [0, 0, 0], [0.8, 0.8, 0.8]);
  a.add(pot, mat('crate'), [-0.2, 0, 0.45], [0, 0, 0], [0.7, 1.1, 0.7]);
  return a;
});

def('brickPile', () => {
  const a = new Assembly();
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i < 5; i++) a.add(box(0.21, 0.07, 0.1), mat(row % 2 ? 'barrelRed' : 'crate'), [(i - 2) * 0.22 + (row % 2) * 0.05, 0.035 + row * 0.07, 0]);
    for (let i = 0; i < 5; i++) a.add(box(0.21, 0.07, 0.1), mat(row % 2 ? 'crate' : 'barrelRed'), [(i - 2) * 0.22 + (row % 2) * 0.05, 0.035 + row * 0.07, 0.11]);
  }
  return a;
});

def('chimney', () => {
  // a kiln chimney for the skyline (outside the walls)
  const a = new Assembly();
  a.add(cbox(3.4, 2.2, 3.4, 0.1), mat('concreteDark'), [0, 1.1, 0]);
  a.add(cylY(1.2, 16, 10, 0.85), mat('barrelRed'), [0, 10.2, 0]);
  for (const y of [6, 11, 16]) a.add(cylY(1.25 - y * 0.022, 0.4, 10), mat('crateDark'), [0, y, 0]);
  a.add(cylY(0.95, 0.6, 10), mat('darksteel'), [0, 18.4, 0]);
  return a;
});

def('awning', () => {
  // canvas awning on a wall (back at z = 0), for the kiln yard
  const a = new Assembly();
  a.add(box(3, 0.04, 1.4), mat('tan'), [0, 0, -0.7], [-0.25, 0, 0]);
  for (const x of [-1.4, 1.4]) a.add(cyl(0.03, 1.5, 6), mat('wood'), [x, -0.18, -0.7], [0.25, 0, 0]);
  for (let i = 0; i < 6; i++) a.add(box(0.5, 0.045, 0.02), mat(i % 2 ? 'accent' : 'tan'), [-1.25 + i * 0.5, -0.17, -1.38]);
  return a;
});

// ------------------------------------------------------------------ dockyard skyline
def('crane', () => {
  // a dockside gantry crane for the skyline
  const a = new Assembly();
  for (const x of [-4, 4]) for (const z of [-3, 3]) a.add(box(0.6, 22, 0.6), mat('hazard'), [x, 11, z]);
  a.add(box(9.2, 1.2, 7.2), mat('hazard'), [0, 22.4, 0]);
  a.add(box(1.2, 1.2, 30), mat('hazard'), [-3, 23.6, -10]);
  a.add(box(1.2, 1.2, 30), mat('hazard'), [3, 23.6, -10]);
  a.add(cbox(3.2, 2.6, 3.2, 0.1), mat('plate'), [0, 21, 1]);
  for (let i = 0; i < 5; i++) {
    for (const x of [-4, 4]) a.add(box(0.2, 0.2, 6.2), mat('darksteel'), [x, 3 + i * 4, 0]);
    for (const z of [-3, 3]) a.add(box(8.2, 0.2, 0.2), mat('darksteel'), [0, 3 + i * 4, z]);
  }
  a.add(box(0.1, 9, 0.1), mat('darksteel'), [0, 18, -18]);
  a.add(cbox(2.4, 0.5, 1.2, 0.05), mat('darksteel'), [0, 13.3, -18]);
  return a;
});

def('containerStack', () => {
  const a = new Assembly();
  const cols = ['barrelBlue', 'barrelRed', 'olive', 'hazard'];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 2; j++) {
      const m = mat(cols[(i + j * 2) % 4]);
      a.add(box(2.44, 2.59, 6.06), m, [i * 2.5 - 2.5, 1.3 + j * 2.6, 0]);
      for (let k = 0; k < 11; k++) a.add(box(2.48, 2.3, 0.05), m, [i * 2.5 - 2.5, 1.3 + j * 2.6, -2.75 + k * 0.55]);
    }
  }
  return a;
});

// ------------------------------------------------------------------ overpass skyline
def('tower', () => {
  // a city block for the skyline, with lit window strips
  const a = new Assembly();
  a.add(box(12, 28, 10), mat('concreteDark'), [0, 14, 0]);
  for (let f = 0; f < 8; f++) {
    a.add(box(11.2, 1.0, 0.1), mat(f % 3 === 1 ? 'window' : 'visor'), [0, 3 + f * 3.2, -5.02]);
    a.add(box(0.1, 1.0, 9.2), mat(f % 4 === 2 ? 'window' : 'visor'), [-6.02, 3 + f * 3.2, 0]);
    a.add(box(0.1, 1.0, 9.2), mat(f % 4 === 0 ? 'window' : 'visor'), [6.02, 3 + f * 3.2, 0]);
  }
  a.add(box(12.4, 0.6, 10.4), mat('plate'), [0, 28.3, 0]);
  a.add(cbox(2.5, 2, 2.5, 0.1), mat('plate'), [2, 29.6, 1.5]);
  return a;
});

export const PROP_TYPES = Object.keys(P);

const built = new Map();
/** { parts: [{ geometry, material }], light } for a prop type (built once). */
export function propParts(type) {
  if (built.has(type)) return built.get(type);
  const def = P[type];
  if (!def) throw new Error('unknown prop ' + type);
  const group = def.build().build();
  const parts = group.children.map((m) => ({ geometry: m.geometry, material: m.material }));
  const out = { parts, light: def.light };
  built.set(type, out);
  return out;
}

/** A single prop as an Object3D (for the viewer). */
export function propModel(type) {
  const g = new THREE.Group();
  for (const p of propParts(type).parts) g.add(new THREE.Mesh(p.geometry, p.material));
  return g;
}
