// Procedural weapon models, built at real-world scale (metres), pointing down -Z, with the grip
// (right hand) near the origin and the bore at y = 0. Static pieces are merged per material; moving
// parts are their own groups so the viewmodel can animate them:
//   mag (magazine), bolt, pump, slide, hammer, cyl (revolver cylinder), trigger
// Sockets: muzzle, eject, grip (right hand), support (left hand), sight (eye line when aiming).
// Profiles are [forward, up] pairs; forward = -Z.
import { Assembly, cbox, box, profile, cyl, cylY, latheZ, torus, sphere, socket, part, mat, flattenModel } from './kit.js';

const M = {
  metal: () => mat('gunmetal'), steel: () => mat('steel'), dark: () => mat('darksteel'), poly: () => mat('polymer'),
  tan: () => mat('tan'), olive: () => mat('olive'), wood: () => mat('wood'), rubber: () => mat('rubber'),
  accent: () => mat('accent'), lens: () => mat('lens'), dot: () => mat('reddot'), brass: () => mat('brass'),
  edge: () => mat('edge'), wrap: () => mat('wrap'),
};
const Z = (u) => -u; // forward distance → z

/** Picatinny-style rail: a strip with evenly spaced teeth (forward from u0 to u1, top at height v). */
function rail(a, u0, u1, v, width, material, x = 0, rot = [0, 0, 0]) {
  const len = u1 - u0;
  a.add(box(width, 0.006, len), material, [x, v - 0.003, Z(u0 + len / 2)], rot);
  const n = Math.max(2, Math.floor(len / 0.012));
  for (let i = 0; i < n; i++) {
    const u = u0 + (i + 0.5) * (len / n);
    a.add(box(width * 1.15, 0.004, 0.006), material, [x, v + 0.002, Z(u)], rot);
  }
}

/** Trigger guard (half loop) and trigger blade below the bore at forward position u. */
function triggerGroup(a, u, v, metal) {
  const guard = torus(0.022, 0.003, 4, 10, Math.PI);
  a.add(guard, metal, [0, v, Z(u)], [0, Math.PI / 2, Math.PI]);
  a.add(box(0.004, 0.024, 0.006), metal, [0, v - 0.01, Z(u - 0.004)], [0.35, 0, 0]);
}

