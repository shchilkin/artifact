import { expect, test } from '@playwright/test';
import { expectNoBrowserIssues, setupBrowserTestPage } from './helpers';

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8Dwn4GBgYGJAQoAHgQCAZ7h6N8AAAAASUVORK5CYII=';

const composition = {
  artifactPackage: 'project',
  manifest: { kind: 'artifact-project-package', version: 1, documentSchemaVersion: 3 },
  document: {
    schemaVersion: 3,
    global: { seed: 42, aspect: '1:1', bg: 'transparent' },
    layers: [
      { id: 'layer-1780509438366-378', kind: 'fill', name: 'Ground', color: '#5e30eb', opacity: 100 },
      {
        id: 'layer-1780509986923-502',
        kind: 'image',
        name: 'Portrait',
        src: PIXEL,
        x: 0.5,
        y: 0.5,
        scaleX: 120,
        scaleY: 120,
        opacity: 100,
      },
      {
        id: 'layer-1780509501549-384',
        kind: 'emoji',
        name: 'Emoji field',
        emojis: ['✦'],
        density: 4,
        minSz: 20,
        maxSz: 30,
      },
      { id: 'layer-1780509662261-414', kind: 'effect', name: 'Glitch', preset: 'glitch', glitch: 8 },
      { id: 'layer-1780509546581-404', kind: 'effect', name: 'Grain', preset: 'grain', grain: 8 },
      { id: 'layer-1780509791460-474', kind: 'effect', name: 'Noise Warp', preset: 'noiseWarp', noiseWarp: 4 },
      { id: 'layer-1780509850760-482', kind: 'effect', name: 'Vortex', preset: 'vortex', vortex: 2 },
      { id: 'layer-1780509870977-483', kind: 'effect', name: 'Tear', preset: 'tear', tearAmt: 1, tearSize: 4 },
      {
        id: 'layer-1780509894426-491',
        kind: 'effect',
        name: 'Scanlines',
        preset: 'scanlines',
        scanlines: 8,
        scanlineWidth: 2,
      },
      { id: 'layer-1780509923809-501', kind: 'effect', name: 'Chromatic Aberration', preset: 'ca', ca: 2 },
    ],
  },
};

test('Motion Lab loads, scrubs, tunes, starts, and exports a document-backed recipe', async ({ page }) => {
  await setupBrowserTestPage(page);
  await page.route('**/viber.artifact', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(composition) }),
  );

  await page.goto('/dev/motion-lab', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Motion Lab' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Neutral Frame ready', { timeout: 20_000 });
  await expect(page.getByText('ready', { exact: true })).toBeVisible();
  await expect(page.getByText('mismatch', { exact: true })).toBeVisible();
  await expect(page.getByText('transform.translateX', { exact: true }).first()).toBeVisible();

  const canvas = page.getByLabel('Mixed Media Artwork preview');
  await expect(canvas).toBeVisible();
  await expect
    .poll(() =>
      canvas.evaluate((element: HTMLCanvasElement) => {
        const pixels = element.getContext('2d')?.getImageData(0, 0, element.width, element.height).data;
        return pixels ? pixels.some((value, index) => index % 4 !== 3 && value > 16) : false;
      }),
    )
    .toBe(true);

  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect
    .poll(async () => Number((await page.getByText(/^Time /).textContent())?.match(/[\d.]+/)?.[0] ?? 0))
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pause' }).click();

  const scrubber = page.getByRole('slider', { name: /^Time/ });
  await scrubber.fill('1.25');
  await expect(page.getByText(/^Time 1\.25s$/)).toBeVisible();
  await page.getByRole('button', { name: 'Neutral frame' }).click();
  await expect(page.getByText(/^Time 0\.00s$/)).toBeVisible();

  const rangeMax = page.getByRole('group', { name: 'transform.translateX' }).getByLabel('Range max');
  await rangeMax.fill('0.06');
  await rangeMax.blur();
  await expect(page.getByRole('status')).toContainText('Neutral Frame ready', { timeout: 20_000 });

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export sidecar' }).click();
  await expect((await download).suggestedFilename()).toBe('viber.motion.json');
  expectNoBrowserIssues(page);
});
