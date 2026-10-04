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
  await expect(entry.getByText('time, pointer.speed, pointer.x, pointer.y')).toBeVisible();
  // A measured time where the context has timer queries, "n/a" where it has none; never stuck measuring.
  await expect(entry.getByTestId('runtime-gpu-time')).toHaveText(/^(\d+\.\d\d ms|n\/a)$/, { timeout: 15_000 });

  const canvas = entry.locator('canvas');
  const before = await canvas.screenshot();
  const amount = entry.locator('input[type="range"]').first();
  await amount.focus();
  await amount.press('Home');
  await expect(entry.getByText('0%')).toBeVisible();
  await expect.poll(async () => (await canvas.screenshot()).equals(before)).toBe(false);

  // Animate: the frame changes on its own.
  await amount.press('End');
  await page.getByRole('button', { name: 'Animate' }).click();
  const moving = await canvas.screenshot();
  await expect.poll(async () => (await canvas.screenshot()).equals(moving)).toBe(false);
  await page.getByRole('button', { name: 'Still' }).click();
});
