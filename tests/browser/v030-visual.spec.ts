import { expect, type Locator, type Page, test } from '@playwright/test';
import {
  expectLayerCanvasToHavePixels,
  expectNoBrowserIssues,
  gotoDocument,
  setupBrowserTestPage,
  switchToLayerView,
  switchToNodeView,
} from './helpers';

const blankEditorDocument = {
  schemaVersion: 1,
  global: { bg: '#101018', seed: 30, aspect: '1:1' },
  layers: [],
  export: { format: 'png', scale: 1, target: 'cover' },
};

const layerStateDocument = {
  schemaVersion: 1,
  global: { bg: '#101018', seed: 31, aspect: '1:1' },
  layers: [
    {
      id: 'v030-backdrop',
      name: 'Backdrop',
      visible: true,
      locked: false,
      kind: 'fill',
      color: '#254fbd',
      opacity: 100,
      blendMode: 'normal',
    },
    {
      id: 'v030-hidden-wash',
      name: 'Hidden wash',
      visible: false,
      locked: false,
      kind: 'fill',
      color: '#ffcc55',
      opacity: 100,
      blendMode: 'normal',
    },
    {
      id: 'v030-locked-ink',
      name: 'Locked ink',
      visible: true,
      locked: true,
      kind: 'fill',
      color: '#d94830',
      opacity: 100,
      blendMode: 'normal',
    },
  ],
  export: { format: 'png', scale: 1, target: 'cover' },
};

const graphStateDocument = {
  schemaVersion: 1,
  global: { bg: '#101018', seed: 32, aspect: '1:1' },
  layers: [
    {
      id: 'v030-graph-base',
      name: 'Graph base',
      visible: true,
      locked: false,
      kind: 'fill',
      color: '#2e6bd9',
      opacity: 100,
      blendMode: 'normal',
    },
    {
      id: 'v030-graph-orphan',
      name: 'Graph orphan',
      visible: true,
      locked: false,
      kind: 'fill',
      color: '#5b1238',
      opacity: 100,
      blendMode: 'normal',
    },
  ],
  graph: {
    edges: [
      {
        id: 'e-v030-base-export',
        fromId: 'v030-graph-base',
        fromPort: 'out',
        toId: '__export__',
        toPort: 'in',
      },
    ],
    positions: {
      'v030-graph-base': { x: 0, y: 80 },
      'v030-graph-orphan': { x: 0, y: 420 },
      __export__: { x: 520, y: 80 },
    },
    mergeNodes: [],
    colorNodes: [],
    areas: [{ id: 'v030-area', name: 'Output study', color: '#ff705f', nodeIds: ['v030-graph-base'] }],
  },
  export: { format: 'png', scale: 1, target: 'cover' },
};

test.beforeEach(async ({ page }) => {
  await setupBrowserTestPage(page);
});

test.afterEach(async ({ page }) => {
  expectNoBrowserIssues(page);
});

test('v0.30 blank editor keeps the empty start and layer shell visually readable', async ({ page }) => {
  await gotoDocument(page, blankEditorDocument);

  await expect(page.getByRole('heading', { name: 'Artifact Cover Editor' })).toBeAttached();
  await expect(page.locator('.empty-canvas-start')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('.sidebar .layer-row')).toHaveCount(0);
  await expect(page.locator('.editor-chrome-status')).toHaveCount(0);
  await expect(page.locator('.canvas-aspect-controls')).toHaveCount(0);
  await expect(page.getByText('Local draft')).toHaveCount(0);

  await assertReadableBox(page.locator('.empty-canvas-start'), { minWidth: 240, minHeight: 140 });
  await assertReadableBox(page.locator('.sidebar'), { minWidth: 250, minHeight: 420 });

  await page.getByRole('button', { name: /change canvas aspect ratio/i }).click();
  await page.getByRole('menuitem', { name: /4:5.*Portrait/i }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
        return doc.global?.aspect;
      }),
    )
    .toBe('4:5');

  const menu = await openLayerAddLibraryMenu(page);
  await expect(page.getByLabel('Search layers and effects')).toBeVisible();
  await assertAddLibraryReadability(menu);
});

