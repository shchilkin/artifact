import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const runtime = 'packages/artifact-core-web/generated/';
const sourceFiles = [
  'Cargo.toml',
  'Cargo.lock',
  'crates/artifact-core/Cargo.toml',
  'crates/artifact-wasm/Cargo.toml',
  'crates/artifact-wasm/src/lib.rs',
  ...readdirSync(new URL('crates/artifact-core/src/', root))
    .filter((f) => f.endsWith('.rs'))
    .map((f) => `crates/artifact-core/src/${f}`),
].sort();
const runtimeFiles = readdirSync(new URL(runtime, root))
  .filter((f) => /\.(js|ts|wasm)$/.test(f))
  .sort();
const hash = (file) =>
  createHash('sha256')
    .update(readFileSync(new URL(file, root)))
    .digest('hex');
const manifest = {
  source: Object.fromEntries(sourceFiles.map((file) => [file, hash(file)])),
  runtime: Object.fromEntries(runtimeFiles.map((file) => [file, hash(runtime + file)])),
};
const path = new URL(runtime + 'manifest.json', root);
if (process.argv.includes('--write')) writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
else {
  assert.deepEqual(
    JSON.parse(readFileSync(path, 'utf8')),
    manifest,
    'Shared WASM runtime is stale. Run npm run build:core-pilot -- wasm and commit generated output.',
  );
  console.log('Shared WASM source/runtime manifest verified');
}
