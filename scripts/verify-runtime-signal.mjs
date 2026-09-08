import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { serveEmbed } from './runtime-embed-server.mjs';

const root = resolve(process.argv[2]);
const manifest = JSON.parse(await readFile(join(root, 'dist/.vite/manifest.json'), 'utf8'));
const runtimeBundle = Object.entries(manifest).find(([name]) => name.endsWith('artifact-runtime/dist/index.js'))?.[1]
  ?.file;
assert.ok(runtimeBundle);
const previousPoster = process.argv[3]
  ? `data:image/png;base64,${(await readFile(resolve(process.argv[3]))).toString('base64')}`
  : null;
const { server, url } = await serveEmbed(join(root, 'dist'));
const browser = await chromium.launch({ channel: process.env.ARTIFACT_BROWSER_CHANNEL ?? 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(url);
  const evidence = await page.evaluate(
    async ({ runtimeBundle, previousPoster }) => {
      const runtime = await import(`/${runtimeBundle}`);
      const composition = await (await fetch('/viber.artifact')).json();
      const before = JSON.stringify(composition);
      // A zero-opacity fill forces separate GPU passes without altering pixels.
      // Preserve graph render order when creating this stack-mode reference.
      const separatePasses = structuredClone(composition);
      const order = runtime.analyzeArtifactRuntimeProject(composition).layerOrder;
      separatePasses.document.layers = order.flatMap((id) => {
        const layer = separatePasses.document.layers.find((entry) => entry.id === id);
        return ['noiseWarp', 'vortex', 'tear'].includes(layer.preset)
          ? [layer, { id: `separator-${id}`, kind: 'fill', color: '#000000', opacity: 0 }]
          : [layer];
      });
      delete separatePasses.document.graph;
      separatePasses.document.global.bg = 'transparent';
      const pixels = (canvas) => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const changed = (a, b, mask) => {
        let count = 0;
        for (let i = 0; i < a.length; i += 4) {
          if (mask && mask[i + 3] !== 255) continue;
          if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) count++;
        }
        return count;
      };
      const checksum = async (bytes) =>
        [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
          .map((value) => value.toString(16).padStart(2, '0'))
          .join('');
      const foreground = structuredClone(composition);
      delete foreground.document.graph;
      foreground.document.global.bg = 'transparent';
      foreground.document.layers = foreground.document.layers.slice(9);
      const maskCanvas = document.createElement('canvas');
      await runtime.renderArtifactRuntimeProject({ canvas: maskCanvas, project: foreground, width: 512, height: 512 });
      const rawMask = pixels(maskCanvas);
      const mask = new Uint8ClampedArray(rawMask);
      // Exclude a one-pixel antialias fringe: stacked fractional alpha can round
      // to 255 while retaining a one-channel background contribution at an edge.
      for (let y = 0; y < 512; y++)
        for (let x = 0; x < 512; x++) {
          const neighbors = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => [x + dx, y + dy]));
          if (
            neighbors.some(
              ([nx, ny]) => nx < 0 || ny < 0 || nx >= 512 || ny >= 512 || rawMask[(ny * 512 + nx) * 4 + 3] !== 255,
            )
          )
            mask[(y * 512 + x) * 4 + 3] = 0;
        }
      const maskPixelCount = mask.filter((value, index) => index % 4 === 3 && value === 255).length;
      let previous;
      if (previousPoster) {
        const image = new Image();
        image.src = previousPoster;
        await image.decode();
        const reference = document.createElement('canvas');
        reference.width = reference.height = 512;
        reference.getContext('2d').drawImage(image, 0, 0);
        previous = pixels(reference);
      }
      const result = { modes: {}, maskPixelCount, performance: {} };
      for (const mode of ['flow', 'grain', 'glitch', 'combined']) {
        const filename = mode === 'combined' ? '/viber.motion.json' : `/viber-${mode}.motion.json`;
        const motionRecipe = await (await fetch(filename)).json();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 512;
        const frames = [];
        const started = performance.now();
        const session = await runtime.createMixedMediaArtwork({
          canvas,
          composition,
          motionRecipe,
          profile: 'mixed-media-2d@1',
          pixelRatio: 1,
          maxRenderSize: 512,
          onFrame: (frame) => frames.push({ ...frame, at: performance.now() }),
        });
        const creationMs = performance.now() - started;
        const neutral = pixels(canvas);
        await session.seek(1.6);
        const animated = pixels(canvas);
        const animatedPng = canvas.toDataURL('image/png');
        const referenceCanvas = document.createElement('canvas');
        referenceCanvas.width = referenceCanvas.height = 512;
        const referenceSession = await runtime.createMixedMediaArtwork({
          canvas: referenceCanvas,
          composition: separatePasses,
          motionRecipe,
          profile: 'mixed-media-2d@1',
          pixelRatio: 1,
          maxRenderSize: 512,
        });
        await referenceSession.seek(1.6);
        const separatePassChangedPixels = changed(animated, pixels(referenceCanvas));
        referenceSession.destroy();
        await session.seek(5.3);
        await session.seek(1.6);
        const repeated = pixels(canvas);
        await session.seek(8);
        const loop = pixels(canvas);
        await session.seek(0.25);
        const held = pixels(canvas);
        await session.seek(0.26);
        const withinStep = pixels(canvas);
        await session.seek(3);
        const betweenEvents = pixels(canvas);
        const foregroundDifferences = [];
        for (let i = 0; i < neutral.length; i += 4) {
          if (mask[i + 3] === 255 && [0, 1, 2, 3].some((channel) => neutral[i + channel] !== animated[i + channel]))
            foregroundDifferences.push({
              x: (i / 4) % 512,
              y: Math.floor(i / 4 / 512),
              before: [...neutral.slice(i, i + 4)],
              after: [...animated.slice(i, i + 4)],
            });
        }
        result.modes[mode] = {
          separatePassChangedPixels,
          foregroundDifferences,
          changedPixels: changed(neutral, animated),
          foregroundChangedPixels: changed(neutral, animated, mask),
          repeatedChangedPixels: changed(animated, repeated),
          loopChangedPixels: changed(neutral, loop),
          withinStepChangedPixels: changed(held, withinStep),
          betweenEventsChangedPixels: changed(neutral, betweenEvents),
          previousPosterChangedPixels: previous ? changed(neutral, previous) : null,
          neutralSha256: await checksum(neutral),
          animatedSha256: await checksum(animated),
          animatedPng,
        };
        if (mode === 'combined') {
          frames.length = 0;
          session.start();
          await new Promise((accept) => setTimeout(accept, 4500));
          session.pause();
          const warm = frames.filter((frame) => frame.at > started + creationMs + 1000);
          const durations = warm.map((frame) => frame.renderDurationMs).sort((a, b) => a - b);
          result.performance = {
            creationMs,
            fps: ((warm.length - 1) * 1000) / (warm.at(-1).at - warm[0].at),
            p50Ms: durations[Math.floor(durations.length * 0.5)],
            p95Ms: durations[Math.floor(durations.length * 0.95)],
            framesOver100Ms: durations.filter((duration) => duration > 100).length,
          };
        }
        session.destroy();
      }
      result.compositionUnchanged = JSON.stringify(composition) === before;
      return result;
    },
    { runtimeBundle, previousPoster },
  );
  assert.ok(evidence.maskPixelCount > 10000, 'Foreground mask must cover real opaque artwork');
  assert.equal(evidence.compositionUnchanged, true);
  await writeFile(
    join(root, 'signal-verification-debug.json'),
    `${JSON.stringify(evidence, (key, value) => (key === 'animatedPng' ? undefined : value), 2)}\n`,
  );
  for (const [mode, proof] of Object.entries(evidence.modes)) {
    await writeFile(join(root, `signal-${mode}.png`), Buffer.from(proof.animatedPng.split(',')[1], 'base64'));
    delete proof.animatedPng;
    assert.ok(proof.changedPixels > 100, `${mode} must visibly alter the background`);
    assert.equal(proof.foregroundChangedPixels, 0, `${mode} must preserve opaque foreground pixels`);
    assert.equal(proof.repeatedChangedPixels, 0, `${mode} must repeat after out-of-order seeks`);
    assert.equal(proof.separatePassChangedPixels, 0, `${mode} batching must match separate GPU passes`);
    assert.equal(proof.loopChangedPixels, 0, `${mode} must close its loop`);
    if (previousPoster)
      assert.equal(proof.previousPosterChangedPixels, 0, `${mode} must preserve the previous neutral frame`);
  }
  assert.equal(evidence.modes.grain.withinStepChangedPixels, 0);
  assert.equal(evidence.modes.glitch.betweenEventsChangedPixels, 0);
  await page.getByRole('button', { name: 'Открыть обложку Вайбер' }).click();
  for (const mode of ['flow', 'grain', 'glitch', 'combined', 'classic', 'combined']) {
    await page.getByLabel('Движение', { exact: true }).selectOption(mode);
    await page.locator('#artwork[data-state="ready"]').waitFor();
    assert.equal(await page.locator('#artwork canvas').count(), 1);
  }
  await page.screenshot({ path: join(root, 'signal-ui.png') });
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.waitForFunction(() => [...document.fonts].every((face) => !face.family.startsWith('ArtifactEmbedded')));
  assert.deepEqual(errors, []);
  await writeFile(join(root, 'signal-verification.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
  assert.ok(evidence.performance.fps >= 30, 'Combined mode must sustain 30 fps');
  assert.ok(evidence.performance.framesOver100Ms <= 1, 'No repeated frames over 100 ms');
} finally {
  await browser.close();
  await new Promise((accept) => server.close(accept));
}
