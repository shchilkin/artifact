import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { expectNoBrowserIssues, setupBrowserTestPage } from './helpers';

// The experimental runtime (packages/runtime, issue #330) is not part of the app bundle. The dev server serves its
// source through Vite's /@fs/ path, so these tests need the dev server, not the production preview.
test.skip(process.env.PLAYWRIGHT_WEB_SERVER_MODE === 'preview', 'needs the dev server to import the runtime source');

const RUNTIME_MODULE = `/@fs${fileURLToPath(new URL('../../packages/runtime/src/index.ts', import.meta.url))}`;

type RuntimeModule = typeof import('../../packages/runtime/src/index');

declare global {
  interface Window {
    __glAudit?: {
      readPixels: number;
      draws: number;
      created: Record<string, number>;
      live: Map<WebGL2RenderingContext, Map<object, string>>;
    };
  }
}

/** Wraps WebGL2 prototype methods to count readbacks, draws, and created/deleted GL objects per context. */
async function instrumentWebGl(page: Page) {
  await page.evaluate(() => {
    const audit = { readPixels: 0, draws: 0, created: {} as Record<string, number>, live: new Map() };
    window.__glAudit = audit;
    const proto = WebGL2RenderingContext.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
    const liveFor = (gl: WebGL2RenderingContext) => {
      let live = audit.live.get(gl);
      if (!live) audit.live.set(gl, (live = new Map()));
      return live;
    };
    const readPixels = proto.readPixels;
    proto.readPixels = function (this: WebGL2RenderingContext, ...args: unknown[]) {
      audit.readPixels += 1;
      return readPixels.apply(this, args);
    };
    const drawArrays = proto.drawArrays;
    proto.drawArrays = function (this: WebGL2RenderingContext, ...args: unknown[]) {
      audit.draws += 1;
      return drawArrays.apply(this, args);
    };
    for (const kind of ['Texture', 'Framebuffer', 'Buffer', 'Program', 'Shader', 'VertexArray', 'Renderbuffer']) {
      const create = proto[`create${kind}`];
      const remove = proto[`delete${kind}`];
      proto[`create${kind}`] = function (this: WebGL2RenderingContext, ...args: unknown[]) {
        const object = create.apply(this, args) as object | null;
        if (object) {
          liveFor(this).set(object, kind);
          audit.created[kind] = (audit.created[kind] ?? 0) + 1;
        }
        return object;
      };
      proto[`delete${kind}`] = function (this: WebGL2RenderingContext, ...args: unknown[]) {
        liveFor(this).delete(args[0] as object);
        return remove.apply(this, args);
      };
    }
  });
}

async function openTestPage(page: Page, reducedMotion: 'reduce' | 'no-preference') {
  await setupBrowserTestPage(page);
  // Set explicitly: the runtime reads the media query itself, so the tests do not depend on the config default.
  await page.emulateMedia({ reducedMotion });
  await page.goto('/docs');
  const webgl2 = await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')));
  test.skip(!webgl2, 'the runtime needs WebGL2');
  await instrumentWebGl(page);
}

test.afterEach(async ({ page }) => {
  expectNoBrowserIssues(page);
});