// =================================================================== assault rifle
function buildRifle() {
  const st = new Assembly('rifle');
  const metal = M.metal(), poly = M.poly(), dark = M.dark(), acc = M.accent();
  // Upper receiver with a forward taper and ejection port housing
  st.add(profile([[-0.13, -0.02], [0.17, -0.02], [0.18, 0.012], [0.17, 0.03], [-0.12, 0.03], [-0.13, 0.018]], 0.034, 0.003), metal);
  // Lower receiver + magwell flare
  st.add(profile([[-0.11, -0.02], [0.13, -0.02], [0.13, -0.035], [0.09, -0.07], [0.03, -0.072], [0.0, -0.04], [-0.07, -0.04], [-0.11, -0.03]], 0.03, 0.003), metal);
  // Handguard (octagonal) with side and bottom rails and vent slots
  st.add(cyl(0.026, 0.25, 8), poly, [0, -0.001, Z(0.305)], [0, 0, Math.PI / 8]);
  rail(st, 0.18, 0.43, 0.031, 0.02, dark);
  rail(st, 0.22, 0.4, -0.027, 0.016, dark, 0, [0, 0, Math.PI]);
  for (const sx of [-1, 1]) {
    rail(st, 0.24, 0.36, 0, 0.012, dark, sx * 0.027, [0, 0, (sx * Math.PI) / 2]);
    for (let i = 0; i < 4; i++) st.add(box(0.004, 0.008, 0.02), dark, [sx * 0.024, 0.012, Z(0.2 + i * 0.05)]);
  }
  // Top rail over the receiver
  rail(st, -0.12, 0.17, 0.036, 0.02, dark);
  // Barrel, gas block, muzzle brake (with ports)
  st.add(cyl(0.0095, 0.2, 10), metal, [0, 0, Z(0.53)]);
  st.add(cbox(0.022, 0.03, 0.02), dark, [0, 0.006, Z(0.45)]);
  st.add(latheZ([[0, 0], [0.014, 0], [0.015, -0.01], [0.015, -0.055], [0.012, -0.065], [0, -0.065]], 10), dark, [0, 0, Z(0.6)]);
  for (const sx of [-1, 1]) st.add(box(0.006, 0.006, 0.03), poly, [sx * 0.013, 0, Z(0.635)]);
  // Pistol grip (raked back) and trigger group
  st.add(profile([[-0.065, -0.035], [-0.025, -0.035], [-0.05, -0.135], [-0.088, -0.13]], 0.03, 0.004), poly);
  triggerGroup(st, -0.01, -0.04, metal);
  // Buffer tube and adjustable stock with cheek riser, rubber butt pad, accent stripe
  st.add(cyl(0.014, 0.2, 10), metal, [0, 0.008, Z(-0.22)]);
  st.add(profile([[-0.22, 0.03], [-0.37, 0.034], [-0.38, -0.075], [-0.33, -0.075], [-0.25, -0.012], [-0.22, -0.012]], 0.036, 0.004), poly);
  st.add(box(0.038, 0.11, 0.014), M.rubber(), [0, -0.02, Z(-0.386)]);
  st.add(box(0.037, 0.006, 0.1), acc, [0, 0.036, Z(-0.3)]);
  // Charging handle (T) and forward assist
  st.add(box(0.044, 0.007, 0.012), dark, [0, 0.028, Z(-0.125)]);
  st.add(cyl(0.006, 0.02, 6), dark, [0.02, 0.012, Z(-0.06)], [0, 0.6, 0]);
  // Ejection port (dark recess) on the right
  st.add(box(0.003, 0.014, 0.045), mat('rubber'), [0.0175, 0.01, Z(0.04)]);
  // Red-dot sight on the top rail: an open frame (you look through it when aiming), tinted glass, the dot
  st.add(cbox(0.03, 0.012, 0.062, 0.003), dark, [0, 0.044, Z(0.03)]);
  for (const sx of [-1, 1]) st.add(cbox(0.006, 0.04, 0.05, 0.002), dark, [sx * 0.0145, 0.068, Z(0.034)]);
  st.add(cbox(0.035, 0.007, 0.054, 0.002), dark, [0, 0.0895, Z(0.034)]);
  st.add(cbox(0.012, 0.012, 0.02, 0.002), dark, [0.022, 0.06, Z(0.03)]); // battery turret
  st.add(box(0.023, 0.034, 0.002), mat('lensGlass'), [0, 0.068, Z(0.058)]);
  st.add(sphere(0.0016, 6, 4), M.dot(), [0, 0.068, Z(0.056)]);

  const g = st.build();
  // Curved magazine (its own part, pivot at the magwell)
  const mg = new Assembly('mag');
  mg.add(profile([[-0.022, 0], [0.024, 0], [0.034, -0.06], [0.05, -0.13], [0.006, -0.145], [-0.008, -0.075]], 0.024, 0.002), poly);
  mg.add(profile([[0.002, -0.137], [0.05, -0.128], [0.053, -0.143], [0.004, -0.152]], 0.028, 0.002), acc);
  g.add(part('mag', [mg.build(), socket('magHand', [0, -0.075, Z(0.018)])], [0, -0.04, Z(0.075)]));
  g.add(socket('muzzle', [0, 0, Z(0.67)]), socket('eject', [0.02, 0.012, Z(0.04)]), socket('grip', [0, -0.07, Z(-0.055)]),
    socket('support', [0, -0.03, Z(0.3)]), socket('sight', [0, 0.068, Z(0.03)]));
  return g;
}

