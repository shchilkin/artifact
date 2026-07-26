import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { auditLegacyContract, auditLegacyRegistry, loadLegacyRegistry } from './ui-legacy-registry.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');

test('the committed UI legacy registry matches the current repository', async () => {
  const registry = await loadLegacyRegistry(repoRoot);
  const result = await auditLegacyRegistry(repoRoot, registry);
  assert.deepEqual(result.errors, []);
});

test('a bounded contract permits reductions but rejects growth and new callers', async () => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'artifact-ui-legacy-registry-'));
  await mkdir(path.join(fixtureRoot, 'app'), { recursive: true });
  const existingFile = path.join(fixtureRoot, 'app/existing.tsx');
  const newFile = path.join(fixtureRoot, 'app/new.tsx');
  const contract = {
    id: 'fixture-adapter',
    scan: { roots: ['app'], extensions: ['tsx'], pattern: 'legacy-adapter' },
    allowedReferences: { 'app/existing.tsx': 1 },
  };

  await writeFile(existingFile, 'legacy-adapter\n', 'utf8');
  assert.deepEqual((await auditLegacyContract(fixtureRoot, contract)).errors, []);

  await writeFile(existingFile, 'replacement\n', 'utf8');
  assert.deepEqual((await auditLegacyContract(fixtureRoot, contract)).errors, []);

  await writeFile(existingFile, 'legacy-adapter legacy-adapter\n', 'utf8');
  assert.match((await auditLegacyContract(fixtureRoot, contract)).errors[0], /grew from 1 to 2/);

  await writeFile(existingFile, 'legacy-adapter\n', 'utf8');
  await writeFile(newFile, 'legacy-adapter\n', 'utf8');
  assert.match((await auditLegacyContract(fixtureRoot, contract)).errors[0], /new legacy reference/);
});
