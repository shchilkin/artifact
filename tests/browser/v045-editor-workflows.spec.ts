import { expect, test } from '@playwright/test';
import {
  editorDocumentFixture,
  expectNoBrowserIssues,
  fillLayerFixture,
  gotoDocument,
  setupBrowserTestPage,
} from './helpers';

const workflowDocument = editorDocumentFixture([
  fillLayerFixture({ id: 'v045-base', name: 'Base plate', color: '#243b66' }),
  fillLayerFixture({ id: 'v045-ink', name: 'Signal ink', color: '#dc604f' }),
]);

test.beforeEach(async ({ page }) => {
  await setupBrowserTestPage(page);
});

test.afterEach(async ({ page }) => {
  expectNoBrowserIssues(page);
});

test('editor mode navigation keeps its existing Layers and Nodes contract accessible', async ({ page }) => {
  await gotoDocument(page, workflowDocument);

  const navigation = page.getByRole('navigation', { name: 'Editor navigation' });
  await expect(navigation).toBeVisible();

  const layers = page.getByRole('tab', { name: 'Switch to layers view' });
  const nodes = page.getByRole('tab', { name: 'Switch to nodes view' });
  await expect(layers).toHaveAttribute('aria-selected', 'true');
  await expect(nodes).toHaveAttribute('aria-selected', 'false');

  for (const tab of [layers, nodes]) {
    const box = await tab.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.9);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(43.9);
  }

  await layers.focus();
  await page.keyboard.press('ArrowRight');
  await expect(nodes).toBeFocused();
  await expect(nodes).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.node-canvas-root')).toBeVisible({ timeout: 15_000 });
});

test('focused layer rows support keyboard selection without changing document commands', async ({ page }) => {
  await gotoDocument(page, workflowDocument);

  const baseRow = page.locator('.layer-row[data-layer-id="v045-base"]');
  await baseRow.getByRole('checkbox', { name: 'Select Base plate layer' }).focus();
  await page.keyboard.press('Enter');
  await expect(baseRow).toHaveAttribute('data-editor-row-selected', 'true');

  const inkRow = page.locator('.layer-row[data-layer-id="v045-ink"]');
  await inkRow.getByRole('checkbox', { name: 'Select Signal ink layer' }).focus();
  await page.keyboard.press('Space');
  await expect(inkRow).toHaveAttribute('data-editor-row-selected', 'true');
  await expect(baseRow).toHaveAttribute('data-editor-row-selected', 'false');
});

test('mobile Layers commands and Add Library filters keep 44px targets and readable history text', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoDocument(page, workflowDocument);

  const row = page.locator('.layer-row[data-layer-id="v045-ink"]');
  await row.getByRole('checkbox', { name: 'Select Signal ink layer' }).focus();
  await page.keyboard.press('Enter');
  await row.hover();

  await expectMinimumTarget(row.getByRole('button', { name: 'Drag layer Signal ink' }));
  await expectMinimumTarget(row.locator('.layer-row-name-button'));
  await expectMinimumTarget(row.getByRole('button', { name: 'Open actions for layer Signal ink' }));
  await expectMinimumTarget(page.getByRole('button', { name: /Change canvas aspect ratio/ }));
  await expectMinimumTarget(page.getByRole('button', { name: 'Add layer' }));

  const newProject = page.getByRole('button', { name: 'Create new project' });
  const randomize = page.getByRole('button', { name: 'Randomize document' });
  expect(await renderedContrastRatio(newProject)).toBeGreaterThanOrEqual(4.5);
  expect(await renderedContrastRatio(randomize)).toBeGreaterThanOrEqual(4.5);

  await page.getByRole('button', { name: 'Add layer' }).click();
  for (const filter of [
    page.locator('.add-library-intent').first(),
    page.locator('.add-library-browse-item').first(),
  ]) {
    await expectMinimumTarget(filter);
  }

  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Switch to nodes view' }).click();
  await expect(page.locator('.node-canvas-root')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Add node' }).click();
  await expectMinimumTarget(page.locator('.add-library-recipe').first());
});

