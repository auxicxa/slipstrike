// Catalogue of every model in the game, for the /viewer page (and for screenshot checks).
// Each entry: { id, group, label, build() → Object3D, poses?: [...], update?(obj, t, pose), teams? }
import * as THREE from 'three';
import { boxesGeometry, flatMat } from '../render/geo.js';
import { MODELS as LEGACY_WEAPONS } from '../render/Viewmodel.js';
import { PlayerModel } from '../render/PlayerModel.js';
import { TEAM_COLORS } from '../../shared/config/game.js';

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
register({
  id: 'legacy-player', group: 'Legacy (before upgrade)', label: 'old player', teams: true,
  build: (team = 0) => {
    const g = new THREE.Group();
    const p = new PlayerModel(g, TEAM_COLORS[team]);
    p.update({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, h: 1.8, sliding: false, grounded: true, weapon: 'rifle', alive: true }, 0.016, 0);
    g.userData.model = p;
    return g;
  },
});
