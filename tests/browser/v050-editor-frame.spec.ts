import { expect, type Page, test } from '@playwright/test';
import {
  editorDocumentFixture,
  expectLayerCanvasToHavePixels,
  expectNoBrowserIssues,
  fillLayerFixture,
  gotoDocument,
  setupBrowserTestPage,
  switchToLayerView,
  switchToNodeView,
  textLayerFixture,
} from './helpers';

// v0.50 U2: the editor frame does not move when a layer is selected or the mode changes.
const frameDocument = editorDocumentFixture([
  fillLayerFixture({ id: 'frame-fill', name: 'Backdrop', color: '#2255cc' }),
  fillLayerFixture({ id: 'frame-wash', name: 'Wash', color: '#dd3322' }),
  textLayerFixture({ id: 'frame-title', name: 'Title', content: 'FRAME' }),
]);

type Box = { x: number; y: number; width: number; height: number };

test.beforeEach(async ({ page }) => setupBrowserTestPage(page));
test.afterEach(async ({ page }) => expectNoBrowserIssues(page));

test('selecting a layer keeps the canvas, inspector column, and command bar in place', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoDocument(page, frameDocument);
  await expectLayerCanvasToHavePixels(page);

  const inspector = page.getByRole('complementary', { name: 'Layer settings' });
  await expect(inspector).toBeVisible();
  await expect(inspector).toContainText('No layer selected');

  const before = await readFrame(page);
  await page.locator('.layer-row[data-layer-id="frame-title"] .layer-row-name-button').click();
  await expect(inspector).not.toContainText('No layer selected');
  await expect(inspector.locator('.editor-target-header').first()).toContainText('Title');
  const after = await readFrame(page);

  expectSameBox(after.preview, before.preview);
  expectSameBox(after.inspector, before.inspector);
  expectSameBox(after.commandBar, before.commandBar);
});

test('switching between Layers and Nodes keeps the command bar in place', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoDocument(page, frameDocument);
  await expectLayerCanvasToHavePixels(page);
  await page.locator('.layer-row[data-layer-id="frame-wash"] .layer-row-name-button').click();

  const layers = await readFrame(page);
  await switchToNodeView(page);
  await expect(page.locator('.react-flow__node').first()).toBeVisible({
    timeout: 15_000,
  });
  const nodes = await readFrame(page);
  expectSameBox(nodes.commandBar, layers.commandBar);

  await switchToLayerView(page);
  await expect(page.locator('.artifact-canvas-preview__surface')).toBeVisible({
    timeout: 15_000,
  });
  const back = await readFrame(page);
  expectSameBox(back.commandBar, layers.commandBar);
  expectSameBox(back.preview, layers.preview);
  expectSameBox(back.inspector, layers.inspector);
});

test('the first Nodes entry fits every node inside the graph viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoDocument(page, frameDocument);
  await switchToNodeView(page);

  await expect.poll(() => page.locator('.react-flow__node').count(), { timeout: 15_000 }).toBeGreaterThan(3);
  await expect.poll(() => countNodesOutsideViewport(page), { timeout: 10_000 }).toBe(0);
});

test('later Nodes entries restore the viewport the user left instead of fitting again', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoDocument(page, frameDocument);
  await switchToNodeView(page);
  await expect.poll(() => countNodesOutsideViewport(page), { timeout: 10_000 }).toBe(0);

  const flowViewport = page.locator('.react-flow__viewport');
  const fitted = await flowViewport.getAttribute('style');
  for (let step = 0; step < 3; step += 1) await page.locator('.react-flow__controls-zoomin').click();
  await expect.poll(() => flowViewport.getAttribute('style')).not.toBe(fitted);
  const zoomed = await flowViewport.getAttribute('style');

  await switchToLayerView(page);
  await switchToNodeView(page);
  await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => flowViewport.getAttribute('style')).toBe(zoomed);
});

test('node thumbnails render near their on-screen size and re-render sharper after zooming in', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoDocument(page, frameDocument);
  await switchToNodeView(page);
  await expect(page.locator('.react-flow__node .node-thumbnail').first()).toHaveAttribute(
    'data-canvas-chrome-state',
    'ready',
    { timeout: 15_000 },
  );

  const fitted = await readOnScreenThumbnailWidths(page);
  expect(fitted.length).toBeGreaterThan(0);
  // The fitted graph is zoomed out, so thumbnails render below the 1000 px document baseline.
  expect(Math.max(...fitted)).toBeLessThan(1000);

  const zoomIn = page.locator('.react-flow__controls-zoomin');
  for (let step = 0; step < 6; step += 1) await zoomIn.click();
  await expect
    .poll(
      async () => {
        const widths = await readOnScreenThumbnailWidths(page);
        return widths.length ? Math.min(...widths) : 0;
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThan(Math.max(...fitted));
  await expect(page.locator('.node-thumbnail[data-canvas-chrome-state="updating"]')).toHaveCount(0);

  // The selected node's preview keeps the document-baseline resolution.
  await page.locator('.react-flow__node[data-id="frame-title"] .node-thumbnail').click();
  const selected = page.locator('.react-flow__node[data-id="frame-title"] .node-thumbnail-canvas');
  await expect
    .poll(() => selected.evaluate((element) => (element as HTMLCanvasElement).width), { timeout: 10_000 })
    .toBeGreaterThanOrEqual(1000);
});

for (const width of [768, 1024]) {
  for (const aspect of ['9:16', '16:9'] as const) {
    test(`narrow desktop ${width} px keeps the ${aspect} canvas whole, the inspector reserved, and one command row`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoDocument(page, { ...frameDocument, global: { ...frameDocument.global, aspect } });
      await expectLayerCanvasToHavePixels(page);

      const inspector = page.getByRole('complementary', { name: 'Layer settings' });
      await expect(inspector).toBeVisible();
      await expect(inspector).toContainText('No layer selected');
      const empty = await readNarrowFrame(page);
      expectCanvasInsideFrame(empty);

      await page.locator('.layer-row[data-layer-id="frame-title"] .layer-row-name-button').click();
      await expect(inspector).not.toContainText('No layer selected');
      const selected = await readNarrowFrame(page);
      expectCanvasInsideFrame(selected);
      expectSameBox(selected.preview, empty.preview);
      expectSameBox(selected.inspector, empty.inspector);

      const commands = await readCommandBarButtons(page);
      expect(new Set(commands.map((command) => Math.round(command.y))).size).toBe(1);
      expectNoOverlap(commands);
    });
  }
}

