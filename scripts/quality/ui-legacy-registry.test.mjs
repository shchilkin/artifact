import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  auditLegacyContract,
  auditLegacyRegistry,
  auditRemovedLegacySurface,
  loadLegacyRegistry,
} from './ui-legacy-registry.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');

test('the committed UI legacy registry matches the current repository', async () => {
  const registry = await loadLegacyRegistry(repoRoot);
  const result = await auditLegacyRegistry(repoRoot, registry);
  assert.deepEqual(result.errors, []);
});

test('a forbidden contract rejects a reintroduced caller', async () => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'artifact-ui-legacy-registry-'));
  await mkdir(path.join(fixtureRoot, 'app'), { recursive: true });
  const newFile = path.join(fixtureRoot, 'app/new.tsx');
  const contract = {
    id: 'fixture-adapter',
    scan: { roots: ['app'], extensions: ['tsx'], pattern: 'legacy-adapter' },
    allowedReferences: {},
  };

  assert.deepEqual((await auditLegacyContract(fixtureRoot, contract)).errors, []);
  await writeFile(newFile, 'legacy-adapter\n', 'utf8');
  assert.match((await auditLegacyContract(fixtureRoot, contract)).errors[0], /new legacy reference/);
});

test('a removed compatibility file cannot be reintroduced', async () => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'artifact-ui-removed-file-'));
  const removedPath = 'app/RemovedAdapter.tsx';
  const registry = {
    removedFiles: [{ path: removedPath }],
    removedStylesheetSections: [],
  };

  assert.deepEqual(await auditRemovedLegacySurface(fixtureRoot, registry), []);

  await mkdir(path.join(fixtureRoot, 'app'), { recursive: true });
  await writeFile(path.join(fixtureRoot, removedPath), 'export const RemovedAdapter = true;\n', 'utf8');
  assert.match((await auditRemovedLegacySurface(fixtureRoot, registry))[0], /was reintroduced/);
});
