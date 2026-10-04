import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import type { ParityComparison } from '../../packages/runtime/src/testing/parity';
import { PLATE_CASE_LOOP_SECONDS, plateCaseBindings } from '../../packages/runtime/src/testing/plateCase';
import { expectNoBrowserIssues, setupBrowserTestPage } from './helpers';
import type * as LivePage from './runtime/livePackagePage';

// Live package export (issue #333): the editor splits a cover into plates and live chains, and the package played at
// rest matches the editor's render at 540px within the harness tolerance. Needs the dev server (`/@fs/` imports).
test.skip(process.env.PLAYWRIGHT_WEB_SERVER_MODE === 'preview', 'needs the dev server to import the runtime source');

const PAGE_MODULE = `/@fs${fileURLToPath(new URL('./runtime/livePackagePage.ts', import.meta.url))}`;
/** As in runtime-harness.spec.ts: goldens are recorded in CI's Linux container. */
const GOLDENS_ENABLED = process.platform === 'linux' || process.env.RUNTIME_GOLDENS === '1';
const GOLDEN_OPTIONS = { threshold: 0.05, maxDiffPixelRatio: 0.002 };
/** An `.artifact` project to check by hand, for example the Вайбер cover. */
const PROJECT = process.env.LIVE_PACKAGE_PROJECT;

test.beforeEach(async ({ page }) => {
  await setupBrowserTestPage(page);
  await page.goto('/docs');
  const webgl2 = await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')));
  test.skip(!webgl2, 'the runtime needs WebGL2');
});

test.afterEach(async ({ page }) => {
  expectNoBrowserIssues(page);
});

function describeComparison(comparison: ParityComparison): string {
  return comparison.mode === 'pixels'
    ? `pixels: ${(comparison.differentRatio * 100).toFixed(3)}% over ${comparison.tolerance.channelThreshold} levels, ` +
        `mean abs diff ${comparison.meanAbsDiff.toFixed(4)}, worst channel ${comparison.maxChannelDiff}`
    : `statistics: mean diff ${comparison.meanDiff.toFixed(3)}, std dev diff ${comparison.stdDevDiff.toFixed(3)}, ` +
        `histogram distance ${comparison.histogramDistance.toFixed(4)}`;
}

async function attach(testInfo: TestInfo, name: string, result: LivePage.LivePackageResult) {
  const path = testInfo.outputPath(`${name}-editor-runtime-diff.png`);
  writeFileSync(path, Buffer.from(result.reviewPng.slice(result.reviewPng.indexOf(',') + 1), 'base64'));
  await testInfo.attach(`${name}-editor-runtime-diff.png`, { path, contentType: 'image/png' });
  const manifest = testInfo.outputPath(`${name}-manifest.json`);
  writeFileSync(manifest, JSON.stringify(result.manifest, null, 2));
  await testInfo.attach(`${name}-manifest.json`, { path: manifest, contentType: 'application/json' });
  testInfo.annotations.push({ type: 'parity', description: describeComparison(result.comparison) });
}

function sampleCover(page: Page, request: LivePage.ExportRequest) {
  return page.evaluate(
    async ([url, request]) => ((await import(/* @vite-ignore */ url)) as typeof LivePage).sampleCover(request),
    [PAGE_MODULE, request] as const,
  );
}

test('the sample cover exports plates and a live chain that match the editor at rest', async ({ page }, testInfo) => {
  const result = await sampleCover(page, { size: 540 });
  await attach(testInfo, 'sample', result);
  const { manifest } = result;
  expect(manifest.fallback).toBeUndefined();
  expect(manifest.stack.map((item) => item.type)).toEqual(['plate', 'chain', 'plate']);
  const chain = manifest.stack[1];
  if (chain.type !== 'chain') throw new Error('expected a chain');
  // The registry decides: Glitch, Grain, Noise Warp and Vortex are all registered, so the whole run is live.
  const live = chain.passes.map((pass) => pass.effect);
  expect(live).toContain('glitch');
  expect(live).toContain('grain');
  expect(live).toContain('noiseWarp');
  expect(live.indexOf('grain')).toBeGreaterThan(live.indexOf('glitch'));
  expect(live.indexOf('vortex')).toBeGreaterThan(live.indexOf('noiseWarp'));
  expect(manifest.baked.map((layer) => layer.effects).flat()).not.toContain('glitch');
  expect(manifest.baked.every((layer) => layer.reason.length > 0)).toBe(true);
  expect(result.files.sort()).toEqual(['manifest.json', 'plates/0.png', 'plates/2.png', 'still.png']);
  expect(result.comparison.pass, describeComparison(result.comparison)).toBe(true);
});

