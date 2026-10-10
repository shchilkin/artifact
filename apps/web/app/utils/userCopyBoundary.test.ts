import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Guards the user-facing copy boundary (CLAUDE.md, docs/style-guide.md):
// string literals and JSX text in app UI code must not carry release version
// references ("v0.28") or a three-dot "..." instead of the typographic "…".
// Comments are not scanned because the TypeScript AST drops them.

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCANNED_DIRS = ['components', 'routes', 'utils'];
const TEST_FILE = /\.(test|spec)\.tsx?$/;
const VERSION_REFERENCE = /\bv0\.\d/;
const THREE_DOTS = '...';

interface CopyViolation {
  file: string;
  line: number;
  text: string;
}

// Known exceptions. Each entry must name the exact file and literal text and
// say why it is allowed or who owns the fix. Keep this list short.
const ALLOWLIST: ReadonlyArray<{ file: string; text: string; reason: string }> = [
  {
    file: 'components/ProjectsPanel.tsx',
    text: 'Name this project...',
    reason: 'Projects sheet copy is rewritten in #445; remove this entry when that lands.',
  },
];

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !TEST_FILE.test(entry.name) ? [path] : [];
  });
}

function literalText(node: ts.Node): string | null {
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node) ||
    ts.isJsxText(node)
  ) {
    return node.text;
  }
  return null;
}

function findCopyViolations(path: string): CopyViolation[] {
  const file = relative(APP_ROOT, path).split('\\').join('/');
  const source = ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const violations: CopyViolation[] = [];
  const visit = (node: ts.Node) => {
    const text = literalText(node);
    if (text !== null && breaksCopyBoundary(text)) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      violations.push({ file, line, text: text.trim() });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return violations;
}

function breaksCopyBoundary(text: string) {
  return VERSION_REFERENCE.test(text) || text.includes(THREE_DOTS);
}

function isAllowed(violation: CopyViolation) {
  return ALLOWLIST.some((entry) => entry.file === violation.file && entry.text === violation.text);
}

describe('user-facing copy boundary', () => {
  it('keeps version references and "..." out of UI strings', () => {
    const violations = SCANNED_DIRS.flatMap((dir) => listSourceFiles(join(APP_ROOT, dir)))
      .flatMap(findCopyViolations)
      .filter((violation) => !isAllowed(violation))
      .map(({ file, line, text }) => `${file}:${line} ${JSON.stringify(text)}`);

    expect(violations).toEqual([]);
  });

  it('flags version references and three dots but not the typographic ellipsis', () => {
    const sample = ['Search…', 'Search...', 'reserved in v0.28', 'Version 1.0'];
    expect(sample.map(breaksCopyBoundary)).toEqual([false, true, true, false]);
  });
});
