import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const runtime = 'packages/artifact-core-web/generated/';
export function rustSources(directory, base = directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return rustSources(full, base);
    return entry.isFile() && entry.name.endsWith('.rs') ? [path.relative(base, full).replaceAll(path.sep, '/')] : [];
  });
}
export function makeManifest(directory = root) {
  const sourceFiles = [
    'Cargo.toml',
    'Cargo.lock',
    'rust-toolchain.toml',
    'crates/artifact-core/Cargo.toml',
    'crates/artifact-wasm/Cargo.toml',
    'scripts/core-pilot/build.mjs',
    ...rustSources(path.join(directory, 'crates/artifact-core/src')).map((file) => `crates/artifact-core/src/${file}`),
    ...rustSources(path.join(directory, 'crates/artifact-wasm/src')).map((file) => `crates/artifact-wasm/src/${file}`),
  ].sort();
  const runtimeFiles = readdirSync(path.join(directory, runtime))
    .filter((f) => /\.(js|ts|wasm)$/.test(f))
    .sort();
  const hash = (file) =>
    createHash('sha256')
      .update(readFileSync(path.join(directory, file)))
      .digest('hex');
  return {
    source: Object.fromEntries(sourceFiles.map((file) => [file, hash(file)])),
    runtime: Object.fromEntries(runtimeFiles.map((file) => [file, hash(runtime + file)])),
  };
}
export function verifyManifest(directory = root) {
  assert.deepEqual(
    JSON.parse(readFileSync(path.join(directory, runtime, 'manifest.json'), 'utf8')),
    makeManifest(directory),
    'Shared WASM runtime is stale. Run npm run build:core-pilot -- wasm and commit generated output.',
  );
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--write'))
    writeFileSync(path.join(root, runtime, 'manifest.json'), JSON.stringify(makeManifest(), null, 2) + '\n');
  else {
    verifyManifest();
    console.log('Shared WASM source/runtime manifest verified');
  }
}
