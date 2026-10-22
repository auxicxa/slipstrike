// Dev-only model viewer (/viewer): every procedural model on a turntable, with orbit controls, a
// wireframe toggle, socket markers, lighting presets and triangle/draw-call stats.
// Automation: window.__viewer.show(id, {pose, team}), .view('front'|'side'|'back'|'top'|'three'), .stats()
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { listModels, getModel } from '../models/registry.js';
import { addLighting, configureRenderer } from '../render/lighting.js';
import { countTriangles, countMeshes } from '../models/kit.js';
import { playerHitboxes } from '../../shared/sim/hitscan.js';

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
configureRenderer(renderer, 1.0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.info.autoReset = false;
stage.append(renderer.domElement);
const label = Object.assign(document.createElement('div'), { id: 'label' });
stage.append(label);

const scene = new THREE.Scene();
import { environmentFor } from '../render/lighting.js';
scene.environment = environmentFor(renderer);
scene.environmentIntensity = 0.55;
const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 200);
// First-person previews use the game's viewmodel camera: at the origin, looking down -Z
const fpCamera = new THREE.PerspectiveCamera(62, 1, 0.01, 10);
const cross = Object.assign(document.createElement('div'), { id: 'cross' });
stage.append(cross);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Floor with soft contact shadow
const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 48), new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const grid = new THREE.GridHelper(12, 24, 0x5a6270, 0x454c58);
grid.position.y = 0.001;
scene.add(grid);

const state = { id: null, obj: null, fp: false, turntable: true, wire: false, sockets: false, light: 'game', pose: null, team: 0, t: 0 };
let rig = null;
function setLight(p) {
  state.light = p;
  rig?.dispose();
  rig = addLighting(scene, p, { shadows: true, shadowRange: 4, shadowSize: 2048 });
  if (rig.sun) rig.sun.position.multiplyScalar(0.12);
  renderControls();
}

const holder = new THREE.Group();
scene.add(holder);
const markers = new THREE.Group();
scene.add(markers);

/** Bounds of the visible meshes only (rigs keep hidden models around). */
function visibleBox(root) {
  const box = new THREE.Box3(), b = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverseVisible((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (o.parent?.name === 'forearm') return; // frame a first-person rig on the weapon and hands
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    box.union(b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
  });
  return box;
}

function fit() {
  const box = visibleBox(holder);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const r = Math.max(size.length() / 2, 0.05);
  controls.target.copy(center);
  const dist = r / Math.sin((camera.fov * Math.PI) / 360) * 1.15;
  camera.near = dist / 100; camera.far = dist * 20; camera.updateProjectionMatrix();
  const dir = camera.position.clone().sub(controls.target).normalize();
  if (!isFinite(dir.x) || dir.lengthSq() < 0.5) dir.set(0.6, 0.35, 0.72).normalize();
  camera.position.copy(center).addScaledVector(dir, dist);
  floor.position.y = box.min.y - 0.002;
  grid.position.y = box.min.y;
  const s = Math.max(1, r * 3);
  floor.scale.setScalar(s / 6); grid.scale.setScalar(s / 6);
  return { size, center, r, dist };
}

const VIEWS = {
  // models face -Z, so "front" looks from -Z
  front: [0, 0.15, -1], side: [1, 0.12, 0], back: [0, 0.2, 1], top: [0.001, 1, 0.001], three: [0.75, 0.45, -0.8],
};
function view(name) {
  const box = visibleBox(holder);
  const center = box.getCenter(new THREE.Vector3());
  const r = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.05);
  const dist = r / Math.sin((camera.fov * Math.PI) / 360) * 1.15;
  const d = new THREE.Vector3(...VIEWS[name]).normalize();
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(d, dist);
  controls.update();
}

function applyWire() {
  holder.traverse((o) => { if (o.isMesh && o.material) for (const m of [].concat(o.material)) m.wireframe = state.wire; });
}