test('medium desktop editor keeps bottom actions inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 760 });
  await gotoDocument(page, layerStateDocument);
  await expectLayerCanvasToHavePixels(page);

  const bottomBar = page.locator('.main > .bottom-bar');
  await expect(bottomBar).toBeVisible();
  await expect(bottomBar.getByRole('button', { name: /more editor actions/i })).toBeVisible();
  await expect(bottomBar.getByRole('button', { name: /projects/i })).toBeVisible();
  await expect(bottomBar.getByRole('button', { name: /export/i })).toBeVisible();
  await bottomBar.getByRole('button', { name: /more editor actions/i }).click();
  const moreMenu = page.locator('.artifact-dropdown-menu-content');
  await expect(moreMenu.getByRole('menuitem', { name: 'Open document' })).toBeVisible();
  await expect(moreMenu.getByRole('menuitem', { name: 'Copy editor link' })).toBeVisible();

  const layout = {
    ...(await readViewportMetrics(page)),
    bar: await readElementRect(bottomBar),
    buttons: await readVisibleButtonRects(bottomBar.locator('button')),
    menu: await readElementRect(moreMenu),
  };
  await page.keyboard.press('Escape');

  expectEditorBottomActionsInsideViewport(layout);
});

test('wide desktop editor keeps overflow-only actions collapsed', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoDocument(page, layerStateDocument);
  await expectLayerCanvasToHavePixels(page);

  const bottomBar = page.locator('.main > .bottom-bar');
  await expect(bottomBar.getByRole('button', { name: /open document file/i })).toBeVisible();
  await expect(bottomBar.getByRole('button', { name: /share link or download editable files/i })).toBeVisible();
  await expect(bottomBar.getByRole('button', { name: /more editor actions/i })).toBeHidden();
});

test('medium desktop node bottom rail stays single-row and intentional', async ({ page }) => {
  const bottomBar = await openGraphNodeBottomBar(page, { width: 1117, height: 775 });
  await expect(bottomBar.getByRole('button', { name: /projects/i })).toBeVisible();
  await expect(bottomBar.getByRole('button', { name: /export/i })).toBeVisible();

  const layout = await readNodeBottomRailLayout(page);

  expectSingleRowNodeBottomRail(layout);
});

test('narrow node bottom rail wraps into viewport-safe command rows', async ({ page }) => {
  const bottomBar = await openGraphNodeBottomBar(page, { width: 566, height: 775 });
  await expect(bottomBar.getByRole('button', { name: /open document file/i })).toBeHidden();
  await expect(bottomBar.getByRole('button', { name: /share link or download editable files/i })).toBeHidden();

  expectNarrowNodeBottomRail(await readNodeBottomRailLayoutWithControls(page));
});

