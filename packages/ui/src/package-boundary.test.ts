import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const sourceRoot = fileURLToPath(new URL('.', import.meta.url));
const packageRoot = path.dirname(sourceRoot);

function collectProductionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectProductionFiles(entryPath);
    if (!/\.(?:css|ts|tsx)$/.test(entry.name) || entry.name.includes('.test.')) return [];
    return [entryPath];
  });
}

function collectTypeScriptModuleSpecifiers(source: string, filePath: string): string[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const specifiers: string[] = [];

  function visit(node: ts.Node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      specifiers.push(node.moduleReference.expression.text);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

function collectCssModuleSpecifiers(source: string): string[] {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...withoutComments.matchAll(/@import\s+(?:url\(\s*)?(?:['"]([^'"]+)['"]|([^'"\s);]+))/g)].map(
    (match) => match[1] ?? match[2],
  );
}

function collectModuleSpecifiers(source: string, filePath: string): string[] {
  return filePath.endsWith('.css')
    ? collectCssModuleSpecifiers(source)
    : collectTypeScriptModuleSpecifiers(source, filePath);
}

describe('UI Foundation package boundary', () => {
  it('recognizes every supported static module edge without reading comments as imports', () => {
    expect(
      collectTypeScriptModuleSpecifiers(
        `
          import './side-effect';
          import value from './default';
          export { value as other } from './exported';
          const lazy = import('./lazy');
          // import '../../../apps/web/comment-only';
        `,
        'fixture.ts',
      ),
    ).toEqual(['./side-effect', './default', './exported', './lazy']);
    expect(
      collectCssModuleSpecifiers(`
        @import './quoted.css';
        @import url("./url.css");
        /* @import '../../../apps/backoffice/comment-only.css'; */
      `),
    ).toEqual(['./quoted.css', './url.css']);
  });

  it('keeps production imports inside the package or in external mechanics dependencies', () => {
    const violations = collectProductionFiles(sourceRoot).flatMap((filePath) =>
      collectModuleSpecifiers(readFileSync(filePath, 'utf8'), filePath).flatMap((specifier) => {
        if (specifier.startsWith('@artifact/')) {
          return [`${path.relative(packageRoot, filePath)} imports product workspace ${specifier}`];
        }
        if (!specifier.startsWith('.')) return [];

        const resolvedPath = path.resolve(path.dirname(filePath), specifier);
        const relativePath = path.relative(packageRoot, resolvedPath);
        if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) return [];

        return [`${path.relative(packageRoot, filePath)} escapes the package through ${specifier}`];
      }),
    );

    expect(violations).toEqual([]);
  });
});