// =================================================================== pistol
function buildPistol({ revolver = false } = {}) {
  if (revolver) return buildRevolver();
  const fr = new Assembly('pistol');
  const metal = M.metal(), poly = M.poly(), dark = M.dark(), acc = M.accent();
  // Frame with dust-cover rail, grip with beavertail
  fr.add(profile([[-0.035, -0.002], [0.155, -0.002], [0.155, -0.018], [0.07, -0.02], [0.05, -0.016], [-0.02, -0.016], [-0.045, 0.0]], 0.026, 0.002), poly);
  fr.add(profile([[-0.05, -0.006], [0.012, -0.012], [0.008, -0.04], [0.004, -0.05], [0.006, -0.06], [0.0, -0.072], [0.002, -0.082],
    [-0.006, -0.112], [-0.05, -0.11], [-0.054, -0.06], [-0.05, -0.022], [-0.062, -0.01]], 0.029, 0.003), poly);
  // Grip texture panels
  for (const sx of [-1, 1]) fr.add(profile([[-0.04, -0.03], [0.002, -0.03], [-0.01, -0.095], [-0.046, -0.092]], 0.002), M.rubber(), [sx * 0.0145, 0, 0]);
  triggerGroup(fr, 0.025, -0.016, poly);
  const g = fr.build();
  // Magazine: body hidden inside the grip, base plate (accent) below; slides out along the grip rake
  const mg = new Assembly('mag');
  mg.add(box(0.02, 0.1, 0.028), dark, [0, -0.05, 0]);
  mg.add(box(0.03, 0.01, 0.024), acc, [0, -0.104, -0.003]);
  const magPart = part('mag', [mg.build(), socket('magHand', [0, -0.1, 0])], [0, -0.012, Z(-0.012)]);
  magPart.rotation.x = -0.18;
  g.add(magPart);
  // Slide (moves back when firing): serrations, ejection port, sights
  const sl = new Assembly('slide');
  sl.add(profile([[-0.045, 0.0], [0.165, 0.0], [0.168, 0.022], [0.16, 0.032], [-0.035, 0.032], [-0.047, 0.018]], 0.025, 0.002), metal);
  for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) sl.add(box(0.002, 0.024, 0.002), dark, [sx * 0.0126, 0.016, Z(-0.03 + i * 0.006)]);
  sl.add(box(0.003, 0.012, 0.035), M.rubber(), [0.0115, 0.022, Z(0.055)]); // ejection port
  sl.add(box(0.005, 0.007, 0.006), dark, [0, 0.035, Z(0.155)]); // front sight
  sl.add(sphere(0.0013, 4, 3), acc, [0, 0.038, Z(0.152)]);
  for (const sx of [-1, 1]) sl.add(box(0.005, 0.007, 0.006), dark, [sx * 0.0045, 0.035, Z(-0.03)]); // rear sight notch
  g.add(part('slide', [sl.build()]));
  // Hammer
  const hm = new Assembly('hammer');
  hm.add(box(0.008, 0.018, 0.008), dark, [0, 0.008, 0]);
  g.add(part('hammer', [hm.build()], [0, 0.012, Z(-0.05)]));
  g.add(socket('muzzle', [0, 0.017, Z(0.17)]), socket('eject', [0.014, 0.024, Z(0.055)]), socket('grip', [0, -0.055, Z(-0.02)]),
    socket('support', [-0.012, -0.05, Z(-0.012)]), socket('sight', [0, 0.038, Z(-0.03)]));
  return g;
}

// =================================================================== revolver
function buildRevolver() {
  const fr = new Assembly('revolver');
  const steel = M.steel(), wood = M.wood(), dark = M.dark();
  fr.add(profile([[-0.04, -0.012], [0.06, -0.012], [0.06, 0.03], [-0.03, 0.032], [-0.045, 0.012]], 0.024, 0.002), steel);
  fr.add(cyl(0.0105, 0.13, 10), steel, [0, 0.012, Z(0.125)]);
  fr.add(box(0.008, 0.012, 0.13), steel, [0, 0.026, Z(0.125)]); // top rib
  fr.add(cyl(0.006, 0.12, 8), dark, [0, -0.004, Z(0.115)]); // ejector rod housing
  fr.add(box(0.005, 0.01, 0.006), dark, [0, 0.034, Z(0.185)]);
  fr.add(profile([[-0.045, 0.0], [0.0, -0.012], [-0.004, -0.04], [-0.014, -0.075], [-0.026, -0.1], [-0.048, -0.106], [-0.07, -0.098],
    [-0.072, -0.07], [-0.064, -0.03], [-0.058, -0.008]], 0.03, 0.004), wood);
  fr.add(cylY(0.0035, 0.032, 6), M.brass(), [0, -0.055, Z(-0.035)], [0, 0, Math.PI / 2]); // grip screw
  triggerGroup(fr, 0.012, -0.014, steel);
  const g = fr.build();
  const cy = new Assembly('cyl');
  cy.add(cyl(0.021, 0.045, 12), dark);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    cy.add(cyl(0.005, 0.047, 6), mat('rubber'), [Math.cos(a) * 0.013, Math.sin(a) * 0.013, 0]);
  }
  g.add(part('cyl', [cy.build(), socket('load', [0, -0.01, 0.04])], [0, 0.009, Z(0.02)]));
  const hm = new Assembly('hammer');
  hm.add(profile([[0, 0], [0.008, 0], [0.004, 0.022], [-0.008, 0.026], [-0.006, 0.018]], 0.007), dark);
  g.add(part('hammer', [hm.build()], [0, 0.018, Z(-0.03)]));
  g.add(socket('muzzle', [0, 0.012, Z(0.19)]), socket('eject', [0.01, 0.01, Z(0.02)]), socket('grip', [0, -0.05, Z(-0.03)]),
    socket('support', [-0.012, -0.048, Z(-0.022)]), socket('sight', [0, 0.036, Z(-0.03)]));
  return g;
}