function showSockets() {
  markers.clear();
  if (!state.sockets || !state.obj) return;
  state.obj.updateMatrixWorld(true);
  if (state.obj.userData.hitboxH) {
    // the gameplay hitboxes (legs / body / head) for this pose's height, as wireframes
    for (const b of playerHitboxes(0, 0, 0, state.obj.userData.hitboxH)) {
      const box = new THREE.Box3(new THREE.Vector3(b.minx, b.miny, b.minz), new THREE.Vector3(b.maxx, b.maxy, b.maxz));
      const helper = new THREE.Box3Helper(box, 0xffe14d);
      helper.applyMatrix4(holder.matrixWorld);
      markers.add(helper);
    }
  }
  const colors = { muzzle: 0xff3030, eject: 0xffd23d, grip: 0x3dff7a, support: 0x3db4ff, sight: 0xff40ff };
  state.obj.traverse((o) => {
    if (o.isMesh || o.type !== 'Object3D' || !o.name) return;
    const c = colors[o.name] ?? (o.name.startsWith('hand') ? 0x3dff7a : 0xffffff);
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.008 * (state.markerScale || 1), 8, 6), new THREE.MeshBasicMaterial({ color: c, depthTest: false }));
    m.renderOrder = 10;
    o.getWorldPosition(m.position);
    markers.add(m);
  });
}

function show(id, opts = {}) {
  const e = getModel(id);
  if (!e) throw new Error('no model ' + id);
  if (state.obj) { holder.remove(state.obj); }
  state.id = id;
  state.fp = !!e.fp && !state.fpOrbit; // fpOrbit: inspect a first-person rig from outside
  floor.visible = grid.visible = !state.fp;
  cross.style.display = state.fp ? 'block' : 'none';
  scene.background = state.fp ? new THREE.Color(0x7d8ea6) : null;
  if (opts.team !== undefined) state.team = opts.team;
  state.pose = opts.pose ?? (e.poses ? e.poses[0] : null);
  state.t = 0;
  const obj = e.build(state.team);
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  state.obj = obj;
  holder.rotation.set(0, 0, 0);
  holder.add(obj);
  e.update?.(obj, 0, state.pose, 0);
  if (!state.fp) {
    const { r } = fit();
    state.markerScale = Math.max(1, r / 0.3);
  } else state.markerScale = 0.4;
  applyWire();
  showSockets();
  label.textContent = e.label;
  renderControls();
  renderStats();
  return stats();
}

function stats() {
  const e = getModel(state.id);
  const box = visibleBox(holder);
  const size = box.getSize(new THREE.Vector3());
  return {
    // statsTris: a model can report its own count (e.g. a character without the weapon in its hands)
    id: state.id, triangles: state.obj.userData.statsTris ?? countTriangles(state.obj), meshes: countMeshes(state.obj),
    drawCalls: renderer.info.render.calls, size: [size.x, size.y, size.z].map((v) => +v.toFixed(3)),
    budget: e?.budget ?? null,
  };
}

// ---------------------------------------------------------------- UI
const modelsEl = document.getElementById('models');
function renderModels() {
  modelsEl.innerHTML = '';
  const groups = new Map();
  for (const e of listModels()) { if (!groups.has(e.group)) groups.set(e.group, []); groups.get(e.group).push(e); }
  for (const [g, list] of groups) {
    const h = document.createElement('h2'); h.textContent = g; modelsEl.append(h);
    const wrap = document.createElement('div'); wrap.className = 'list';
    for (const e of list) {
      const b = document.createElement('button');
      b.textContent = e.label;
      b.dataset.id = e.id;
      b.onclick = () => { show(e.id); renderModels(); };
      if (e.id === state.id) b.className = 'on';
      wrap.append(b);
    }
    modelsEl.append(wrap);
  }
}

