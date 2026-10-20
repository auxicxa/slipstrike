# SLIPSTRIKE

A fast-movement competitive arena shooter that runs in the browser. Slide, air-strafe, dash and mantle around
compact low-poly maps in short rounds: **1v1, 2v2, 3v3** (first to 5 rounds) or **Free-for-all deathmatch**.
It was built for MacBooks with **trackpads**: every action can be rebound, and you never have to click the
trackpad while moving (fire is also on **F**, scope is on **E**).

All art is generated in code (boxes, merged into a handful of draw calls) and all sound is synthesized with
WebAudio. There are no external asset files.

- **Client:** Three.js + Vite, plain JavaScript (ES modules)
- **Server:** Node.js + Express + `ws`. The server is authoritative at 60 Hz and sends snapshots at 30 Hz. One port serves the page and the WebSocket.
- **Netcode:** client-side prediction with reconciliation, interpolation of other players, and lag-compensated hitscan.

---

## Quick start (local)

Requires **Node.js 20.19+** (22 recommended).

```bash
npm install
npm run dev
```

Open **http://localhost:3000**. `npm run dev` runs the game server and the Vite dev server on the same port, with
hot reload for client code and auto-restart when `server/` or `shared/` changes.

- **Practice Range (offline)** works without anyone else. It has target dummies, a speedometer and a map picker.
- **Create Room** gives you a 4-letter code. Friends enter it next to **Join**.
- **Quick Play** puts you in an open public room, or creates one.

Production build:

```bash
npm run build      # builds the client into dist/
npm start          # serves dist/ + the game socket on $PORT (default 3000)
```

## Playing on a LAN (same Wi-Fi)

1. On the host computer run `npm run build && npm start` (or `npm run dev`).
2. The server prints addresses like `LAN: http://192.168.1.23:3000`. Everyone on the same network opens that address.
3. On macOS, allow incoming connections for `node` when the firewall asks.

School networks often block device-to-device traffic ("client isolation"). If classmates can't reach your
laptop, deploy it (below). Everyone then connects to a normal `https://` website, which school networks allow.

## Deploying (Render, Railway or Fly)

The server listens on `process.env.PORT` and serves the page and the WebSocket (`/ws`) together. The client
connects to `wss://<same host>/ws` automatically when the page is served over HTTPS, so it works behind each
host's TLS on port 443 with nothing to configure. **Run one instance only**: rooms live in memory.

**Render** (free tier):
1. Push this repo to GitHub.
2. In Render: **New → Blueprint** and pick the repo (it uses `render.yaml`). Or create a **Web Service** by hand:
   - Build command: `npm ci && npm run build`
   - Start command: `npm start`
   - Health check path: `/healthz`
3. Open the `https://….onrender.com` URL. Free instances sleep when idle, so the first visit can take ~30 s.

**Railway:**
1. **New Project → Deploy from GitHub repo**.
2. Railway detects Node. Set **Build command** `npm run build` and **Start command** `npm start` if it doesn't.
3. Under **Settings → Networking**, click **Generate Domain**.

**Fly.io** (uses the `Dockerfile`):
1. Install `flyctl`, then `fly auth login`.
2. Edit `app = "…"` in `fly.toml` to a unique name.
3. Run `fly launch --copy-config --no-deploy` and then `fly deploy`.
4. Keep it on one machine (`fly scale count 1`).

Any host that runs a Dockerfile works too: `docker build -t slipstrike . && docker run -p 3000:3000 slipstrike`.

---

## Controls (defaults, all rebindable in Settings → Controls)

