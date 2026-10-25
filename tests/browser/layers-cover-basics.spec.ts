import { expect, type Page, test } from '@playwright/test';

import {
  editorDocumentFixture,
  expectStoredLayerField,
  fillLayerFixture,
  gotoDocument,
  registerBrowserTestHooks,
  textLayerFixture,
} from './helpers';

// Toolset Consolidation acceptance: brightness/contrast, drop shadow, gradient fill and text tracking are reachable
// from Layers without opening Nodes.

const coverDocument = editorDocumentFixture([
  fillLayerFixture({ id: 'basics-fill', name: 'Backdrop', color: '#2255cc' }),
  textLayerFixture({ id: 'basics-title', name: 'Title', content: 'COVER' }),
]);

registerBrowserTestHooks(test);

const inspector = (page: Page) => page.getByRole('complementary', { name: 'Layer settings' });

async function addFromLibrary(page: Page, query: string, label: string) {
  await page.locator('.layer-panel-header').getByRole('button', { name: 'Add layer' }).click();
  await page.getByLabel('Search layers and effects').fill(query);
  await page
    .locator('.add-library-layer-menu .add-library-row')
    .filter({ has: page.locator('.add-library-row-label', { hasText: new RegExp(`^${label}$`) }) })
    .first()
    .click();
  await expect(page.locator('.layer-row').filter({ hasText: label })).toHaveCount(1, { timeout: 15_000 });
}

test('cover basics are reachable from Layers alone', async ({ page }) => {
  await gotoDocument(page, coverDocument);

  await addFromLibrary(page, 'brightness', 'Adjust');
  await expect(inspector(page).getByRole('slider', { name: 'Brightness', exact: true })).toBeVisible();
  await expect(inspector(page).getByRole('slider', { name: 'Contrast', exact: true })).toBeVisible();

  await addFromLibrary(page, 'drop shadow', 'Shadow');
  await expect(inspector(page).getByRole('slider', { name: 'Offset X', exact: true })).toBeVisible();

  await page.locator('.layer-row[data-layer-id="basics-fill"] .layer-row-name-button').click();
  await inspector(page).getByRole('combobox', { name: 'Style', exact: true }).selectOption('linear');
  await expectStoredLayerField(page, { key: 'id', value: 'basics-fill' }, 'fillMode', 'linear');

  await page.locator('.layer-row[data-layer-id="basics-title"] .layer-row-name-button').click();
  await inspector(page).getByRole('button', { name: 'Type', exact: true }).click();
  await expect(inspector(page).getByRole('slider', { name: 'Tracking', exact: true })).toBeVisible();

  // Everything above happened in Layers.
  await expect(page.locator('.react-flow')).toHaveCount(0);
});