test('v0.30 style guide exposes reusable primitives and editor states', async ({ page }) => {
  await page.goto('/docs/style-guide');

  const siteNavigation = page.getByRole('navigation', { name: 'Site navigation' });
  await expect(siteNavigation).toBeVisible();
  await expect(page.getByRole('link', { name: 'artifact' })).toBeVisible();
  await expect(siteNavigation.getByRole('link', { name: 'Open editor' })).toBeVisible();
  await expect(page.getByRole('contentinfo')).toBeAttached();
  await expect(page.getByRole('heading', { name: 'Style guide.' })).toBeVisible();
  await expect(page.getByText('Artifact editor design system')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  await expect.poll(async () => page.locator('.artifact-icon-button').count()).toBeGreaterThanOrEqual(4);
  await expect(page.locator('.artifact-input')).toHaveCount(3);
  await expect.poll(async () => page.locator('.artifact-search-field').count()).toBeGreaterThanOrEqual(2);
  await expect.poll(async () => page.locator('.artifact-badge').count()).toBeGreaterThanOrEqual(4);
  await expect(page.locator('.artifact-toolbar')).toHaveCount(1);
  await expect(page.locator('.artifact-segmented-control')).toHaveCount(1);
  await expect(page.locator('.artifact-tabs-list')).toHaveCount(1);
  await expect(page.locator('.artifact-tabs-trigger')).toHaveCount(2);
  await expect(page.locator('.artifact-panel')).toHaveCount(1);
  await expect(page.locator('.artifact-empty-state')).toHaveCount(1);
  await expect.poll(async () => page.locator('.artifact-preview-frame').count()).toBeGreaterThanOrEqual(2);
  await expect.poll(async () => page.locator('.artifact-menu-item').count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.layer-row')).toHaveCount(4);
  await expect(page.locator('.node-shell')).toHaveCount(7);
  await expect(page.locator('.style-guide-node-toolbar-specimen')).toBeVisible();
  await expect(page.locator('.style-guide-node-toolbar-specimen .node-toolbar-group')).toHaveCount(3);
  await expect(page.locator('.style-guide-node-frame-specimen .node-shell-frame')).toHaveCount(4);
  await expect(page.locator('.style-guide-node-frame-specimen .react-flow__handle')).toHaveCount(9);
  await expect(page.locator('.add-library-surface')).toBeVisible();
  await expect(page.locator('.editor-target-header')).toHaveCount(4);
  await expect(page.locator('.editor-target-header').first()).toBeVisible();
  await expect(page.locator('.style-guide-inspector-panel')).toBeVisible();
  await expect(page.locator('.style-guide-inspector-panel .node-inspector-section')).toHaveCount(2);
  await expect(page.locator('.style-guide-inspector-panel .node-field')).toHaveCount(4);
  await expect(page.locator('.style-guide-inspector-panel .node-slider')).toHaveCount(2);
  await expect(page.locator('.style-guide-inspector-panel .node-color-input')).toHaveCount(1);
  await expect(page.locator('.style-guide-inspector-panel .node-check')).toHaveCount(1);
  await expect(page.locator('.style-guide-inspector-panel .node-inspector-note')).toBeVisible();
  await expect(page.locator('.style-guide-props-specimen')).toHaveCount(4);
  await expect(page.locator('.style-guide-props-specimen .node-props-panel-open')).toHaveCount(4);
  await expect(page.locator('.style-guide-props-specimen .editor-target-header')).toHaveCount(3);
  await expect(page.locator('.style-guide-props-specimen').filter({ hasText: 'No selection' })).toBeVisible();
  await expect(page.locator('.style-guide-props-specimen').filter({ hasText: 'Cover title' })).toBeVisible();
  await expect(page.locator('.style-guide-props-specimen').filter({ hasText: 'Paper grain' })).toBeVisible();
  await expect(page.locator('.style-guide-props-specimen').filter({ hasText: 'Export target' })).toBeVisible();

  await assertReadableBox(page.locator('.style-guide-token').first(), { minWidth: 96, minHeight: 100 });
  await assertReadableBox(page.locator('.artifact-search-field').first(), { minWidth: 220, minHeight: 44 });
  await assertReadableBox(page.locator('.style-guide-node-frame-specimen'), { minWidth: 420, minHeight: 360 });
  await assertReadableBox(page.locator('.style-guide-add-library-surface'), { minWidth: 420, minHeight: 420 });
  await assertReadableBox(page.locator('.style-guide-inspector-panel'), { minWidth: 320, minHeight: 360 });
  await assertReadableBox(page.locator('.style-guide-props-specimen').first(), { minWidth: 240, minHeight: 420 });
  await assertReadableButtons(page.locator('.style-guide-main button'));

  await page.getByLabel('Add layer').focus();
  const focusOutline = await page.getByLabel('Add layer').evaluate((button) => getComputedStyle(button).outlineStyle);
  expect(focusOutline).not.toBe('none');

  await page.getByRole('tab', { name: 'Nodes' }).click();
  await expect(page.locator('.artifact-tabs-content').filter({ hasText: 'graph context' })).toBeVisible();

  const fontPicker = page.locator('.style-guide-inspector-panel .font-picker-trigger');
  await fontPicker.click();
  await expect(page.locator('.style-guide-inspector-panel .font-picker-panel')).toBeVisible();
  await expect(page.getByLabel('Search fonts')).toBeVisible();
  await fontPicker.click();
  await expect(page.locator('.style-guide-inspector-panel .font-picker-panel')).toBeHidden();

  await page.getByRole('button', { name: 'Open dialog specimen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Dialog specimen' });
  await assertReadableBox(dialog, { minWidth: 320, minHeight: 180 });
  await dialog.getByRole('button', { name: 'Close dialog specimen' }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: 'Open sheet specimen' }).click();
  const sheet = page.getByRole('dialog', { name: 'Sheet specimen' });
  await assertReadableBox(sheet, { minWidth: 300, minHeight: 300 });
  await sheet.getByRole('button', { name: 'Close sheet specimen' }).click();
  await expect(sheet).toBeHidden();

  await page.getByRole('button', { name: 'Open menu specimen' }).click();
  const floatingMenu = page.locator('.style-guide-floating-menu');
  await expect(floatingMenu).toBeVisible();
  await expect(floatingMenu.getByRole('button', { name: 'Duplicate' })).toBeVisible();
  await assertOpaqueContextMenu(floatingMenu);
  await page.keyboard.press('Escape');
  await expect(floatingMenu).toBeHidden();

  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    specimens: Array.from(document.querySelectorAll('.style-guide-specimen, .style-guide-token')).map((element) => {
      const box = element.getBoundingClientRect();
      return { width: box.width, height: box.height };
    }),
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
  for (const specimen of layout.specimens) {
    expect(specimen.width).toBeGreaterThan(0);
    expect(specimen.height).toBeGreaterThan(0);
  }
});

test('v0.30 layers baseline preserves selected hidden locked and preview states', async ({ page }) => {
  await gotoDocument(page, layerStateDocument);
  await expectLayerCanvasToHavePixels(page);

  const hiddenRow = page.locator('.layer-row').filter({ hasText: 'Hidden wash' }).first();
  const lockedRow = page.locator('.layer-row').filter({ hasText: 'Locked ink' }).first();

  await expect(page.locator('.layer-row-meta-state-visible')).toHaveCount(0);
  await expect(hiddenRow.locator('.layer-row-meta-state-hidden')).toContainText('hidden');
  await expect(hiddenRow).toHaveAttribute('data-layer-visible', 'false');
  await expect(lockedRow).toHaveAttribute('data-layer-locked', 'true');
  await expect(lockedRow.locator('.layer-lock-badge')).toContainText('lock');

  await hiddenRow.click();
  await expect(hiddenRow).toHaveClass(/layer-row-selected/);
  await expect(hiddenRow).toHaveClass(/layer-row-hidden/);
  await expect(page.locator('.layer-inspector-drawer .editor-target-header').first()).toContainText('Hidden');

  await lockedRow.click();
  await expect(lockedRow).toHaveClass(/layer-row-selected/);
  await lockedRow.hover();
  await lockedRow
    .getByLabel(/Open actions for layer/)
    .first()
    .click();
  const lockedLayerMenu = page.locator('.layer-context-menu');
  await expect(lockedLayerMenu).toBeVisible();
  await expect(lockedLayerMenu.getByRole('menuitem', { name: 'Delete locked' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('.layer-inspector-drawer .editor-target-header').first()).toContainText('Locked');

  const visualStates = await page.evaluate(() => {
    const list = document.querySelector('.layer-panel-list');
    const firstRow = document.querySelector('.layer-row');
    const selected = document.querySelector('.layer-row-selected');
    const hidden = document.querySelector('.layer-row-hidden');
    const locked = document.querySelector('.layer-row-locked');
    const name = hidden?.querySelector('.layer-row-name');
    return {
      listBg: list ? getComputedStyle(list).background : '',
      firstRowBorder: firstRow ? getComputedStyle(firstRow).borderBottomColor : '',
      selectedShadow: selected ? getComputedStyle(selected).boxShadow : '',
      hiddenOpacity: hidden ? Number(getComputedStyle(hidden).opacity) : 1,
      hiddenDecoration: name ? getComputedStyle(name).textDecorationLine : '',
      lockedBadgeBg: locked?.querySelector('.layer-lock-badge')
        ? getComputedStyle(locked.querySelector('.layer-lock-badge') as Element).backgroundColor
        : '',
      lockedCursor: locked ? getComputedStyle(locked).cursor : '',
    };
  });

  expect(visualStates.listBg).not.toBe('');
  expect(visualStates.firstRowBorder).not.toBe('rgba(0, 0, 0, 0)');
  expect(visualStates.selectedShadow).not.toBe('none');
  expect(visualStates.hiddenOpacity).toBeLessThan(0.9);
  expect(visualStates.hiddenDecoration).toContain('line-through');
  expect(visualStates.lockedBadgeBg).not.toBe('');
  expect(visualStates.lockedCursor).not.toBe('');
});

test('v0.30 layer Add Library keeps search results preview and controls readable', async ({ page }) => {
  await gotoDocument(page, layerStateDocument);

  const menu = await openLayerAddLibraryMenu(page);

  await page.getByLabel('Search layers and effects').fill('pixelate');
  await expect(menu.locator('.add-library-row').filter({ hasText: 'Pixelate' })).toBeVisible();
  await expect(menu.locator('img[alt="Pixelate preview"]')).toBeVisible({ timeout: 15_000 });
  await expect(menu.locator('.add-library-detail')).toContainText('Pixelate');
  await expect(menu.locator('.add-library-tags')).toContainText('low-res');

  await assertAddLibraryReadability(menu);
  await assertReadableButtons(menu.locator('button'));
});

test('v0.30 nodes baseline preserves output path area context and previews', async ({ page }) => {
  await gotoDocument(page, graphStateDocument);
  await expect.poll(async () => getCanvasCenterRgb(page), { timeout: 15_000 }).toMatchObject({ r: 46, g: 107, b: 217 });

  await switchToNodeView(page);
  const connectedNode = page.locator('.react-flow__node').filter({ hasText: 'Graph base' });
  const orphanNode = page.locator('.react-flow__node').filter({ hasText: 'Graph orphan' });
  await expect(connectedNode.locator('.node-shell')).toHaveClass(/node-shell-output-path/, { timeout: 15_000 });
  await expect(orphanNode.locator('.node-shell')).not.toHaveClass(/node-shell-output-path/);
  await expect(page.locator('.react-flow__edge.node-edge-output-path')).toHaveCount(1);
  await expect(page.locator('.node-area')).toContainText('Output study');

  await connectedNode.click();
  await expect(connectedNode.locator('.node-shell')).toHaveClass(/node-shell-selected/);
  await expect(page.locator('.node-props-panel .editor-target-header').first()).toContainText('Output path');

  await connectedNode.click({ button: 'right' });
  const contextMenu = page.locator('.node-menu');
  await expect(contextMenu).toBeVisible();
  await assertOpaqueContextMenu(contextMenu);
  await page.keyboard.press('Escape');
  await expect(contextMenu).toBeHidden();

  await page.getByRole('button', { name: 'Add node' }).click();
  const nodeMenu = page.locator('.add-library-node-menu');
  await expect(nodeMenu).toBeVisible({ timeout: 15_000 });
  await page.getByLabel('Search nodes and effects').fill('pixelate');
  await expect(nodeMenu.locator('.add-library-row').filter({ hasText: 'Pixelate' })).toBeVisible();
  await expect(nodeMenu.locator('img[alt="Pixelate preview"]')).toBeVisible({ timeout: 15_000 });
  await assertAddLibraryReadability(nodeMenu);

  await page.keyboard.press('Escape');
  await switchToLayerView(page);
  await expectLayerCanvasToHavePixels(page);
});

async function assertReadableBox(locator: Locator, options: { minWidth: number; minHeight: number }) {
  await expect(locator).toBeVisible({ timeout: 15_000 });
  const box = await locator.boundingBox();
  expect(box).toBeTruthy();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(options.minWidth);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(options.minHeight);
}

async function openLayerAddLibraryMenu(page: Page) {
  await page.locator('.layer-panel-header').getByRole('button', { name: 'Add layer' }).click();
  const menu = page.locator('.add-library-layer-menu');
  await expect(menu).toBeVisible({ timeout: 15_000 });
  return menu;
}

async function openGraphNodeBottomBar(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await gotoDocument(page, graphStateDocument);
  await switchToNodeView(page);
  const bottomBar = page.locator('.main-nodes > .bottom-bar');
  await expect(bottomBar).toBeVisible({ timeout: 15_000 });
  await expect(bottomBar.getByRole('button', { name: /more editor actions/i })).toBeVisible();
  return bottomBar;
}

async function readNodeBottomRailLayout(page: Page) {
  const bottomBar = page.locator('.main-nodes > .bottom-bar');
  const buttons = await readVisibleButtonRects(bottomBar.locator('button'));
  return {
    ...(await readViewportMetrics(page)),
    bar: await readElementRect(bottomBar),
    buttons,
    rowCount: new Set(buttons.map((button) => Math.round(button.top))).size,
  };
}

async function readNodeBottomRailLayoutWithControls(page: Page) {
  return {
    ...(await readNodeBottomRailLayout(page)),
    controls: await readElementRect(page.locator('.react-flow__controls')),
  };
}

async function readViewportMetrics(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
}

async function readElementRect(locator: Locator) {
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      bottom: box.bottom,
      height: box.height,
      left: box.left,
      right: box.right,
      top: box.top,
      width: box.width,
    };
  });
}

