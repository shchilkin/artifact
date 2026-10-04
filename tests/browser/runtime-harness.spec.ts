import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { FIXTURES } from '../../packages/runtime/src/testing/effectCase';
import type { ParityComparison } from '../../packages/runtime/src/testing/parity';
import { EFFECT_CASES } from '../../packages/runtime/test/cases/index';
import { expectNoBrowserIssues, setupBrowserTestPage } from './helpers';
import type * as Harness from './runtime/harnessPage';

// Runtime parity harness (issue #331). Every case in packages/runtime/test/cases gets static parity against the
// editor on each fixture, its golden frames, and a GPU time. Tolerances and the golden workflow are documented in
// docs/runtime/README.md. The runtime is not in the app bundle, so this needs the dev server (`/@fs/` imports).
test.skip(process.env.PLAYWRIGHT_WEB_SERVER_MODE === 'preview', 'needs the dev server to import the runtime source');

const HARNESS_MODULE = `/@fs${fileURLToPath(new URL('./runtime/harnessPage.ts', import.meta.url))}`;

/**
 * Goldens are recorded in CI's Linux Playwright container (Chromium, SwiftShader). Other platforms rasterise
 * differently, so they skip golden comparison unless `RUNTIME_GOLDENS=1` asks for platform-suffixed local goldens.
 */
const GOLDENS_ENABLED = process.platform === 'linux' || process.env.RUNTIME_GOLDENS === '1';
/** Same container, same GPU path: frames should match exactly. The allowance absorbs a stray rounding change. */
const GOLDEN_OPTIONS = { threshold: 0.05, maxDiffPixelRatio: 0.002 };

const BROKEN_NOISE_WARP = { search: 'vec2(ox, oy)', replace: 'vec2(oy, ox)' };
/** Grain at half the editor's strength: the same noise shape, too faint. */
const FAINT_GRAIN = { search: 'uGrain * 3.0', replace: 'uGrain * 1.5' };
/** Scanlines one row lower than the editor's, which start at the top row. */
const SHIFTED_SCANLINES = { search: '* size.y - 0.5 -', replace: '* size.y - 1.5 -' };
/** Chromatic split without its first (Canvas 2D) stage: only the editor's GPU filter runs. */
const RGB_SPLIT_GPU_ONLY = { search: 'floor(uRgbSplit * size.x / 540.0 + 0.5)', replace: '0.0' };
/** Chromatic split without the GPU filter's red shift (a patch on the second stage, the editor's `RGB_FRAG`). */
const RGB_SPLIT_NO_GPU_RED = { search: 'clamp(uv + uDir,', replace: 'clamp(uv,' };
/** Ripple with its rings mirrored (the shift's sign flipped), as a phase of half a turn would draw them. */
const MIRRORED_RIPPLE = { search: 'float shift = sin(', replace: 'float shift = -sin(' };
/** Ripple truncating the source position instead of rounding it as the editor's `Math.round` does. */
const TRUNCATED_RIPPLE = { search: 'floor(source + 0.5)', replace: 'floor(source)' };

