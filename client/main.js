// SLIPSTRIKE client entry point: wires the game shell, menus and sessions together.
import { Game } from './core/Game.js';
import { Menus } from './ui/Menus.js';
import { input } from './core/Input.js';
import { OfflinePractice } from './modes/OfflinePractice.js';

const game = new Game(document.getElementById('app'));
let menus;

const app = {
  game,
  startPractice(opts = {}) {
    game.start(new OfflinePractice(game, opts));
    showPause(true);
  },
  quickPlay(name) { menus.toast('Online play is coming in the next build.'); void name; },
  createRoom(name) { menus.toast('Online play is coming in the next build.'); void name; },
  joinRoom(name, code) { menus.toast('Online play is coming in the next build.'); void name; void code; },
  leaveMatch() {
    game.stop();
    menus.title();
  },
};

menus = new Menus(app);

function showPause(first = false) {
  menus.pause({
    first,
    onResume: () => game.requestPlay(),
    onLeave: () => app.leaveMatch(),
  });
}

game.onPauseChange = (paused) => {
  if (!game.running) return;
  if (paused) { if (menus.screen !== 'settings') showPause(false); }
  else menus.hide();
};

menus.title();

// Expose for automated tests and debugging in the console
window.__slip = { game, menus, app, input };