async function readVisibleButtonRects(locator: Locator) {
  return locator.evaluateAll((buttons) =>
    buttons
      .map((button) => {
        const box = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        return {
          bottom: box.bottom,
          display: style.display,
          height: box.height,
          label: button.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          left: box.left,
          right: box.right,
          top: box.top,
          width: box.width,
        };
      })
      .filter((button) => button.display !== 'none' && button.width > 0 && button.height > 0),
  );
}

function expectEditorBottomActionsInsideViewport(
  layout: Awaited<ReturnType<typeof readViewportMetrics>> & {
    bar: Awaited<ReturnType<typeof readElementRect>>;
    buttons: Awaited<ReturnType<typeof readVisibleButtonRects>>;
    menu: Awaited<ReturnType<typeof readElementRect>>;
  },
) {
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.bar.right).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.menu.left).toBeGreaterThanOrEqual(0);
  expect(layout.menu.right).toBeLessThanOrEqual(layout.viewportWidth + 1);
  for (const button of layout.buttons) {
    expect(button.left).toBeGreaterThanOrEqual(layout.bar.left - 1);
    expect(button.right).toBeLessThanOrEqual(layout.viewportWidth + 1);
    expect(button.bottom).toBeLessThanOrEqual(layout.bar.bottom + 1);
  }
}