async function openHarness(page: Page) {
  await setupBrowserTestPage(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/docs');
  const webgl2 = await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')));
  test.skip(!webgl2, 'the runtime needs WebGL2');
}

async function runParity(page: Page, effect: string, fixture: string, options: Harness.ParityOptions = {}) {
  return page.evaluate(
    async ([url, effect, fixture, options]) => {
      const harness = (await import(/* @vite-ignore */ url)) as typeof Harness;
      return harness.parity(effect, fixture as Parameters<typeof harness.parity>[1], options);
    },
    [HARNESS_MODULE, effect, fixture, options] as const,
  );
}

function pngBuffer(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
}

/** Saves editor | runtime | diff next to the test results and attaches it to the report. */
async function attachReview(testInfo: TestInfo, name: string, reviewPng: string) {
  const path = testInfo.outputPath(`${name}-editor-runtime-diff.png`);
  await writeFile(path, pngBuffer(reviewPng));
  await testInfo.attach(`${name}-editor-runtime-diff.png`, { path, contentType: 'image/png' });
}

function describeComparison(comparison: ParityComparison): string {
  if (comparison.mode === 'pixels') {
    return (
      `pixels: ${(comparison.differentRatio * 100).toFixed(3)}% over ${comparison.tolerance.channelThreshold} levels ` +
      `(max ${(comparison.tolerance.maxDifferentRatio * 100).toFixed(3)}%), mean abs diff ` +
      `${comparison.meanAbsDiff.toFixed(4)} (max ${comparison.tolerance.maxMeanAbsDiff}), worst channel ` +
      `${comparison.maxChannelDiff}`
    );
  }
  return (
    `statistics: mean diff ${comparison.meanDiff.toFixed(3)} (max ${comparison.tolerance.maxMeanDiff}), std dev ` +
    `diff ${comparison.stdDevDiff.toFixed(3)} (max ${comparison.tolerance.maxStdDevDiff}), histogram distance ` +
    `${comparison.histogramDistance.toFixed(4)} (max ${comparison.tolerance.maxHistogramDistance})`
  );
}

test.beforeEach(async ({ page }) => {
  await openHarness(page);
});

test.afterEach(async ({ page }) => {
  expectNoBrowserIssues(page);
});

test('every registered effect has a harness case', async ({ page }) => {
  const uncovered = await page.evaluate(async (url) => {
    const harness = (await import(/* @vite-ignore */ url)) as typeof Harness;
    return harness.uncoveredEffects();
  }, HARNESS_MODULE);
  expect(uncovered, 'add a case in packages/runtime/test/cases for each of these').toEqual([]);
});

for (const [effect, effectCase] of Object.entries(EFFECT_CASES)) {
  test.describe(effect, () => {
    for (const fixture of effectCase.fixtures ?? FIXTURES) {
      test(`static parity with the editor on the ${fixture} fixture`, async ({ page }, testInfo) => {
        const result = await runParity(page, effect, fixture);
        await attachReview(testInfo, `${effect}-${fixture}`, result.reviewPng);
        testInfo.annotations.push({ type: 'parity', description: describeComparison(result.comparison) });
        expect(result.comparison.pass, describeComparison(result.comparison)).toBe(true);
      });
    }

    if ((effectCase.frames ?? []).length > 0) {
      test('motion and input goldens', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'chromium', 'goldens are recorded for Chromium only');
        test.skip(!GOLDENS_ENABLED, 'goldens are recorded on Linux; set RUNTIME_GOLDENS=1 to compare locally');
        const frames = await page.evaluate(
          async ([url, effect]) => {
            const harness = (await import(/* @vite-ignore */ url)) as typeof Harness;
            return harness.goldens(effect);
          },
          [HARNESS_MODULE, effect] as const,
        );
        expect(frames.map((frame) => frame.name)).toEqual((effectCase.frames ?? []).map((frame) => frame.name));
        // More than one distinct frame proves the frame samples reach the shader.
        expect(new Set(frames.map((frame) => frame.png)).size).toBeGreaterThan(1);
        for (const frame of frames) {
          expect.soft(pngBuffer(frame.png)).toMatchSnapshot([effect, `${frame.name}.png`], GOLDEN_OPTIONS);
        }
      });
    }

    test('GPU time at 540px', async ({ page }, testInfo) => {
      const ms = await page.evaluate(
        async ([url, effect]) => {
          const harness = (await import(/* @vite-ignore */ url)) as typeof Harness;
          return harness.gpuTime(effect);
        },
        [HARNESS_MODULE, effect] as const,
      );
      const description = ms === null ? 'n/a (no EXT_disjoint_timer_query_webgl2)' : `${ms.toFixed(3)} ms`;
      testInfo.annotations.push({ type: 'gpu-time', description });
      console.log(`[runtime] ${effect} GPU time at 540px (${testInfo.project.name}): ${description}`);
      if (ms !== null) expect(ms).toBeGreaterThan(0);
    });
  });
}