// =================================================================== shotgun
function buildShotgun() {
  const st = new Assembly('shotgun');
  const metal = M.metal(), wood = M.wood(), dark = M.dark(), acc = M.accent();
  st.add(profile([[-0.11, -0.04], [0.12, -0.04], [0.125, 0.012], [0.1, 0.02], [-0.1, 0.017], [-0.11, 0.0]], 0.036, 0.003), metal);
  st.add(box(0.003, 0.02, 0.06), mat('rubber'), [0.0185, 0.004, Z(0.04)]); // ejection port
  // Barrel with a vent rib and bead sight, tube magazine underneath with a cap
  st.add(cyl(0.012, 0.52, 12), metal, [0, 0.008, Z(0.38)]);
  st.add(box(0.008, 0.004, 0.5), dark, [0, 0.022, Z(0.38)]);
  st.add(sphere(0.003, 6, 4), M.brass(), [0, 0.026, Z(0.625)]);
  st.add(cyl(0.011, 0.44, 10), dark, [0, -0.022, Z(0.34)]);
  st.add(cyl(0.012, 0.025, 10), metal, [0, -0.022, Z(0.565)]);
  st.add(cbox(0.02, 0.04, 0.012), dark, [0, -0.008, Z(0.56)]); // barrel clamp
  // Wooden stock with comb and rubber recoil pad
  // (the comb drops away from the sight line so the stock stays below the eye when aiming)
  st.add(profile([[-0.1, -0.008], [-0.4, -0.045], [-0.41, -0.16], [-0.36, -0.16], [-0.14, -0.066], [-0.1, -0.045]], 0.038, 0.005), wood);
  st.add(box(0.04, 0.12, 0.016), M.rubber(), [0, -0.1, Z(-0.415)], [0.08, 0, 0]);
  triggerGroup(st, -0.04, -0.04, metal);
  // Side saddle shells (accent)
  for (let i = 0; i < 4; i++) {
    st.add(cyl(0.0065, 0.04, 8), acc, [-0.024, -0.012, Z(-0.03 + i * 0.016)], [Math.PI / 2, 0, 0]);
    st.add(cyl(0.0068, 0.008, 8), M.brass(), [-0.024, -0.034, Z(-0.03 + i * 0.016)], [Math.PI / 2, 0, 0]);
  }
  const g = st.build();
  // Pump (forend) with grip ridges: slides back and forth
  const pm = new Assembly('pump');
  pm.add(cyl(0.022, 0.16, 10), wood);
  for (let i = 0; i < 6; i++) pm.add(cyl(0.0232, 0.008, 10), mat('crateDark'), [0, 0, -0.06 + i * 0.024]);
  g.add(part('pump', [pm.build(), socket('support', [0, -0.014, 0])], [0, -0.016, Z(0.3)]));
  g.add(socket('muzzle', [0, 0.008, Z(0.645)]), socket('eject', [0.02, 0.006, Z(0.04)]), socket('grip', [0, -0.06, Z(-0.09)]),
    socket('load', [0, -0.06, Z(0.07)]), socket('sight', [0, 0.027, Z(0.0)]));
  return g;
}