test.describe('with motion allowed', () => {
  test('a 540px chain of three passes renders 120 frames with no readback or GL errors, and destroy frees it', async ({
    page,
  }) => {
    await openTestPage(page, 'no-preference');
    const result = await page.evaluate(async (runtimeUrl) => {
      const { createArtwork, effectRegistry } = (await import(/* @vite-ignore */ runtimeUrl)) as RuntimeModule;
      const audit = window.__glAudit!;

      const source = document.createElement('canvas');
      source.width = 540;
      source.height = 540;
      const ctx = source.getContext('2d')!;
      const gradient = ctx.createLinearGradient(0, 0, 540, 540);
      gradient.addColorStop(0, '#ff280a');
      gradient.addColorStop(1, '#0a1efa');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 540, 540);

      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:fixed;left:0;top:0;width:540px;height:540px;z-index:2147483647';
      document.body.append(canvas);

      const context = { seed: 3, width: 540, height: 540 };
      const chain = [20, 45, 70].map((amount, index) =>
        effectRegistry.pass('noiseWarp', { noiseWarp: amount, seedOffset: index }, context),
      );
      if (chain.some((pass) => pass === null)) throw new Error('Noise Warp pass missing');

      const drawsBefore = audit.draws;
      const artwork = createArtwork({
        canvas,
        source,
        chain: chain.filter((pass) => pass !== null),
        maxRenderSize: 540,
        devicePixelRatio: 1,
      });
      artwork.start();
      await new Promise<void>((resolve, reject) => {
        const deadline = performance.now() + 20_000;
        const poll = () => {
          if (artwork.state.frames >= 121) return resolve();
          if (performance.now() > deadline) return reject(new Error(`only ${artwork.state.frames} frames`));
          requestAnimationFrame(poll);
        };
        poll();
      });
      artwork.pause();
      const state = artwork.state;
      const gl = canvas.getContext('webgl2')!;
      const glError = gl.getError();
      const createdLive = Object.fromEntries(
        [...(audit.live.get(gl)?.values() ?? [])].reduce(
          (counts, kind) => counts.set(kind, (counts.get(kind) ?? 0) + 1),
          new Map<string, number>(),
        ),
      );
      artwork.destroy();
      const liveAfterDestroy = audit.live.get(gl)?.size ?? 0;
      const errorAfterDestroy = gl.getError();
      canvas.remove();
      return {
        state,
        draws: audit.draws - drawsBefore,
        readPixels: audit.readPixels,
        glError,
        errorAfterDestroy,
        createdLive,
        liveAfterDestroy,
      };
    }, RUNTIME_MODULE);

    expect(result.state).toMatchObject({ status: 'idle', width: 540, height: 540 });
    expect(result.state.frames).toBeGreaterThanOrEqual(121);
    // One draw per pass per frame.
    expect(result.draws).toBe(result.state.frames * 3);
    expect(result.readPixels).toBe(0);
    expect(result.glError).toBe(0);
    expect(result.errorAfterDestroy).toBe(0);
    // Two ping-pong targets plus the source texture; one program shared by the three identical fragments.
    expect(result.createdLive).toEqual({
      Texture: 3,
      Framebuffer: 2,
      Buffer: 1,
      VertexArray: 1,
      Program: 1,
      Shader: 2,
    });
    expect(result.liveAfterDestroy).toBe(0);
  });
});

test('under reduced motion the artwork draws one still frame and requests no animation frames', async ({ page }) => {
  await openTestPage(page, 'reduce');
  const result = await page.evaluate(async (runtimeUrl) => {
    const { createArtwork, effectRegistry } = (await import(/* @vite-ignore */ runtimeUrl)) as RuntimeModule;
    const runtimeFrames: string[] = [];
    const requestAnimationFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      const stack = new Error().stack ?? '';
      if (stack.includes('packages/runtime/src')) runtimeFrames.push(stack);
      return requestAnimationFrame(callback);
    };

    const source = document.createElement('canvas');
    source.width = 64;
    source.height = 64;
    const ctx = source.getContext('2d')!;
    ctx.fillStyle = '#e04020';
    ctx.fillRect(0, 0, 64, 64);

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;left:0;top:0;width:540px;height:540px;z-index:2147483647';
    document.body.append(canvas);
    const pass = effectRegistry.pass('noiseWarp', { noiseWarp: 50 }, { seed: 1, width: 540, height: 540 })!;
    const artwork = createArtwork({
      canvas,
      source,
      chain: [pass, pass, pass],
      devicePixelRatio: 1,
      contextAttributes: { preserveDrawingBuffer: true },
    });
    artwork.start();
    await new Promise((resolve) => setTimeout(resolve, 500));

    const probe = document.createElement('canvas');
    probe.width = 1;
    probe.height = 1;
    const probeCtx = probe.getContext('2d')!;
    probeCtx.drawImage(canvas, 270, 270, 1, 1, 0, 0, 1, 1);
    const pixel = [...probeCtx.getImageData(0, 0, 1, 1).data];
    const state = artwork.state;
    const stillFrames = runtimeFrames.length;
    artwork.destroy();

    // Control: the same artwork with motion allowed does request frames, so the counter can see them.
    const moving = createArtwork({ canvas, source, chain: [pass], reducedMotion: false, devicePixelRatio: 1 });
    moving.start();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const movingFrames = runtimeFrames.length;
    moving.destroy();

    canvas.remove();
    window.requestAnimationFrame = requestAnimationFrame;
    return { state, stillFrames, movingFrames, pixel };
  }, RUNTIME_MODULE);

  expect(result.state).toMatchObject({ status: 'still', frames: 1 });
  expect(result.stillFrames).toBe(0);
  expect(result.movingFrames).toBeGreaterThan(0);
  // The still frame shows the source colour.
  expect(result.pixel).toEqual([224, 64, 32, 255]);
});

