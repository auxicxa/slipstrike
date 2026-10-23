// Catalogue of every model in the game, for the /viewer page (and for screenshot checks).
// Each entry: { id, group, label, build() → Object3D, poses?: [...], update?(obj, t, pose), teams? }
import * as THREE from 'three';
import { boxesGeometry, flatMat } from '../render/geo.js';
import { LEGACY_WEAPONS } from './legacy.js';

const entries = [];
export function register(e) {
  const i = entries.findIndex((x) => x.id === e.id);
  if (i >= 0) entries[i] = e; else entries.push(e);
}
export function listModels() { return entries.slice(); }
export function getModel(id) { return entries.find((e) => e.id === id); }

// ---------------------------------------------------------------- current (pre-upgrade) models
for (const id of Object.keys(LEGACY_WEAPONS)) {
  register({
    id: 'legacy-' + id, group: 'Legacy (before upgrade)', label: `old ${id}`,
    build: () => new THREE.Mesh(boxesGeometry(LEGACY_WEAPONS[id].parts), flatMat),
  });
}

// ---------------------------------------------------------------- weapons
import { weaponModel } from './weapons.js';
const WEAPON_LABELS = { rifle: 'Assault Rifle', pistol: 'Pistol', revolver: 'Revolver', shotgun: 'Shotgun', sniper: 'Sniper', knife: 'Knife' };
for (const [id, label] of Object.entries(WEAPON_LABELS)) {
  register({ id: 'weapon-' + id, group: 'Weapons', label, budget: 3000, build: () => weaponModel(id) });
}

// ---------------------------------------------------------------- first person (the real Viewmodel, scripted)
import { buildFpPreview, seekFp, FP_POSES } from './vmPreview.js';
for (const [id, label] of Object.entries(WEAPON_LABELS)) {
  register({
    id: 'fp-' + id, group: 'First person', label: label + ' (1st person)', fp: true,
    poses: FP_POSES[id === 'knife' ? 'knife' : 'gun'],
    build: () => buildFpPreview(id), update: (obj, t, pose) => seekFp(obj, t, pose),
  });
}

// ---------------------------------------------------------------- characters
import { buildCharPreview, seekChar, CHAR_POSES } from './charPreview.js';
import { OUTFITS } from './character.js';
OUTFITS.forEach((o, i) => {
  register({
    id: 'char-' + o.name.toLowerCase(), group: 'Characters', label: `${o.name} (skin ${i + 1})`, teams: true, budget: 4000,
    poses: CHAR_POSES, build: (team = 0) => buildCharPreview(i, i, team), update: (obj, t, pose) => seekChar(obj, t, pose),
  });
});

// ---------------------------------------------------------------- map props
import { PROP_TYPES, propModel } from './props.js';
for (const t of PROP_TYPES) register({ id: 'prop-' + t, group: 'Map props', label: t, build: () => propModel(t) });
