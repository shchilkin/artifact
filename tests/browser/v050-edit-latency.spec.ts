import { expect, type Page, test } from '@playwright/test';
import {
  editorDocumentFixture,
  expectNoBrowserIssues,
  fillLayerFixture,
  gotoDocument,
  setupBrowserTestPage,
} from './helpers';

const sliderDocument = editorDocumentFixture([
  fillLayerFixture({ id: 'v050-base', name: 'Base plate', color: '#243b66' }),
  {
    id: 'v050-scanlines',
    name: 'Scanlines',
    kind: 'effect',
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    preset: 'scanlines',
    scanlines: 24,
    scanlineWidth: 2,
  },
]);

const twoScanlinesDocument = editorDocumentFixture([
  fillLayerFixture({ id: 'v050-base', name: 'Base plate', color: '#243b66' }),
  ...['v050-lines-a', 'v050-lines-b'].map((id, index) => ({
    id,
    name: index === 0 ? 'Lines A' : 'Lines B',
    kind: 'effect',
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    preset: 'scanlines',
    scanlines: 24,
    scanlineWidth: 2,
  })),
]);

const storedLayer = (page: Page, id: string) =>
  page.evaluate((layerId) => {
    const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
    return JSON.stringify(doc.layers?.find((layer: { id: string }) => layer.id === layerId) ?? null);
  }, id);

test.beforeEach(async ({ page }) => {
  await setupBrowserTestPage(page);
});

test.afterEach(async ({ page }) => {
  expectNoBrowserIssues(page);
});

test('a continuous slider drag commits its last value as one undo entry', async ({ page }) => {
  await gotoDocument(page, sliderDocument);
  await page.locator('.layer-row[data-layer-id="v050-scanlines"] .layer-row-name-button').click();
  const slider = page.locator('.layer-inspector-drawer input[type="range"]').first();
  await expect(slider).toBeVisible();
  const before = await storedLayer(page, 'v050-scanlines');
  const startValue = await slider.inputValue();

  const box = await slider.boundingBox();
  if (!box) throw new Error('slider has no box');
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.9, y);
  await page.mouse.down();
  for (let step = 1; step <= 20; step += 1) {
    await page.mouse.move(box.x + box.width * (0.9 - step * 0.03), y);
  }
  await page.mouse.up();

  const draggedValue = await slider.inputValue();
  expect(draggedValue).not.toBe(startValue);
  await expect.poll(() => storedLayer(page, 'v050-scanlines'), { timeout: 15_000 }).not.toBe(before);
  // The document holds the value the thumb shows once the gesture ends.
  await expect(slider).toHaveValue(draggedValue);

  const undo = page.getByRole('button', { name: 'Undo' });
  await expect(undo).toBeEnabled();
  // A keypress after a pause is its own undo entry, separate from the drag.
  await page.waitForTimeout(600);
  await slider.focus();
  await slider.press('ArrowRight');
  const keyValue = await slider.inputValue();
  expect(keyValue).not.toBe(draggedValue);
  await page.waitForTimeout(600);

  await undo.click();
  await expect(slider).toHaveValue(draggedValue);
  await undo.click();
  await expect(slider).toHaveValue(startValue);
  await expect.poll(() => storedLayer(page, 'v050-scanlines'), { timeout: 15_000 }).toBe(before);
  await expect(undo).toBeDisabled();
});

test('a slider value still waiting when the selection changes goes to the layer it was made on', async ({ page }) => {
  await gotoDocument(page, twoScanlinesDocument);
  await page.locator('.layer-row[data-layer-id="v050-lines-a"] .layer-row-name-button').click();
  const slider = page.locator('.layer-inspector-drawer input[type="range"]').first();
  await expect(slider).toHaveValue('24');
  const layerB = await storedLayer(page, 'v050-lines-b');

  // Two steps and a selection change in one task: the second step is still waiting when B is selected.
  await slider.evaluate((input: HTMLInputElement) => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    for (const value of ['30', '31']) {
      setValue.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    document
      .querySelector<HTMLButtonElement>('.layer-row[data-layer-id="v050-lines-b"] .layer-row-name-button')!
      .click();
  });

  await expect(slider).toHaveValue('24');
  await expect
    .poll(async () => JSON.parse(await storedLayer(page, 'v050-lines-a')).scanlines, { timeout: 15_000 })
    .toBe(31);
  await page.waitForTimeout(300);
  expect(await storedLayer(page, 'v050-lines-b')).toBe(layerB);
});
