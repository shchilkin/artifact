import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { expectNoBrowserIssues, setupBrowserTestPage } from './helpers';

// Shader compilation off the main thread (issue #419). Creating an artwork used to compile and link every program
// synchronously: with a cold shader cache a heavy chain blocked the main thread for hundreds of milliseconds. The
// runtime now links in the background with KHR_parallel_shader_compile and draws once `ready` settles.
test.skip(process.env.PLAYWRIGHT_WEB_SERVER_MODE === 'preview', 'needs the dev server to import the runtime source');

const RUNTIME_MODULE = `/@fs${fileURLToPath(new URL('../../packages/runtime/src/index.ts', import.meta.url))}`;
const CASES_MODULE = `/@fs${fileURLToPath(new URL('../../packages/runtime/test/cases/index.ts', import.meta.url))}`;

// Long task timing and the GPU flags below are Chromium's.
test.skip(({ browserName }) => browserName !== 'chromium', 'long task timing and GPU flags are Chromium-only');

// Long tasks are measured on the GPU: headless Chromium falls back to SwiftShader, which has no
// KHR_parallel_shader_compile (the cold start test then skips). A fresh browser gets a fresh shader cache.
test.use({
  launchOptions: {
    args: ['--enable-gpu', '--ignore-gpu-blocklist', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])],
  },
});

type RuntimeModule = typeof import('../../packages/runtime/src/index');
type CasesModule = typeof import('../../packages/runtime/test/cases/index');

/** What one cold start recorded. */
interface ColdStart {
  readonly passes: number;
  readonly programs: number;
  readonly parallel: boolean;
  /** Status and frames right after `createArtwork` returned. */
  readonly created: { readonly status: string; readonly frames: number };
  readonly createMs: number;
  readonly readyMs: number;
  readonly longTasks: readonly number[];
  readonly status: string;
  readonly frames: number;
  /** The resting frame's centre pixel. */
  readonly pixel: readonly number[];
}

async function openPage(page: Page) {
  await setupBrowserTestPage(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/docs');
  const webgl2 = await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')));
  test.skip(!webgl2, 'the runtime needs WebGL2');
}

/**
 * Creates a 1080px artwork whose chain runs every registered effect with its harness case's layer, starts it, waits
 * for `ready` and ten frames, and reports the main-thread long tasks seen meanwhile. Every fragment gets a `#define`
 * unique to the run, so no shader comes from the browser's cache. `withoutExtension` hides
 * KHR_parallel_shader_compile, as on a browser without it.
 */
function coldStart(page: Page, withoutExtension: boolean): Promise<ColdStart> {
  return page.evaluate(
    async ({ runtimeUrl, casesUrl, withoutExtension }) => {
      const { createArtwork, effectRegistry } = (await import(/* @vite-ignore */ runtimeUrl)) as RuntimeModule;
      const { EFFECT_CASES } = (await import(/* @vite-ignore */ casesUrl)) as CasesModule;
      const size = 1080;
      const run = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
      // A preprocessor token would not reach the driver: ANGLE's translated source, and so the driver's own cache key,
      // would be unchanged. A uniform the shader reads (unset, so 0) does reach it, and leaves every pixel as it was.
      const unique = (fragment: string) => {
        const end = fragment.lastIndexOf('}');
        const declaration = `uniform mediump float uColdStart_${run};\n`;
        return `${declaration}${fragment.slice(0, end)}  gl_FragColor.a += uColdStart_${run};\n}\n`;
      };
      const context = { seed: 7, width: size, height: size };
      const chain = effectRegistry.ids().map((id) => {
        const effectCase = EFFECT_CASES[id];
        const pass = effectRegistry.pass(id, { ...effectCase?.layer, seedOffset: 0 }, context);
        if (!pass) throw new Error(`"${id}" is off for its case's layer values.`);
        return { ...pass, fragment: unique(pass.fragment), stages: pass.stages?.map(unique) };
      });

      const getExtension = WebGL2RenderingContext.prototype.getExtension;
      if (withoutExtension) {
        WebGL2RenderingContext.prototype.getExtension = function (this: WebGL2RenderingContext, name: string) {
          return name === 'KHR_parallel_shader_compile' ? null : getExtension.call(this, name);
        } as typeof getExtension;
      }

      const source = document.createElement('canvas');
      source.width = size;
      source.height = size;
      const ctx = source.getContext('2d')!;
      const gradient = ctx.createLinearGradient(0, 0, size, size);
      gradient.addColorStop(0, '#ff280a');
      gradient.addColorStop(1, '#0a1efa');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      canvas.style.cssText = 'position:fixed;left:0;top:0;width:540px;height:540px;z-index:2147483647';
      document.body.append(canvas);

      const frame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
      // Let the page settle so its own work does not land in the window.
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await frame();
      await frame();

      const longTasks: number[] = [];
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTasks.push(entry.duration);
      });
      observer.observe({ type: 'longtask', buffered: false });
      const parallel = withoutExtension
        ? false
        : Boolean(document.createElement('canvas').getContext('webgl2')?.getExtension('KHR_parallel_shader_compile'));

      const started = performance.now();
      const artwork = createArtwork({
        canvas,
        source,
        chain,
        devicePixelRatio: 2,
        maxRenderSize: size,
        observeVisibility: null,
        contextAttributes: { preserveDrawingBuffer: true },
      });
      const createMs = performance.now() - started;
      const created = { status: artwork.state.status, frames: artwork.state.frames };
      artwork.start();
      await artwork.ready;
      const readyMs = performance.now() - started;
      for (let index = 0; index < 10; index += 1) await frame();
      // Long task entries arrive after the task: give the observer a moment, then collect what is left.
      await new Promise((resolve) => setTimeout(resolve, 100));
      for (const entry of observer.takeRecords()) longTasks.push(entry.duration);
      observer.disconnect();
      const { status, frames } = artwork.state;

      // Without frame uniforms every frame is the resting frame. Reading it back waits for the GPU, so it comes after
      // the measured window.
      artwork.pause();
      artwork.seek(0);
      const probe = document.createElement('canvas');
      probe.width = 1;
      probe.height = 1;
      const probeCtx = probe.getContext('2d')!;
      probeCtx.drawImage(canvas, size / 2, size / 2, 1, 1, 0, 0, 1, 1);
      const pixel = [...probeCtx.getImageData(0, 0, 1, 1).data];
      artwork.destroy();
      canvas.remove();
      WebGL2RenderingContext.prototype.getExtension = getExtension;
      return {
        passes: chain.length,
        programs: chain.reduce((count, pass) => count + 1 + (pass.stages?.length ?? 0), 0),
        parallel,
        created,
        createMs,
        readyMs,
        longTasks,
        status,
        frames,
        pixel,
      };
    },
    { runtimeUrl: RUNTIME_MODULE, casesUrl: CASES_MODULE, withoutExtension },
  );
}

