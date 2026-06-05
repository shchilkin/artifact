import { expect, type Page } from '@playwright/test';

const consoleIssues = new WeakMap<Page, string[]>();

export async function setupBrowserTestPage(
  page: Page,
  options: { captureNodeDragWarnings?: boolean } = {},
): Promise<void> {
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
    if (
      options.captureNodeDragWarnings &&
      message.type() === 'warning' &&
      text.includes('trying to drag a node that is not initialized')
    ) {
      issues.push(`${message.type()}: ${text}`);
    }
  });
  page.on('pageerror', (error) => {
    if (isBenignBrowserTestIssue(error.message)) return;
    issues.push(`pageerror: ${error.message}`);
  });
}

export function expectNoBrowserIssues(page: Page): void {
  expect(consoleIssues.get(page) ?? []).toEqual([]);
}

export function documentUrl(doc: object): string {
  return `/app?doc=${encodeURIComponent(JSON.stringify(doc))}`;
}

export function editorDocumentFixture(layers: object[]) {
  return {
    schemaVersion: 1,
    global: { bg: '#101018', seed: 1, aspect: '1:1' },
    layers,
    export: { format: 'png', scale: 1, target: 'cover' },
  };
}

export function fillLayerFixture({ id, name, color }: { id: string; name: string; color: string }) {
  return {
    id,
    name,
    visible: true,
    locked: false,
    kind: 'fill',
    color,
    opacity: 100,
    blendMode: 'normal',
  };
}

export function textLayerFixture({ id, name, content }: { id: string; name: string; content: string }) {
  return {
    id,
    name,
    visible: true,
    locked: false,
    kind: 'text',
    content,
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
  };
}

export async function gotoDocument(page: Page, doc: object): Promise<void> {
  await page.goto('/app?new=blank', { waitUntil: 'domcontentloaded' });
  await page.evaluate((serializedDoc) => localStorage.setItem('doc', serializedDoc), JSON.stringify(doc));
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Artifact Cover Editor' })).toBeVisible({ timeout: 15_000 });
}

export async function expectLayerCanvasToHavePixels(page: Page): Promise<void> {
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

export async function expectStoredLayerCount(page: Page, expected: number | { atLeast: number }): Promise<void> {
  const matcher = expect.poll(
    async () =>
      page.evaluate(() => {
        const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
        return doc.layers?.length ?? 0;
      }),
    { timeout: 15_000 },
  );
  if (typeof expected === 'number') await matcher.toBe(expected);
  else await matcher.toBeGreaterThanOrEqual(expected.atLeast);
}

export async function expectStoredImageLayerAssetUri(page: Page): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
          return doc.layers?.find((layer: { kind: string }) => layer.kind === 'image')?.src ?? '';
        }),
      { timeout: 15_000 },
    )
    .toMatch(/^artifact-asset:\/\//);
}

export async function switchToNodeView(page: Page): Promise<void> {
  await expect(async () => {
    if (await page.locator('.node-canvas-root').isVisible()) return;
    const nodesTab = page.getByRole('tab', { name: 'Switch to nodes view' });
    await expect(nodesTab).toBeVisible({ timeout: 2_000 });
    await nodesTab.click();
    await expect(page.locator('.node-canvas-root')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 10_000 });
}

export async function switchToLayerView(page: Page): Promise<void> {
  await expect(async () => {
    const layersTab = page.locator('.floating-view-toggle').getByRole('tab', { name: 'Switch to layers view' });
    await expect(layersTab).toBeVisible({ timeout: 2_000 });
    await layersTab.click();
    await expect(page.locator('.sidebar')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 10_000 });
}

function isBenignBrowserTestIssue(text: string): boolean {
  return (
    text.includes('downloadable font: download failed') ||
    text.includes('Failed to preconnect to https://fonts.googleapis.com/') ||
    text.includes('Failed to preconnect to https://fonts.gstatic.com/') ||
    text.includes('Failed to load resource: A server with the specified hostname could not be found.') ||
    text.includes('Failed to load resource: net::ERR_NAME_NOT_RESOLVED') ||
    text.includes('Outdated Optimize Dep') ||
    text.includes('Error loading route module `/app/routes/generator.tsx`, reloading page') ||
    text.includes('Importing a module script failed') ||
    text.includes('Failed to fetch dynamically imported module: http://127.0.0.1:4173/node_modules/.vite/deps/') ||
    text.includes(
      'Failed to fetch dynamically imported module: http://127.0.0.1:4173/@fs/Users/shchilkin/dev/album-cover-utils/node_modules/@react-router/dev/dist/config/defaults/entry.client.tsx',
    ) ||
    text.includes('Failed to fetch dynamically imported module: http://127.0.0.1:4173/app/routes/generator.tsx') ||
    text.includes('error loading dynamically imported module: http://127.0.0.1:4173/') ||
    text.includes('due to access control checks') ||
    text.includes('NS_BINDING_ABORTED') ||
    text.includes('Cannot update a component (`NodeThumbnail`) while rendering a different component (`PerfMetric`)') ||
    text === 'JSHandle@object'
  );
}
