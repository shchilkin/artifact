import { expect, type Page, test } from '@playwright/test';
import {
  editorDocumentFixture,
  expectLayerCanvasToHavePixels,
  expectNoBrowserIssues,
  fillLayerFixture,
  gotoDocument,
  pressForwardTab,
  setupBrowserTestPage,
  switchToNodeView,
  textLayerFixture,
} from './helpers';

// v0.50 U5: replacing and destructive actions confirm in-app, rows show whether a layer reaches Output,
// row controls keep one accessible name, and Add Library opens as an opaque surface with one filter axis.
const stateDocument = editorDocumentFixture([
  fillLayerFixture({ id: 'state-fill', name: 'Backdrop', color: '#2255cc' }),
  textLayerFixture({ id: 'state-title', name: 'Title', content: 'STATE' }),
]);

const graphDocument = {
  ...editorDocumentFixture([
    fillLayerFixture({ id: 'graph-fill', name: 'Connected fill', color: '#2255cc' }),
    textLayerFixture({ id: 'graph-title', name: 'Connected title', content: 'GRAPH' }),
    fillLayerFixture({ id: 'graph-loose', name: 'Loose fill', color: '#dd3322' }),
  ]),
  graph: {
    edges: [
      { id: 'e1', fromId: 'graph-fill', fromPort: 'out', toId: 'graph-title', toPort: 'bg' },
      { id: 'e2', fromId: 'graph-title', fromPort: 'out', toId: '__export__', toPort: 'in' },
    ],
    positions: {
      'graph-fill': { x: 0, y: 0 },
      'graph-title': { x: 240, y: 0 },
      'graph-loose': { x: 0, y: 200 },
      __export__: { x: 480, y: 0 },
    },
    mergeNodes: [],
    colorNodes: [],
  },
};

/** Fails the test if any editor flow reaches for the native confirm dialog. */
async function forbidNativeConfirm(page: Page) {
  await page.addInitScript(() => {
    const calls: string[] = [];
    Object.defineProperty(window, '__nativeConfirmCalls', { value: calls });
    window.confirm = (message?: string) => {
      calls.push(String(message));
      return false;
    };
  });
  page.on('dialog', (dialog) => {
    throw new Error(`Unexpected native ${dialog.type()} dialog: ${dialog.message()}`);
  });
}

async function expectNoNativeConfirm(page: Page) {
  const calls = await page.evaluate(
    () => (window as unknown as { __nativeConfirmCalls: string[] }).__nativeConfirmCalls,
  );
  expect(calls).toEqual([]);
}

/** WebKit moves focus between buttons with Alt+Tab, like Safari's Option+Tab. */
async function pressBackwardTab(page: Page) {
  const shortcut = page.context().browser()?.browserType().name() === 'webkit' ? 'Alt+Shift+Tab' : 'Shift+Tab';
  await page.keyboard.press(shortcut);
}

async function renameLayer(page: Page, layerId: string, name: string) {
  const row = page.locator(`.layer-row[data-layer-id="${layerId}"]`);
  await row.locator('.layer-row-name-button').dblclick();
  const input = row.getByRole('textbox');
  await input.fill(name);
  await input.press('Enter');
  await expect(row.locator('.layer-row-name-button')).toHaveText(name);
}

test.beforeEach(async ({ page }) => {
  await setupBrowserTestPage(page);
  await forbidNativeConfirm(page);
});
test.afterEach(async ({ page }) => expectNoBrowserIssues(page));