function expectSingleRowNodeBottomRail(layout: Awaited<ReturnType<typeof readNodeBottomRailLayout>>) {
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.bar.width).toBeGreaterThan(360);
  expect(layout.bar.height).toBeLessThanOrEqual(64);
  expect(layout.bar.left).toBeGreaterThanOrEqual(0);
  expect(layout.bar.right).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expectButtonRowsAligned(layout.buttons);
  expectButtonsDoNotOverlap(layout.buttons);
}

function expectNarrowNodeBottomRail(layout: Awaited<ReturnType<typeof readNodeBottomRailLayoutWithControls>>) {
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.bar.left).toBeGreaterThanOrEqual(0);
  expect(layout.bar.right).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.bar.width).toBeLessThanOrEqual(layout.viewportWidth - 24);
  expect(layout.bar.height).toBeLessThanOrEqual(110);
  expect(layout.bar.left).toBeGreaterThanOrEqual(layout.controls.right + 12);
  expect(layout.rowCount).toBe(2);
  for (const button of layout.buttons) {
    expect(button.left).toBeGreaterThanOrEqual(layout.bar.left - 1);
    expect(button.right).toBeLessThanOrEqual(layout.bar.right + 1);
    expect(button.width).toBeGreaterThanOrEqual(44);
    expect(button.height).toBeGreaterThanOrEqual(44);
  }
}

