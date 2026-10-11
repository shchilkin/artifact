import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Enforces the copy rules in docs/style-guide.md ("Content Style"): string literals and
// JSX text in app UI code must not carry release version references ("v0.28"),
// must use the typographic "…" instead of "...", and in-progress status words
// ("Loading", "Saving", …) must end their phrase with "…".
// Comments are not scanned because the TypeScript AST drops them.

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCANNED_DIRS = ['components', 'routes', 'utils', 'hooks', 'features'];
const SCANNED_FILES = ['root.tsx'];
const TEST_FILE = /\.(test|spec)\.tsx?$/;
const VERSION_REFERENCE = /\bv\d+\.\d/i;
const THREE_DOTS = '...';
const LOADING_PHRASE = /^(Loading|Saving|Exporting|Creating|Generating|Preparing|Working|Opening)\b/;

type CopyRule = 'version' | 'three-dots' | 'loading-ellipsis';

interface CopyViolation {
  file: string;
  line: number;
  rule: CopyRule;
  text: string;
}

// Known exceptions. Each entry must name the exact file, rule, and literal text
// and say why it is allowed or who owns the fix. Every entry must still match a
// finding, so remove it once the string is gone.
const ALLOWLIST: ReadonlyArray<{ file: string; rule: CopyRule; text: string; reason: string }> = [
  {
    file: 'components/ProjectsPanel.tsx',
    rule: 'three-dots',
    text: 'Name this project...',
    reason: 'Projects sheet copy is rewritten in #445; remove this entry when that lands.',
  },
  {
    file: 'utils/randomConfig.ts',
    rule: 'version',
    text: 'V0.29',
    reason: 'Artwork text drawn on the canvas by random documents, not UI copy.',
  },
  {
    file: 'utils/starterDocuments.ts',
    rule: 'version',
    text: 'V0.20',
    reason: 'Artwork text content of a starter document, not UI copy.',
  },
  {
    file: 'components/canvas-chrome/canvasChromeInventory.ts',
    rule: 'loading-ellipsis',
    text: 'Loading',
    reason: 'Name of a documented component state, not progress copy.',
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

// A complete phrase: a plain string, or JSX text that is its element's only child.
// Template chunks and JSX text mixed with expressions are fragments of a phrase.
function isCompletePhrase(node: ts.Node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return true;
  return ts.isJsxText(node) && ts.isJsxElement(node.parent) && node.parent.children.length === 1;
}

function enclosingJsxAttributeName(node: ts.Node): string | null {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isJsxAttribute(current)) return current.name.getText();
    if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current) || ts.isBlock(current)) return null;
  }
  return null;
}

function isConsoleArgument(node: ts.Node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isCallExpression(current)) {
      const callee = current.expression;
      return ts.isPropertyAccessExpression(callee) && callee.expression.getText() === 'console';
    }
    if (ts.isBlock(current)) return false;
  }
  return false;
}

function copyRulesBroken(text: string, node?: ts.Node): CopyRule[] {
  const trimmed = text.trim();
  const rules: CopyRule[] = [];
  if (VERSION_REFERENCE.test(trimmed) && !trimmed.includes('://')) rules.push('version');
  if (trimmed.includes(THREE_DOTS)) rules.push('three-dots');
  const visible = !node || (isCompletePhrase(node) && !enclosingJsxAttributeName(node)?.startsWith('aria-'));
  if (visible && LOADING_PHRASE.test(trimmed) && !trimmed.includes('…') && !trimmed.endsWith('.')) {
    rules.push('loading-ellipsis');
  }
  return rules;
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
    if (text !== null && !isConsoleArgument(node)) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      for (const rule of copyRulesBroken(text, node)) violations.push({ file, line, rule, text: text.trim() });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return violations;
}

function matchesEntry(violation: CopyViolation, entry: (typeof ALLOWLIST)[number]) {
  return entry.file === violation.file && entry.rule === violation.rule && entry.text === violation.text;
}

const findings = [
  ...SCANNED_DIRS.flatMap((dir) => listSourceFiles(join(APP_ROOT, dir))),
  ...SCANNED_FILES.map((file) => join(APP_ROOT, file)),
].flatMap(findCopyViolations);

describe('user-facing copy boundary', () => {
  it('keeps version references, "..." and bare loading words out of UI strings', () => {
    const violations = findings
      .filter((violation) => !ALLOWLIST.some((entry) => matchesEntry(violation, entry)))
      .map(({ file, line, rule, text }) => `${file}:${line} [${rule}] ${JSON.stringify(text)}`);

    expect(violations).toEqual([]);
  });

  it('keeps every allowlist entry tied to a current finding', () => {
    const stale = ALLOWLIST.filter((entry) => !findings.some((violation) => matchesEntry(violation, entry))).map(
      ({ file, rule, text }) => `${file} [${rule}] ${JSON.stringify(text)}`,
    );

    expect(stale).toEqual([]);
  });

  it.each([
    ['Search…', []],
    ['Search...', ['three-dots']],
    ['reserved in v0.28', ['version']],
    ['Release V1.2', ['version']],
    ['https://cdn.example.com/pkg@v1.2/index.js', []],
    ['Version 1.0', []],
    ['Loading', ['loading-ellipsis']],
    ['Exporting image…', []],
    ['Preparing previews… · 2', []],
    ['Creating a local version from the prompt.', []],
  ] as const)('classifies %j', (text, rules) => {
    expect(copyRulesBroken(text)).toEqual(rules);
  });
});
