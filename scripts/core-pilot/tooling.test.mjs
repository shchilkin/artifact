import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { inspect } from './doctor.mjs';
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

test('doctor identifies missing prerequisites and wrong versions', () => {
  const run = (name) =>
    name === 'cargo' ? { status: 127, error: new Error('ENOENT') } : ok(versions[path.basename(name)]);
  const result = inspect({ mode: 'web', run, hasFile: (name) => name.endsWith('node_modules') });
  assert.ok(result.problems.some((line) => line.includes('Cargo is missing')));
  assert.ok(!result.problems.some((line) => line.includes('Xcode')));
  const wrong = inspect({
    mode: 'macos',
    run: (name) => ok(name === 'rustc' ? 'rustc 1.94.0\n' : versions[name]),
    platform: 'linux',
    arch: 'x64',
    hasFile: () => true,
  });
  assert.ok(wrong.problems.some((line) => line.includes('Rust has an unexpected version')));
  assert.ok(wrong.problems.some((line) => line.includes('Apple Silicon macOS')));
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
