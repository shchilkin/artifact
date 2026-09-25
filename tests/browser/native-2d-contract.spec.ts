import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  expectImageExportDownload,
  expectLayerCanvasToHavePixels,
  expectNoBrowserIssues,
  setupBrowserTestPage,
  switchToNodeView,
} from './helpers';

const fixtureNames = [
  'text-font',
  'alpha-nonsquare',
  'alpha-jpeg',
  'blend-modes',
  'branch-merge-mask-repeat',
  'source-families',
  'graph-utilities',
  'hundred-node',
] as const;

function documentFor(name: string) {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL(`../fixtures/native-2d/${name}.artifact.json`, import.meta.url)), 'utf8'),
  );
}

async function openDocument(page: import('@playwright/test').Page, name: string, doc = documentFor(name)) {
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Artifact Cover Editor' })).toBeVisible();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open document file' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: `${name}.artifact.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  });
  await expect(page.getByRole('dialog', { name: 'Open artifact file' })).toBeVisible();
  await page.getByRole('button', { name: 'OPEN FILE' }).click();
  await expect(page.getByRole('dialog', { name: 'Open artifact file' })).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('doc') ?? '{}').global?.seed))
    .toBe(doc.global.seed);
  return doc;
}

test.beforeEach(async ({ page }) => setupBrowserTestPage(page));
test.afterEach(async ({ page }) => expectNoBrowserIssues(page));

for (const name of fixtureNames) {
  test(`main Web imports ${name} fixture`, async ({ page }, testInfo) => {
    const doc = await openDocument(page, name);
    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('doc') ?? '{}').layers?.length))
      .toBe(doc.layers.length);
    await expectLayerCanvasToHavePixels(page);
    if (name === 'text-font' || name === 'branch-merge-mask-repeat') {
      await page.screenshot({ path: testInfo.outputPath(`${name}-editor.png`) });
    }
    if (name === 'branch-merge-mask-repeat') {
      await switchToNodeView(page);
      await page.screenshot({ path: testInfo.outputPath(`${name}-nodes.png`) });
    }
    if (name === 'text-font') {
      await expect
        .poll(() =>
          page.evaluate(() =>
            Array.from(document.fonts).some(
              (face) =>
                face.family.replaceAll('"', '') === 'Artifact Imported covered grace p01' && face.status === 'loaded',
            ),
          ),
        )
        .toBe(true);
    }
    if (name === 'alpha-nonsquare') {
      await expect
        .poll(() =>
          page
            .locator('.pixi-container canvas')
            .first()
            .evaluate((canvas) => {
              const element = canvas as HTMLCanvasElement;
              const context = element.getContext('2d', { willReadFrequently: true });
              if (!context) return false;
              const corner = context.getImageData(0, 0, 1, 1).data[3];
              const center = context.getImageData(Math.floor(element.width / 2), Math.floor(element.height / 2), 1, 1)
                .data[3];
              return corner === 0 && center > 0 && center < 255;
            }),
        )
        .toBe(true);
    }
  });
}

test('Web output responds to repeat and mask parameters', async ({ page }) => {
  const original = documentFor('branch-merge-mask-repeat');
  const exportDigest = async () => {
    const download = await expectImageExportDownload(page, /\.png$/i);
    const path = await download.path();
    if (!path) throw new Error('Export path missing');
    return createHash('sha256').update(readFileSync(path)).digest('hex');
  };
  await openDocument(page, 'branch-merge-mask-repeat', original);
  const baseline = await exportDigest();
  const repeatChanged = structuredClone(original);
  repeatChanged.graph.repeatNodes[0].count = 1;
  await openDocument(page, 'branch-merge-mask-repeat', repeatChanged);
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('doc') ?? '{}').graph?.repeatNodes?.[0]?.count))
    .toBe(1);
  expect(await exportDigest()).not.toBe(baseline);
  const maskChanged = structuredClone(original);
  maskChanged.graph.maskNodes[0].invert = true;
  await openDocument(page, 'branch-merge-mask-repeat', maskChanged);
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('doc') ?? '{}').graph?.maskNodes?.[0]?.invert))
    .toBe(true);
  expect(await exportDigest()).not.toBe(baseline);
});
