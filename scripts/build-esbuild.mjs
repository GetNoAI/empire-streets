#!/usr/bin/env node
/**
 * Fallback production build with esbuild (no vite/rollup), for machines where rollup's native
 * binary isn't installed (e.g. an arm64 Linux box with node_modules copied from a Mac). It makes
 * the same `dist/` layout `vite build` does: hashed bundles in `dist/assets/`, `index.html` and
 * `preview.html` rewired to them, and everything in `public/` copied over.
 *
 *   node scripts/build-esbuild.mjs [--out dist] [--no-public]
 */
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ESBUILD_LIB can point at another install's lib/main.js (with ESBUILD_BINARY_PATH for its binary).
const { build } = await import(process.env.ESBUILD_LIB ?? 'esbuild');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outDir = resolve(root, args.includes('--out') ? args[args.indexOf('--out') + 1] : 'dist');
const copyPublic = !args.includes('--no-public');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, 'assets'), { recursive: true });

const result = await build({
  entryPoints: { main: join(root, 'src/main.ts'), preview: join(root, 'src/preview/preview.ts') },
  bundle: true,
  format: 'esm',
  splitting: true,
  target: 'es2022',
  minify: true,
  sourcemap: false,
  outdir: join(outDir, 'assets'),
  entryNames: '[name]-[hash]',
  chunkNames: 'chunk-[hash]',
  assetNames: '[name]-[hash]',
  metafile: true,
  logLevel: 'info',
  loader: { '.png': 'file', '.jpg': 'file', '.glb': 'file', '.wasm': 'file', '.woff2': 'file' },
  define: {
    'import.meta.env.PROD': 'true',
    'import.meta.env.DEV': 'false',
    'import.meta.env.MODE': '"production"',
    'import.meta.env.BASE_URL': '"./"',
  },
});

// Metafile paths are relative to the cwd; make them relative to dist/.
const outRel = relative(process.cwd(), outDir).replace(/\\/g, '/');
const rel = (p) => p.replace(/\\/g, '/').replace(outRel + '/', '');
/** The emitted JS (and its CSS bundle, if any) for an entry point. */
function emitted(entry) {
  for (const [out, meta] of Object.entries(result.metafile.outputs)) {
    if (meta.entryPoint && meta.entryPoint.replace(/\\/g, '/').endsWith(entry)) return { js: rel(out), css: meta.cssBundle ? rel(meta.cssBundle) : null };
  }
  throw new Error(`no output for ${entry}`);
}
const main = emitted('src/main.ts');
const preview = emitted('src/preview/preview.ts');

function html(src, js, css) {
  let s = readFileSync(join(root, src), 'utf8');
  const tags = [`<script type="module" crossorigin src="./${js}"></script>`];
  if (css && existsSync(join(outDir, css))) tags.unshift(`<link rel="stylesheet" crossorigin href="./${css}">`);
  s = s.replace(/<script type="module" src="[^"]+"><\/script>/, '');
  s = s.replace('</head>', `    ${tags.join('\n    ')}\n  </head>`);
  writeFileSync(join(outDir, src), s);
}
html('index.html', main.js, main.css);
html('preview.html', preview.js, preview.css);

if (copyPublic && existsSync(join(root, 'public'))) cpSync(join(root, 'public'), outDir, { recursive: true });

const bytes = Object.entries(result.metafile.outputs).reduce((n, [, m]) => n + m.bytes, 0);
const h = createHash('sha1').update(main.js).digest('hex').slice(0, 8);
console.log(`built ${outRel}/ (${(bytes / 1048576).toFixed(1)} MB of bundles, build ${h})`);