| Action | Default | Action | Default |
|---|---|---|---|
| Move | W A S D | Fire / quick stab | **Left click** or **F** |
| Jump (hold to auto-hop) | Space | Scope / ADS / heavy stab | **E** or right click (hold or toggle) |
| Sprint | Shift | Reload | R |
| Crouch / slide | C | Primary / secondary / knife | 1 / 2 / 3 (knife also X) |
| Air dash | V | Quick-switch last weapon | Q |
| Scoreboard | Tab (hold) | Quick-chat wheel | T (hold, flick toward a message, release) |
| Pause | Esc or P | Performance overlay | ` |
| Keyboard look (fallback) | Arrow keys | | |

The defaults avoid **Ctrl** and **Cmd**: on a Mac those trigger right-click and browser shortcuts. Game keys call
`preventDefault`, so Tab, Space and the arrow keys don't scroll or move focus. A binding can be any key or mouse button.
Click it, press the new key (Esc cancels, Backspace clears). If the key was used elsewhere, it moves to the new action and
the game tells you. **Reset to default** restores everything. Binds and settings are saved in `localStorage`.

### Trackpad tips
- Look sensitivity and a separate ADS/scope multiplier are adjustable. Zooming scales sensitivity in proportion automatically.
- **Extra look acceleration** (off by default): small swipes stay precise and fast swipes turn further. It helps with 180° turns on a trackpad.
- **Raw input** (Chrome/Edge) turns off the OS pointer acceleration. Most trackpad players prefer it OFF.
- **Look smoothing** averages out trackpad jitter (it adds a little latency).
- **Keyboard look** with the arrow keys works as a full fallback. Its speed is adjustable.
- **Gentle aim assist** (off by default) only slows your look speed while the crosshair is on an enemy. It never pulls your aim.
- If the browser refuses to re-lock the pointer right after Esc, wait a second and click again (a browser rule).

### Movement
- **Source-style acceleration:** strafe + turn in the air to gain speed. Bunnyhopping keeps momentum (hold Space to auto-hop) but is capped.
- **Slide:** sprint, then press crouch. You get a speed burst that decays. Sliding off a ledge keeps your speed, and you can jump out of a slide.
- **Air dash:** once per airtime with a 2 s cooldown (shown at the bottom of the HUD).
- **Wall-slide:** hold into a wall while falling to slow down. **Mantle:** jump at a ledge up to ~2.5 m high while moving forward.
- **Knife:** swaps instantly and makes you **22% faster**: the speed-vs-firepower trade-off. Quick stab is 35 damage; heavy stab (the ADS key) is 70.

## Weapons

| Weapon | Slot | Damage | Notes |
|---|---|---|---|
| Assault Rifle | Primary | 28 (head ×1.8) | Full auto, learnable recoil pattern, falloff past 25 m |
| Shotgun | Primary | 8 × 12 | Deadly up close, falls off from 6 to 16 m |
| Sniper | Primary | 110 | One-shots head/upper body, slow bolt, 4× scope, inaccurate unscoped |
| Pistol | Secondary | 24 (head ×2) | Fast swap, accurate |
| Revolver | Secondary | 45 (head ×2) | Slow and hard-hitting |
| Knife | Always | 35 / 70 | Instant swap, faster movement |

You pick your loadout in the lobby and during the freeze time before each round: number keys 1-5 or click.
Magazines reload on R, or automatically when empty. Reserve ammo is unlimited (rounds are short).

## Match rules
- **1v1 / 2v2 / 3v3:** first to 5 round wins. Everyone respawns with full health at the start of each round, with no
  respawns mid-round. Dead players spectate living teammates (fire = next, jump = previous). Sides swap at halftime
  (after round 4). If time runs out, the team with more players alive wins, then the team with more total health.
- **Free-for-all deathmatch:** up to 8 players, 2 s respawns, health regenerates, first to 25 kills or 5 minutes.
- **Lobby:** the host picks the mode and map. Teams auto-balance and you can swap manually. When everyone is ready, a 5 s countdown starts.
- **Quick-chat** only (no free text chat, for school safety): 8 fixed messages, sent to your team.
- **Nicknames** are limited to 16 characters, letters, digits, space, `_ - .`, and pass a profanity filter (leetspeak-aware).
  Room codes use consonants only, so they can't spell words.

---

## Tuning the feel

Everything that affects movement lives in **`shared/config/movement.js`**, with comments. The server and the
client prediction both read it, so restart `npm run dev` after editing. Other tuning files:

- `shared/config/weapons.js`: damage, fire rate, recoil patterns, spread, ADS zoom, reload/swap times
- `shared/config/game.js`: tick rates, round timings, FFA rules, interpolation delay, lag-compensation cap
- `client/core/Settings.js`: default player settings (sensitivity, FOV, crosshair, …)
- `client/core/Bindings.js`: default keybinds

## Adding a map

Maps are plain data built with `shared/maps/builder.js`. Copy `shared/maps/kiln.js`:

```js
const m = new MapBuilder('mymap', 'My Map', { sky: 0x9fc6e8, ground: 0x8c8f99 });
m.floor(-20, 0, 20, 25);                       // floor slab (x0, z0, x1, z1), top at y = 0
m.box(-21, 0, 25, 21, 8, 26, 0x5d6475);        // any box: (x0, y0, z0, x1, y1, z1, colour)
m.block(5, 10, 2, 2, 1.2, 0xc98f4a);           // block centred at (x, z): width, depth, height
m.ramp(-20, 0, 10, -15, 3, 16, '-z', 0x9aa6bf); // ramp rising toward -z
m.spawn(0, 0, 0, 22, 0);                       // team spawn: x, y, z, yaw (0 = facing -z)
m.ffaSpawn(10, 0, 5, 1.2);
m.mirror();                                    // point-mirror everything for the other team
export default m.build();
```

Then register it in `shared/maps/index.js` (`MAPS` and `MATCH_MAPS`). `npm test` checks that every spawn is clear,
lands on the ground and is mirrored fairly. Collision is AABB plus ramps. A wall over ~2.6 m can't be mantled.

---

## How the netcode works

- **Inputs only:** each client tick (60 Hz), the client sends `{seq, buttons, yaw, pitch, weapon select, view tick}`.
  The server runs the same deterministic simulation (`shared/sim/`) and is the only one that decides movement, hits and damage.
- **Prediction + reconciliation:** the client simulates its own player immediately with the same code. Each snapshot
  includes the server's state and the last input it processed. The client rewinds to that state, replays its unacknowledged
  inputs, and smooths away any visible difference over ~100 ms. With the same code and fixed timestep, mispredictions
  are normally zero.
- **Interpolation:** other players are drawn 100 ms in the past, between two snapshots.
- **Lag compensation:** the server keeps 1 s of position history. A shot is checked against targets where the shooter saw
  them (the client's interpolated "view tick"). The rewind is capped at the 100 ms interpolation delay **plus 150 ms of
  latency**: beyond that, high-ping players have to lead their shots.
- **Smooth round starts:** phases end on exact server ticks. Shortly before the freeze ends, the server tells each
  client which of its inputs will be the first unfrozen one, and both sides use that rule. So the moment a round goes
  live, you start moving with no snap-back, whatever your ping. A client can't use this to leave spawn early: an input
  can unfreeze at most 10 ticks before the freeze ends.
- **Even input timing:** the server runs one input per tick, with a catch-up to two per tick when a low-FPS client's
  bursts pile up. That keeps each player's input-to-tick timing predictable.
- **Anti-abuse:** messages are size-limited (4 KB), schema-validated and rate-limited. A token bucket means a client can't
  move faster than 60 inputs/s. Repeated bad messages get the client disconnected. Malformed input never crashes the server.
- **Reconnects:** a session token (in `sessionStorage`) lets a dropped player rejoin the same slot within 30 s.
  Mid-round they count as eliminated and play again next round.

## Testing

```bash
npm test                     # unit tests: movement, weapons/hitscan, maps, protocol fuzzing, name filter
```

**Bots:** `scripts/bot.js` is a headless Node client that plays randomly with intent: it wanders, strafes, jumps,
slides, dashes and shoots at visible enemies. Start the server with `FAST_ROUNDS=1` for quick matches:

```bash
FAST_ROUNDS=1 npm run dev                                  # in one terminal
npm run bot -- --count 4 --mode 2v2 --assert               # plays a full 2v2 and verifies the result
npm run bot -- --count 6 --mode 3v3 --map overpass --assert
npm run bot -- --count 2 --mode 1v1 --assert --chaos       # random disconnects/reconnects + junk messages
npm run bot -- --count 5 --mode ffa --assert
npm run bot -- --count 3 --code ABCD                       # fill YOUR room with bots to play against
npm run bot -- --count 2 --fuzz                            # flood junk; the server should kick, not crash
npm run bot -- --count 5 --code ABCD --roles hunter,passive,hunter,passive,hunter
```

`--roles` gives each bot a fixed behaviour, in join order. Bots then join one at a time, so with you in the room first,
the teams alternate enemy, teammate, enemy… The roles:
- `hunter`: perfect aim, always heads for the nearest enemy.
- `walker`: heads for you but never shoots, so it's an easy moving target.
- `passive`: crouches in spawn and never shoots, so it's a teammate who stays alive.

`--assert` checks that a team reached 5 wins, that the round count matches the score, that sides swapped at
halftime, and that kill/death totals are consistent. It also reads the server tick timings from `/stats`.

**Simulated lag:** `FAKE_LAG_MS=60 FAKE_JITTER_MS=15 npm run dev` adds latency (in each direction) on the
server, to try prediction and lag compensation locally. The ping shows in the HUD, and the performance overlay (`)
shows the reconciliation count.

