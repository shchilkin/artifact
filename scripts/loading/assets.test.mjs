import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chunkFamilies,
  initialRouteFiles,
  normalizeAssetName,
  routeChain,
  stripSourceMapComment,
  summarizeAssets,
} from './assets.mjs';

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

test('chunkFamilies attributes source bytes to dependency families', () => {
  const big = 'x'.repeat(3000);
  const map = {
    sources: [
      '../../node_modules/react-dom/cjs/react-dom.production.js',
      '../../node_modules/@xyflow/react/dist/esm/index.js',
      '../../node_modules/d3-zoom/src/zoom.js',
      '../../app/utils/render/layers/index.ts',
      '../../app/components/Button.tsx',
      '../../node_modules/three/build/three.module.js',
    ],
    sourcesContent: [big, big, 'y'.repeat(10), big, big, 'z'.repeat(100)],
  };
  assert.deepEqual(chunkFamilies(map), ['react', 'react-flow', 'renderer']);
});

test('stripSourceMapComment removes only the trailing map reference', () => {
  assert.equal(stripSourceMapComment('let a=1;\n//# sourceMappingURL=a.js.map'), 'let a=1;');
  assert.equal(stripSourceMapComment('.a{}\n/*# sourceMappingURL=a.css.map */'), '.a{}');
  assert.equal(stripSourceMapComment('let a=1;'), 'let a=1;');
});

test('chunkFamilies keeps shared inspector code out of the node-canvas family', () => {
  const big = 'x'.repeat(3000);
  const map = {
    sources: [
      '../../app/components/node-canvas/inspector/EffectControlSections.tsx',
      '../../app/components/node-canvas/constants.ts',
    ],
    sourcesContent: [big, big],
  };
  assert.deepEqual(chunkFamilies(map), []);
  map.sources.push('../../app/components/node-canvas/NodeCanvas.tsx');
  map.sourcesContent.push(big);
  assert.deepEqual(chunkFamilies(map), ['node-canvas']);
});
