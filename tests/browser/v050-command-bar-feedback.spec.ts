import { expect, type Page, test } from '@playwright/test';
import {
  clickEditorControl,
  editorDocumentFixture,
  expectNoBrowserIssues,
  fillLayerFixture,
  gotoDocument,
  setupBrowserTestPage,
} from './helpers';

declare global {
  interface Window {
    __exportToBlob?: HTMLCanvasElement['toBlob'];
    __failExport?: boolean;
  }
}

const feedbackDocument = editorDocumentFixture([
  fillLayerFixture({
    id: 'feedback-base',
    name: 'Base plate',
    color: '#243b66',
  }),
  fillLayerFixture({
    id: 'feedback-ink',
    name: 'Signal ink',
    color: '#dc604f',
  }),
]);

test.beforeEach(async ({ page }) => {
  await setupBrowserTestPage(page);
});

test.afterEach(async ({ page }) => {
  expectNoBrowserIssues(page);
});

const commandBar = (page: Page) => page.getByRole('toolbar', { name: 'Editor actions' }).first();
const exportButton = (page: Page) => commandBar(page).locator('.export-btn');
const exportStatus = (page: Page) => page.locator('.editor-export-status [role="status"]');
const exportAlert = (page: Page) => page.locator('.editor-export-status [role="alert"]');

const commandXs = (page: Page) =>
  commandBar(page)
    .getByRole('button')
    .evaluateAll((buttons) => buttons.map((button) => Math.round(button.getBoundingClientRect().x * 10) / 10));

/** Makes the next export's PNG encoding fail, as a full or blocked canvas would. */
const failNextExports = (page: Page, fail: boolean) =>
  page.evaluate((shouldFail) => {
    if (!window.__exportToBlob) {
      const toBlob = HTMLCanvasElement.prototype.toBlob;
      window.__exportToBlob = toBlob;
      HTMLCanvasElement.prototype.toBlob = function (callback, ...rest) {
        if (window.__failExport) {
          callback(null);
          return;
        }
        toBlob.call(this, callback, ...rest);
      };
    }
    window.__failExport = shouldFail;
  }, fail);

test('command bar buttons keep their x positions across the first edit', async ({ page }) => {
  await gotoDocument(page, feedbackDocument);
  await page.locator('.layer-row[data-layer-id="feedback-ink"] .layer-row-name-button').click();
  const undo = commandBar(page).getByRole('button', { name: 'Undo' });
  await expect(undo).toBeDisabled();
  const before = await commandXs(page);

  const name = page.getByRole('textbox', { name: 'Name' });
  await name.fill('Signal ink edited');
  await name.press('Tab');
  await expect(undo).toBeEnabled({ timeout: 10_000 });

  expect(await commandXs(page)).toEqual(before);
  await expect(undo).toHaveText('↩');
});

test('export shows busy text, announces the file, and returns to its resting style', async ({ page }) => {
  await gotoDocument(page, feedbackDocument);
  const button = exportButton(page);
  await expect(button).toBeEnabled({ timeout: 15_000 });
  await expect(exportStatus(page)).toBeAttached();
  await expect(exportStatus(page)).toHaveText('');
  const restingBackground = await button.evaluate((element) => getComputedStyle(element).backgroundColor);

  const downloadPromise = page.waitForEvent('download');
  const restingBox = await button.boundingBox();
  await button.click();
  await expect(button).toHaveText(/^exporting…$/i, { useInnerText: true });
  expect(await button.boundingBox()).toEqual(restingBox);
  await expect(button).toHaveAttribute('aria-busy', 'true');
  const download = await downloadPromise;

  await expect(exportStatus(page)).toHaveText(`Exported ${download.suggestedFilename()}`);
  expect(download.suggestedFilename()).toMatch(/^cover-\d+-\d+x\d+\.png$/);
  await expect(button).toHaveText(/^export$/i, { useInnerText: true });
  await expect(button).not.toHaveAttribute('aria-busy', 'true');

  // The pointer is still over the button: it keeps the flare fill rather than turning cream, and shows no focus ring.
  const after = await button.evaluate((element) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--text-primary)';
    document.body.append(probe);
    const cream = getComputedStyle(probe).color;
    probe.remove();
    return {
      background: getComputedStyle(element).backgroundColor,
      cream,
      focusVisible: element.matches(':focus-visible'),
    };
  });
  expect(after.background).not.toBe(after.cream);
  expect(after.focusVisible).toBe(false);
  await page.mouse.move(0, 0);
  await expect
    .poll(() => button.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe(restingBackground);
});

test('an export error stays until it is dismissed and offers Retry', async ({ page }) => {
  await gotoDocument(page, feedbackDocument);
  await expect(exportButton(page)).toBeEnabled({ timeout: 15_000 });
  await failNextExports(page, true);

  await exportButton(page).click();
  const alert = exportAlert(page);
  await expect(alert).toContainText('Canvas export failed');
  // The old notice cleared itself after 5 s.
  await page.waitForTimeout(5_500);
  await expect(alert).toBeVisible();
  await expect(exportStatus(page)).toHaveText('');

  await failNextExports(page, false);
  const downloadPromise = page.waitForEvent('download');
  await alert.getByRole('button', { name: 'Retry' }).click();
  const download = await downloadPromise;
  await expect(exportStatus(page)).toHaveText(`Exported ${download.suggestedFilename()}`);
  await expect(alert).toHaveCount(0);

  await failNextExports(page, true);
  await exportButton(page).click();
  await expect(exportAlert(page)).toBeVisible();
  await exportAlert(page).getByRole('button', { name: 'Dismiss' }).click();
  await expect(exportAlert(page)).toHaveCount(0);
});

test('Projects sheet names its actions plainly and closes from an icon button', async ({ page }) => {
  await gotoDocument(page, feedbackDocument);
  await clickEditorControl(page.locator('.project-workspace-button').first());
  const projects = page.getByRole('dialog', { name: 'PROJECTS' });
  await expect(projects).toBeVisible({ timeout: 15_000 });

  const names = await projects
    .getByRole('button')
    .evaluateAll((buttons) =>
      buttons.map((button) => (button.getAttribute('aria-label') ?? button.textContent ?? '').trim()),
    );
  expect(names.filter((name) => /^create/i.test(name))).toEqual([]);
  await expect(projects.getByRole('button', { name: 'SAVE CURRENT CANVAS' })).toBeVisible();
  await expect(projects.getByRole('button', { name: 'New blank canvas' })).toBeVisible();

  const close = projects.getByRole('button', { name: 'Close projects' });
  await expect(close).toHaveClass(/ui-icon-command/);
  await expect(close).toHaveText('×');
  await expect(projects.getByLabel('Project name')).toHaveAttribute('placeholder', /…$/);
  const placeholders = await projects
    .locator('[placeholder]')
    .evaluateAll((inputs) => inputs.map((input) => input.getAttribute('placeholder') ?? ''));
  expect(placeholders.filter((placeholder) => placeholder.includes('...'))).toEqual([]);

  await close.click();
  await expect(projects).toBeHidden();
});
