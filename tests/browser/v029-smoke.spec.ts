import { expect, type Page, test } from '@playwright/test';
import {
  clickEditorControl,
  documentUrl,
  editorDocumentFixture,
  expectNoBrowserIssues,
  expectStoredLayerCount,
  fillLayerFixture,
  setupBrowserTestPage,
  switchToLayerView,
  switchToNodeView,
  textLayerFixture,
} from './helpers';

const galleryDocument = editorDocumentFixture([
  fillLayerFixture({ id: 'gallery-fill', name: 'Gallery fill', color: '#4466aa' }),
  textLayerFixture({ id: 'gallery-text', name: 'Gallery title', content: 'TYPE' }),
]);

test.beforeEach(async ({ page }) => setupBrowserTestPage(page));
test.afterEach(async ({ page }) => expectNoBrowserIssues(page));

test('public nav Open editor CTA starts a blank editor', async ({ page }) => {
  await page.goto('/showcase');

  await page.getByRole('navigation', { name: 'Site navigation' }).getByRole('link', { name: 'Open editor' }).click();

  await expect(page).toHaveURL(/\/app(?:\?new=blank)?$/);
  await expectBlankEditor(page);
});

test('showcase loads the project wall and opens a tile in the editor', async ({ page }) => {
  await page.goto('/showcase');

  await expect(page.getByRole('heading', { name: 'Made in Artifact.' })).toBeVisible();
  const wall = page.getByRole('region', { name: 'Made in Artifact project wall' });
  await expect(wall).toBeVisible();

  const tiles = wall.getByRole('button', { name: /Open .+ in editor/ });
  await expect.poll(async () => tiles.count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(4);

  await tiles.first().scrollIntoViewIfNeeded();
  await tiles.first().click();
  await expect(page).toHaveURL(/\/app(?:\?|$)/, { timeout: 10_000 });

  await expect(page.getByRole('heading', { name: 'Artifact Cover Editor' })).toBeAttached();
  await expectStoredLayerCount(page, { atLeast: 1 });
});

test('docs index links to the main docs paths', async ({ page }) => {
  await page.goto('/docs');

  await expect(page.getByRole('heading', { name: 'Docs.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Choose a docs path.' })).toBeVisible();
  const startPoints = page.locator('.docs-start-point');
  await expect(startPoints).toHaveCount(3);
  await expect(page.locator('.docs-start-point[href="/docs/nodes"]')).toBeVisible();
  await expect(page.locator('.docs-start-point[href="/docs/style-guide"]')).toBeVisible();
  await expect(page.locator('.docs-start-point[href="/app?new=blank"]')).toBeVisible();
});

test('docs research page supports search and type filtering', async ({ page }) => {
  await page.goto('/docs/nodes');

  await expect(page.getByRole('heading', { name: 'Artifact Docs.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Find an answer or start here.' })).toBeVisible();
  await expect(page.locator('.docs-start-point')).toHaveCount(3);
  await expect(page.getByRole('navigation', { name: 'Docs sections' }).locator('a')).toHaveCount(4);
  await expect(page.getByRole('heading', { name: 'Four paths.' })).toBeVisible();
  await expect(page.locator('.docs-workflow-guide')).toHaveCount(4);

  await page.getByPlaceholder('Search effects, export, fonts, nodes...').fill('noise');
  await expect(page.locator('.docs-search-result')).toHaveCount(8);

  await page.getByText('Filter results by type').click();
  await page.getByRole('button', { name: 'Effects' }).click();
  await expect(page.locator('.docs-type-filter__item--active')).toHaveText('Effects');
  await expect(page.locator('.docs-search-result')).toHaveCount(2);
  await expect(page.locator('.docs-node-feed .docs-poster')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Tune preview' }).first()).toBeVisible();
});

test('blank editor and shared primitive project surfaces open and close', async ({ page }) => {
  await page.goto('/app?new=blank');
  await expectBlankEditor(page);

  await page.getByRole('button', { name: 'PROJECTS' }).click();
  await expect(page.getByRole('dialog', { name: 'PROJECTS' })).toBeVisible();
  await page.getByRole('button', { name: 'Close projects' }).click();
  await expect(page.getByRole('dialog', { name: 'PROJECTS' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'PRESETS' })).toHaveCount(0);

  await switchToNodeView(page);
  await clickEditorControl(page.getByRole('button', { name: 'Add node' }));
  await expect(page.locator('.add-library-node-menu')).toBeVisible();
  await expect(page.getByLabel('Search nodes and effects')).toBeVisible();
  await expect(page.locator('.add-library-node-menu .artifact-search-field')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.add-library-node-menu')).toHaveCount(0);

  await switchToLayerView(page);
  await expect(page.locator('.sidebar')).toBeVisible();
});

test('node gallery dialog opens with an accessible title', async ({ page }) => {
  await page.goto(documentUrl(galleryDocument));

  await switchToNodeView(page);
  await expect(page.locator('.node-preview-open')).toHaveCount(1, { timeout: 15_000 });
  await page.locator('.node-preview-surface').first().hover();
  await page.locator('.node-preview-open').first().click({ force: true });

  const dialog = page.getByRole('dialog', { name: 'Gallery title' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('text preview')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

async function expectBlankEditor(page: Page) {
  await expect(page.getByRole('heading', { name: 'Artifact Cover Editor' })).toBeAttached();
  await expect(page.locator('.empty-canvas-start')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.sidebar .layer-row')).toHaveCount(0);
}
