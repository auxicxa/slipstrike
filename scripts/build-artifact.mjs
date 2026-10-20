#!/usr/bin/env node
// Builds the game as ONE self-contained HTML page (all CSS and JS inlined, no network access) for
// claude.ai pages, which can't run the Node game server:
//   node scripts/build-artifact.mjs           → dist-claude/slipstrike.html: multiplayer over the page's
//                                               room connection (the room creator's browser hosts the match)
//   node scripts/build-artifact.mjs --offline → dist-offline/slipstrike-practice.html: practice only
import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const offline = process.argv.includes('--offline');
const out = path.resolve(offline ? 'dist-offline' : 'dist-claude');
if (offline) process.env.VITE_OFFLINE = '1';
else process.env.VITE_ROOM = '1';
await build({ configFile: path.resolve('vite.config.js'), base: './', build: { outDir: out, emptyOutDir: true }, logLevel: 'warn' });

const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
const jsFile = html.match(/<script[^>]+src="\.\/([^"]+\.js)"/)[1];
const cssFile = html.match(/<link[^>]+href="\.\/([^"]+\.css)"/)[1];
const js = fs.readFileSync(path.join(out, jsFile), 'utf8').replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(out, cssFile), 'utf8');

// The host adds its own <html>/<head>/<body>, so the page is a fragment.
const page = `<title>${offline ? 'SLIPSTRIKE Practice' : 'SLIPSTRIKE'}</title>
<style>
:root { color-scheme: dark; }
html, body { height: 100%; margin: 0; background: #0f131a; }
${css}
</style>
<div id="app">
  <div id="hud" class="hidden"></div>
  <div id="menus"></div>
  <div id="toast"></div>
</div>
<script type="module">
${js}
</script>
`;
const file = path.join(out, offline ? 'slipstrike-practice.html' : 'slipstrike.html');
fs.writeFileSync(file, page);
console.log(`wrote ${file} (${(page.length / 1024).toFixed(0)} KB)`);