**Browser end-to-end checks** (Playwright with a Chromium you already have):

```bash
FAST_ROUNDS=1 npm start      # or npm run dev
npm run e2e                  # set CHROMIUM_PATH=/path/to/chrome if needed
```

They cover the practice movement, firing with F, the keybind menu (rebind, conflicts, persistence, reset), ADS hold/toggle,
keyboard look, online 1v1 against a bot (prediction errors, ping, quick-chat, server-confirmed hits), the round start
(no correction when the round goes live: run the server with `FAKE_LAG_MS=60 FAKE_JITTER_MS=15` to make it meaningful),
reconnect mid-match, the 2v2 flow (loadout, scoreboard, spectating, results, back to lobby), 3v3 spectating, and the
automatic graphics fallback. The bots use `--roles`, so the checks are deterministic.

`GET /stats` returns rooms, connections and server tick timings. `GET /healthz` is the health check.

---

## Project layout

```
shared/            code used by BOTH server and client
  config/          movement.js (feel), weapons.js, game.js
  sim/             collision, movement, weapons, hitscan, world (the deterministic simulation)
  maps/            map data + builder
  net/protocol.js  message types + validators
  util/            name filter, room codes
server/            index.js (Express + ws + Vite), RoomManager (connections, matchmaking, tick loop), Room (match logic), LagComp
client/            main.js (app flow), core/ (game loop, input, settings, binds), net/, modes/ (practice, online),
                   render/ (map mesh, models, viewmodel, effects), ui/ (HUD, menus, settings), audio/ (synth)
scripts/bot.js     headless test bots
test/              unit tests (node:test)
e2e/               browser checks (Playwright)
```

