import { expect, test } from '@playwright/test';
import { expectNoBrowserIssues, setupBrowserTestPage } from './helpers';

// /dev/runtime is registered outside production builds only (apps/web/app/routes.ts).
test.skip(process.env.PLAYWRIGHT_WEB_SERVER_MODE === 'preview', 'the runtime catalogue is a development route');

test.afterEach(async ({ page }) => {
  expectNoBrowserIssues(page);
});

test('the runtime catalogue shows Noise Warp with working controls and a GPU time', async ({ page }) => {
  await setupBrowserTestPage(page);
  await page.goto('/dev/runtime');
  const webgl2 = await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')));
  test.skip(!webgl2, 'the runtime needs WebGL2');

  const entry = page.locator('article[data-effect="noiseWarp"]');
  await expect(entry.getByRole('heading', { name: 'Noise Warp' })).toBeVisible();
  await expect(entry.getByText('wave track, pointer.x, pointer.y, pointer.speed')).toBeVisible();
  // A measured time where the context has timer queries, "n/a" where it has none; never stuck measuring.
  await expect(entry.getByTestId('runtime-gpu-time')).toHaveText(/^(\d+\.\d\d ms|n\/a)$/, { timeout: 15_000 });

  const canvas = entry.locator('canvas');
  const before = await canvas.screenshot();
  const amount = entry.locator('input[type="range"]').first();
  await amount.focus();
  await amount.press('Home');
  await expect(entry.getByText('0%')).toBeVisible();
  await expect.poll(async () => (await canvas.screenshot()).equals(before)).toBe(false);

  // Still: moving the pointer over the canvas drives the pointer bindings.
  await amount.press('End');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('catalogue canvas has no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const centred = await canvas.screenshot();
  await page.mouse.move(box.x + box.width - 4, box.y + box.height - 4, { steps: 4 });
  await expect.poll(async () => (await canvas.screenshot()).equals(centred)).toBe(false);
  await page.mouse.move(0, 0);

  // Animate: the frame changes on its own.
  await page.getByRole('button', { name: 'Animate' }).click();
  const moving = await canvas.screenshot();
  await expect.poll(async () => (await canvas.screenshot()).equals(moving)).toBe(false);
  await page.getByRole('button', { name: 'Still' }).click();
});

test('the runtime catalogue shows Vortex, with the swirl centre following the pointer', async ({ page }) => {
  await setupBrowserTestPage(page);
  await page.goto('/dev/runtime');
  const webgl2 = await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')));
  test.skip(!webgl2, 'the runtime needs WebGL2');

  const entry = page.locator('article[data-effect="vortex"]');
  await expect(entry.getByRole('heading', { name: 'Vortex' })).toBeVisible();
  await expect(entry.getByText('wave track, pointer.x, pointer.y, hover')).toBeVisible();
  await expect(entry.getByTestId('runtime-gpu-time')).toHaveText(/^(\d+\.\d\d ms|n\/a)$/, { timeout: 15_000 });

  const canvas = entry.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('catalogue canvas has no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const centred = await canvas.screenshot();
  await page.mouse.move(box.x + 4, box.y + 4, { steps: 4 });
  await expect.poll(async () => (await canvas.screenshot()).equals(centred)).toBe(false);
  await page.mouse.move(0, 0);
});

test('the catalogue exports the sample cover as a live package and plays it', async ({ page }) => {
  await setupBrowserTestPage(page);
  await page.goto('/dev/runtime');
  const webgl2 = await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')));
  test.skip(!webgl2, 'the runtime needs WebGL2');

  const panel = page.getByRole('region', { name: 'Live package export' });
  await panel.getByRole('button', { name: 'Export' }).click();
  await expect(panel.getByTestId('live-export-summary')).toContainText(
    /chain: .*grain \(Grain\).*noiseWarp \(Noise Warp\)/,
    {
      timeout: 30_000,
    },
  );
  await expect(panel.getByTestId('live-export-parity')).toHaveText(/^pass/);
  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Download .zip' }).click();
  expect((await download).suggestedFilename()).toBe('Sample cover-live-540.zip');
});

test('the runtime catalogue shows Liquid Morph with a working frequency control', async ({ page, browserName }) => {
  await setupBrowserTestPage(page);
  await page.goto('/dev/runtime');
  const webgl2 = await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')));
  test.skip(!webgl2, 'the runtime needs WebGL2');

  const entry = page.locator('article[data-effect="morph"]');
  await expect(entry.getByRole('heading', { name: 'Morph' })).toBeVisible();
  await expect(entry.getByText('wave track, pointer.speed')).toBeVisible();
  await expect(entry.getByTestId('runtime-gpu-time')).toHaveText(/^(\d+\.\d\d ms|n\/a)$/, { timeout: 15_000 });

  // The entry sits below the fold; bring it into view before capturing, so WebKit composites the canvas.
  await entry.scrollIntoViewIfNeeded();
  const canvas = entry.locator('canvas');
  const frequency = entry.getByRole('slider', { name: 'Morph Freq' });
  await expect(frequency).toHaveValue('5');
  const before = await canvas.screenshot();
  await frequency.focus();
  await frequency.press('End');
  await expect(frequency).toHaveValue('20');
  // WebKit on Linux (CI) presents a recreated catalogue canvas that started below the fold one update late; Vortex's
  // entry shows the same lag, so the pixel check runs in the other engines and in WebKit on macOS.
  if (browserName === 'webkit' && process.platform === 'linux') return;
  await expect.poll(async () => (await canvas.screenshot()).equals(before)).toBe(false);
});

test('the runtime catalogue shows radial chromatic aberration, with the fringe centre following the pointer', async ({
  page,
  browserName,
}) => {
  await setupBrowserTestPage(page);
  await page.goto('/dev/runtime');
  const webgl2 = await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')));
  test.skip(!webgl2, 'the runtime needs WebGL2');

  const entry = page.locator('article[data-effect="ca"]');
  await expect(entry.getByRole('heading', { name: 'Chrom. Ab.' })).toBeVisible();
  await expect(entry.getByText('wave track, pointer.x, pointer.y, pointer.speed')).toBeVisible();
  await expect(entry.getByTestId('runtime-gpu-time')).toHaveText(/^(\d+\.\d\d ms|n\/a)$/, { timeout: 15_000 });

  // The entry sits below the fold; bring it into view before capturing, so WebKit composites the canvas.
  await entry.scrollIntoViewIfNeeded();
  // WebKit on Linux (CI) presents a recreated catalogue canvas below the fold one update late (see Liquid Morph).
  if (browserName === 'webkit' && process.platform === 'linux') return;
  const canvas = entry.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('catalogue canvas has no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const centred = await canvas.screenshot();
  await page.mouse.move(box.x + 4, box.y + 4, { steps: 4 });
  await expect.poll(async () => (await canvas.screenshot()).equals(centred)).toBe(false);
  await page.mouse.move(0, 0);
});

test('the runtime catalogue shows Data Mosh with a working amount control', async ({ page, browserName }) => {
  await setupBrowserTestPage(page);
  await page.goto('/dev/runtime');
  const webgl2 = await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')));
  test.skip(!webgl2, 'the runtime needs WebGL2');

  const entry = page.locator('article[data-effect="dataMosh"]');
  await expect(entry.getByRole('heading', { name: 'Data Mosh' })).toBeVisible();
  await expect(entry.getByText('step track, pulse track, click')).toBeVisible();
  await expect(entry.getByTestId('runtime-gpu-time')).toHaveText(/^(\d+\.\d\d ms|n\/a)$/, { timeout: 15_000 });

  // The entry sits below the fold; bring it into view before capturing, so WebKit composites the canvas.
  await entry.scrollIntoViewIfNeeded();
  const canvas = entry.locator('canvas');
  const amount = entry.getByRole('slider', { name: 'Data Mosh' });
  await expect(amount).toHaveValue('30');
  const before = await canvas.screenshot();
  await amount.focus();
  await amount.press('End');
  await expect(amount).toHaveValue('100');
  // WebKit on Linux (CI) presents a recreated catalogue canvas below the fold one update late (see Liquid Morph).
  if (browserName === 'webkit' && process.platform === 'linux') return;
  await expect.poll(async () => (await canvas.screenshot()).equals(before)).toBe(false);
});

test('the runtime catalogue shows Tear, with a click spiking the tear', async ({ page, browserName }) => {
  await setupBrowserTestPage(page);
  await page.goto('/dev/runtime');
  const webgl2 = await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')));
  test.skip(!webgl2, 'the runtime needs WebGL2');

  const entry = page.locator('article[data-effect="tear"]');
  await expect(entry.getByRole('heading', { name: 'Tear' })).toBeVisible();
  await expect(entry.getByText('step track, pulse track, click')).toBeVisible();
  await expect(entry.getByTestId('runtime-gpu-time')).toHaveText(/^(\d+\.\d\d ms|n\/a)$/, { timeout: 15_000 });

  const canvas = entry.locator('canvas');
  // The entry sits below the fold, and the mouse works in viewport coordinates.
  await canvas.scrollIntoViewIfNeeded();
  // WebKit on Linux (CI) presents a recreated catalogue canvas below the fold one update late (see Liquid Morph).
  if (browserName === 'webkit' && process.platform === 'linux') return;
  const box = await canvas.boundingBox();
  if (!box) throw new Error('catalogue canvas has no box');
  // Hover first so the resting frame is taken with the pointer on the canvas; only the press changes the tear.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
  await page.waitForTimeout(400);
  const resting = await canvas.screenshot();
  await page.mouse.down();
  await expect.poll(async () => (await canvas.screenshot()).equals(resting)).toBe(false);
  await page.mouse.up();
  await page.mouse.move(0, 0);
});

test('the runtime catalogue shows Glitch with a working VHS Streaks control', async ({ page, browserName }) => {
  await setupBrowserTestPage(page);
  await page.goto('/dev/runtime');
  const webgl2 = await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')));
  test.skip(!webgl2, 'the runtime needs WebGL2');

  const entry = page.locator('article[data-effect="glitch"]');
  await expect(entry.getByRole('heading', { name: 'Glitch' })).toBeVisible();
  await expect(entry.getByText('step track, pulse track, click')).toBeVisible();
  await expect(entry.getByTestId('runtime-gpu-time')).toHaveText(/^(\d+\.\d\d ms|n\/a)$/, { timeout: 15_000 });

  // The entry sits below the fold; bring it into view before capturing, so WebKit composites the canvas.
  await entry.scrollIntoViewIfNeeded();
  const canvas = entry.locator('canvas');
  const amount = entry.getByRole('slider', { name: 'VHS Streaks' });
  await expect(amount).toHaveValue('14');
  const before = await canvas.screenshot();
  await amount.focus();
  await amount.press('End');
  // The editor's slider runs to 24 streaks.
  await expect(amount).toHaveValue('24');
  // WebKit on Linux (CI) presents a recreated catalogue canvas below the fold one update late (see Liquid Morph).
  if (browserName === 'webkit' && process.platform === 'linux') return;
  await expect.poll(async () => (await canvas.screenshot()).equals(before)).toBe(false);
});

test('the runtime catalogue shows plate parallax, with depth and strength controls', async ({ page, browserName }) => {
  await setupBrowserTestPage(page);
  await page.goto('/dev/runtime');
  const webgl2 = await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')));
  test.skip(!webgl2, 'the runtime needs WebGL2');

  const entry = page.locator('article[data-effect="plateParallax"]');
  await expect(entry.getByRole('heading', { name: 'Plate parallax' })).toBeVisible();
  await expect(entry.getByText('pointer.x, pointer.y, wave track')).toBeVisible();
  const strength = entry.getByRole('slider', { name: 'Strength' });
  const topDepth = entry.getByRole('slider', { name: 'Top depth' });
  await expect(strength).toHaveValue('4');
  await expect(topDepth).toHaveValue('100');

  // Below the fold: bring it into view so every engine composites the canvas (see Liquid Morph above).
  await entry.scrollIntoViewIfNeeded();
  await topDepth.focus();
  await topDepth.press('Home');
  await expect(entry.getByText('card (depth 0%)')).toBeVisible();
  if (browserName === 'webkit' && process.platform === 'linux') return;

  const canvas = entry.locator('canvas');
  await expect.poll(async () => (await canvas.boundingBox())?.width ?? 0).toBeGreaterThan(0);
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const centred = await canvas.screenshot();
  await page.mouse.move(box.x + 4, box.y + 4, { steps: 4 });
  await expect.poll(async () => (await canvas.screenshot()).equals(centred)).toBe(false);

  // At zero strength the pointer moves nothing: the corner frame is the centred one.
  await strength.focus();
  await strength.press('Home');
  await expect(strength).toHaveValue('0');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(250);
  const still = await canvas.screenshot();
  await page.mouse.move(box.x + 4, box.y + 4, { steps: 4 });
  await page.waitForTimeout(250);
  expect((await canvas.screenshot()).equals(still)).toBe(true);
  await page.mouse.move(0, 0);
});
