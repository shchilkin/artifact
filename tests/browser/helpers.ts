import { expect, type Locator, type Page } from '@playwright/test';

const consoleIssues = new WeakMap<Page, string[]>();

export async function setupBrowserTestPage(
  page: Page,
  options: {
    captureNodeDragWarnings?: boolean;
    ignoreExpectedHttp400?: boolean;
    ignoreExpectedHttp404?: boolean;
  } = {},
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
    if (options.ignoreExpectedHttp400 && /Failed to load resource:.*status of 400/.test(text)) return;
    if (options.ignoreExpectedHttp404 && /Failed to load resource:.*status of 404/.test(text)) return;
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

export async function pressForwardTab(page: Page): Promise<void> {
  const shortcut = page.context().browser()?.browserType().name() === 'webkit' ? 'Alt+Tab' : 'Tab';
  await page.keyboard.press(shortcut);
}

export async function supportsWebGl(page: Page): Promise<boolean> {
  return page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl')));
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
  await gotoReadyEditor(page, documentUrl(doc));
}

async function gotoEditor(page: Page, url: string): Promise<void> {
  await expect(async () => {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  }).toPass({ timeout: 45_000 });
}

async function gotoReadyEditor(page: Page, url: string): Promise<void> {
  await expect(async () => {
    await gotoEditor(page, url);
    await expect(page.getByRole('heading', { name: 'Artifact Cover Editor' })).toBeVisible({ timeout: 15_000 });
  }).toPass({ timeout: 60_000 });
}

export async function expectLayerCanvasToHavePixels(page: Page): Promise<void> {
  const canvas = page.locator('.pixi-container canvas').first();
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => canvas.evaluate(canvasHasVisiblePixels), { timeout: 15_000 }).toBe(true);
}

function canvasHasVisiblePixels(element: Element): boolean {
  const canvas = element as HTMLCanvasElement;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || canvas.width <= 0 || canvas.height <= 0) return false;
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let maxChannel = 0;
  let visibleSamples = 0;
  const pixelStride = Math.max(4, Math.floor(pixels.length / (4 * 4096)) * 4);
  for (let index = 0; index < pixels.length; index += pixelStride) {
    const alpha = pixels[index + 3];
    const channel = Math.max(pixels[index], pixels[index + 1], pixels[index + 2]);
    maxChannel = Math.max(maxChannel, channel);
    if (alpha > 8 && channel > 24) visibleSamples += 1;
  }
  return visibleSamples > 0 && maxChannel > 24;
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
    await expect(nodesTab).toBeVisible({ timeout: 5_000 });
    await nodesTab.click();
    await expect(page.locator('.node-canvas-root')).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 20_000 });
}

export async function switchToLayerView(page: Page): Promise<void> {
  await expect(async () => {
    const layersTab = page.getByRole('tab', { name: 'Switch to layers view' });
    await expect(layersTab).toBeVisible({ timeout: 5_000 });
    await layersTab.click();
    await expect(page.locator('.sidebar')).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 20_000 });
}

export async function clickEditorControl(control: Locator): Promise<void> {
  await expect(control).toBeVisible({ timeout: 15_000 });
  await expect(control).toBeEnabled({ timeout: 15_000 });
  await control.evaluate((element) => (element as HTMLElement).click());
}

const BENIGN_BROWSER_TEST_SUBSTRINGS = [
  'downloadable font: download failed',
  'Failed to preconnect to https://fonts.googleapis.com/',
  'Failed to preconnect to https://fonts.gstatic.com/',
  'Failed to load resource: A server with the specified hostname could not be found.',
  'Failed to load resource: net::ERR_NAME_NOT_RESOLVED',
  'Outdated Optimize Dep',
  'Error loading route module `/app/routes/editor.tsx`, reloading page',
  'Importing a module script failed',
  'Failed to fetch dynamically imported module: http://127.0.0.1:4173/node_modules/.vite/deps/',
  'Failed to fetch dynamically imported module: http://127.0.0.1:4173/@fs/Users/shchilkin/dev/album-cover-utils/node_modules/@react-router/dev/dist/config/defaults/entry.client.tsx',
  'Failed to fetch dynamically imported module: http://127.0.0.1:4173/app/routes/editor.tsx',
  'error loading dynamically imported module: http://127.0.0.1:4173/',
  'due to access control checks',
  'NS_BINDING_ABORTED',
  'Error loading route module `/app/routes/showcase.tsx`, reloading page',
  'Cannot update a component (`NodeThumbnail`) while rendering a different component (`PerfMetric`)',
  'ResizeObserver loop completed with undelivered notifications',
  "WebGL: INVALID_OPERATION: texImage3D: FLIP_Y or PREMULTIPLY_ALPHA isn't allowed for uploading 3D textures",
];

const BENIGN_BROWSER_TEST_MESSAGES = new Set(['JSHandle@object']);

function isBenignBrowserTestIssue(text: string): boolean {
  return (
    BENIGN_BROWSER_TEST_MESSAGES.has(text) ||
    BENIGN_BROWSER_TEST_SUBSTRINGS.some((substring) => text.includes(substring))
  );
}
