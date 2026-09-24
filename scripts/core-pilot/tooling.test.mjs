import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildStages } from './build-plan.mjs';
import { inspect, supportsNodeVersion } from './doctor.mjs';
import { makeManifest, verifyManifest } from './runtime-manifest.mjs';

const ok = (stdout) => ({ status: 0, stdout, stderr: '' });
const versions = {
  node: 'v26.8.1\n',
  npm: '11.19.0\n',
  cargo: 'cargo 1.95.0\n',
  rustc: 'rustc 1.95.0\n',
  rustup: 'aarch64-apple-darwin\nwasm32-unknown-unknown\n',
  'wasm-bindgen': 'wasm-bindgen 0.2.128\n',
  xcodebuild: 'Xcode 26.6\nBuild version 17F113\n',
  xcrun: '/Applications/Xcode.app/swiftc\n',
  swift: 'Apple Swift version 6.3.3\n',
  codesign: '1.0\n',
};

test('Node boundaries match the locked Web build range', () => {
  for (const version of ['v20.19.0', 'v20.20.1', 'v22.12.0', 'v23.0.0', 'v26.8.1'])
    assert.equal(supportsNodeVersion(version), true, version);
  for (const version of ['v18.20.0', 'v20.18.9', 'v21.9.0', 'v22.11.9', 'v22.12.0-beta'])
    assert.equal(supportsNodeVersion(version), false, version);
});

test('Web doctor needs only Node/npm while WASM and native modes check their own prerequisites', () => {
  const run = (name) =>
    name === 'cargo' ? { status: 127, error: new Error('ENOENT') } : ok(versions[path.basename(name)]);
  const web = inspect({
    mode: 'web',
    run,
    hasFile: (name) => name.endsWith('node_modules'),
  });
  assert.deepEqual(web.problems, []);
  assert.deepEqual(
    web.results.map((line) => line.split(':')[0]),
    ['Node.js', 'npm'],
  );
  const wasm = inspect({
    mode: 'wasm',
    run,
    platform: 'darwin',
    arch: 'arm64',
    hasFile: (name) => name.endsWith('node_modules'),
  });
  assert.ok(wasm.problems.some((line) => line.includes('Cargo is missing')));
  assert.ok(wasm.problems.some((line) => line.includes('build:core-wasm-canonical')));
  assert.ok(!wasm.results.some((line) => line.startsWith('Xcode')));
  const canonical = inspect({ mode: 'wasm', run, platform: 'linux', arch: 'x64', hasFile: () => true });
  assert.ok(!canonical.problems.some((line) => line.includes('build:core-wasm-canonical')));
  const wrong = inspect({
    mode: 'macos',
    run: (name) => ok(name === 'rustc' ? 'rustc 1.94.0\n' : versions[name]),
    platform: 'linux',
    arch: 'x64',
    hasFile: () => true,
  });
  assert.ok(wrong.problems.some((line) => line.includes('Rust has an unexpected version')));
  assert.ok(wrong.problems.some((line) => line.includes('Apple Silicon macOS')));
  assert.ok(!wrong.results.some((line) => line.startsWith('wasm-bindgen')));
  const unsupported = inspect({
    mode: 'web',
    run: (name) => ok(name === 'node' ? 'v21.9.0\n' : versions[name]),
    hasFile: () => true,
  });
  assert.ok(unsupported.problems.some((line) => line.includes('^20.19.0 or >=22.12.0')));
});

test('canonical WASM generation is Linux x86-64 and Mac builds consume the reviewed runtime', () => {
  assert.deepEqual(buildStages('all', 'linux', 'x64'), {
    wasm: true,
    macos: false,
  });
  assert.deepEqual(buildStages('all', 'darwin', 'arm64'), {
    wasm: false,
    macos: true,
  });
  assert.deepEqual(buildStages('macos', 'darwin', 'arm64'), {
    wasm: false,
    macos: true,
  });
  assert.throws(() => buildStages('wasm', 'darwin', 'arm64'), /build:core-wasm-canonical/);
  assert.throws(() => buildStages('wasm', 'linux', 'arm64'), /build:core-wasm-canonical/);
  assert.throws(() => buildStages('all', 'linux', 'arm64'), /Linux x86-64 or Apple Silicon macOS/);
});

test('runtime manifest rejects a changed nested Rust module and toolchain', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'artifact-tooling-'));
  try {
    const files = [
      'Cargo.toml',
      'Cargo.lock',
      'rust-toolchain.toml',
      'crates/artifact-core/Cargo.toml',
      'crates/artifact-wasm/Cargo.toml',
      'scripts/core-pilot/build.mjs',
      'scripts/core-pilot/build-plan.mjs',
      'scripts/core-pilot/build-wasm-canonical.mjs',
      'crates/artifact-core/src/nested/commands.rs',
      'crates/artifact-wasm/src/lib.rs',
      'packages/artifact-core-web/generated/artifact_wasm.js',
    ];
    for (const file of files) {
      const full = path.join(directory, file);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, 'reviewed input');
    }
    const manifest = makeManifest(directory);
    assert.ok('crates/artifact-core/src/nested/commands.rs' in manifest.source);
    const manifestPath = path.join(directory, 'packages/artifact-core-web/generated/manifest.json');
    writeFileSync(manifestPath, JSON.stringify(manifest));
    verifyManifest(directory);
    writeFileSync(path.join(directory, 'crates/artifact-core/src/nested/commands.rs'), 'stale source');
    assert.throws(() => verifyManifest(directory), /Shared WASM runtime is stale/);
    writeFileSync(path.join(directory, 'crates/artifact-core/src/nested/commands.rs'), 'reviewed input');
    writeFileSync(path.join(directory, 'rust-toolchain.toml'), 'different toolchain');
    assert.throws(() => verifyManifest(directory), /Shared WASM runtime is stale/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('checked WASM runtime does not embed common host source roots', () => {
  const wasm = readFileSync(
    new URL('../../packages/artifact-core-web/generated/artifact_wasm_bg.wasm', import.meta.url),
  );
  for (const hostRoot of ['/Users/', '/home/', '/private/tmp/'])
    assert.ok(!wasm.includes(Buffer.from(hostRoot)), `WASM runtime embeds ${hostRoot}`);
});
