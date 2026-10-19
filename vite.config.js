import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: path.resolve('client'),
  publicDir: false,
  server: { fs: { allow: [path.resolve('.')] } },
  build: {
    outDir: path.resolve('dist'),
    emptyOutDir: true,
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
  },
});
