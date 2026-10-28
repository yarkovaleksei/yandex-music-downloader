import { build as bundle } from 'esbuild';
import { build } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Sandbox preload использует только встроенный Electron require, остальные модули bundled.
await bundle({
  entryPoints: [path.join(root, 'src/preload/index.ts')],
  outfile: path.join(root, 'dist/preload.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
  target: 'node24',
});
await bundle({
  entryPoints: [
    path.join(
      root,
      '../../packages/application/src/fixtures/desktop-native-probe.ts',
    ),
  ],
  outfile: path.join(root, 'dist/native-probe.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  target: 'node24',
});
await build({
  root,
  base: './',
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    rolldownOptions: {
      onLog(level, log, handler) {
        if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log);
      },
    },
  },
  logLevel: 'warn',
});