test('New confirms in an accessible dialog that traps focus and cancels with Escape', async ({ page }) => {
  await gotoDocument(page, stateDocument);
  await expectLayerCanvasToHavePixels(page);

  const newProject = page.getByRole('button', { name: 'Create new project' }).first();
  await newProject.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('alertdialog', { name: 'Create a new project?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleDescription(/recovery copy/);
  const cancel = dialog.getByRole('button', { name: 'Cancel' });
  const confirm = dialog.getByRole('button', { name: 'Create new project' });
  // The replacing action is never the initial focus.
  await expect(cancel).toBeFocused();

  await pressForwardTab(page);
  await expect(confirm).toBeFocused();
  await pressForwardTab(page);
  await expect(cancel).toBeFocused();
  await pressBackwardTab(page);
  await expect(confirm).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(newProject).toBeFocused();
  await expect(page.locator('.layer-row')).toHaveCount(2);

  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Create new project' }).click();
  await expect(page.locator('.empty-canvas-start')).toBeVisible({ timeout: 15_000 });

  await expectNoNativeConfirm(page);
});

test('Randomize replaces an unedited shared document without asking', async ({ page }) => {
  await gotoDocument(page, stateDocument);
  await expectLayerCanvasToHavePixels(page);
  await page.getByRole('button', { name: 'Randomize document' }).first().click();
  await expect(page.locator('.layer-row[data-layer-id="state-title"]')).toHaveCount(0);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expectNoNativeConfirm(page);
});

test('Randomize asks first only when it would replace edited work', async ({ page }) => {
  await gotoDocument(page, stateDocument);
  await expectLayerCanvasToHavePixels(page);
  const randomize = page.getByRole('button', { name: 'Randomize document' }).first();
  const dialog = page.getByRole('alertdialog', { name: 'Replace with a random cover?' });

  await renameLayer(page, 'state-title', 'Edited title');
  await randomize.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.layer-row[data-layer-id="state-title"]')).toContainText('Edited title');

  await randomize.click();
  await dialog.getByRole('button', { name: 'Randomize' }).click();
  await expect(page.locator('.layer-row[data-layer-id="state-title"]')).toHaveCount(0);

  // A random document nobody edited is not work to lose.
  const layerIds = () =>
    page.locator('.layer-row').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-layer-id')));
  const idsBefore = await layerIds();
  await randomize.click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(layerIds).not.toEqual(idsBefore);

  await expectNoNativeConfirm(page);
});

test('opening an artifact file confirms in the same dialog and returns focus on cancel', async ({ page }) => {
  await gotoDocument(page, stateDocument);
  await expectLayerCanvasToHavePixels(page);

  await page.evaluate((doc) => {
    const file = new File([JSON.stringify(doc)], 'state.artifact.json', { type: 'application/json' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    document
      .querySelector('main')
      ?.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
  }, graphDocument);

  const dialog = page.getByRole('alertdialog', { name: 'Open artifact file' });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('.layer-row[data-layer-id="graph-loose"]')).toHaveCount(0);

  await expectNoNativeConfirm(page);
});

test('Layers rows show whether each layer reaches Output', async ({ page }) => {
  await gotoDocument(page, graphDocument);
  await expectLayerCanvasToHavePixels(page);

  const loose = page.locator('.layer-row[data-layer-id="graph-loose"]');
  await expect(loose).toHaveAttribute('data-layer-output', 'unreached');
  await expect(loose).toContainText('not in output');
  for (const id of ['graph-fill', 'graph-title']) {
    const row = page.locator(`.layer-row[data-layer-id="${id}"]`);
    await expect(row).toHaveAttribute('data-layer-output', 'reached');
    await expect(row).not.toContainText('not in output');
  }
});

test('a layer stack without a graph shows every row in Output', async ({ page }) => {
  await gotoDocument(page, stateDocument);
  await expect(page.locator('.layer-row[data-layer-output="reached"]')).toHaveCount(2);
  await expect(page.locator('.layer-row[data-layer-output="unreached"]')).toHaveCount(0);
});

test('layer row controls keep one accessible name through selection', async ({ page }) => {
  await gotoDocument(page, stateDocument);
  const row = page.locator('.layer-row[data-layer-id="state-title"]');
  const nameButton = row.locator('.layer-row-name-button');
  const more = row.getByRole('button', { name: 'Open actions for layer Title' });

  const describe = () =>
    nameButton.evaluate((element) => ({ name: element.textContent, title: element.getAttribute('title') }));
  const before = await describe();
  await nameButton.click();
  await expect(row).toHaveAttribute('class', /layer-row-selected/);
  expect(await describe()).toEqual(before);
  await expect(nameButton).toHaveAccessibleName('Title');
  await expect(more).toHaveAttribute('title', 'Open actions for layer Title');
  await expect(row.locator('.layer-row-actions')).not.toHaveAttribute('aria-label', /.+/);
});

test('Add Library opens opaque, without layout shift, and filters on one axis', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoDocument(page, stateDocument);
  await expectLayerCanvasToHavePixels(page);

  await page.evaluate(() => {
    const shifts = { value: 0 };
    Object.defineProperty(window, '__addLibraryShift', { value: shifts });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
        shifts.value += entry.value;
      }
    }).observe({ type: 'layout-shift' });
  });

  await page.getByRole('button', { name: 'Add layer' }).click();
  const surface = page.locator('.add-library-layer-menu');
  await expect(surface).toBeVisible();
  const look = await surface.evaluate((element) => {
    const style = getComputedStyle(element);
    const probe = document.createElement('canvas').getContext('2d')!;
    probe.fillStyle = style.backgroundColor;
    probe.fillRect(0, 0, 1, 1);
    return { opacity: style.opacity, animation: style.animationName, alpha: probe.getImageData(0, 0, 1, 1).data[3] };
  });
  expect(look).toEqual({ opacity: '1', animation: 'none', alpha: 255 });
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(() => (window as unknown as { __addLibraryShift: { value: number } }).__addLibraryShift.value),
  ).toBeLessThanOrEqual(0.05);

  const filters = surface.getByRole('group', { name: 'Filter library' });
  await expect(filters.getByRole('button')).toHaveText(['All', 'Sources', 'Effects', 'Structure', 'Color', '3D']);
  await expect(surface.locator('.add-library-browse, .add-library-recipes')).toHaveCount(0);

  await filters.getByRole('button', { name: 'Effects' }).click();
  await expect(filters.getByRole('button', { name: 'Effects' })).toHaveAttribute('aria-pressed', 'true');
  await expect(filters.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
  await expect(surface.locator('.add-library-row', { hasText: 'Pixelate' })).toBeVisible();
  await expect(surface.locator('.add-library-row-label', { hasText: /^Fill$/ })).toHaveCount(0);
});

test('node Add Library lists recipes as one more filter', async ({ page }) => {
  await gotoDocument(page, stateDocument);
  await switchToNodeView(page);
  await page.getByRole('button', { name: 'Add node' }).click();
  const surface = page.locator('.add-library-node-menu');
  const filters = surface.getByRole('group', { name: 'Filter library' });
  await filters.getByRole('button', { name: 'Recipes' }).click();
  await expect(surface.getByRole('group', { name: 'Print Damage' })).toBeVisible();
  await expect(surface.getByRole('group', { name: 'Photo + Type' })).toBeVisible();
  const ids = await surface.locator('[role="option"]').evaluateAll((options) => options.map((option) => option.id));
  expect(new Set(ids).size).toBe(ids.length);
});
