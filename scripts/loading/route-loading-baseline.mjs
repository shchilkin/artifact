#!/usr/bin/env node
// Measures what each representative route and activation state loads from the
// production web build. Output uses hash-free asset names so baselines can be
// compared across builds.
//
//   node scripts/loading/route-loading-baseline.mjs            # manifest + browser
//   node scripts/loading/route-loading-baseline.mjs --manifest-only
//   node scripts/loading/route-loading-baseline.mjs --out apps/web/build/route-loading.json
//
// Requires a web build first; `npm run loading:gate` builds with client source
// maps so every asset can be attributed to dependency families (React, React Flow,
// PixiJS, Three.js, renderer, ...) without trusting chunk file names. Sizes ignore
// the source-map comment, so they match a production build. The browser pass
// serves apps/web/build/client
// with `vite preview` (SPA fallback, like the production rewrite) and blocks the
// service worker so every state is measured as a first visit. A free port is
// chosen per run.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { withPreviewServer } from '../preview-server.mjs';
import {
  chunkFamilies,
  initialRouteFiles,
  normalizeAssetName,
  stripSourceMapComment,
  summarizeAssets,
} from './assets.mjs';

const ROOT = process.cwd();
const WEB = path.join(ROOT, 'apps/web');
const CLIENT = path.join(WEB, 'build/client');
const ASSETS = path.join(CLIENT, 'assets');

const args = process.argv.slice(2);
const manifestOnly = args.includes('--manifest-only');
const outIndex = args.indexOf('--out');
const outPath = outIndex >= 0 ? args[outIndex + 1] : null;

// Route ids from apps/web/app/routes.ts that the loading matrix covers.
const MANIFEST_ROUTES = [
  { state: 'home', routeId: 'routes/home' },
  { state: 'docs', routeId: 'routes/docs' },
  { state: 'account-recovery', routeId: 'routes/reset-password' },
  { state: 'projects', routeId: 'routes/projects' },
  { state: 'editor', routeId: 'routes/editor' },
  { state: 'style-guide', routeId: 'routes/docs.style-guide' },
  { state: 'showcase', routeId: 'routes/showcase' },
];

const BLANK_DOCUMENT = {
  schemaVersion: 1,
  global: { bg: '#101018', seed: 1, aspect: '1:1' },
  layers: [],
  export: { format: 'png', scale: 1, target: 'cover' },
};

// Browser states. `activate` runs after the initial load settles; requests made
// after that point are recorded as activation-only dependencies.
const BROWSER_STATES = [
  { state: 'home', url: '/', routeId: 'routes/home' },
  { state: 'docs', url: '/docs', routeId: 'routes/docs' },
  { state: 'account-recovery', url: '/reset-password', routeId: 'routes/reset-password' },
  { state: 'projects', url: '/projects', routeId: 'routes/projects' },
  { state: 'editor-layers-blank', url: '/app', routeId: 'routes/editor', doc: BLANK_DOCUMENT },
  {
    state: 'editor-nodes',
    url: '/app',
    routeId: 'routes/editor',
    doc: BLANK_DOCUMENT,
    activate: async (page) => {
      await page.getByRole('tab', { name: 'Switch to nodes view' }).click();
      await page.locator('.react-flow__node').first().waitFor({ timeout: 20_000 });
    },
  },
  { state: 'style-guide', url: '/docs/style-guide', routeId: 'routes/docs.style-guide' },
  {
    state: 'first-3d-activation',
    url: '/app',
    routeId: 'routes/editor',
    doc: BLANK_DOCUMENT,
    activate: async (page) => {
      await page.getByRole('button', { name: 'Add layer' }).click();
      await page.getByPlaceholder('Add layer…').fill('Primitive');
      await page
        .getByRole('option', { name: /Primitive/ })
        .first()
        .dblclick();
      await page.locator('.layer-row').first().waitFor({ timeout: 20_000 });
    },
  },
];

