// SLIPSTRIKE server: serves the client and the game WebSocket (/ws) on a single port.
//   npm run dev   → Vite dev middleware (hot reload) + game server
//   npm start     → serves the built client from dist/ + game server
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { RoomManager } from './RoomManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEV = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.disable('x-powered-by');
const server = http.createServer(app);

const rooms = new RoomManager();

app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.get('/stats', (_req, res) => res.json(rooms.stats()));

if (DEV) {
  const { createServer } = await import('vite');
  const vite = await createServer({
    configFile: path.join(ROOT, 'vite.config.js'),
    server: { middlewareMode: true, hmr: { server } },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  const dist = path.join(ROOT, 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    console.error('dist/ not found. Run "npm run build" first (or use "npm run dev").');
    process.exit(1);
  }
  app.use(express.static(dist, { index: 'index.html', maxAge: '1h', setHeaders: (res, p) => {
    if (p.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
  } }));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
server.on('upgrade', (req, socket, head) => {
  let pathname = '/';
  try { pathname = new URL(req.url, 'http://x').pathname; } catch { /* ignore */ }
  if (pathname !== '/ws') return; // other upgrades (Vite HMR) are handled by their own listeners
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});
wss.on('connection', (ws, req) => rooms.onConnection(ws, req));

server.listen(PORT, HOST, () => {
  const lan = Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`\n  SLIPSTRIKE ${DEV ? '(dev)' : ''} running`);
  console.log(`  Local:   http://localhost:${PORT}`);
  for (const ip of lan) console.log(`  LAN:     http://${ip}:${PORT}`);
  console.log('');
});

function shutdown() {
  rooms.shutdown();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (e) => console.error('[uncaught]', e));
process.on('unhandledRejection', (e) => console.error('[unhandled]', e));