## Defaults and decisions (made without asking)

- **Name: SLIPSTRIKE.** Teams are **Ember** (orange) and **Tide** (blue), a colour-blind-friendly pair. Maps: Kiln (1v1), Dockyard (2v2), Overpass (3v3), plus the Range.
- **Plain JavaScript** (no TypeScript), so the server and the shared simulation run in Node with no build step.
- **Air dash** (not double jump), on its own key **V**. Space is kept for jumping and bunnyhopping.
- **Knife on 3 and X** (the brief asked for slot 3 = knife and a separate knife action). **Quick-chat on T** and **Pause on P** (Esc also pauses; browsers reserve Esc).
- **Sprint only applies when moving forward.**
- **Players don't collide with each other** (avoids body-blocking and prediction jitter).
- **Unlimited reserve ammo.** Magazines still matter.
- **Lag compensation cap:** 150 ms of latency on top of the 100 ms interpolation delay.
- **Quick-play rooms default to 2v2.** The first player (host) can change the mode. Created rooms default to 1v1.
- **Round timer:** 90 s; 8 s freeze/loadout before round 1 and 6 s before later rounds; tie-break by players alive, then total health.
- **Practice is offline** (runs the same simulation in the browser), so it works even when the server is unreachable.
- **Graphics quality:** Medium (default) renders at 1× pixel ratio. That's the key to holding 60 FPS on Retina MacBooks. High uses the full
  Retina resolution with antialiasing. Low renders at 0.75× with fewer particles. **Auto quality** (on by default) steps
  down one level if the game stays below 50 FPS for a few seconds, and says so on screen. It never raises the quality
  again by itself. While you're playing, a step down from High only lowers the resolution, so your pointer lock isn't
  dropped; antialiasing follows the next time you open the menus.
- Teammates get name tags (visible through walls). Enemies don't.

## Known limitations / not yet verified

- **Not tested on real MacBook trackpads or in Safari.** Pointer Lock, trackpad feel and Safari's pointer-lock quirks were
  only exercised in headless Chromium. Try the trackpad options and tell us what feels off.
- **60 FPS on school hardware is not measured.** The automated browser uses software rendering (~10 FPS). Only the budgets
  were checked: ~20-60 draw calls and under 2k triangles per frame. Use the ` overlay on a real MacBook.
- **Deploys to Render, Railway and Fly were not performed** (no accounts here). Both the production build
  (`npm ci && npm run build && npm start`, from a clean checkout) and the Docker image (`docker build` + `docker run`, with a
  full bot match and the browser online check played through the container) were verified locally.
- **Real school networks / proxies** were not tested. If WebSockets are blocked, the menu shows a clear error.
- **One server process only** (rooms are in memory). Fine for a class; not built to scale across machines.
