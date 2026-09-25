import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const components = ['core', 'web', 'macos'];
const actions = ['verify', 'tag-and-create-draft', 'create-draft', 'publish-draft', 'deploy-production'];
const semver =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?$/;
export const readJson = (root, file) => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
export const readText = (root, file) => readFileSync(path.join(root, file), 'utf8');

export function metadata(root) {
  const cargo = readText(root, 'Cargo.toml');
  const core = cargo.match(/\[workspace.package\]([\s\S]*?)(?=\n\[|$)/)?.[1].match(/^version = "([^"]+)"/m)?.[1];
  const mac = readJson(root, 'apps/macos/app-version.json');
  return {
    core,
    web: readJson(root, 'apps/web/package.json').version,
    macos: mac.version,
    buildNumber: mac.buildNumber,
  };
}

export function verifyVersions(root) {
  const versions = metadata(root);
  for (const component of components)
    assert.match(versions[component] ?? '', semver, `${component} version is invalid`);
  assert.match(versions.macos, /^\d+\.\d+\.\d+$/, 'macOS app version must be X.Y.Z');
  assert.match(
    versions.buildNumber ?? '',
    /^[1-9]\d{0,8}$/,
    'macOS buildNumber must be a positive decimal string (at most nine digits)',
  );
  const lock = readJson(root, 'package-lock.json');
  const rootPackage = readJson(root, 'package.json');
  assert.equal(lock.version, rootPackage.version, 'root lock version');
  assert.equal(lock.packages[''].version, rootPackage.version, 'root package lock version');
  assert.equal(lock.packages['apps/web'].version, versions.web, 'Web lock version');
  assert.equal(
    readJson(root, 'packages/artifact-core-web/package.json').version,
    versions.core,
    'WASM adapter version',
  );
  assert.equal(lock.packages['packages/artifact-core-web'].version, versions.core, 'WASM adapter lock version');
  for (const packageName of ['artifact-core', 'artifact-wasm', 'artifact-ffi']) {
    const cargo = readText(root, `crates/${packageName}/Cargo.toml`);
    assert.match(cargo, /^version.workspace = true$/m, `${packageName} must inherit core version`);
    assert.match(cargo, /^publish.workspace = true$/m, `${packageName} must inherit private publication policy`);
    const entry = readText(root, 'Cargo.lock')
      .split('[[package]]')
      .find((text) => text.includes(`name = "${packageName}"\n`));
    assert.equal(entry?.match(/version = "([^"]+)"/)?.[1], versions.core, `${packageName} Cargo.lock version`);
  }
  assert.match(readText(root, 'Cargo.toml'), /^publish = false$/m, 'Rust packages remain private');
  assert.equal(readJson(root, 'packages/artifact-core-web/package.json').private, true);
  // This is an npm workspace link, not a claim that a version pins local Rust source.
  assert.equal(
    readJson(root, 'apps/web/package.json').dependencies['@artifact/core-web'],
    versions.core,
    'Web adapter dependency',
  );
  assert.equal(
    lock.packages['apps/web'].dependencies['@artifact/core-web'],
    versions.core,
    'Web adapter dependency lock',
  );
  return versions;
}

export function releasePlan(component, version, action = 'verify') {
  assert.ok(components.includes(component), `Unknown component: ${component}`);
  assert.ok(semver.test(version), `Invalid release version: ${version}`);
  assert.ok(actions.includes(action), `Unknown release action: ${action}`);
  assert.ok(action !== 'deploy-production' || component === 'web', 'Only Web can deploy production');
  const tag = `${component}/v${version}`;
  return {
    component,
    version,
    action,
    tag,
    notes: `docs/releases/${tag}.md`,
    versionPlan: `docs/version-plans/${component}/v${version.split('.').slice(0, 2).join('.')}.md`,
    compatibility: ['wasm-and-web', 'native-macos'],
    applicationGate: component === 'core' ? null : component,
    requiresTag: ['create-draft', 'publish-draft', 'deploy-production'].includes(action),
    mutation: action !== 'verify',
  };
}
