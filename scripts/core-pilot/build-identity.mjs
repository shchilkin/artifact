import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { metadata } from '../release/components.mjs';
import { verifyManifest } from './runtime-manifest.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function files(directory, relative) {
  return readdirSync(path.join(directory, relative), { withFileTypes: true }).flatMap((entry) => {
    const name = `${relative}/${entry.name}`;
    if (entry.isDirectory()) return files(directory, name);
    assert.ok(entry.isFile(), `Build inputs must be regular files: ${name}`);
    return [name];
  });
}
function digest(directory, names) {
  const entries = [...names].sort().map((name) => [name, hash(readFileSync(path.join(directory, name)))]);
  return { sha256: hash(JSON.stringify(entries)), files: Object.fromEntries(entries) };
}

export function buildIdentity(component = 'macos', directory = root, env = process.env) {
  assert.ok(['web', 'macos'].includes(component), 'Build identity requires a client');
  const versions = metadata(directory);
  const git = (args) => spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
  const revision = git(['rev-parse', 'HEAD']);
  const supplied = env.VITE_APP_COMMIT ?? env.VERCEL_GIT_COMMIT_SHA ?? env.GITHUB_SHA;
  const sha = revision.status === 0 ? revision.stdout.trim() : supplied;
  assert.match(sha ?? '', /^[0-9a-f]{40}$/, 'Build needs full source commit (Git HEAD or provider SHA)');
  if (supplied) assert.equal(supplied, sha, 'Provider source commit differs from Git HEAD');
  const status = git(['status', '--porcelain']);
  const dirty = status.status === 0 ? status.stdout.trim().length > 0 : null;
  const source = digest(directory, ['Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', ...files(directory, 'crates')]);
  let adapter;
  let runtime;
  if (component === 'web') {
    verifyManifest(directory);
    adapter = digest(directory, [
      'packages/artifact-core-web/package.json',
      ...files(directory, 'packages/artifact-core-web/src'),
    ]);
    runtime = digest(directory, files(directory, 'packages/artifact-core-web/generated'));
  } else {
    adapter = digest(directory, files(directory, 'apps/macos/Generated'));
    runtime = digest(directory, ['target/release/libartifact_ffi.a']);
  }
  return {
    identityFormat: 1,
    component,
    version: versions[component],
    ...(component === 'macos' ? { buildNumber: versions.buildNumber } : {}),
    sha,
    dirty,
    core: { version: versions.core, source, adapter, runtime },
  };
}
