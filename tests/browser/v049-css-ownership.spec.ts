import { expect, type Page, test } from '@playwright/test';

import {
  editorDocumentFixture,
  expectNoBrowserIssues,
  fillLayerFixture,
  gotoDocument,
  setupBrowserTestPage,
  switchToNodeView,
} from './helpers';

// CSS ownership is a property of the production build: development injects one
// <style> per module in import order, so these checks only run against
// `vite preview` (PLAYWRIGHT_WEB_SERVER_MODE=preview, see scripts/run-browser-release.mjs).
test.skip(
  process.env.PLAYWRIGHT_WEB_SERVER_MODE !== 'preview',
  'CSS ownership is checked against the production build.',
);

test.beforeEach(async ({ page }) => setupBrowserTestPage(page));
test.afterEach(async ({ page }) => expectNoBrowserIssues(page));

// Selectors owned by the editor shell, layers panel, inspector, node canvas, and 3D chrome.
const EDITOR_OWNED_SELECTOR =
  /\.(editor-layout|sidebar|bottom-bar|layer-row|add-library|artifact-inspector|node-field|node-canvas|react-flow|artifact-viewport3d)\b/;

type StyleSheetSummary = { href: string; selectors: string[] };

async function readStyleSheets(page: Page): Promise<StyleSheetSummary[]> {
  return page.evaluate(() => {
    const collect = (rules: CSSRuleList): string[] =>
      Array.from(rules).flatMap((rule) => {
        if (rule instanceof CSSStyleRule) return [rule.selectorText];
        if ('cssRules' in rule) return collect((rule as CSSGroupingRule).cssRules);
        return [];
      });
    return Array.from(document.styleSheets).flatMap((sheet) => {
      if (sheet.href && new URL(sheet.href).origin !== location.origin) return [];
      return [{ href: sheet.href ?? 'inline', selectors: collect(sheet.cssRules) }];
    });
  });
}

function sheetIndex(sheets: StyleSheetSummary[], selector: RegExp): number {
  return sheets.findIndex((sheet) => sheet.selectors.some((text) => selector.test(text)));
}

for (const path of ['/', '/docs', '/docs/nodes', '/reset-password', '/showcase', '/projects']) {
  test(`${path} loads no editor, inspector, node-canvas, or 3D styles`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('navigation', { name: 'Site navigation' })).toBeVisible();
    await page.waitForLoadState('networkidle');

    const sheets = await readStyleSheets(page);
    expect(sheetIndex(sheets, /\.site-nav\b/)).toBeGreaterThanOrEqual(0);
    const leaked = sheets.flatMap((sheet) => sheet.selectors.filter((text) => EDITOR_OWNED_SELECTOR.test(text)));
    expect(leaked).toEqual([]);
  });
}

test('docs surface styles load ahead of shared component styles', async ({ page }) => {
  await page.goto('/docs/nodes');
  await expect(page.getByRole('navigation', { name: 'Site navigation' })).toBeVisible();

  const sheets = await readStyleSheets(page);
  const global = sheetIndex(sheets, /\.site-nav\b/);
  const docs = sheetIndex(sheets, /\.docs-search-panel\b/);
  const primitives = sheetIndex(sheets, /^\.artifact-search-field$/);
  expect(global).toBeGreaterThanOrEqual(0);
  expect(docs).toBeGreaterThan(global);
  expect(primitives).toBeGreaterThan(docs);
});

test('editor surface styles load with the editor and node-canvas styles wait for Nodes', async ({ page }) => {
  await gotoDocument(page, editorDocumentFixture([fillLayerFixture({ id: 'base', name: 'Base', color: '#443366' })]));

  let sheets = await readStyleSheets(page);
  const global = sheetIndex(sheets, /\.site-nav\b/);
  const layers = sheetIndex(sheets, /\.layer-row\b/);
  const primitives = sheetIndex(sheets, /^\.artifact-toolbar-button$/);
  expect(layers).toBeGreaterThan(global);
  expect(sheetIndex(sheets, /\.artifact-inspector-section\b/)).toBeGreaterThan(global);
  expect(primitives).toBeGreaterThan(layers);
  expect(sheetIndex(sheets, /\.react-flow\b/)).toBe(-1);
  await expect(page.locator('.layer-row').first()).toBeVisible();

  await switchToNodeView(page);
  sheets = await readStyleSheets(page);
  expect(sheetIndex(sheets, /\.react-flow\b/)).toBeGreaterThan(layers);
});

test('style guide specimens receive their owning surface styles', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto('/docs/style-guide');
  const layerRow = page.locator('.layer-row').first();
  await expect(layerRow).toBeVisible({ timeout: 20_000 });

  const sheets = await readStyleSheets(page);
  expect(sheetIndex(sheets, /\.docs-page\b/)).toBeGreaterThanOrEqual(0);
  expect(sheetIndex(sheets, /\.artifact-inspector-section\b/)).toBeGreaterThanOrEqual(0);
  expect(sheetIndex(sheets, /\.react-flow\b/)).toBeGreaterThanOrEqual(0);
  expect(await layerRow.evaluate((row) => getComputedStyle(row).getPropertyValue('--layer-row-color'))).not.toBe('');
  await expect(page.locator('.add-library-surface').first()).toBeVisible();
});