function describe(result: ColdStart): string {
  const longest = Math.max(0, ...result.longTasks);
  return (
    `${result.passes} passes (${result.programs} programs), parallel compile ${result.parallel}: ` +
    `createArtwork ${result.createMs.toFixed(1)} ms, ready after ${result.readyMs.toFixed(1)} ms, ` +
    `long tasks [${result.longTasks.map((ms) => ms.toFixed(0)).join(', ')}], longest ${longest.toFixed(0)} ms`
  );
}

test.afterEach(async ({ page }) => {
  expectNoBrowserIssues(page);
});

test('a cold start of every registered effect compiles without a main-thread long task', async ({ page }, testInfo) => {
  await openPage(page);
  const result = await coldStart(page, false);
  testInfo.annotations.push({ type: 'cold start', description: describe(result) });
  console.log(`[cold start] ${describe(result)}`);
  test.skip(!result.parallel, 'the context has no KHR_parallel_shader_compile');
  expect(result.passes).toBeGreaterThanOrEqual(10);
  // Nothing is drawn until the shaders are ready; the host keeps showing its still meanwhile.
  expect(result.created).toEqual({ status: 'loading', frames: 0 });
  expect(
    result.longTasks.filter((ms) => ms > 50),
    describe(result),
  ).toEqual([]);
  expect(result.status).toBe('running');
  expect(result.frames).toBeGreaterThan(1);
});

test('without KHR_parallel_shader_compile, creation draws the resting frame at once, as before', async ({
  page,
}, testInfo) => {
  await openPage(page);
  const sync = await coldStart(page, true);
  testInfo.annotations.push({ type: 'cold start without the extension', description: describe(sync) });
  console.log(`[cold start without the extension] ${describe(sync)}`);
  expect(sync.parallel).toBe(false);
  expect(sync.created).toEqual({ status: 'idle', frames: 1 });
  expect(sync.status).toBe('running');
  expect(sync.frames).toBeGreaterThan(1);
  // The same resting frame either way.
  const parallel = await coldStart(page, false);
  expect(parallel.pixel).toEqual(sync.pixel);
});
