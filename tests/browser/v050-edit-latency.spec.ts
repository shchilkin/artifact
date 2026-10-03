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
  await undo.click();
  await expect(slider).toHaveValue(startValue);
  await expect.poll(() => storedLayer(page, 'v050-scanlines'), { timeout: 15_000 }).toBe(before);
  await expect(undo).toBeDisabled();
});

test('Escape during a slider drag reverts the document to the starting value', async ({ page }) => {
  await gotoDocument(page, sliderDocument);
  await page.locator('.layer-row[data-layer-id="v050-scanlines"] .layer-row-name-button').click();
  const slider = page.locator('.layer-inspector-drawer input[type="range"]').first();
  await expect(slider).toBeVisible();
  const startValue = await slider.inputValue();

  const box = await slider.boundingBox();
  if (!box) throw new Error('slider has no box');
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.9, y);
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(box.x + box.width * (0.9 - step * 0.05), y);
  }
  await expect(slider).not.toHaveValue(startValue);
  await page.keyboard.press('Escape');
  await page.mouse.up();

  await expect(slider).toHaveValue(startValue);
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('doc') ?? '{}').layers?.[1]?.scanlines))
    .toBe(Number(startValue));
});
