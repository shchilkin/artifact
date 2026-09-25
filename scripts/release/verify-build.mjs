import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIdentity } from '../core-pilot/build-identity.mjs';
import { readJson } from './components.mjs';

export function verifyBuild(root, component, requireClean = false) {
  const file =
    component === 'macos'
      ? 'apps/macos/.build/Artifact.app/Contents/Resources/build-identity.json'
      : 'apps/web/build/client/build-identity.json';
  const identity = readJson(root, file);
  assert.deepEqual(
    identity,
    buildIdentity(component, root),
    'Built identity must match current source and embedded runtime',
  );
  if (requireClean) assert.equal(identity.dirty, false, 'Release artifact must be built from a clean checkout');
  if (component === 'macos') {
    const plist = (field) =>
      execFileSync(
        'plutil',
        ['-extract', field, 'raw', '-o', '-', path.join(root, 'apps/macos/.build/Artifact.app/Contents/Info.plist')],
        { encoding: 'utf8' },
      ).trim();
    assert.equal(plist('CFBundleShortVersionString'), identity.version);
    assert.equal(plist('CFBundleVersion'), identity.buildNumber);
    assert.equal(plist('ArtifactBuildSHA'), identity.sha);
  }
  return identity;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const component = process.argv[2];
  assert.ok(['web', 'macos'].includes(component), 'Choose web or macos');
  const identity = verifyBuild(process.cwd(), component, process.argv.includes('--require-clean'));
  console.log(
    `${component} ${identity.version}: ${identity.sha}, core ${identity.core.version} / ${identity.core.source.sha256}`,
  );
}