test.describe('the harness itself', () => {
  test('a broken Noise Warp port fails parity with a diff image', async ({ page }, testInfo) => {
    const result = await runParity(page, 'noiseWarp', 'graphic', { fragmentPatch: BROKEN_NOISE_WARP });
    await attachReview(testInfo, 'noiseWarp-broken', result.reviewPng);
    testInfo.annotations.push({ type: 'parity', description: describeComparison(result.comparison) });
    expect(result.patched).toBe(true);
    expect(result.comparison.pass, describeComparison(result.comparison)).toBe(false);
    if (result.comparison.mode !== 'pixels') throw new Error('expected a pixel comparison');
    expect(result.comparison.differentRatio).toBeGreaterThan(result.comparison.tolerance.maxDifferentRatio);

    // The diff panel marks differing pixels in red, so the review image shows where the port went wrong.
    const redShare = await page.evaluate(async (png) => {
      const image = new Image();
      image.src = png;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(image, 0, 0);
      const panel = image.height;
      const data = ctx.getImageData(image.width - panel, 0, panel, panel).data;
      let red = 0;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index] >= 128 && data[index + 1] === 0 && data[index + 2] === 0) red += 1;
      }
      return red / (panel * panel);
    }, result.reviewPng);
    expect(redShare).toBeGreaterThan(0.01);
  });

  test('statistics accept a reseeded Noise Warp that pixels reject', async ({ page }) => {
    // A far-off seed draws a different noise field over the same text cover: the glyphs move, the colour
    // distribution does not. This is the situation of a stochastic effect whose GPU noise differs from the editor's
    // CPU noise by design.
    const reseeded = { runtimeSeed: 5011 };
    const pixels = await runParity(page, 'noiseWarp', 'text', { ...reseeded, stochastic: false });
    const statistics = await runParity(page, 'noiseWarp', 'text', { ...reseeded, stochastic: true });
    expect(pixels.comparison.pass, describeComparison(pixels.comparison)).toBe(false);
    expect(statistics.comparison.pass, describeComparison(statistics.comparison)).toBe(true);
  });

  test('statistics reject Grain at half strength', async ({ page }) => {
    // The subtlest broken grain port measured: mean and std dev barely move, the histogram does. Flat colours show
    // it most clearly; a port must pass on every fixture, so failing on these is enough to reject it.
    for (const fixture of ['graphic', 'text']) {
      const result = await runParity(page, 'grain', fixture, { fragmentPatch: FAINT_GRAIN });
      expect(result.patched).toBe(true);
      expect(result.comparison.pass, `${fixture}: ${describeComparison(result.comparison)}`).toBe(false);
    }
  });

  test('pixels reject Chromatic split with either editor stage missing', async ({ page }) => {
    for (const patch of [RGB_SPLIT_GPU_ONLY, RGB_SPLIT_NO_GPU_RED]) {
      const result = await runParity(page, 'rgbSplit', 'graphic', { fragmentPatch: patch });
      expect(result.patched).toBe(true);
      expect(result.comparison.pass, `${patch.search}: ${describeComparison(result.comparison)}`).toBe(false);
    }
  });

  test('pixels reject Ripple with mirrored rings or truncated sampling', async ({ page }) => {
    for (const patch of [MIRRORED_RIPPLE, TRUNCATED_RIPPLE]) {
      const result = await runParity(page, 'ripple', 'photo', { fragmentPatch: patch });
      expect(result.patched).toBe(true);
      expect(result.comparison.pass, `${patch.search}: ${describeComparison(result.comparison)}`).toBe(false);
    }
  });

  test('pixels reject Scanlines one row off', async ({ page }) => {
    const result = await runParity(page, 'scanlines', 'graphic', { fragmentPatch: SHIFTED_SCANLINES });
    expect(result.patched).toBe(true);
    expect(result.comparison.pass, describeComparison(result.comparison)).toBe(false);
  });
});
