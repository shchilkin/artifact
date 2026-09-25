import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildIdentity } from '../core-pilot/build-identity.mjs';
import { makeManifest } from '../core-pilot/runtime-manifest.mjs';
import { verifyRelease } from '../verify-release.mjs';
import { performRelease } from './act.mjs';
import { components, readJson, releasePlan, verifyVersions } from './components.mjs';
import { verifyBuild } from './verify-build.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const sha = 'a'.repeat(40);
function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'artifact-release-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of [
    'package.json',
    'package-lock.json',
    'Cargo.toml',
    'Cargo.lock',
    'rust-toolchain.toml',
    'crates',
    'packages/artifact-core-web/package.json',
    'packages/artifact-core-web/src',
    'packages/artifact-core-web/generated',
    'apps/web/package.json',
    'apps/macos/app-version.json',
    'scripts/core-pilot/build.mjs',
    'scripts/core-pilot/build-plan.mjs',
    'scripts/core-pilot/build-wasm-canonical.mjs',
  ]) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    cpSync(path.join(repository, file), path.join(root, file), { recursive: true });
  }
  return root;
}
function write(root, file, value) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), typeof value === 'object' ? JSON.stringify(value) : value);
}
function editJson(root, file, edit) {
  const value = readJson(root, file);
  edit(value);
  write(root, file, value);
}
function ready(root, component) {
  const versions = verifyVersions(root);
  const plan = releasePlan(component, versions[component]);
  write(
    root,
    plan.notes,
    `# ${plan.tag} Release Notes\n\nPrepared fixture release.\n\n${['Highlights', 'Scope Boundaries', 'Compatibility', 'Validation', 'Manual QA', 'Accepted Risks'].map((title) => `## ${title}\n\nConcrete fixture evidence.\n`).join('\n')}`,
  );
  write(root, plan.versionPlan, 'Status: release-ready\n\n- [x] Scoped acceptance criterion verified.\n');
  write(root, 'docs/roadmap.md', plan.tag);
  write(root, 'docs/production-readiness.md', `### ${plan.tag} Release Prep`);
  return plan;
}
function git(existing = false, tagSha = sha) {
  return (args) => {
    if (args.includes('--verify')) {
      if (!existing) throw new Error('missing tag');
      return tagSha;
    }
    return sha;
  };
}

test('Web-only version bump leaves core, macOS and tooling root untouched', (t) => {
  const root = fixture(t);
  const before = verifyVersions(root);
  editJson(root, 'apps/web/package.json', (p) => {
    p.version = '7.2.3';
  });
  editJson(root, 'package-lock.json', (p) => {
    p.packages['apps/web'].version = '7.2.3';
  });
  assert.deepEqual(verifyVersions(root), { ...before, web: '7.2.3' });
  const plan = ready(root, 'web');
  assert.equal(verifyRelease(root, { component: 'web' }, git()).tag, 'web/v7.2.3');
  assert.equal(plan.applicationGate, 'web');
});

test('macOS-only release has independent app version and build counter', (t) => {
  const root = fixture(t);
  const before = verifyVersions(root);
  write(root, 'apps/macos/app-version.json', { version: '2.4.6', buildNumber: '13' });
  assert.deepEqual(verifyVersions(root), { ...before, macos: '2.4.6', buildNumber: '13' });
  ready(root, 'macos');
  assert.equal(verifyRelease(root, { component: 'macos' }, git()).tag, 'macos/v2.4.6');
  write(root, 'apps/macos/app-version.json', { version: '2.4.6', buildNumber: '0' });
  assert.throws(() => verifyVersions(root), /buildNumber/);
});

test('core release synchronizes Rust/WASM/FFI and workspace references without bumping clients', (t) => {
  const root = fixture(t);
  const before = verifyVersions(root);
  for (const file of ['Cargo.toml', 'Cargo.lock'])
    write(
      root,
      file,
      readFileSync(path.join(root, file), 'utf8').replaceAll(`version = "${before.core}"`, 'version = "9.8.7"'),
    );
  assert.throws(() => verifyVersions(root), /WASM adapter version/);
  editJson(root, 'packages/artifact-core-web/package.json', (p) => {
    p.version = '9.8.7';
  });
  editJson(root, 'apps/web/package.json', (p) => {
    p.dependencies['@artifact/core-web'] = '9.8.7';
  });
  editJson(root, 'package-lock.json', (p) => {
    p.packages['packages/artifact-core-web'].version = '9.8.7';
    p.packages['apps/web'].dependencies['@artifact/core-web'] = '9.8.7';
  });
  assert.deepEqual(verifyVersions(root), { ...before, core: '9.8.7' });
  ready(root, 'core');
  const plan = verifyRelease(root, { component: 'core' }, git());
  assert.equal(plan.applicationGate, null);
  assert.deepEqual(plan.compatibility, ['wasm-and-web', 'native-macos']);
  assert.throws(() => releasePlan('core', '9.8.7', 'deploy-production'), /Only Web/);
});

