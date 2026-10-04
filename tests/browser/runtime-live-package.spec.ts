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
