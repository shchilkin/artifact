import { expect, type Page, test } from '@playwright/test';

const consoleIssues = new WeakMap<Page, string[]>();
const layeredFillDocument = {
  schemaVersion: 1,
  global: { bg: '#101018', seed: 1, aspect: '1:1' },
  layers: [
    {
      id: 'mobile-bottom-fill',
      name: 'Bottom fill',
      visible: true,
      locked: false,
      kind: 'fill',
      color: '#2255cc',
      opacity: 100,
      blendMode: 'normal',
    },
    {
      id: 'mobile-top-fill',
      name: 'Top fill',
      visible: true,
      locked: false,
      kind: 'fill',
      color: '#dd3322',
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
    if (message.type() === 'error' && /clerk\.accounts\.dev/.test(text) && /Failed to fetch/.test(text)) {
      return;
    }
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

test('mobile layers smoke keeps canvas actions and layer list usable', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(layeredFillDocument))}`);
  await expectLayerCanvasToHavePixels(page);

  await expect(page.getByRole('tab', { name: 'layers' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'nodes' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'export' })).toBeVisible();

  await page.getByText('Top fill', { exact: true }).click();
  await expect(page.locator('.layer-row.bg-accent-dim').filter({ hasText: 'Top fill' })).toBeVisible();

  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    sidebarHeight: document.querySelector('.sidebar')?.getBoundingClientRect().height ?? 0,
    canvasHeight: document.querySelector('.canvas-area')?.getBoundingClientRect().height ?? 0,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.sidebarHeight).toBeGreaterThan(160);
  expect(layout.canvasHeight).toBeGreaterThan(180);
});

test('mobile empty start exposes starter actions without horizontal overflow', async ({ page }) => {
  await page.goto('/app?new=blank');

  const start = page.locator('.empty-canvas-start');
  await expect(start).toBeVisible({ timeout: 15_000 });
  await expect(start.getByRole('button', { name: 'AI', exact: true })).toBeVisible();
  await expect(start.getByRole('button', { name: 'Text', exact: true })).toBeVisible();

  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
});

function isBenignBrowserTestIssue(text: string) {
  return (
    text.includes('downloadable font: download failed') ||
    text.includes('Failed to preconnect to https://fonts.googleapis.com/') ||
    text.includes('Failed to preconnect to https://fonts.gstatic.com/') ||
    text.includes('Failed to load resource: A server with the specified hostname could not be found.') ||
    text.includes('Failed to load resource: net::ERR_NAME_NOT_RESOLVED') ||
    text.includes('Error loading route module `/app/routes/generator.tsx`, reloading page') ||
    text.includes('Importing a module script failed') ||
    text.includes('error loading dynamically imported module: http://127.0.0.1:4173/') ||
    text === 'JSHandle@object'
  );
}

async function expectLayerCanvasToHavePixels(page: Page) {
  const canvas = page.locator('.pixi-container canvas').first();
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(
      async () =>
        canvas.evaluate((element) => {
          const canvas = element as HTMLCanvasElement;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx || canvas.width <= 0 || canvas.height <= 0) return false;
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let maxChannel = 0;
          let alphaTotal = 0;
          let samples = 0;
          for (let y = 0; y < canvas.height; y += Math.max(1, Math.floor(canvas.height / 12))) {
            for (let x = 0; x < canvas.width; x += Math.max(1, Math.floor(canvas.width / 12))) {
              const index = (y * canvas.width + x) * 4;
              maxChannel = Math.max(maxChannel, pixels[index] ?? 0, pixels[index + 1] ?? 0, pixels[index + 2] ?? 0);
              alphaTotal += pixels[index + 3] ?? 0;
              samples += 1;
            }
          }
          return alphaTotal / samples > 4 && maxChannel > 24;
        }),
      { timeout: 15_000 },
    )
    .toBe(true);
}