const sizeCache = new Map();
function assetSize(file) {
  const clean = file.split('#')[0].split('?')[0];
  if (sizeCache.has(clean)) return sizeCache.get(clean);
  const builtPath = path.join(CLIENT, clean);
  const bytes = Buffer.from(stripSourceMapComment(readFileSync(builtPath, 'utf8')));
  const size = { raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length };
  if (existsSync(`${builtPath}.map`)) {
    const families = chunkFamilies(JSON.parse(readFileSync(`${builtPath}.map`, 'utf8')));
    if (families.length) size.families = families;
  }
  sizeCache.set(clean, size);
  return size;
}

function summarize(files) {
  return summarizeAssets(files, assetSize);
}

function readRouteManifest() {
  const file = readdirSync(ASSETS).find((name) => /^manifest-[a-z0-9]+\.js$/.test(name));
  if (!file) throw new Error('No React Router manifest found. Run `npm run build` first.');
  const source = readFileSync(path.join(ASSETS, file), 'utf8');
  return JSON.parse(source.slice(source.indexOf('{'), source.lastIndexOf('}') + 1));
}

function manifestBaseline() {
  const manifest = readRouteManifest();
  const states = {};
  for (const { state, routeId } of MANIFEST_ROUTES) {
    const { js, css } = initialRouteFiles(manifest, routeId);
    states[state] = { routeId, js: summarize(js), css: summarize(css) };
  }
  return states;
}

// Root route static imports (hash-free, with families) and the entry imports they share.
function rootGraph() {
  const manifest = readRouteManifest();
  return {
    entryImports: manifest.entry.imports.map(normalizeAssetName),
    imports: (manifest.routes.root.imports ?? []).map((file) => ({
      name: normalizeAssetName(file),
      families: assetSize(file).families ?? [],
    })),
  };
}

async function measureState(browser, origin, spec, manifest) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  if (spec.doc) {
    await context.addInitScript((doc) => localStorage.setItem('doc', JSON.stringify(doc)), spec.doc);
  }
  const page = await context.newPage();
  const phases = { initial: [], activation: [] };
  let phase = 'initial';
  page.on('requestfinished', (request) => {
    const url = new URL(request.url());
    if (url.origin !== origin || !url.pathname.startsWith('/assets/')) return;
    if (!/\.(js|css)$/.test(url.pathname)) return;
    phases[phase].push(url.pathname);
  });
  await page.goto(`${origin}${spec.url}`, { waitUntil: 'networkidle' });
  if (spec.activate) {
    phase = 'activation';
    await spec.activate(page);
    await page.waitForLoadState('networkidle');
  }
  await context.close();

  const split = (files) => ({
    js: summarize(files.filter((f) => f.endsWith('.js'))),
    css: summarize(files.filter((f) => f.endsWith('.css'))),
  });
  const initialFiles = new Set(phases.initial);
  // Files the route needs before it renders, per the route manifest. Anything else requested during the
  // first visit came from a dynamic import after the route rendered.
  const { js, css } = initialRouteFiles(manifest, spec.routeId);
  const staticFiles = new Set([...js, ...css].map((file) => file.split('#')[0]));
  return {
    url: spec.url,
    initial: split(phases.initial),
    afterRender: split(phases.initial.filter((f) => !staticFiles.has(f))),
    ...(spec.activate ? { activation: split(phases.activation.filter((f) => !initialFiles.has(f))) } : {}),
  };
}

async function browserBaseline() {
  const { chromium } = await import('playwright');
  return withPreviewServer(async (origin) => {
    const manifest = readRouteManifest();
    const browser = await chromium.launch();
    const states = {};
    for (const spec of BROWSER_STATES) {
      states[spec.state] = await measureState(browser, origin, spec, manifest);
    }
    await browser.close();
    return states;
  });
}

const version = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const result = {
  version,
  generatedBy: 'scripts/loading/route-loading-baseline.mjs',
  units: 'bytes; gzip is level 9 over the built file',
  manifest: manifestBaseline(),
  rootGraph: rootGraph(),
  ...(manifestOnly ? {} : { browser: await browserBaseline() }),
};

const json = `${JSON.stringify(result, null, 2)}\n`;
if (outPath) writeFileSync(path.resolve(ROOT, outPath), json);
else process.stdout.write(json);
