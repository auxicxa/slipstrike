// Game-wide constants: tick rates, match rules, modes.

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const SNAPSHOT_RATE = 30;
export const SNAPSHOT_EVERY = TICK_RATE / SNAPSHOT_RATE; // ticks between snapshots
export const INTERP_DELAY = 0.1; // seconds remote players are rendered in the past
export const LAG_COMP_MAX = 0.15; // max rewind in seconds
export const HISTORY_TICKS = 60; // lag-comp ring buffer length (1 s)

export const MAX_HP = 100;

export const MODES = {
  '1v1': { id: '1v1', teamSize: 1, teams: true, map: 'kiln', label: '1v1 Duel' },
  '2v2': { id: '2v2', teamSize: 2, teams: true, map: 'dockyard', label: '2v2' },
  '3v3': { id: '3v3', teamSize: 3, teams: true, map: 'overpass', label: '3v3' },
  ffa: { id: 'ffa', teamSize: 8, teams: false, map: 'dockyard', label: 'Free-for-all' },
};

export const ROUND = {
  winsNeeded: 5, // first to 5
  halftimeAfter: 4, // sides swap after this many rounds
  freezeTime: 8, // loadout phase (seconds)
  roundTime: 90,
  roundEndTime: 4,
  halftimeExtra: 3, // extra banner time at halftime
  matchEndTime: 15,
  countdown: 5, // lobby countdown after all ready
};

export const FFA = {
  killLimit: 25,
  timeLimit: 300,
  respawnDelay: 2,
  regenDelay: 5,
  regenPerSec: 20,
  spawnProtect: 1.0,
};

export const TEAM_COLORS = { 0: 0xff8a3d, 1: 0x3db4ff }; // orange vs blue (colour-blind friendly)
export const TEAM_NAMES = { 0: 'Ember', 1: 'Tide' };

export const QUICK_CHAT = [
  'Nice shot!',
  'Help!',
  'Push together',
  'Hold here',
  'Enemy spotted',
  'Thanks!',
  'Sorry!',
  'GG',
];

export const RECONNECT_GRACE = 30; // seconds a disconnected player's slot is held
