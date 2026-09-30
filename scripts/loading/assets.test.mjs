import assert from 'node:assert/strict';
import test from 'node:test';
import { initialRouteFiles, normalizeAssetName, routeChain, summarizeAssets } from './assets.mjs';

test('normalizeAssetName strips content hashes, css markers, and directories', () => {
  assert.equal(normalizeAssetName('/assets/tabs-BAgeaCc-.js'), 'tabs.js');
  assert.equal(normalizeAssetName('/assets/flow-vendor-CHpVij2M.css#'), 'flow-vendor.css');
  assert.equal(normalizeAssetName('/assets/entry.client-CuqXxfeF.js'), 'entry.client.js');
  assert.equal(normalizeAssetName('/assets/manifest-ad73b5bf.js'), 'manifest.js');
  assert.equal(normalizeAssetName('favicon.svg'), 'favicon.svg');
});

test('summarizeAssets deduplicates files and totals sizes', () => {
  const sizes = { '/a-11111111.js': { raw: 10, gzip: 4 }, '/b-22222222.js': { raw: 30, gzip: 9 } };
  const result = summarizeAssets(['/a-11111111.js', '/b-22222222.js', '/a-11111111.js#'], (f) => sizes[f]);
  assert.deepEqual(result.total, { raw: 40, gzip: 13 });
  assert.deepEqual(
    result.assets.map((a) => a.name),
    ['b.js', 'a.js'],
  );
});

const manifest = {
  entry: { module: '/e.js', imports: ['/r.js'], css: ['/e.css'] },
  routes: {
    root: { id: 'root', module: '/root.js', imports: ['/shell.js'], css: ['/root.css'] },
    'routes/docs': { id: 'routes/docs', parentId: 'root', module: '/docs.js', imports: [], css: [] },
  },
};

test('initialRouteFiles combines entry and every route in the chain', () => {
  assert.deepEqual(
    routeChain(manifest, 'routes/docs').map((r) => r.id),
    ['routes/docs', 'root'],
  );
  assert.deepEqual(initialRouteFiles(manifest, 'routes/docs'), {
    js: ['/e.js', '/r.js', '/docs.js', '/root.js', '/shell.js'],
    css: ['/e.css', '/root.css'],
  });
});

test('routeChain rejects unknown routes', () => {
  assert.throws(() => routeChain(manifest, 'routes/missing'), /missing from manifest/);
});
