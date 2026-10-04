import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { expectNoBrowserIssues, setupBrowserTestPage } from './helpers';

// Bindings (issue #332) on a real WebGL2 canvas: a wave track and pointer speed drive Noise Warp. The runtime is not
// part of the app bundle; the dev server serves its source through Vite's /@fs/ path, as in runtime-chain.spec.ts.
test.skip(process.env.PLAYWRIGHT_WEB_SERVER_MODE === 'preview', 'needs the dev server to import the runtime source');

const RUNTIME_MODULE = `/@fs${fileURLToPath(new URL('../../packages/runtime/src/index.ts', import.meta.url))}`;
const SIZE = 540;

type RuntimeModule = typeof import('../../packages/runtime/src/index');
type Artwork = ReturnType<RuntimeModule['createLiveArtwork']>;

declare global {
  interface Window {
    __bindings?: {
      artwork: Artwork;
      /** Mean absolute RGB difference between the canvas now and the source image. */
      diffFromSource(): number;
      /** Canvas pixels now, for comparing two frames. */
      pixels(): number[];
    };
  }
}

/**
 * A 540px canvas at the top left of the page running Noise Warp at zero authored amount, so the resting frame is
 * the source image and any bound movement shows as a pixel difference.
 */
async function openArtwork(page: Page, reducedMotion: 'reduce' | 'no-preference') {
  await setupBrowserTestPage(page);
  await page.emulateMedia({ reducedMotion });
  await page.goto('/docs');
  const webgl2 = await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')));
  test.skip(!webgl2, 'the runtime needs WebGL2');

  await page.evaluate(
    async ({ runtimeUrl, size }) => {
      const { createLiveArtwork } = (await import(/* @vite-ignore */ runtimeUrl)) as RuntimeModule;

      // Fine stripes and blocks, so a small warp moves many pixels.
      const source = document.createElement('canvas');
      source.width = size;
      source.height = size;
      const ctx = source.getContext('2d')!;
      ctx.fillStyle = '#1030ff';
      ctx.fillRect(0, 0, size, size);
      for (let x = 0; x < size; x += 12) {
        ctx.fillStyle = x % 24 === 0 ? '#ff3010' : '#f0f0a0';
        ctx.fillRect(x, 0, 6, size);
      }
      for (let y = 0; y < size; y += 30) {
        ctx.fillStyle = '#101010';
        ctx.fillRect(0, y, size, 4);
      }

      const canvas = document.createElement('canvas');
      canvas.style.cssText = `position:fixed;left:0;top:0;width:${size}px;height:${size}px;z-index:2147483647`;
      document.body.append(canvas);

      const artwork = createLiveArtwork({
        canvas,
        source,
        passes: [{ effect: 'noiseWarp', layer: { noiseWarp: 0, seedOffset: 0 } }],
        context: { seed: 7, width: size, height: size },
        bindings: {
          version: 1,
          loop: { durationSeconds: 4 },
          bindings: [
            { from: { track: 'wave' }, to: { pass: 0, field: 'noiseWarp' }, range: [-60, 60], mode: 'add' },
            { from: { input: 'pointer.speed' }, to: { pass: 0, field: 'noiseWarp' }, range: [0, 150], mode: 'add' },
          ],
        },
        devicePixelRatio: 1,
        maxRenderSize: size,
        contextAttributes: { preserveDrawingBuffer: true },
      });

      const read = (image: CanvasImageSource) => {
        const copy = document.createElement('canvas');
        copy.width = size;
        copy.height = size;
        const copyCtx = copy.getContext('2d', { willReadFrequently: true })!;
        copyCtx.drawImage(image, 0, 0);
        return copyCtx.getImageData(0, 0, size, size).data;
      };
      const sourcePixels = read(source);
      const meanDiff = (a: ArrayLike<number>, b: ArrayLike<number>) => {
        let total = 0;
        for (let index = 0; index < a.length; index += 4) {
          total +=
            Math.abs(a[index] - b[index]) +
            Math.abs(a[index + 1] - b[index + 1]) +
            Math.abs(a[index + 2] - b[index + 2]);
        }
        return total / ((a.length / 4) * 3);
      };
      window.__bindings = {
        artwork,
        diffFromSource: () => meanDiff(read(canvas), sourcePixels),
        pixels: () => [...read(canvas)],
      };
    },
    { runtimeUrl: RUNTIME_MODULE, size: SIZE },
  );
}

/** Sweeps the mouse across the artwork quickly. */
async function sweepPointer(page: Page) {
  await page.mouse.move(40, SIZE / 2);
  await page.mouse.move(SIZE - 40, SIZE / 2, { steps: 12 });
}

test.afterEach(async ({ page }) => {
  await page.evaluate(() => {
    window.__bindings?.artwork.destroy();
    delete window.__bindings;
  });
  expectNoBrowserIssues(page);
});

test.describe('with motion allowed', () => {
  test('a wave track moves Noise Warp over the loop and the loop closes', async ({ page }) => {
    await openArtwork(page, 'no-preference');
    const result = await page.evaluate(() => {
      const { artwork, diffFromSource, pixels } = window.__bindings!;
      const atRest = diffFromSource();
      // Wave at its peak: 0 + 60 authored-units of warp.
      artwork.seek(1);
      const quarter = diffFromSource();
      artwork.seek(0);
      const start = pixels();
      artwork.seek(4);
      const end = pixels();
      return { atRest, quarter, loopSeamDiffers: end.some((value, index) => value !== start[index]) };
    });
    // The resting frame is the source: the wave is at zero and nothing has moved the pointer.
    expect(result.atRest).toBeLessThan(0.5);
    expect(result.quarter).toBeGreaterThan(2);
    expect(result.loopSeamDiffers).toBe(false);
  });

  test('pointer speed drives Noise Warp on a stopped artwork, which redraws on pointer events', async ({ page }) => {
    await openArtwork(page, 'no-preference');
    const before = await page.evaluate(() => ({
      diff: window.__bindings!.diffFromSource(),
      frames: window.__bindings!.artwork.state.frames,
    }));
    await sweepPointer(page);
    const after = await page.evaluate(() => ({
      diff: window.__bindings!.diffFromSource(),
      state: window.__bindings!.artwork.state,
    }));

    expect(before).toEqual({ diff: expect.any(Number), frames: 1 });
    expect(before.diff).toBeLessThan(0.5);
    // Not started: every frame after the first was a redraw for a pointer event.
    expect(after.state.status).toBe('idle');
    expect(after.state.frames).toBeGreaterThan(5);
    expect(after.diff).toBeGreaterThan(2);
  });
});

test('under reduced motion, tracks and pointer bindings are off and the authored still stays', async ({ page }) => {
  await openArtwork(page, 'reduce');
  await sweepPointer(page);
  const result = await page.evaluate(() => {
    const { artwork, diffFromSource } = window.__bindings!;
    const afterPointer = { diff: diffFromSource(), state: artwork.state };
    artwork.start();
    artwork.seek(1);
    return { afterPointer, afterSeek: diffFromSource(), status: artwork.state.status };
  });
  expect(result.afterPointer.state).toMatchObject({ status: 'still', frames: 1 });
  expect(result.afterPointer.diff).toBeLessThan(0.5);
  // Seeking to the wave's peak still draws the authored still.
  expect(result.afterSeek).toBeLessThan(0.5);
  expect(result.status).toBe('still');
});
