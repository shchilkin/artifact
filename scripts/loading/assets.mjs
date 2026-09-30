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