// =================================================================== sniper
function buildSniper() {
  const st = new Assembly('sniper');
  const metal = M.metal(), olive = M.olive(), dark = M.dark(), acc = M.accent();
  // Chassis stock: forend, grip area, thumbhole butt with cheek riser
  st.add(profile([[0.3, -0.012], [0.3, -0.04], [0.05, -0.045], [0.0, -0.05], [-0.04, -0.045], [-0.11, -0.03], [-0.42, -0.04], [-0.44, -0.13],
    [-0.39, -0.135], [-0.2, -0.06], [-0.12, -0.065], [-0.08, -0.15], [-0.04, -0.15], [-0.03, -0.06], [0.0, -0.02], [0.3, -0.012]], 0.04, 0.005), olive);
  st.add(profile([[-0.16, -0.005], [-0.34, -0.012], [-0.35, 0.012], [-0.17, 0.016]], 0.034, 0.004), olive); // cheek riser
  st.add(box(0.035, 0.004, 0.17), acc, [0, 0.016, Z(-0.255)], [0.03, 0, 0]);
  for (const u of [-0.2, -0.31]) st.add(cyl(0.004, 0.03, 6), dark, [0, -0.02, Z(u)], [Math.PI / 2, 0, 0]);
  st.add(box(0.044, 0.12, 0.016), M.rubber(), [0, -0.075, Z(-0.445)]);
  // Round receiver, rail, long barrel with fluting and muzzle brake
  st.add(cyl(0.018, 0.25, 12), metal, [0, 0, Z(0.03)]);
  rail(st, -0.08, 0.15, 0.024, 0.018, dark);
  st.add(cyl(0.013, 0.56, 10, 0.01), metal, [0, 0, Z(0.43)]);
  for (let i = 0; i < 4; i++) st.add(box(0.003, 0.003, 0.3), dark, [Math.cos(i * 1.57) * 0.0115, Math.sin(i * 1.57) * 0.0115, Z(0.4)]);
  st.add(latheZ([[0, 0], [0.017, 0], [0.018, -0.012], [0.018, -0.07], [0.014, -0.08], [0, -0.08]], 10), dark, [0, 0, Z(0.71)]);
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) st.add(box(0.006, 0.008, 0.012), mat('rubber'), [sx * 0.016, 0, Z(0.73 + i * 0.02)]);
  triggerGroup(st, -0.02, -0.045, dark);
  // Detachable box magazine
  st.add(box(0.003, 0.014, 0.05), mat('rubber'), [0.019, 0.006, Z(0.05)]); // ejection port
  // Scope: tube, bells, turrets, rings, lenses
  const sv = 0.072;
  st.add(cyl(0.016, 0.24, 14), dark, [0, sv, Z(0.04)]);
  st.add(latheZ([[0.016, 0], [0.026, -0.04], [0.026, -0.07], [0.024, -0.075]], 14), dark, [0, sv, Z(0.16)]);
  st.add(latheZ([[0.016, 0], [0.021, 0.03], [0.021, 0.07], [0.019, 0.075]], 14), dark, [0, sv, Z(-0.08)]);
  st.add(cylY(0.011, 0.022, 10), metal, [0, sv + 0.022, Z(0.03)]);
  st.add(cylY(0.009, 0.02, 10), metal, [0.022, sv, Z(0.03)], [0, 0, Math.PI / 2]);
  st.add(cylY(0.0115, 0.004, 10), acc, [0, sv + 0.034, Z(0.03)]);
  for (const u of [-0.04, 0.1]) {
    st.add(torus(0.018, 0.004, 4, 12), metal, [0, sv, Z(u)]);
    st.add(box(0.016, sv - 0.03, 0.014), metal, [0, (sv + 0.024) / 2 + 0.003, Z(u)]);
  }
  st.add(cyl(0.024, 0.003, 14), M.lens(), [0, sv, Z(0.234)]);
  st.add(cyl(0.019, 0.003, 14), M.lens(), [0, sv, Z(-0.154)]);
  const g = st.build();
  // Bolt: body, handle angled down to the right, knob
  const bo = new Assembly('bolt');
  bo.add(cyl(0.009, 0.11, 8), M.steel(), [0, 0, 0.0]);
  bo.add(cyl(0.004, 0.045, 6), M.steel(), [0.022, -0.01, 0.035], [0, 0, -0.45], [1, 1, 1]);
  bo.add(sphere(0.008, 8, 6), dark, [0.042, -0.02, 0.035]);
  g.add(part('bolt', [bo.build(), socket('boltHand', [0.044, -0.03, 0.045])], [0, 0.004, Z(-0.03)]));
  // Magazine
  const mg = new Assembly('mag');
  mg.add(cbox(0.03, 0.06, 0.07, 0.004), dark, [0, -0.03, 0]);
  mg.add(box(0.032, 0.006, 0.072), acc, [0, -0.062, 0]);
  g.add(part('mag', [mg.build(), socket('magHand', [0, -0.05, 0.0])], [0, -0.04, Z(0.05)]));
  // Folded bipod under the forend
  const bp = new Assembly('bipod');
  bp.add(cbox(0.04, 0.016, 0.03), dark);
  for (const sx of [-1, 1]) {
    bp.add(cyl(0.005, 0.17, 6), metal, [sx * 0.012, -0.012, 0.085]);
    bp.add(cyl(0.006, 0.02, 6), mat('rubber'), [sx * 0.012, -0.012, 0.175]);
  }
  g.add(part('bipod', [bp.build()], [0, -0.05, Z(0.27)]));
  g.children.find((c) => c.name === 'bipod').rotation.x = -0.05;
  g.add(socket('muzzle', [0, 0, Z(0.79)]), socket('eject', [0.02, 0.008, Z(0.05)]), socket('grip', [0, -0.085, Z(-0.07)]),
    socket('support', [0, -0.04, Z(0.2)]), socket('sight', [0, sv, Z(-0.16)]));
  return g;
}

