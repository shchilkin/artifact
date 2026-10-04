import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { PLATE_INPUT_FRAMES, PLATE_MOTION_FRAMES } from '../../packages/runtime/src/testing/plateCase';
import { expectNoBrowserIssues, setupBrowserTestPage } from './helpers';
import type * as Plates from './runtime/platesPage';

// Plate transforms and pointer parallax (issue #394) on the harness fixtures: the resting frame equals the still,
// pointer and breathing goldens, and no uncovered edge at the strongest offsets. Needs the dev server (`/@fs/`).
test.skip(process.env.PLAYWRIGHT_WEB_SERVER_MODE === 'preview', 'needs the dev server to import the runtime source');

const PLATES_MODULE = `/@fs${fileURLToPath(new URL('./runtime/platesPage.ts', import.meta.url))}`;
/** As in runtime-harness.spec.ts: goldens are recorded in CI's Linux container. */
const GOLDENS_ENABLED = process.platform === 'linux' || process.env.RUNTIME_GOLDENS === '1';
const GOLDEN_OPTIONS = { threshold: 0.05, maxDiffPixelRatio: 0.002 };

async function call<T extends keyof typeof Plates>(page: Page, name: T, ...args: Parameters<(typeof Plates)[T]>) {
  return page.evaluate(
    async ([url, name, args]) => {
      const plates = (await import(/* @vite-ignore */ url)) as Record<string, (...a: unknown[]) => unknown>;
      return plates[name](...args);
    },
    [PLATES_MODULE, name, args] as const,
  ) as Promise<Awaited<ReturnType<(typeof Plates)[T]>>>;
}

test.beforeEach(async ({ page }) => {
  await setupBrowserTestPage(page);
  await page.goto('/docs');
  const webgl2 = await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')));
  test.skip(!webgl2, 'the runtime needs WebGL2');
});

test.afterEach(async ({ page }) => {
  expectNoBrowserIssues(page);
});

test('at rest, moving plates draw exactly the still', async ({ page }, testInfo) => {
  const result = await call(page, 'restingParity');
  const { comparison } = result;
  if (comparison.mode !== 'pixels') throw new Error('expected a pixel comparison');
  testInfo.annotations.push({
    type: 'parity',
    description: `identical: ${result.identical}, worst channel ${comparison.maxChannelDiff}`,
  });
  expect(comparison.pass).toBe(true);
  expect(comparison.maxChannelDiff).toBeLessThanOrEqual(1);
});

test('pointer and breathing goldens', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'goldens are recorded for Chromium only');
  test.skip(!GOLDENS_ENABLED, 'goldens are recorded on Linux; set RUNTIME_GOLDENS=1 to compare locally');
  const frames = await call(page, 'goldens');
  expect(frames.map((frame) => frame.name)).toEqual(
    [...PLATE_INPUT_FRAMES, ...PLATE_MOTION_FRAMES].map((frame) => frame.name),
  );
  // breath-0 is the centred rest, and the breath is as large a quarter loop before and after its top.
  expect(new Set(frames.map((frame) => frame.png)).size).toBe(frames.length - 2);
  for (const frame of frames) {
    const png = Buffer.from(frame.png.slice(frame.png.indexOf(',') + 1), 'base64');
    expect.soft(png).toMatchSnapshot(['plates', `${frame.name}.png`], GOLDEN_OPTIONS);
  }
});

test.describe('edges at the strongest offsets', () => {
  const strongest = { strength: 0.08, breathing: 0.03, tilt: 4 };

  test('a covering plate never uncovers the frame', async ({ page }, testInfo) => {
    const results = await call(page, 'edges', { bindings: strongest });
    for (const result of results) {
      if (result.uncovered === 0) continue;
      const path = testInfo.outputPath(`edges-${result.name}.png`);
      await writeFile(path, Buffer.from(result.png.slice(result.png.indexOf(',') + 1), 'base64'));
      await testInfo.attach(`edges-${result.name}.png`, { path, contentType: 'image/png' });
    }
    expect(results.filter((result) => result.uncovered > 0).map((result) => result.name)).toEqual([]);
  });

  test('the check sees the edge when cover is off', async ({ page }) => {
    const results = await call(page, 'edges', { bindings: strongest, cover: false });
    // At rest the plate covers the frame by itself; at every corner it uncovers two sides.
    const corners = results.filter((result) => !result.name.startsWith('pointer-centre'));
    expect(corners.every((result) => result.uncovered > 0)).toBe(true);
  });
});