test("runtime Noise Warp matches the editor's Pixi output, the right way up", async ({ page }) => {
  await openTestPage(page, 'reduce');
  const result = await page.evaluate(async (runtimeUrl) => {
    const { createArtwork, effectRegistry } = (await import(/* @vite-ignore */ runtimeUrl)) as RuntimeModule;
    const { gpuRenderToCanvas } = await import('/app/utils/gpuRender.ts');
    const { buildFiltersFromEffectLayer } = await import('/app/utils/pixiFilters.ts');
    const { makeEffectPresetLayer } = await import('/app/types/config.ts');
    const size = 540;
    const seed = 11;

    // Asymmetric source: warm top, cool bottom, a bright block in the upper left.
    const source = document.createElement('canvas');
    source.width = size;
    source.height = size;
    const ctx = source.getContext('2d')!;
    const gradient = ctx.createLinearGradient(0, 0, 0, size);
    gradient.addColorStop(0, '#ff3010');
    gradient.addColorStop(1, '#1030ff');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#f0f0a0';
    ctx.fillRect(60, 40, 180, 120);
    for (let x = 0; x < size; x += 30) {
      ctx.fillStyle = x % 60 === 0 ? '#000000' : '#30d060';
      ctx.fillRect(x, 300, 15, 200);
    }

    const pixels = (canvas: HTMLCanvasElement | OffscreenCanvas | HTMLCanvasElement) => {
      const copy = document.createElement('canvas');
      copy.width = size;
      copy.height = size;
      const copyCtx = copy.getContext('2d', { willReadFrequently: true })!;
      copyCtx.drawImage(canvas as CanvasImageSource, 0, 0);
      return copyCtx.getImageData(0, 0, size, size).data;
    };
    const flipped = (data: Uint8ClampedArray) => {
      const out = new Uint8ClampedArray(data.length);
      const row = size * 4;
      for (let y = 0; y < size; y += 1) out.set(data.subarray(y * row, (y + 1) * row), (size - 1 - y) * row);
      return out;
    };
    const meanDiff = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
      let total = 0;
      for (let index = 0; index < a.length; index += 4) {
        total +=
          Math.abs(a[index] - b[index]) + Math.abs(a[index + 1] - b[index + 1]) + Math.abs(a[index + 2] - b[index + 2]);
      }
      return total / ((a.length / 4) * 3);
    };
    const share = (a: Uint8ClampedArray, b: Uint8ClampedArray, threshold: number) => {
      let over = 0;
      for (let index = 0; index < a.length; index += 4) {
        const diff = Math.max(
          Math.abs(a[index] - b[index]),
          Math.abs(a[index + 1] - b[index + 1]),
          Math.abs(a[index + 2] - b[index + 2]),
        );
        if (diff > threshold) over += 1;
      }
      return over / (a.length / 4);
    };

    const render = (chain: Parameters<typeof createArtwork>[0]['chain']) => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const artwork = createArtwork({
        canvas,
        source,
        chain,
        reducedMotion: true,
        observeVisibility: null,
        maxRenderSize: size,
        contextAttributes: { preserveDrawingBuffer: true },
      });
      const data = pixels(canvas);
      artwork.destroy();
      return data;
    };

    const sourcePixels = pixels(source);
    const copied = render([]);

    const layer = { ...makeEffectPresetLayer('noiseWarp'), noiseWarp: 90, seedOffset: 0 };
    const filters = buildFiltersFromEffectLayer(layer, seed, size, size);
    if (!filters || filters.length !== 1) throw new Error('expected exactly one editor filter');
    const editor = pixels(await gpuRenderToCanvas({ width: size, height: size, source, filters }));
    const pass = effectRegistry.pass('noiseWarp', layer, { seed, width: size, height: size });
    if (!pass) throw new Error('Noise Warp pass missing');
    const runtime = render([pass]);

    return {
      copyDiff: meanDiff(copied, sourcePixels),
      copyFlippedDiff: meanDiff(copied, flipped(sourcePixels)),
      warpVsSource: meanDiff(runtime, sourcePixels),
      warpDiff: meanDiff(runtime, editor),
      warpOver8: share(runtime, editor, 8),
      warpFlippedDiff: meanDiff(runtime, flipped(editor)),
    };
  }, RUNTIME_MODULE);

  // An empty chain copies the source the right way up.
  expect(result.copyDiff).toBeLessThan(0.5);
  expect(result.copyFlippedDiff).toBeGreaterThan(20);
  // The warp moves pixels, and lands where the editor's does: same fragment, same uniforms, same inputClamp.
  expect(result.warpVsSource).toBeGreaterThan(2);
  expect(result.warpDiff).toBeLessThan(0.05);
  expect(result.warpOver8).toBeLessThan(0.001);
  expect(result.warpFlippedDiff).toBeGreaterThan(20);
});
