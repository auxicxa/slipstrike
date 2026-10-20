// SLIPSTRIKE client entry point: wires the game shell, menus, network and sessions together.
import { Game } from './core/Game.js';
import { Menus } from './ui/Menus.js';
import { input } from './core/Input.js';
import { OfflinePractice } from './modes/OfflinePractice.js';
import { OnlineMatch } from './modes/OnlineMatch.js';
import { net } from './net/Net.js';
import { C, S } from '../shared/net/protocol.js';
import { sanitizeLoadout } from '../shared/config/weapons.js';
import { settings } from './core/Settings.js';

const game = new Game(document.getElementById('app'));
let menus;
let room = null;      // latest room state from the server
let online = null;    // OnlineMatch while a match is running

function savedLoadout() {
  try { return sanitizeLoadout(JSON.parse(localStorage.getItem('slipstrike.loadout') || 'null')); } catch { return sanitizeLoadout(null); }
}

const app = {
  game,
  startPractice(opts = {}) {
    leaveOnline(false);
    game.start(new OfflinePractice(game, { mapId: opts.mapId, loadout: savedLoadout() }));
    showPause(true);
  },
  async connectThen(name, fn) {
    menus.message('Connecting…', 'Contacting the game server.');
    try {
      await net.connect(name);
      fn();
    } catch {
      menus.title('Could not reach the game server. Check your connection (school networks sometimes block WebSockets) and try again.');
    }
  },
  quickPlay(name) { this.connectThen(name, () => net.send({ t: C.QUICK })); },
  createRoom(name) { this.connectThen(name, () => net.send({ t: C.CREATE, pub: false })); },
  joinRoom(name, code) { this.connectThen(name, () => net.send({ t: C.JOIN, code })); },
  leaveMatch() {
    if (online || room) { leaveOnline(true); return; }
    game.stop();
    menus.title();
  },
};

menus = new Menus(app);
game.onToast = (msg) => menus.toast(msg, 5000);

function showPause(first = false) {
  menus.pause({
    first,
    onResume: () => game.requestPlay(),
    onLeave: () => app.leaveMatch(),
  });
}

function leaveOnline(sendLeave) {
  if (sendLeave && room) net.send({ t: C.LEAVE });
  room = null;
  if (online) { game.stop(); online = null; }
  if (sendLeave) menus.title();
}

const lobbyActions = {
  setMode: (mode, map) => net.send({ t: C.SET_MODE, mode, map }),
  swap: () => net.send({ t: C.SWAP_TEAM }),
  ready: (r) => net.send({ t: C.READY, ready: r }),
  loadout: (p, s) => {
    try { localStorage.setItem('slipstrike.loadout', JSON.stringify({ p, s })); } catch { /* ignore */ }
    net.send({ t: C.LOADOUT, p, s });
  },
  leave: () => leaveOnline(true),
  settings: () => menus.settings(() => { if (room) menus.lobby(room, net.id, lobbyActions); else menus.title(); }),
};

// ------------------------------------------------------------------ server messages
net.on(S.WELCOME, (m) => {
  if (room && !m.resumed) {
    // We were in a room, but the server no longer has our slot
    leaveOnline(false);
    menus.title('You were disconnected from the room.');
  } else if (m.resumed) menus.toast('Reconnected');
});

net.on(S.ROOM, (r) => {
  const first = !room;
  room = r;
  if (first) {
    const lo = savedLoadout();
    net.send({ t: C.LOADOUT, p: lo.p, s: lo.s });
  }
  const inMatch = r.phase !== 'lobby' && r.phase !== 'countdown';
  if (inMatch) {
    if (!online) {
      online = new OnlineMatch(game, net, r, { onEvent });
      game.start(online);
      menus.hide();
      showPause(true);
    } else online.setRoom(r);
    if (r.phase === 'matchEnd' && menus.screen !== 'results' && r.result) {
      input.exitLock();
      menus.results(r, net.id, () => leaveOnline(true));
    }
    if (menus.screen === 'results' && menus.backT) menus.backT.textContent = `Back to the lobby in ${Math.ceil(r.pt)}s`;
  } else {
    if (online) { game.stop(); online = null; }
    if (menus.screen !== 'settings') menus.lobby(r, net.id, lobbyActions);
  }
});

function onEvent(ev) {
  if (ev.e === 'matchEnd') input.exitLock();
}

net.on(S.ERROR, (m) => {
  menus.toast(m.msg, 3500);
  if (!room && menus.screen === 'msg') menus.title(m.msg);
});
net.on(S.LEFT, () => { room = null; });
net.on(S.KICK, (m) => { leaveOnline(false); menus.title(m.msg || 'Disconnected by the server.'); });
net.on('kicked', () => { leaveOnline(false); menus.title('Disconnected by the server.'); });
net.on('lost', () => { leaveOnline(false); menus.title('Connection to the server was lost.'); });
net.on('state', (s) => { if (s === 'reconnecting' && room) menus.toast('Connection lost. Reconnecting…', 4000); });

game.onPauseChange = (paused) => {
  if (!game.running) return;
  if (menus.screen === 'results') return;
  if (paused) { if (menus.screen !== 'settings') showPause(false); }
  else menus.hide();
};

menus.title();

// Exposed for automated tests and debugging in the console
window.__slip = { game, menus, app, input, net, settings, get room() { return room; }, get online() { return online; } };
