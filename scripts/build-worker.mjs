/**
 * Bundles the Worker into dist/worker/index.js — the entrypoint referenced by
 * the deploy manifest. Everything is inlined, so the upload is self-contained.
 */
import { build } from 'esbuild';
import { mkdir, stat } from 'node:fs/promises';

const outdir = 'dist/worker';
await mkdir(outdir, { recursive: true });

const result = await build({
  entryPoints: ['worker/index.ts'],
  outfile: `${outdir}/index.js`,
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  conditions: ['worker', 'browser'],
  minify: false,
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'info',
});

if (result.errors.length) process.exit(1);

const { size } = await stat(`${outdir}/index.js`);
console.log(`worker bundle: dist/worker/index.js (${(size / 1024).toFixed(1)} KiB)`);
