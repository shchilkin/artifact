import { expect, type Page, test } from '@playwright/test';

const consoleIssues = new WeakMap<Page, string[]>();
const galleryDocument = {
  schemaVersion: 1,
  global: { bg: '#101018', seed: 1, aspect: '1:1' },
  layers: [
    {
      id: 'gallery-fill',
      name: 'Gallery fill',
      visible: true,
      locked: false,
      kind: 'fill',
      color: '#4466aa',
      opacity: 100,
      blendMode: 'normal',
    },
    {
      id: 'gallery-text',
      name: 'Gallery title',
      visible: true,
      locked: false,
      kind: 'text',
      content: 'TYPE',
      font: 'DISPLAY',
      size: 120,
      color: '#f4eadc',
      x: 0.5,
      y: 0.5,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 100,
      blendMode: 'normal',
    },
  ],
  export: { format: 'png', scale: 1, target: 'cover' },
};

test.beforeEach(async ({ page }) => {
  const issues: string[] = [];
  consoleIssues.set(page, issues);

  await page.route('**/api/ai/access', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        authenticated: false,
        enabled: false,
        disabledReason: 'anonymous',
      }),
    });
  });

  page.on('console', (message) => {
    const text = message.text();
    if (isBenignBrowserTestIssue(text)) return;
    if (message.type() === 'error' && /clerk\.accounts\.dev/.test(text) && /Failed to fetch/.test(text)) return;
    if (message.type() === 'error') issues.push(`${message.type()}: ${text}`);
  });
  page.on('pageerror', (error) => {
    if (isBenignBrowserTestIssue(error.message)) return;
    issues.push(`pageerror: ${error.message}`);
  });
});

test.afterEach(async ({ page }) => {
  expect(consoleIssues.get(page) ?? []).toEqual([]);
});

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

  await tiles.first().click();

  await expect(page).toHaveURL(/\/app(?:\?|$)/);
  await expect(page.getByRole('heading', { name: 'Artifact Cover Editor' })).toBeAttached();
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
          return doc.layers?.length ?? 0;
        }),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);
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

test('blank editor and shared primitive surfaces open and close', async ({ page }) => {
  await page.goto('/app?new=blank');
  await expectBlankEditor(page);

  await page.getByRole('button', { name: 'PROJECTS' }).click();
  await expect(page.getByRole('dialog', { name: 'PROJECTS' })).toBeVisible();
  await page.getByRole('button', { name: 'Close projects' }).click();
  await expect(page.getByRole('dialog', { name: 'PROJECTS' })).toHaveCount(0);

  await page.getByRole('button', { name: 'PRESETS' }).click();
  await expect(page.getByRole('dialog', { name: 'PRESETS' })).toBeVisible();
  await page.getByRole('button', { name: 'Close presets' }).click();
  await expect(page.getByRole('dialog', { name: 'PRESETS' })).toHaveCount(0);

  await switchToNodeView(page);
  await page.getByRole('button', { name: 'Add node' }).click();
  await expect(page.locator('.add-library-node-menu')).toBeVisible();
  await expect(page.getByLabel('Search nodes and effects')).toBeVisible();
  await expect(page.locator('.add-library-node-menu .artifact-search-field')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.add-library-node-menu')).toHaveCount(0);

  await switchToLayerView(page);
  await expect(page.locator('.sidebar')).toBeVisible();
});

test('node gallery dialog opens with an accessible title', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(galleryDocument))}`);

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

function isBenignBrowserTestIssue(text: string) {
  return (
    text.includes('downloadable font: download failed') ||
    text.includes('Failed to preconnect to https://fonts.googleapis.com/') ||
    text.includes('Failed to preconnect to https://fonts.gstatic.com/') ||
    text.includes('Failed to load resource: A server with the specified hostname could not be found.') ||
    text.includes('Failed to load resource: net::ERR_NAME_NOT_RESOLVED') ||
    text.includes('Outdated Optimize Dep') ||
    text.includes('Error loading route module `/app/routes/generator.tsx`, reloading page') ||
    text.includes('Importing a module script failed') ||
    text.includes('Failed to fetch dynamically imported module: http://127.0.0.1:4173/app/routes/generator.tsx') ||
    text.includes('error loading dynamically imported module: http://127.0.0.1:4173/') ||
    text.includes('due to access control checks') ||
    text.includes('NS_BINDING_ABORTED') ||
    text === 'JSHandle@object'
  );
}

async function expectBlankEditor(page: Page) {
  await expect(page.getByRole('heading', { name: 'Artifact Cover Editor' })).toBeAttached();
  await expect(page.locator('.empty-canvas-start')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.sidebar .layer-row')).toHaveCount(0);
}

async function switchToNodeView(page: Page) {
  await expect(async () => {
    if (await page.locator('.node-canvas-root').isVisible()) return;
    const nodesTab = page.getByRole('tab', { name: 'Switch to nodes view' });
    await expect(nodesTab).toBeVisible({ timeout: 2_000 });
    await nodesTab.click();
    await expect(page.locator('.node-canvas-root')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 10_000 });
}

async function switchToLayerView(page: Page) {
  await expect(async () => {
    const layersTab = page.locator('.floating-view-toggle').getByRole('tab', { name: 'Switch to layers view' });
    await expect(layersTab).toBeVisible({ timeout: 2_000 });
    await layersTab.click();
    await expect(page.locator('.sidebar')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 10_000 });
}