test('layer context menu supports Home End Escape and returns focus to row selection', async ({ page }) => {
  await gotoDocument(page, workflowDocument);

  const row = page.locator('.layer-row[data-layer-id="v045-ink"]');
  const selection = row.getByRole('checkbox', { name: 'Select Signal ink layer' });
  await row.hover();
  await row.getByRole('button', { name: 'Open actions for layer Signal ink' }).click();

  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const rename = menu.getByRole('menuitem', { name: 'Rename' });
  await expect(rename).toBeFocused();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem', { name: 'Create area' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(rename).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(selection).toBeFocused();
});

test('Layers Add Library announces keyboard navigation and returns focus after layered Escape', async ({ page }) => {
  await gotoDocument(page, workflowDocument);

  const trigger = page.getByRole('button', { name: 'Add layer' });
  await trigger.click();
  const search = page.getByRole('combobox', { name: 'Search layers and effects' });
  await expect(search).toBeFocused();

  await search.fill('fill');
  const firstActiveId = await search.getAttribute('aria-activedescendant');
  expect(firstActiveId).toBeTruthy();
  await expect(page.locator(`[id="${firstActiveId}"]`)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  const lastActiveId = await search.getAttribute('aria-activedescendant');
  expect(lastActiveId).toBeTruthy();
  await expect(page.locator(`[id="${lastActiveId}"]`)).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('Escape');
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(search).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('Layers Add Library keeps the keyboard-active option inside the visible result viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoDocument(page, workflowDocument);

  await page.getByRole('button', { name: 'Add layer' }).click();
  const search = page.getByRole('combobox', { name: 'Search layers and effects' });
  await expect(search).toBeFocused();
  const initialActiveId = await search.getAttribute('aria-activedescendant');
  await page.keyboard.press('End');
  await expect.poll(() => search.getAttribute('aria-activedescendant')).not.toBe(initialActiveId);

  const activeId = await search.getAttribute('aria-activedescendant');
  expect(activeId).toBeTruthy();
  const list = page.getByRole('listbox', { name: 'Library results' });
  const activeOption = page.locator(`[id="${activeId}"]`);
  await expect(activeOption).toHaveAttribute('aria-selected', 'true');
  await expect
    .poll(async () => {
      const [listBox, optionBox] = await Promise.all([list.boundingBox(), activeOption.boundingBox()]);
      if (!listBox || !optionBox) return false;
      return optionBox.y >= listBox.y && optionBox.y + optionBox.height <= listBox.y + listBox.height;
    })
    .toBe(true);
});

test('Nodes Add Library returns focus to the Add node command after dismissal', async ({ page }) => {
  await gotoDocument(page, workflowDocument);

  await page.getByRole('tab', { name: 'Switch to nodes view' }).click();
  await expect(page.locator('.node-canvas-root')).toBeVisible({ timeout: 15_000 });

  const trigger = page.getByRole('button', { name: 'Add node' });
  await trigger.click();
  const search = page.getByRole('combobox', { name: 'Search nodes and effects' });
  await expect(search).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(search).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('document import confirmation uses the editor overlay and returns focus after cancellation', async ({ page }) => {
  await gotoDocument(page, workflowDocument);

  const trigger = page.getByRole('button', { name: 'Open document file' });
  const fileChooserPromise = page.waitForEvent('filechooser');
  await trigger.click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'workflow.artifact.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(workflowDocument)),
  });

  await expect(page.getByRole('dialog', { name: 'Open artifact file' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Open artifact file' })).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('style guide renders live editor command, notice, organization, and creation patterns', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/docs/style-guide');

  await expect(page.getByRole('group', { name: 'History commands' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Output commands' })).toBeVisible();
  await expect(page.getByText('Imported source is ready to edit.')).toBeVisible();
  await expect(page.getByText('One selected layer is hidden and will not appear in export.')).toBeVisible();
  await expect(page.locator('.style-guide-layer-organization .layer-area-folder')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Collapsed organization group', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Empty organization group', exact: true })).toBeVisible();
  await expect(page.locator('.style-guide-add-library-surface .add-library-row').first()).toBeVisible();
  await expect(page.locator('.style-guide-add-library-state [data-preview-state="loading"]')).toHaveCount(1);
  await expect(page.locator('.style-guide-add-library-state [data-preview-state="ready"]')).toHaveCount(1);
  await expect(page.locator('.style-guide-add-library-state [data-preview-state="fallback"]')).toHaveCount(1);
  await expect(page.locator('.style-guide-add-library-state [data-preview-state="failed"]')).toHaveCount(1);
  await expectWorkflowSpecimenMatrix(page);
  await expectDeterministicOverlayStates(page);

  const overlayTrigger = page.getByRole('button', { name: 'Open editor popover' });
  await overlayTrigger.click();
  const overlayContent = page.locator('.style-guide-editor-overlay-content').filter({ hasText: 'Add source' });
  await expect(overlayContent.getByText('Add source', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(overlayContent).toBeHidden();
  await expect(overlayTrigger).toBeFocused();

  await expectNoPageOverflow(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await expectWorkflowSpecimenMatrix(page);
  await expectDeterministicOverlayStates(page);
  await expectNoPageOverflow(page);
});

test('real editor commands expose disabled history and busy export states', async ({ page }) => {
  await gotoDocument(page, workflowDocument);

  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled();

  const exportButton = page.getByRole('button', { name: 'Export artwork' });
  await exportButton.click();
  await expect(page.getByRole('button', { name: 'Exporting artwork' })).toHaveAttribute('aria-busy', 'true');
});

async function expectWorkflowSpecimenMatrix(page: import('@playwright/test').Page) {
  const specimens = page.locator('[data-editor-specimen]');
  await expect(specimens).toHaveCount(48);
  const ids = await specimens.evaluateAll((elements) =>
    elements.map((element) => (element as HTMLElement).dataset.editorSpecimen),
  );
  expect(new Set(ids).size).toBe(48);
  expect(ids.filter((id) => id?.startsWith('command-'))).toHaveLength(8);
  expect(ids.filter((id) => id?.startsWith('row-'))).toHaveLength(13);
  expect(ids.filter((id) => id?.startsWith('organization-'))).toHaveLength(9);
  expect(ids.filter((id) => id?.startsWith('notice-'))).toHaveLength(9);
  expect(ids.filter((id) => id?.startsWith('overlay-'))).toHaveLength(9);
}

async function expectDeterministicOverlayStates(page: import('@playwright/test').Page) {
  await expect(page.getByRole('dialog', { name: 'closed overlay' })).toHaveCount(0);

  const openOverlay = page.getByRole('dialog', { name: 'open overlay' });
  await expect(openOverlay).toHaveAttribute('data-editor-overlay-state', 'open');
  await page.keyboard.press('Escape');
  await expect(openOverlay).toBeHidden();

  const keyboard = page.locator('[data-editor-specimen="overlay-keyboard-opened"]');
  const keyboardTrigger = keyboard.getByRole('button', { name: 'Open keyboard opened' });
  await keyboardTrigger.focus();
  await keyboardTrigger.press('Enter');
  await expect(page.getByRole('dialog', { name: 'keyboard opened overlay' })).toHaveAttribute(
    'data-editor-overlay-method',
    'keyboard',
  );
  await expectOverlayPositioned(page.getByRole('dialog', { name: 'keyboard opened overlay' }));
  await page.keyboard.press('Escape');
  await expect(keyboardTrigger).toBeFocused();

  const pointer = page.locator('[data-editor-specimen="overlay-pointer-opened"]');
  const pointerTrigger = pointer.getByRole('button', { name: 'Open pointer opened' });
  await pointerTrigger.click();
  await expect(page.getByRole('dialog', { name: 'pointer opened overlay' })).toHaveAttribute(
    'data-editor-overlay-method',
    'pointer',
  );
  await expectOverlayPositioned(page.getByRole('dialog', { name: 'pointer opened overlay' }));
  await page.keyboard.press('Escape');

  const busyTrigger = page.locator('[data-editor-specimen="overlay-busy"]').getByRole('button', { name: 'Open busy' });
  await busyTrigger.click();
  const busyOverlay = page.getByRole('dialog', { name: 'busy overlay' });
  await expect(busyOverlay).toHaveAttribute('aria-busy', 'true');
  await expectOverlayPositioned(busyOverlay);
  await page.keyboard.press('Escape');
  await expect(busyOverlay).toBeVisible();
  await busyOverlay.getByRole('button', { name: 'Finish busy state' }).click();
  await expect(busyOverlay).toBeHidden();

  const disabledTrigger = page
    .locator('[data-editor-specimen="overlay-disabled-item"]')
    .getByRole('button', { name: 'Open disabled item' });
  await disabledTrigger.click();
  const disabledOverlay = page.getByRole('dialog', { name: 'disabled item overlay' });
  await expect(disabledOverlay.getByRole('button', { name: 'Secondary action' })).toBeDisabled();
  await expectOverlayPositioned(disabledOverlay);
  await page.keyboard.press('Escape');

  const nestedTrigger = page
    .locator('[data-editor-specimen="overlay-nested-scope"]')
    .getByRole('button', { name: 'Open nested scope' });
  await nestedTrigger.click();
  const nestedOverlay = page.getByRole('dialog', { name: 'nested scope overlay' });
  await expect(nestedOverlay.getByText('Effects / Texture / Grain')).toBeVisible();
  await expectOverlayPositioned(nestedOverlay);
  await page.keyboard.press('Escape');

  const collisionTrigger = page
    .locator('[data-editor-specimen="overlay-collision-adjusted"]')
    .getByRole('button', { name: 'Open collision adjusted' });
  await collisionTrigger.click();
  const collisionOverlay = page.getByRole('dialog', { name: 'collision adjusted overlay' });
  await expect(collisionOverlay).toHaveAttribute('data-editor-overlay-collision-adjusted', 'true');
  await expectOverlayPositioned(collisionOverlay);
  const collisionBox = await collisionOverlay.boundingBox();
  const viewport = page.viewportSize();
  expect(collisionBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(collisionBox!.x).toBeGreaterThanOrEqual(0);
  expect(collisionBox!.x + collisionBox!.width).toBeLessThanOrEqual(viewport!.width);
  await page.keyboard.press('Escape');

  const mobileTrigger = page
    .locator('[data-editor-specimen="overlay-mobile-sheet"]')
    .getByRole('button', { name: 'Open mobile sheet' });
  await mobileTrigger.click();
  const mobileOverlay = page.getByRole('dialog', { name: 'mobile sheet overlay' });
  await expect(mobileOverlay).toHaveClass(/editor-overlay-frame--sheet/);
  await page.keyboard.press('Escape');
}

async function expectOverlayPositioned(locator: import('@playwright/test').Locator) {
  await expect
    .poll(async () =>
      locator.evaluate((element) => {
        const wrapper = element.closest<HTMLElement>('[data-radix-popper-content-wrapper]');
        if (!wrapper) return true;
        const box = wrapper.getBoundingClientRect();
        return (
          !wrapper.style.transform.includes('-200%') &&
          box.width > 0 &&
          box.height > 0 &&
          box.left >= 0 &&
          box.top >= 0 &&
          box.right <= window.innerWidth &&
          box.bottom <= window.innerHeight
        );
      }),
    )
    .toBe(true);
}

async function expectNoPageOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

async function expectMinimumTarget(locator: import('@playwright/test').Locator) {
  const box = await locator.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(43.9);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.9);
}

async function renderedContrastRatio(locator: import('@playwright/test').Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const parseRgb = (value: string) => {
      if (!context) return [0, 0, 0];
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
    };
    const luminance = (rgb: number[]) =>
      rgb
        .map((channel) => channel / 255)
        .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
        .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const foreground = luminance(parseRgb(style.color));
    const background = luminance(parseRgb(style.backgroundColor));
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
}
