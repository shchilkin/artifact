import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// The core modules stay small enough to read whole: no production file in utils/, types/, or hooks/ over 800
// lines. Split along a module seam instead of raising the limit.

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHECKED_DIRS = ['utils', 'types', 'hooks'];
const MAX_LINES = 800;
const TEST_FILE = /\.(test|spec)\.tsx?$/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !TEST_FILE.test(entry.name) ? [path] : [];
  });
}

describe('core source file size', () => {
  it(`keeps every production file in ${CHECKED_DIRS.join(', ')} at ${MAX_LINES} lines or fewer`, () => {
    const oversized = CHECKED_DIRS.flatMap((dir) => sourceFiles(join(APP_ROOT, dir)))
      .map((path) => ({ file: relative(APP_ROOT, path), lines: readFileSync(path, 'utf8').split('\n').length }))
      .filter(({ lines }) => lines > MAX_LINES);
    expect(oversized).toEqual([]);
  });
});