const controlsEl = document.getElementById('controls');
function btn(label, on, fn) { const b = document.createElement('button'); b.textContent = label; if (on) b.className = 'on'; b.onclick = fn; return b; }
function renderControls() {
  controlsEl.innerHTML = '<h2>View</h2>';
  const r1 = document.createElement('div'); r1.className = 'row';
  r1.append(btn('Turntable', state.turntable, () => { state.turntable = !state.turntable; renderControls(); }),
    btn('Wireframe', state.wire, () => { state.wire = !state.wire; applyWire(); renderControls(); }),
    btn('Sockets', state.sockets, () => { state.sockets = !state.sockets; showSockets(); renderControls(); }));
  const r2 = document.createElement('div'); r2.className = 'row';
  for (const v of Object.keys(VIEWS)) r2.append(btn(v, false, () => view(v)));
  const r3 = document.createElement('div'); r3.className = 'row';
  r3.append('Light ');
  for (const p of ['game', 'studio', 'dusk']) r3.append(btn(p, state.light === p, () => setLight(p)));
  controlsEl.append(r1, r2, r3);
  const e = state.id && getModel(state.id);
  if (e?.poses) {
    const r4 = document.createElement('div'); r4.className = 'row';
    r4.append('Pose ');
    const sel = document.createElement('select');
    for (const p of e.poses) { const o = document.createElement('option'); o.value = p; o.textContent = p; o.selected = p === state.pose; sel.append(o); }
    sel.onchange = () => { state.pose = sel.value; state.t = 0; };
    r4.append(sel);
    controlsEl.append(r4);
  }
  if (e?.teams) {
    const r5 = document.createElement('div'); r5.className = 'row';
    r5.append('Team ');
    for (const t of [0, 1]) r5.append(btn(t ? 'Tide' : 'Ember', state.team === t, () => { show(state.id, { team: t, pose: state.pose }); }));
    controlsEl.append(r5);
  }
}

const statsEl = document.getElementById('stats');
function renderStats() {
  if (!state.obj) return;
  const s = stats();
  const over = s.budget && s.triangles > s.budget;
  statsEl.innerHTML = `<h2>Stats</h2>
    <div><span>Triangles</span><b class="${over ? 'warn' : ''}">${s.triangles}${s.budget ? ' / ' + s.budget : ''}</b></div>
    <div><span>Meshes (≈ draw calls)</span><b>${s.meshes}</b></div>
    <div><span>Frame draw calls</span><b>${s.drawCalls}</b></div>
    <div><span>Size (m)</span><b>${s.size.join(' × ')}</b></div>`;
}

addEventListener('keydown', (e) => {
  if (e.target.tagName === 'SELECT') return;
  if (e.key === 't') { state.turntable = !state.turntable; renderControls(); }
  if (e.key === 'w') { state.wire = !state.wire; applyWire(); renderControls(); }
  if (e.key === 's') { state.sockets = !state.sockets; showSockets(); renderControls(); }
  const v = { 1: 'front', 2: 'side', 3: 'back', 4: 'top', 5: 'three' }[e.key];
  if (v) view(v);
});

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  fpCamera.aspect = w / h; fpCamera.updateProjectionMatrix();
}
addEventListener('resize', resize);

let last = performance.now(), statT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  state.t += dt;
  if (state.turntable && !state.fp) holder.rotation.y += dt * 0.5;
  if (state.fp) holder.rotation.set(0, 0, 0);
  const e = state.id && getModel(state.id);
  if (e?.update && state.obj) { e.update(state.obj, state.t, state.pose, dt); if (state.sockets) showSockets(); }
  controls.update();
  renderer.info.reset();
  renderer.render(scene, state.fp ? fpCamera : camera);
  statT += dt;
  if (statT > 0.5) { statT = 0; renderStats(); }
}

resize();
setLight('game');
const first = new URLSearchParams(location.search).get('model') || listModels()[0]?.id;
if (first) show(first);
renderModels();
requestAnimationFrame(frame);

window.__viewer = {
  list: () => listModels().map((e) => ({ id: e.id, group: e.group, label: e.label, poses: e.poses || null, teams: !!e.teams, budget: e.budget ?? null })),
  show: (id, opts) => { const s = show(id, opts); renderModels(); return s; },
  view, stats, obj: () => state.obj, camera, controls,
  set: (o) => { Object.assign(state, o); if ('fpOrbit' in o && state.id) show(state.id); applyWire(); showSockets(); renderControls(); if (o.light) setLight(o.light); },
  pose: (p, t = 0.4) => { state.pose = p; state.t = t; const e = getModel(state.id); e?.update?.(state.obj, t, p, 0); if (state.sockets) showSockets(); },
  render: () => { controls.update(); renderer.render(scene, state.fp ? fpCamera : camera); },
};
