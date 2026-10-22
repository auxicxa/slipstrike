// Offline practice: runs a full World locally with target dummies. No server needed.
import { World } from '../../shared/sim/world.js';
import { copyMoveState } from '../../shared/sim/movement.js';
import { DT } from '../../shared/config/game.js';
import { BTN } from '../../shared/net/protocol.js';
import { currentWeapon } from '../../shared/sim/weapons.js';
import { MAPS } from '../../shared/maps/index.js';

const LOCAL = 1;

export class OfflinePractice {
  constructor(game, { mapId = 'range', loadout } = {}) {
    this.game = game;
    this.map = MAPS[mapId] || MAPS.range;
    this.world = new World(this.map, { teams: true });
    this.coll = this.world.coll;
    this.me = this.world.addPlayer(LOCAL, { name: 'You', team: 0, loadout });
    this.world.spawnPlayer(this.me, this.map.spawns[0][0]);
    this.prev = copyMoveState({}, this.me.ms);
    this.acc = 0;
    this.alpha = 0;
    this.respawnT = 0;
    this.dummies = [];
    let id = 100;
    const dummySpots = this.map.dummies.length ? this.map.dummies : (this.map.spawns[1] || []).map((s) => ({ pos: s }));
    for (const d of dummySpots) {
      const p = this.world.addPlayer(id++, { name: 'Dummy', team: 1, dummy: true });
      p.def = d;
      p.respawnT = 0;
      this.world.spawnPlayer(p, [d.pos[0], d.pos[1], d.pos[2], 0]);
      p.phase = Math.random() * 6;
      this.dummies.push(p);
    }
    this.time = 0;
  }

  initialYaw() { return this.map.spawns[0][0][3]; }
  localPlayer() { return this.me; }

  update(dt, game) {
    this.acc += dt;
    let n = 0;
    while (this.acc >= DT && n < 8) {
      this.acc -= DT;
      this.tick(game);
      n++;
    }
    if (n === 8) this.acc = 0;
    this.alpha = this.acc / DT;
  }

  tick(game) {
    this.time += DT;
    const inp = game.buildInput();
    copyMoveState(this.prev, this.me.ms);
    if (this.me.alive) {
      const act = this.world.processInput(this.me, inp, DT);
      game.onLocalTick(this.me, act);
    } else {
      this.respawnT -= DT;
      if (this.respawnT <= 0) this.respawnMe();
    }
    for (const d of this.dummies) {
      if (!d.alive) {
        d.respawnT -= DT;
        if (d.respawnT <= 0) this.world.spawnPlayer(d, [d.def.pos[0], d.def.pos[1], d.def.pos[2], 0]);
        continue;
      }
      let b = 0;
      if (d.def.strafe) {
        const t = this.time + d.phase;
        b = Math.sin(t * (6 / d.def.strafe)) > 0 ? BTN.LEFT : BTN.RIGHT;
      }
      if (d.def.crouch) b |= BTN.CROUCH;
      // Dummies face the player
      const yaw = Math.atan2(-(this.me.ms.x - d.ms.x), -(this.me.ms.z - d.ms.z));
      this.world.processInput(d, { b, y: yaw, p: 0, w: 0 }, DT);
      // Heal back up after a moment without damage
      d.lastHurtT += DT;
      if (d.lastHurtT > 3 && d.hp < 100) d.hp = Math.min(100, d.hp + 50 * DT);
    }
    const events = this.world.takeEvents();
    for (const e of events) {
      if (e.e === 'kill') {
        const v = this.world.players.get(e.v);
        if (v && v.dummy) v.respawnT = 1.5;
        if (e.v === LOCAL) this.respawnT = 1.5;
      }
    }
    game.handleEvents(events, LOCAL);
  }

  respawnMe() {
    this.world.spawnPlayer(this.me, this.map.spawns[0][0]);
    copyMoveState(this.prev, this.me.ms);
    this.game.setView(this.map.spawns[0][0][3], 0);
  }

  onAction(a, down) {
    if (a === 'reset' && down) this.respawnMe();
  }

  localView() {
    const a = this.alpha, p = this.prev, c = this.me.ms;
    return {
      x: p.x + (c.x - p.x) * a, y: p.y + (c.y - p.y) * a, z: p.z + (c.z - p.z) * a, eye: p.eye + (c.eye - p.eye) * a,
      vx: c.vx, vz: c.vz, vy: c.vy, grounded: c.grounded, sliding: c.sliding, dashCd: c.dashCd, dashUsed: c.dashUsed,
      dashT: c.dashT, airJumps: c.airJumps, wallRun: c.wallRun, wrT: c.wrT, wrNx: c.wrNx, wrNz: c.wrNz,
      alive: this.me.alive, hp: this.me.hp, ws: this.me.ws,
    };
  }

  remotes() {
    return this.dummies.map((d) => ({
      id: d.id, x: d.ms.x, y: d.ms.y, z: d.ms.z, yaw: d.ms.yaw, pitch: 0, h: d.ms.h, sliding: false, grounded: true,
      weapon: currentWeapon(d.ws).id, alive: d.alive, hp: d.hp, dummy: true, team: 1,
    }));
  }

  aimTargets() { return this.remotes().filter((e) => e.alive); }
  entityPos(id) { const p = this.world.players.get(id); return p ? p.ms : null; }
  playerName(id) { return id === LOCAL ? 'You' : 'Dummy'; }
  playerTeam(id) { return id === LOCAL ? 0 : 1; }

  hudInfo() {
    const sp = Math.hypot(this.me.ms.vx, this.me.ms.vz);
    return {
      top: { timer: `${sp.toFixed(1)} m/s`, round: `PRACTICE · ${this.map.name}`, a: null, b: null, myTeam: 0 },
      deadMsg: this.me.alive ? null : 'Respawning…',
    };
  }

  scoreboard() {
    return {
      title: 'Practice',
      groups: [{ team: 0, label: 'You', players: [{ name: 'You', kills: this.me.kills, deaths: this.me.deaths, damage: this.me.damage, me: true }] }],
    };
  }
}