test('with parallax bindings, the sample cover writes plate depths and still matches the editor at rest', async ({
  page,
}, testInfo) => {
  const result = await sampleCover(page, { size: 540, bindings: plateCaseBindings({ tilt: 2 }) });
  await attach(testInfo, 'sample-parallax', result);
  const plates = result.manifest.stack.flatMap((item) => (item.type === 'plate' ? [item] : []));
  // By stack order, top plates nearer; the fill reaches every side of the frame, the image and title none.
  expect(plates.map((plate) => plate.depth)).toEqual([0.5, 1]);
  expect(plates.map((plate) => plate.edges)).toEqual([['top', 'right', 'bottom', 'left'], []]);
  expect(result.comparison.pass, describeComparison(result.comparison)).toBe(true);
});

test('the exporter can put a chosen layer on a plate of its own and still match the editor at rest', async ({
  page,
}, testInfo) => {
  const result = await sampleCover(page, { size: 540, separate: ['Title'] });
  await attach(testInfo, 'sample-separate', result);
  const plates = result.manifest.stack.flatMap((item) => (item.type === 'plate' ? [item] : []));
  expect(result.manifest.stack.map((item) => item.type)).toEqual(['plate', 'chain', 'plate', 'plate']);
  expect(plates.map((plate) => plate.layers.map((layer) => layer.name))).toEqual([
    ['Fill', 'Emojis'],
    ['Image'],
    ['Title'],
  ]);
  // Depth stays by stack order: the Title on top is nearest.
  expect(plates.map((plate) => plate.depth)).toEqual([1 / 3, 2 / 3, 1]);
  expect(result.comparison.pass, describeComparison(result.comparison)).toBe(true);
});

const POINTER_CORNER = { 'pointer.x': 1, 'pointer.y': 1 };
/** Rest first: every other frame is compared with it. Tracks peak a quarter loop in (1 s of 4). */
const LAYER_FRAMES: LivePage.LayerFrame[] = [
  { name: 'rest', seconds: 0 },
  { name: 'pointer', seconds: 0, input: POINTER_CORNER },
  {
    name: 'pointer-title-not-interactive',
    seconds: 0,
    input: POINTER_CORNER,
    layers: { layers: { Title: { interactive: false } } },
  },
  {
    name: 'pointer-none-interactive',
    seconds: 0,
    input: POINTER_CORNER,
    layers: { layerDefaults: { interactive: false } },
  },
  { name: 'quarter', seconds: 1 },
  { name: 'quarter-title-not-animated', seconds: 1, layers: { layers: { Title: { animated: false } } } },
  { name: 'quarter-none-animated', seconds: 1, layers: { layerDefaults: { animated: false } } },
];

test('layer options: a layer switched off rests while the others move', async ({ page }, testInfo) => {
  const result = await page.evaluate(
    async ([url, frames]) => ((await import(/* @vite-ignore */ url)) as typeof LivePage).layerFrames(frames),
    [PAGE_MODULE, LAYER_FRAMES] as const,
  );
  testInfo.annotations.push({
    type: 'layer frames',
    description: result.frames
      .map((frame) => `${frame.name}: ${frame.changedOnTitle} on Title, ${frame.changedElsewhere} elsewhere`)
      .join('; '),
  });
  expect(result.comparison.pass, describeComparison(result.comparison)).toBe(true);
  expect(result.titlePixels).toBeGreaterThan(1000);
  const frame = (name: string) => result.frames.find((entry) => entry.name === name)!;
  // Everything reacts to the pointer, the Title included.
  expect(frame('pointer').changedOnTitle).toBeGreaterThan(0);
  expect(frame('pointer').changedElsewhere).toBeGreaterThan(0);
  // The Title not interactive: its pixels are the rest frame's, while the plates and Vortex beneath still follow.
  expect(frame('pointer-title-not-interactive').changedOnTitle).toBe(0);
  expect(frame('pointer-title-not-interactive').changedElsewhere).toBeGreaterThan(0);
  expect(frame('pointer-none-interactive').changedOnTitle + frame('pointer-none-interactive').changedElsewhere).toBe(0);
  // Time tracks: the Title breathes and Noise Warp sways; switched off, each rests at its authored values.
  expect(frame('quarter').changedOnTitle).toBeGreaterThan(0);
  expect(frame('quarter-title-not-animated').changedOnTitle).toBe(0);
  expect(frame('quarter-title-not-animated').changedElsewhere).toBeGreaterThan(0);
  expect(frame('quarter-none-animated').changedOnTitle + frame('quarter-none-animated').changedElsewhere).toBe(0);
  // setLayerOptions redraws a stopped artwork at once and reaches a running one on its next frame.
  expect(result.switched).toEqual({ stopped: 0, running: 0 });

  // Goldens are recorded for Chromium in CI's Linux container (set RUNTIME_GOLDENS=1 to compare locally).
  if (testInfo.project.name !== 'chromium' || !GOLDENS_ENABLED) return;
  for (const entry of result.frames) {
    const png = Buffer.from(entry.png.slice(entry.png.indexOf(',') + 1), 'base64');
    expect.soft(png).toMatchSnapshot(['layers', `${entry.name}.png`], GOLDEN_OPTIONS);
  }
});