function expectButtonRowsAligned(buttons: Awaited<ReturnType<typeof readVisibleButtonRects>>) {
  const tops = buttons.map((button) => button.top);
  const bottoms = buttons.map((button) => button.bottom);
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
  expect(Math.max(...bottoms) - Math.min(...bottoms)).toBeLessThanOrEqual(1);
}

function expectButtonsDoNotOverlap(buttons: Awaited<ReturnType<typeof readVisibleButtonRects>>) {
  for (let index = 1; index < buttons.length; index += 1) {
    expect(buttons[index].left).toBeGreaterThanOrEqual(buttons[index - 1].right - 1);
  }
}

async function assertReadableButtons(locator: Locator) {
  const buttonMetrics = await locator.evaluateAll((buttons) =>
    buttons
      .slice(0, 12)
      .map((button) => {
        const box = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        return {
          width: box.width,
          height: box.height,
          fontSize: Number.parseFloat(style.fontSize),
          text: button.textContent?.trim() ?? '',
        };
      })
      .filter((metric) => metric.text.length > 0),
  );

  expect(buttonMetrics.length).toBeGreaterThan(0);
  for (const metric of buttonMetrics) {
    const isIconOnly = metric.text.length <= 1;
    expect(metric.width).toBeGreaterThanOrEqual(isIconOnly ? 20 : 28);
    expect(metric.height).toBeGreaterThanOrEqual(isIconOnly ? 20 : 28);
    expect(metric.fontSize).toBeGreaterThanOrEqual(8);
  }
}

