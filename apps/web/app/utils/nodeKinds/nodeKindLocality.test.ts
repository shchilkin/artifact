import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// A graph node kind lives in its own modules plus one line in each registry. Grime shadow is the
// witness: no other app source file may name it, so adding or removing a kind stays a local change.

const APP_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const TEST_FILE = /\.(test|spec)\.tsx?$/;
const SOURCE_FILE = /\.tsx?$/;
const KIND_MENTION = /grime/i;

const ALLOWED_FILES = [
  // Model, renderer, React Flow node, and inspector of the kind.
  'utils/nodeKinds/grimeShadow.ts',
  'utils/render/nodeKinds/grimeShadow.ts',
  'components/node-canvas/nodeKinds/grimeShadow.tsx',
  'components/node-canvas/inspector/GrimeShadowInspector.tsx',
  // One entry per registry.
  'utils/nodeKinds/index.ts',
  'utils/render/nodeKinds/index.ts',
  'components/node-canvas/nodeKinds/index.ts',
  'components/node-canvas/nodeKinds/inspectors.tsx',
  // Frozen schema 5 → 6 migration names the old per-kind array.
  'utils/migrations/v5ToV6.ts',
  // Public node reference copy.
  'routes/docs.nodes.tsx',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'test-fixtures' ? [] : sourceFiles(path);
    return SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name) ? [path] : [];
  });
}

describe('graph node kind locality', () => {
  it('names grime shadow only in its own modules and the registries', () => {
    const mentions = sourceFiles(APP_ROOT)
      .filter((path) => KIND_MENTION.test(readFileSync(path, 'utf8')))
      .map((path) => relative(APP_ROOT, path))
      .sort();
    expect(mentions).toEqual([...ALLOWED_FILES].sort());
  });
});