// =================================================================== knife
function buildKnife() {
  const st = new Assembly('knife');
  const steel = M.steel(), dark = M.dark();
  // Drop-point blade: spine on top, belly sweeping up to the point
  const blade = [[0.0, -0.014], [0.12, -0.016], [0.165, -0.01], [0.195, 0.004], [0.2, 0.01], [0.17, 0.012], [0.1, 0.016], [0.0, 0.016]];
  st.add(profile(blade, 0.0045, 0.0014), steel, [0, 0.0, Z(0.018)]);
  st.add(box(0.0049, 0.004, 0.09), dark, [0, 0.008, Z(0.07)]); // fuller (groove)
  // Glowing cutting edge along the belly
  st.add(profile([[0.006, -0.0165], [0.12, -0.0185], [0.166, -0.0122], [0.196, 0.0026], [0.193, 0.0056], [0.163, -0.008], [0.118, -0.0135], [0.006, -0.0118]], 0.0052), M.edge(), [0, 0, Z(0.018)]);
  // Crossguard, wrapped handle, pommel with accent
  st.add(cbox(0.03, 0.05, 0.012, 0.003), dark, [0, 0, Z(0.012)]);
  st.add(cyl(0.012, 0.1, 8, 0.011), M.wrap(), [0, 0, Z(-0.045)]);
  for (let i = 0; i < 6; i++) st.add(torus(0.012, 0.0022, 4, 8), mat('rubber'), [0, 0, Z(-0.09 + i * 0.017)]);
  st.add(latheZ([[0.011, 0], [0.015, 0.006], [0.014, 0.018], [0.006, 0.026], [0, 0.026]], 8), dark, [0, 0, Z(-0.095)]);
  st.add(cyl(0.0125, 0.006, 8), M.accent(), [0, 0, Z(-0.098)]);
  const g = st.build();
  g.add(socket('muzzle', [0, 0, Z(0.21)]), socket('grip', [0, 0, Z(-0.04)]), socket('tip', [0, 0.01, Z(0.218)]));
  return g;
}

// =================================================================== registry
export const WEAPON_BUILDERS = {
  rifle: buildRifle, pistol: () => buildPistol(), revolver: buildRevolver, shotgun: buildShotgun, sniper: buildSniper, knife: buildKnife,
};

/** A weapon model; built once per id, then cloned (clones share geometries and materials). */
const cache = new Map();
export function weaponModel(id) {
  if (!cache.has(id)) cache.set(id, WEAPON_BUILDERS[id]());
  return cache.get(id).clone(true); // clones share geometries and materials
}

/** The same model baked into one mesh (1 draw call): used in third-person hands. */
const flatCache = new Map();
export function weaponModelFlat(id) {
  if (!flatCache.has(id)) flatCache.set(id, flattenModel(weaponModel(id)));
  return flatCache.get(id).clone(true); // shares the geometry
}

export function findPart(root, name) {
  let found = null;
  root.traverse((o) => { if (!found && o.name === name) found = o; });
  return found;
}
