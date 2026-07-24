import { expect, type Locator, type Page, test } from '@playwright/test';
import { expectNoBrowserIssues, setupBrowserTestPage } from './helpers';

const specimenStates = {
  'node-canvas': [
    'grid',
    'area',
    'selected-node',
    'output-path',
    'connected-port',
    'alignment-guide',
    'toolbar-default',
    'toolbar-disabled',
    'toolbar-pressed',
    'account-variants',
    'preview-queue-status',
    'performance-overlay',
    'add-drag-idle',
    'add-drag-ready',
    'add-drag-edge',
  ],
  'canvas-preview': ['transparent', 'selected', 'drop-image', 'error', 'recovery'],
  'node-gallery-canvas': ['ready', 'selected', 'keyboard-focus', 'loading', 'failed', 'narrow'],
  'primitive-viewport-3d': ['active', 'locked', 'reset', 'keyboard-focus', 'webgl-unavailable'],
} as const;

interface RgbaColor {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

async function readComputedColor(locator: Locator, property: string, pseudoElement?: string): Promise<RgbaColor> {
  return locator.evaluate(
    (element, { property, pseudoElement }) => {
      const color = getComputedStyle(element, pseudoElement ?? null).getPropertyValue(property);
      return rasterizeCssColor(color);

      function rasterizeCssColor(value: string) {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Canvas 2D is required for color assertions');
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = value;
        context.fillRect(0, 0, 1, 1);
        const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
        return { red, green, blue, alpha: alpha / 255 };
      }
    },
    { property, pseudoElement },
  );
}

async function resolveCssVariableColor(page: Page, variable: `--${string}`): Promise<RgbaColor> {
  return page.evaluate((variable) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${variable})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();

    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas 2D is required for color assertions');
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
    return { red, green, blue, alpha: alpha / 255 };
  }, variable);
}

