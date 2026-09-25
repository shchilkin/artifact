import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  expectImageExportDownload,
  expectLayerCanvasToHavePixels,
  expectNoBrowserIssues,
  setupBrowserTestPage,
  switchToLayerView,
  switchToNodeView,
} from './helpers';

const fontFixture = new URL('../fixtures/native-2d/text-font.artifact.json', import.meta.url);

test.beforeEach(async ({ page }) => setupBrowserTestPage(page));
test.afterEach(async ({ page }) => expectNoBrowserIssues(page));

test('main Web shared owner edits, undoes, reopens a font package and exports both formats', async ({
  page,
}, testInfo) => {
  await page.goto('/app?new=blank');
  await expect(page.getByRole('heading', { name: 'Artifact Cover Editor' })).toBeVisible();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open document file' }).click();
  await (await chooserPromise).setFiles(fontFixture.pathname);
  await page.getByRole('dialog', { name: 'Open artifact file' }).getByRole('button', { name: 'OPEN FILE' }).click();
  await expect(page.getByRole('dialog', { name: 'Open artifact file' })).toBeHidden();
  await expectLayerCanvasToHavePixels(page);

  await page.locator('.sidebar .layer-row').filter({ hasText: 'Editable title' }).click();
  await page.getByRole('textbox', { name: 'Text' }).fill('P05 EDITED TITLE');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('doc') ?? '{}').layers?.find(
            (layer: { id: string }) => layer.id === 'font-title',
          )?.content,
      ),
    )
    .toBe('P05 EDITED TITLE');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('doc') ?? '{}').layers?.find(
            (layer: { id: string }) => layer.id === 'font-title',
          )?.content,
      ),
    )
    .toBe('ARTIFACT 2D');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('doc') ?? '{}').layers?.find(
            (layer: { id: string }) => layer.id === 'font-title',
          )?.content,
      ),
    )
    .toBe('P05 EDITED TITLE');

  await switchToNodeView(page);
  await expect(page.locator('.node-shell-kind-export')).toBeVisible();
  await switchToLayerView(page);
  await expectLayerCanvasToHavePixels(page);

  const packagePromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Share link or download editable files' }).click();
  await page.getByRole('menuitem', { name: 'Download package + assets', exact: true }).click();
  const packageDownload = await packagePromise;
  const packagePath = testInfo.outputPath('p05-main-web-font-roundtrip.artifact');
  await packageDownload.saveAs(packagePath);
  const projectPackage = JSON.parse(readFileSync(packagePath, 'utf8'));
  expect(projectPackage.manifest?.fonts?.[0]?.embedding).toBe('embedded-file');
  expect(projectPackage.document?.fontAssets?.[0]?.dataUrl).toContain('data:font/');

  const png = await expectImageExportDownload(page, /\.png$/i);
  const pngPath = testInfo.outputPath('p05-main-web-export.png');
  await png.saveAs(pngPath);

  await switchToNodeView(page);
  await page.locator('.node-shell-kind-export').click();
  await page.getByRole('combobox', { name: 'Format' }).selectOption('jpeg');
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('doc') ?? '{}').export?.format))
    .toBe('jpeg');
  const jpegButton = page.locator('.bottom-bar .export-btn');
  await expect(jpegButton).toBeEnabled();
  const jpegPromise = page.waitForEvent('download');
  await jpegButton.click();
  const jpeg = await jpegPromise;
  expect(jpeg.suggestedFilename()).toMatch(/\.jpe?g$/i);
  const jpegPath = testInfo.outputPath('p05-main-web-export.jpeg');
  await jpeg.saveAs(jpegPath);

  const reopenedChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open document file' }).click();
  await (await reopenedChooser).setFiles(packagePath);
  await page.getByRole('dialog', { name: 'Open artifact file' }).getByRole('button', { name: 'OPEN FILE' }).click();
  await expect(page.getByRole('dialog', { name: 'Open artifact file' })).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('doc') ?? '{}').layers?.find(
            (layer: { id: string }) => layer.id === 'font-title',
          )?.content,
      ),
    )
    .toBe('P05 EDITED TITLE');
  await expectLayerCanvasToHavePixels(page);

  writeFileSync(
    testInfo.outputPath('p05-main-web-artifacts.json'),
    JSON.stringify({ packagePath, pngPath, jpegPath }, null, 2),
  );
});

test('main Web reopens a locally saved native copy with assets', async ({ page }, testInfo) => {
  const nativeCopyPath = process.env.P05_NATIVE_ROUNDTRIP_PATH;
  test.skip(!nativeCopyPath, 'Set P05_NATIVE_ROUNDTRIP_PATH for a local native Save Copy roundtrip.');
  await page.goto('/app?new=blank');
  await expect(page.getByRole('heading', { name: 'Artifact Cover Editor' })).toBeVisible();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open document file' }).click();
  await (await chooserPromise).setFiles(nativeCopyPath!);
  await page.getByRole('dialog', { name: 'Open artifact file' }).getByRole('button', { name: 'OPEN FILE' }).click();
  await expect(page.getByRole('dialog', { name: 'Open artifact file' })).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem('doc') ?? '{}').layers?.some(
          (layer: { content?: string }) => layer.content === 'WEB MAC ROUNDTRIP',
        ),
      ),
    )
    .toBe(true);
  await expectLayerCanvasToHavePixels(page);
  const download = await expectImageExportDownload(page, /\.png$/i);
  await download.saveAs(testInfo.outputPath('p05-native-copy-web-export.png'));
});
