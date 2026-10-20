#!/usr/bin/env node
// Builds the single-player practice version as ONE self-contained HTML page (all CSS and JS inlined,
// no network access), for hosts that can only serve a static page. Output: dist-offline/slipstrike-practice.html
import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve('dist-offline');
process.env.VITE_OFFLINE = '1';
await build({ configFile: path.resolve('vite.config.js'), base: './', build: { outDir: out, emptyOutDir: true }, logLevel: 'warn' });

const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
const jsFile = html.match(/<script[^>]+src="\.\/([^"]+\.js)"/)[1];
const cssFile = html.match(/<link[^>]+href="\.\/([^"]+\.css)"/)[1];
const js = fs.readFileSync(path.join(out, jsFile), 'utf8').replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(out, cssFile), 'utf8');

// The host adds its own <html>/<head>/<body>, so the page is a fragment.
const page = `<title>SLIPSTRIKE Practice</title>
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
const file = path.join(out, 'slipstrike-practice.html');
fs.writeFileSync(file, page);
console.log(`wrote ${file} (${(page.length / 1024).toFixed(0)} KB)`);