function contrastRatio(foreground: RgbaColor, background: RgbaColor): number {
  const composited = compositeOver(foreground, background);
  const lighter = Math.max(relativeLuminance(composited), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(composited), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function compositeOver(foreground: RgbaColor, background: RgbaColor): RgbaColor {
  const alpha = foreground.alpha + background.alpha * (1 - foreground.alpha);
  if (alpha === 0) return { red: 0, green: 0, blue: 0, alpha: 0 };
  return {
    red: (foreground.red * foreground.alpha + background.red * background.alpha * (1 - foreground.alpha)) / alpha,
    green: (foreground.green * foreground.alpha + background.green * background.alpha * (1 - foreground.alpha)) / alpha,
    blue: (foreground.blue * foreground.alpha + background.blue * background.alpha * (1 - foreground.alpha)) / alpha,
    alpha,
  };
}

function relativeLuminance({ red, green, blue }: RgbaColor): number {
  const [linearRed, linearGreen, linearBlue] = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linearRed + 0.7152 * linearGreen + 0.0722 * linearBlue;
}

async function expectReadableNonOverlappingControls(specimen: Locator, minimumSize: number) {
  const metrics = await specimen.locator('button').evaluateAll((buttons) =>
    buttons
      .filter((button) => {
        const style = getComputedStyle(button);
        const bounds = button.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && bounds.width > 0 && bounds.height > 0;
      })
      .map((button) => {
        const style = getComputedStyle(button);
        const bounds = button.getBoundingClientRect();
        return {
          label: button.getAttribute('aria-label') ?? button.textContent?.trim() ?? 'button',
          fontSize: Number.parseFloat(style.fontSize),
          left: bounds.left,
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
          width: bounds.width,
          height: bounds.height,
        };
      }),
  );

  for (const control of metrics) {
    expect(control.fontSize, `${control.label} uses readable control text`).toBeGreaterThanOrEqual(10);
    expect(control.width, `${control.label} has a usable target width`).toBeGreaterThanOrEqual(minimumSize);
    expect(control.height, `${control.label} has a usable target height`).toBeGreaterThanOrEqual(minimumSize);
  }

  for (let firstIndex = 0; firstIndex < metrics.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < metrics.length; secondIndex += 1) {
      const first = metrics[firstIndex];
      const second = metrics[secondIndex];
      const overlapWidth = Math.min(first.right, second.right) - Math.max(first.left, second.left);
      const overlapHeight = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
      expect(overlapWidth > 1 && overlapHeight > 1, `${first.label} does not overlap ${second.label}`).toBe(false);
    }
  }
}

test.beforeEach(async ({ page }) => {
  await setupBrowserTestPage(page);
});

test.afterEach(async ({ page }) => {
  expectNoBrowserIssues(page);
});

test('v0.47 style guide exposes deterministic reduced canvas-chrome specimens', async ({ page }) => {
  await page.goto('/docs/style-guide');

  const specimens = page.locator('[data-canvas-chrome-specimen]');
  await expect(specimens).toHaveCount(4);
  await expect(page.getByRole('heading', { name: 'Workspace reference specimens' })).toBeVisible();
  await expect(page.locator('[data-canvas-chrome-inventory-summary]')).toHaveText('8 surfaces · 7 invariants');

  for (const [id, states] of Object.entries(specimenStates)) {
    const specimen = page.locator(`[data-canvas-chrome-specimen="${id}"]`);
    await expect(specimen).toBeVisible();
    const bounds = await specimen.boundingBox();
    expect(bounds?.width ?? 0).toBeGreaterThanOrEqual(280);
    expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(240);
    for (const state of states) {
      await expect(specimen.locator(`[data-canvas-chrome-state="${state}"]`)).toBeVisible();
    }
    expect(
      Number(
        await specimen
          .locator('[data-canvas-chrome-inventory-count]')
          .getAttribute('data-canvas-chrome-inventory-count'),
      ),
    ).toBeGreaterThan(0);
    await expectReadableNonOverlappingControls(specimen, 38);
  }

  const nodeCanvas = page.locator('[data-canvas-chrome-specimen="node-canvas"]');
  const graphCanvas = nodeCanvas.locator('[data-canvas-chrome-role="graph-canvas"]');
  expect(await graphCanvas.evaluate((element) => getComputedStyle(element).backgroundImage)).not.toBe('none');

  const canvasColor = await readComputedColor(graphCanvas, 'background-color');
  expect(canvasColor).toEqual(await resolveCssVariableColor(page, '--editor-canvas-bg'));
  expect(contrastRatio(await resolveCssVariableColor(page, '--editor-grid-dot'), canvasColor)).toBeGreaterThan(1.25);

  const fillSelection = nodeCanvas.locator('[data-canvas-selection-kind="fill"]');
  const textSelection = nodeCanvas.locator('[data-canvas-selection-kind="text"]');
  const fillCategory = await resolveCssVariableColor(page, '--node-kind-fill');
  const textCategory = await resolveCssVariableColor(page, '--node-kind-text');
  expect(await readComputedColor(fillSelection, 'background-color', '::before')).toEqual(fillCategory);
  expect(await readComputedColor(fillSelection, 'outline-color')).toEqual(fillCategory);
  expect(await readComputedColor(textSelection, 'background-color', '::before')).toEqual(textCategory);
  expect(await readComputedColor(textSelection, 'outline-color')).toEqual(textCategory);
  expect(fillCategory).not.toEqual(textCategory);

  const exportNode = nodeCanvas.locator('[data-canvas-node-kind="export"]');
  expect(await readComputedColor(exportNode, 'background-color', '::before')).toEqual(
    await resolveCssVariableColor(page, '--node-kind-export'),
  );

  const outputEdgeColor = await readComputedColor(
    nodeCanvas.locator('[data-canvas-chrome-role="output-edge"]'),
    'stroke',
  );
  const regularEdgeColor = await readComputedColor(
    nodeCanvas.locator('[data-canvas-chrome-role="regular-edge"]'),
    'stroke',
  );
  const outputContrast = contrastRatio(outputEdgeColor, canvasColor);
  const regularContrast = contrastRatio(regularEdgeColor, canvasColor);
  expect(outputEdgeColor).toEqual(await resolveCssVariableColor(page, '--node-edge-output'));
  expect(outputContrast).toBeGreaterThan(4.5);
  expect(regularContrast).toBeGreaterThan(2);
  expect(outputContrast).toBeGreaterThan(regularContrast);

  const galleryViewport = page.getByRole('group', { name: 'Gallery viewport reference' });
  await galleryViewport.focus();
  await expect(galleryViewport).toBeFocused();
  expect(await galleryViewport.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');

  const primitiveViewport = page.getByRole('group', { name: 'Active primitive viewport reference' });
  await primitiveViewport.focus();
  await expect(primitiveViewport).toBeFocused();
  expect(await primitiveViewport.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
  expect(await readComputedColor(primitiveViewport.locator('.canvas-chrome-primitive__glyph'), 'stroke')).toEqual(
    await resolveCssVariableColor(page, '--node-kind-primitive'),
  );

  const gallery = page.locator('[data-canvas-chrome-specimen="node-gallery-canvas"]');
  await expect(gallery.locator('[data-canvas-chrome-state="loading"] i')).toHaveCount(2);
  await expect(
    gallery.locator('[data-canvas-chrome-state="failed"]').getByRole('button', { name: 'Retry' }),
  ).toBeVisible();
  const narrowArtwork = gallery.locator('[data-canvas-chrome-state="narrow"] > div');
  const narrowBounds = await narrowArtwork.boundingBox();
  expect(narrowBounds?.height ?? 0).toBeGreaterThan(narrowBounds?.width ?? Number.POSITIVE_INFINITY);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator('[data-canvas-chrome-specimen]')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  for (const id of Object.keys(specimenStates)) {
    await expectReadableNonOverlappingControls(page.locator(`[data-canvas-chrome-specimen="${id}"]`), 44);
  }
});
