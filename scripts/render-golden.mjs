#!/usr/bin/env node
// Runs the golden render fixtures with pixel hashes inside the pinned Playwright
// container that CI uses, so text and emoji rasterize the same everywhere.
//
//   npm run test:golden          compare against baselines
//   npm run test:golden:update   rewrite pixel hashes, thumbnails, and recipes
//
// Linux CI (GOLDEN_IN_CONTAINER=1) runs the same vitest command directly.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const update = process.argv.includes('--update');
const TEST_PATH = 'app/test-fixtures/render/golden';

const vitestArgs = [
  '--workspace',
  '@artifact/web',
  'exec',
  '--',
  'vitest',
  'run',
  TEST_PATH,
  ...(update ? ['-u'] : []),
];
const env = { GOLDEN_PIXELS: '1', ...(update ? { GOLDEN_UPDATE: '1' } : {}) };

if (process.env.GOLDEN_IN_CONTAINER === '1') {
  // The renderer imports `@artifact/shared` (shader validation through the migrations), which resolves to its
  // built output; a clean checkout has none, so build it first, as `test:browser` does.
  const build = spawnSync('npm', ['--workspace', '@artifact/shared', 'run', 'build'], { cwd: ROOT, stdio: 'inherit' });
  if (build.status !== 0) process.exit(build.status ?? 1);
  const result = spawnSync('npm', vitestArgs, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });
  process.exit(result.status ?? 1);
}

const ci = readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');
const image = ci.match(/mcr\.microsoft\.com\/playwright:[\w.-]+/)?.[0];
if (!image) {
  console.error('Could not find the Playwright container image in .github/workflows/ci.yml');
  process.exit(1);
}

// Keep Linux dependencies in Docker volumes so the host node_modules are never replaced.
const workspaceDirs = ['apps', 'packages'].flatMap((group) =>
  readdirSync(path.join(ROOT, group))
    .map((name) => `${group}/${name}`)
    .filter((dir) => existsSync(path.join(ROOT, dir, 'package.json'))),
);
const volumes = ['', ...workspaceDirs].flatMap((dir) => {
  const target = path.posix.join('/work', dir, 'node_modules');
  const name = `artifact-golden-amd64-${dir.replaceAll('/', '-') || 'root'}-node-modules`;
  return ['-v', `${name}:${target}`];
});

const inner = [
  'set -e',
  'lock_hash=$(sha256sum package-lock.json | cut -d" " -f1)',
  'if [ "$(cat node_modules/.golden-lock-hash 2>/dev/null)" != "$lock_hash" ]; then',
  '  npm ci --no-audit --no-fund --ignore-scripts',
  '  echo "$lock_hash" > node_modules/.golden-lock-hash',
  'fi',
  `GOLDEN_IN_CONTAINER=1 node scripts/render-golden.mjs ${update ? '--update' : ''}`,
].join('\n');

console.log(`Running golden render fixtures in ${image} (linux/amd64)`);
const result = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '--platform',
    'linux/amd64',
    '-v',
    `${ROOT}:/work`,
    ...volumes,
    '-w',
    '/work',
    image,
    'bash',
    '-c',
    inner,
  ],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