test('version drift in Cargo.lock, npm lock or adapter inheritance fails metadata checks', (t) => {
  for (const file of ['Cargo.lock', 'package-lock.json', 'crates/artifact-ffi/Cargo.toml']) {
    const root = fixture(t);
    const core = verifyVersions(root).core;
    const text = readFileSync(path.join(root, file), 'utf8');
    write(
      root,
      file,
      file.endsWith('.toml')
        ? text.replace('version.workspace = true', 'version = "0.1.0"')
        : text.replaceAll(core, '999.999.999'),
    );
    assert.throws(() => verifyVersions(root));
  }
});

test('only namespaced tags and explicit supported actions are accepted', () => {
  for (const component of components) {
    for (const action of ['verify', 'tag-and-create-draft', 'create-draft', 'publish-draft'])
      assert.match(releasePlan(component, '1.2.3', action).tag, new RegExp(`^${component}/v`));
  }
  for (const version of ['v1.2.3', '01.2.3', '1.2.3/evil', '1.2.3; touch bad', '1.2.3-01'])
    assert.throws(() => releasePlan('web', version));
  assert.throws(() => releasePlan('api', '1.2.3'));
  assert.throws(() => releasePlan('web', '1.2.3', 'publish'));
  assert.throws(() => releasePlan('macos', '1.2.3', 'deploy-production'));
  assert.equal(releasePlan('web', '1.2.3', 'deploy-production').requiresTag, true);
});

test('publication/deploy requires exact tag SHA, and incomplete release facts fail closed', (t) => {
  const root = fixture(t);
  const plan = ready(root, 'web');
  for (const action of ['create-draft', 'publish-draft', 'deploy-production']) {
    assert.throws(() => verifyRelease(root, { component: 'web', action }, git()), /Expected release tag/);
    assert.throws(
      () => verifyRelease(root, { component: 'web', action }, git(true, 'b'.repeat(40))),
      /exact checked commit/,
    );
    assert.equal(verifyRelease(root, { component: 'web', action }, git(true)).tag, plan.tag);
  }
  assert.throws(() => verifyRelease(root, { component: 'web' }, git(true)), /already exists/);
  write(root, plan.versionPlan, 'Status: release-ready\n- [ ] Manual acceptance');
  assert.throws(() => verifyRelease(root, { component: 'web' }, git()), /incomplete/);
  write(root, plan.versionPlan, 'Status: planned');
  assert.throws(() => verifyRelease(root, { component: 'web' }, git()), /release-ready/);
  ready(root, 'web');
  write(
    root,
    plan.notes,
    readFileSync(path.join(root, plan.notes), 'utf8').replace('Concrete fixture evidence.', '[describe highlights]'),
  );
  assert.throws(() => verifyRelease(root, { component: 'web' }, git()), /placeholders/);
});

test('publication actions use a command recorder: no real tag, release or deployment', (t) => {
  for (const component of components)
    for (const action of ['tag-and-create-draft', 'create-draft', 'publish-draft']) {
      const root = fixture(t);
      const plan = ready(root, component);
      const asset = component === 'web' ? 'build-identity.json' : 'Artifact-macOS.zip';
      write(root, `release-artifacts/${asset}`, 'verified artifact fixture');
      const commands = [];
      const run = (command, args) => {
        commands.push([command, ...args]);
        if (args[0] === 'symbolic-ref') return 'main';
        if (args[0] === 'status') return '';
        if (args[0] === 'rev-parse') return git(action !== 'tag-and-create-draft')(args);
        if (args[0] === 'show') return readFileSync(path.join(root, plan.notes), 'utf8');
        if (args[0] === 'api')
          return JSON.stringify([
            action === 'publish-draft'
              ? [
                  {
                    tag_name: plan.tag,
                    draft: true,
                    assets: [{ name: asset }],
                    body: readFileSync(path.join(root, plan.notes), 'utf8'),
                  },
                ]
              : [],
          ]);
        return '';
      };
      performRelease(root, { component, version: plan.version, action }, run);
      const mutations = commands.filter(([, first]) => ['tag', 'push', 'release'].includes(first));
      assert.equal(mutations.length, action === 'tag-and-create-draft' ? 3 : 1);
      assert.ok(mutations.every((args) => args.some((arg) => arg.includes(plan.tag))));
      assert.ok(!commands.some(([cmd]) => ['vercel', 'docker', 'npm', 'cargo'].includes(cmd)));
    }
});