/** Frames recorded for a parallax run on a real cover: rest, the pointer in two corners, and the top of a breath. */
const PARALLAX_FRAMES = [
  { name: 'rest', seconds: 0 },
  { name: 'pointer-top-left', seconds: 0, input: { 'pointer.x': 0, 'pointer.y': 0 } },
  { name: 'pointer-bottom-right', seconds: 0, input: { 'pointer.x': 1, 'pointer.y': 1 } },
  { name: 'breath-top', seconds: PLATE_CASE_LOOP_SECONDS / 2 },
];

test('an .artifact project from LIVE_PACKAGE_PROJECT exports and plays (manual check)', async ({ page }, testInfo) => {
  test.skip(!PROJECT, 'set LIVE_PACKAGE_PROJECT=/path/to/cover.artifact');
  test.setTimeout(120_000);
  const text = readFileSync(PROJECT!, 'utf8');
  for (const approximate of [false, true]) {
    const result = await page.evaluate(
      async ([url, text, approximate]) =>
        ((await import(/* @vite-ignore */ url)) as typeof LivePage).projectCover(text, { size: 540, approximate }),
      [PAGE_MODULE, text, approximate] as const,
    );
    const name = approximate ? 'project-approximate' : 'project-exact';
    await attach(testInfo, name, result);
    console.log(`[live package] ${name}: ${describeComparison(result.comparison)}`);
    console.log(
      JSON.stringify(
        {
          stack: result.manifest.stack.map((item) =>
            item.type === 'plate'
              ? { plate: item.layers.map((l) => l.name) }
              : { chain: item.passes.map((p) => `${p.effect} (${p.source.name})`) },
          ),
          baked: result.manifest.baked,
          fallback: result.manifest.fallback,
        },
        null,
        1,
      ),
    );
    if (!approximate) expect(result.comparison.pass, describeComparison(result.comparison)).toBe(true);
  }

  // Parallax: plates nearer the top of the stack (images, text) move more than the base plate.
  const parallax = await page.evaluate(
    async ([url, text, request]) =>
      ((await import(/* @vite-ignore */ url)) as typeof LivePage).projectCover(text, request),
    [PAGE_MODULE, text, { size: 540, bindings: plateCaseBindings(), frames: PARALLAX_FRAMES }] as const,
  );
  await attach(testInfo, 'project-parallax', parallax);
  console.log(`[live package] project-parallax at rest: ${describeComparison(parallax.comparison)}`);
  console.log(
    JSON.stringify(
      parallax.manifest.stack.flatMap((item) =>
        item.type === 'plate' ? [{ plate: item.layers.map((l) => l.name), depth: item.depth, edges: item.edges }] : [],
      ),
    ),
  );
  for (const frame of parallax.frames) {
    const path = testInfo.outputPath(`project-parallax-${frame.name}.png`);
    writeFileSync(path, Buffer.from(frame.png.slice(frame.png.indexOf(',') + 1), 'base64'));
    await testInfo.attach(`project-parallax-${frame.name}.png`, { path, contentType: 'image/png' });
  }
  expect(parallax.comparison.pass, describeComparison(parallax.comparison)).toBe(true);
});