async function assertAddLibraryReadability(menu: Locator) {
  await assertReadableBox(menu, { minWidth: 420, minHeight: 300 });
  await expect(menu.locator('.add-library-search-input')).toBeVisible();
  await expect(menu.locator('.add-library-body')).toBeVisible();
  await expect(menu.locator('.add-library-detail')).toBeVisible();

  const metrics = await menu.evaluate((element) => {
    const search = element.querySelector('.add-library-search');
    const input = element.querySelector('.add-library-search-input');
    const row = element.querySelector('.add-library-row');
    const detail = element.querySelector('.add-library-detail');
    const preview = element.querySelector('.add-library-preview-frame, .add-library-rendered-preview img');
    const read = (target: Element | null) => {
      if (!target) return null;
      const box = target.getBoundingClientRect();
      const style = getComputedStyle(target);
      return {
        width: box.width,
        height: box.height,
        fontSize: Number.parseFloat(style.fontSize),
        color: style.color,
        bg: style.backgroundColor,
      };
    };
    return {
      search: read(search),
      input: read(input),
      row: read(row),
      detail: read(detail),
      preview: read(preview),
    };
  });

  const expectAtLeast = (value: number | undefined, min: number) =>
    expect(value ?? 0).toBeGreaterThanOrEqual(min - 0.01);

  expectAtLeast(metrics.search?.height, 36);
  expectAtLeast(metrics.input?.fontSize, 11);
  expectAtLeast(metrics.row?.height, 44);
  expectAtLeast(metrics.row?.fontSize, 10);
  expectAtLeast(metrics.detail?.width, 160);
  expectAtLeast(metrics.preview?.height, 80);
}

async function assertOpaqueContextMenu(menu: Locator) {
  const metrics = await menu.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      width: box.width,
      height: box.height,
      background: style.backgroundColor,
      borderColor: style.borderColor,
      shadow: style.boxShadow,
    };
  });

  expect(metrics.width).toBeGreaterThanOrEqual(180);
  expect(metrics.height).toBeGreaterThanOrEqual(120);
  expect(metrics.background).not.toBe('transparent');
  expect(metrics.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(metrics.background).not.toMatch(/rgba\([^)]*,\s*0(?:\.0+)?\)$/);
  expect(metrics.borderColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(metrics.shadow).not.toBe('none');
}

async function getCanvasCenterRgb(page: Page) {
  const canvas = page.locator('.pixi-container canvas').first();
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  return canvas.evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { r: 0, g: 0, b: 0 };
    const pixel = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
    return { r: pixel[0] ?? 0, g: pixel[1] ?? 0, b: pixel[2] ?? 0 };
  });
}
