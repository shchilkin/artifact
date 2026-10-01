import path from 'node:path';

/** Hash-free asset name, so baselines compare across builds: `tabs-BAgeaCc-.js` -> `tabs.js`. */
export function normalizeAssetName(file) {
  const base = path.basename(file.split('#')[0].split('?')[0]);
  const ext = path.extname(base);
  const stem = base.slice(0, -ext.length);
  return `${stem.replace(/-[A-Za-z0-9_-]{8}$/, '')}${ext}`;
}

/** Unique assets with sizes, largest first, plus totals. `sizeOf` returns `{ raw, gzip }`. */
export function summarizeAssets(files, sizeOf) {
  const unique = [...new Set(files.map((file) => file.split('#')[0]))];
  const assets = unique
    .map((file) => ({ name: normalizeAssetName(file), ...sizeOf(file) }))
    .sort((a, b) => b.gzip - a.gzip || a.name.localeCompare(b.name));
  const total = assets.reduce((acc, asset) => ({ raw: acc.raw + asset.raw, gzip: acc.gzip + asset.gzip }), {
    raw: 0,
    gzip: 0,
  });
  return { total, assets };
}

/** Route chain from a leaf route up to root, using React Router manifest `parentId` links. */
export function routeChain(manifest, routeId) {
  const chain = [];
  for (let id = routeId; id; id = manifest.routes[id]?.parentId) {
    const route = manifest.routes[id];
    if (!route) throw new Error(`Route ${id} missing from manifest`);
    chain.push(route);
  }
  return chain;
}

/** Initial JS and CSS files React Router loads for a route: entry, then every route in the chain. */
export function initialRouteFiles(manifest, routeId) {
  const js = [manifest.entry.module, ...manifest.entry.imports];
  const css = [...(manifest.entry.css ?? [])];
  for (const route of routeChain(manifest, routeId)) {
    js.push(route.module, ...(route.imports ?? []));
    css.push(...(route.css ?? []));
  }
  return { js, css };
}

// Dependency families the loading contract reasons about, matched against source-map paths.
const FAMILY_PATTERNS = [
  ['react', /node_modules\/(react|react-dom|scheduler)\//],
  ['react-router', /node_modules\/(react-router|@react-router\/[^/]+)\//],
  ['motion', /node_modules\/(framer-motion|motion-dom|motion-utils)\//],
  ['react-flow', /node_modules\/(@xyflow\/[^/]+|d3-[^/]+)\//],
  ['pixi', /node_modules\/(pixi\.js|@pixi\/[^/]+)\//],
  ['three', /node_modules\/three\//],
  ['renderer', /\/app\/utils\/(render\/|renderer\.ts|pixiFilters|gpuRender)/],
  // The graph canvas itself. Inspector fields, constants, helpers, and NoPan live in the same folder but
  // also serve the Layers inspector.
  ['node-canvas', /\/app\/components\/node-canvas\/(?!inspector\/|constants\.ts|helpers\.ts|nodes\/NoPan\.tsx)/],
];

/**
 * Source bytes per dependency family in one chunk, from its source map. Families under `minBytes` are
 * dropped so a stray helper does not claim ownership.
 */
export function chunkFamilies(sourceMap, minBytes = 2048) {
  const bytes = {};
  sourceMap.sources.forEach((source, index) => {
    const size = sourceMap.sourcesContent?.[index]?.length ?? 0;
    const family = FAMILY_PATTERNS.find(([, pattern]) => pattern.test(source))?.[0];
    if (family) bytes[family] = (bytes[family] ?? 0) + size;
  });
  return Object.keys(bytes)
    .filter((family) => bytes[family] >= minBytes)
    .sort();
}

/** Built file contents without the trailing source-map comment, so sizes match a build without maps. */
export function stripSourceMapComment(source) {
  return source
    .replace(/\n?\/\/# sourceMappingURL=[^\n]*\s*$/, '')
    .replace(/\n?\/\*# sourceMappingURL=[^*]*\*\/\s*$/, '');
}