test('medium desktop command bar keeps one row without overlapping commands', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 760 });
  await gotoDocument(page, frameDocument);
  await expectLayerCanvasToHavePixels(page);

  const commands = await readCommandBarButtons(page);
  expect(new Set(commands.map((command) => Math.round(command.y))).size).toBe(1);
  expectNoOverlap(commands);
});

async function readFrame(page: Page) {
  return page.evaluate(() => {
    const box = (element: Element | null | undefined) => {
      const rect = element?.getBoundingClientRect();
      return rect?.width ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
    };
    return {
      preview: box(document.querySelector('.artifact-canvas-preview__surface')),
      inspector: box(document.querySelector('.layer-inspector-drawer')),
      commandBar: box(
        [...document.querySelectorAll('.editor-command-bar')].find((bar) => bar.getBoundingClientRect().width > 0),
      ),
    };
  });
}

function expectSameBox(actual: Box | null, expected: Box | null) {
  expect(expected).not.toBeNull();
  expect(actual).not.toBeNull();
  for (const side of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(actual![side] - expected![side]), side).toBeLessThanOrEqual(1);
  }
}

function countNodesOutsideViewport(page: Page) {
  return page.evaluate(() => {
    const pane = document.querySelector('.react-flow')!.getBoundingClientRect();
    return [...document.querySelectorAll('.react-flow__node')].filter((node) => {
      const rect = node.getBoundingClientRect();
      return (
        rect.left < pane.left - 1 ||
        rect.top < pane.top - 1 ||
        rect.right > pane.right + 1 ||
        rect.bottom > pane.bottom + 1
      );
    }).length;
  });
}

async function readCommandBarButtons(page: Page) {
  return page.evaluate(() => {
    const bar = [...document.querySelectorAll('.editor-command-bar')].find(
      (element) => element.getBoundingClientRect().width > 0,
    );
    return [...(bar?.querySelectorAll('button') ?? [])]
      .map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          name: button.getAttribute('aria-label') ?? '',
          x: rect.x,
          y: rect.y,
          right: rect.right,
          bottom: rect.bottom,
        };
      })
      .filter((rect) => rect.right > rect.x);
  });
}

function expectNoOverlap(commands: Awaited<ReturnType<typeof readCommandBarButtons>>) {
  for (let i = 0; i < commands.length; i += 1) {
    for (let j = i + 1; j < commands.length; j += 1) {
      const [a, b] = [commands[i]!, commands[j]!];
      const width = Math.min(a.right, b.right) - Math.max(a.x, b.x);
      const height = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
      expect(width > 1 && height > 1, `${a.name} overlaps ${b.name}`).toBe(false);
    }
  }
}

// Backing-store widths of passive node thumbnails that are at least partly on screen inside the graph viewport.
function readOnScreenThumbnailWidths(page: Page) {
  return page.evaluate(() => {
    const pane = document.querySelector('.react-flow')!.getBoundingClientRect();
    // Passive thumbnails only: the selected preview keeps the document-baseline resolution.
    const passive = '.react-flow__node:not(.selected) .node-thumbnail-canvas';
    return [...document.querySelectorAll<HTMLCanvasElement>(passive)]
      .filter((canvas) => {
        const rect = canvas.getBoundingClientRect();
        return rect.right > pane.left && rect.left < pane.right && rect.bottom > pane.top && rect.top < pane.bottom;
      })
      .map((canvas) => canvas.width);
  });
}

async function readNarrowFrame(page: Page) {
  return page.evaluate(() => {
    const box = (element: Element | null | undefined) => {
      const rect = element?.getBoundingClientRect();
      return rect?.width ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
    };
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      preview: box(document.querySelector('.artifact-canvas-preview__surface')),
      sidebar: box(document.querySelector('.sidebar')),
      inspector: box(document.querySelector('.layer-inspector-drawer')),
      commandBar: box(document.querySelector('.app > .bottom-bar')),
    };
  });
}

// The preview is fully visible: inside the viewport, right of the layer list, and clear of the inspector and
// command bar.
function expectCanvasInsideFrame(frame: Awaited<ReturnType<typeof readNarrowFrame>>) {
  const { preview, sidebar, inspector, commandBar, viewport } = frame;
  expect(preview && sidebar && inspector && commandBar).toBeTruthy();
  const right = preview!.x + preview!.width;
  const bottom = preview!.y + preview!.height;
  expect(preview!.width).toBeGreaterThan(200);
  expect(preview!.height).toBeGreaterThan(200);
  expect(preview!.x).toBeGreaterThanOrEqual(sidebar!.x + sidebar!.width - 1);
  expect(right).toBeLessThanOrEqual(viewport.width + 1);
  expect(bottom).toBeLessThanOrEqual(commandBar!.y + 1);
  const inspectorBeside = inspector!.x >= preview!.x + 1;
  if (inspectorBeside) expect(right).toBeLessThanOrEqual(inspector!.x + 1);
  else expect(bottom).toBeLessThanOrEqual(inspector!.y + 1);
}