test('publication refuses non-main, dirty worktree, missing draft and API failures before writes', (t) => {
  const root = fixture(t);
  ready(root, 'core');
  for (const fault of ['branch', 'dirty', 'api', 'missing']) {
    const writes = [];
    const run = (command, args) => {
      if (args[0] === 'symbolic-ref') return fault === 'branch' ? 'feature' : 'main';
      if (args[0] === 'status') return fault === 'dirty' ? ' M Cargo.toml' : '';
      if (args[0] === 'rev-parse') return sha;
      if (args[0] === 'api') {
        if (fault === 'api') throw new Error('network');
        return '[]';
      }
      writes.push([command, ...args]);
      return '';
    };
    assert.throws(() => performRelease(root, { component: 'core', action: 'publish-draft' }, run));
    assert.deepEqual(writes, []);
  }
});

test('Web path-dependency edits and native linked bytes change identity even at the same version/SHA', (t) => {
  const root = fixture(t);
  const manifest = () => write(root, 'packages/artifact-core-web/generated/manifest.json', makeManifest(root));
  manifest();
  const first = buildIdentity('web', root, { GITHUB_SHA: sha });
  write(root, 'crates/artifact-core/src/release_identity_fixture.rs', '// changed local core');
  assert.throws(() => buildIdentity('web', root, { GITHUB_SHA: sha }), /stale/);
  manifest();
  const changed = buildIdentity('web', root, { GITHUB_SHA: sha });
  assert.equal(changed.version, first.version);
  assert.equal(changed.sha, first.sha);
  assert.equal(changed.core.version, first.core.version);
  assert.notEqual(changed.core.source.sha256, first.core.source.sha256);
  write(root, 'apps/macos/Generated/adapter.swift', '// generated binding');
  write(root, 'target/release/libartifact_ffi.a', 'first library');
  const native = buildIdentity('macos', root, { GITHUB_SHA: sha });
  write(root, 'target/release/libartifact_ffi.a', 'second library');
  assert.notEqual(buildIdentity('macos', root, { GITHUB_SHA: sha }).core.runtime.sha256, native.core.runtime.sha256);
  assert.equal(native.buildNumber, readJson(root, 'apps/macos/app-version.json').buildNumber);
  assert.equal(native.dirty, null); // source archive provenance is explicitly unknown
  assert.throws(() => buildIdentity('web', root, {}), /full source commit/);
});

test('workflow gates route Web-only, macOS-only and core releases without production side effects', () => {
  const workflow = readFileSync(path.join(repository, '.github/workflows/release.yml'), 'utf8');
  const native = readFileSync(path.join(repository, '.github/workflows/native-tooling.yml'), 'utf8');
  assert.match(workflow, /compatibility:\n\s+needs: metadata\n\s+uses: .\/\.github\/workflows\/native-tooling.yml/);
  assert.match(workflow, /web:\n\s+needs: metadata\n\s+if: inputs.component == 'web'/);
  assert.match(
    workflow,
    /deploy-production:\n[\s\S]*?if: inputs.component == 'web' && inputs.action == 'deploy-production'/,
  );
  assert.match(native, /inputs.release-component == 'macos'/);
  assert.match(native, /npm run check:core-web/);
  assert.match(native, /npm run check:core-native/);
  const gate = workflow.match(/test "\$METADATA" = success[\s\S]*?fi\n/)[0].replace(/^          /gm, '');
  for (const component of components) {
    const env = {
      ...process.env,
      METADATA: 'success',
      COMPATIBILITY: 'success',
      COMPONENT: component,
      WEB: component === 'web' ? 'success' : 'skipped',
    };
    execFileSync('bash', ['-e', '-c', gate], { env });
    for (const failed of ['METADATA', 'COMPATIBILITY', ...(component === 'web' ? ['WEB'] : [])]) {
      assert.notEqual(spawnSync('bash', ['-e', '-c', gate], { env: { ...env, [failed]: 'failure' } }).status, 0);
    }
  }
});

test('built identity verification rejects tampered core provenance', (t) => {
  const root = fixture(t);
  write(root, 'packages/artifact-core-web/generated/manifest.json', makeManifest(root));
  const identity = buildIdentity('web', root, { GITHUB_SHA: sha });
  write(root, 'apps/web/build/client/build-identity.json', identity);
  const before = process.env.GITHUB_SHA;
  process.env.GITHUB_SHA = sha;
  try {
    verifyBuild(root, 'web');
    assert.throws(() => verifyBuild(root, 'web', true), /clean checkout/);
    identity.core.version = '99.99.99';
    write(root, 'apps/web/build/client/build-identity.json', identity);
    assert.throws(() => verifyBuild(root, 'web'), /must match current source/);
  } finally {
    if (before === undefined) delete process.env.GITHUB_SHA;
    else process.env.GITHUB_SHA = before;
  }
});
