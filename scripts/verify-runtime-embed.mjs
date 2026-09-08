import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { serveEmbed } from './runtime-embed-server.mjs';

const root = resolve(process.argv[2]);
const evidence = JSON.parse(await readFile(join(root, 'evidence.json'), 'utf8'));
const outlined = evidence.textMode === 'svg-outlines';
const expectedFontCount = outlined ? 0 : 1;
const manifest = JSON.parse(await readFile(join(root, 'dist/.vite/manifest.json'), 'utf8'));
const runtimeBundle = Object.entries(manifest).find(([name]) => name.endsWith('artifact-runtime/dist/index.js'))?.[1]
  ?.file;
assert.ok(runtimeBundle, 'Production manifest must identify the dynamically loaded runtime');
const { server, url } = await serveEmbed(join(root, 'dist'));
const browser = await chromium.launch({ channel: process.env.ARTIFACT_BROWSER_CHANNEL ?? 'chrome' });
const results = [];
const openName = 'Открыть обложку Вайбер';
const pixelHash = () => {
  const canvas = document.querySelector('#artwork canvas');
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let hash = 2166136261;
  for (const value of pixels) hash = Math.imul(hash ^ value, 16777619);
  return hash >>> 0;
};
const fontCount = () => [...document.fonts].filter((face) => face.family.startsWith('ArtifactEmbedded')).length;
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  const requests = [];
  const errors = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(url);
  await page.locator('#open img').evaluate((image) => image.decode());
  assert.equal(
    requests.some((entry) => /\.artifact|motion\.json/.test(entry)),
    false,
  );
  assert.equal(await page.evaluate(fontCount), 0);
  assert.equal(requests.includes(`${url}/${runtimeBundle}`), false);
  assert.equal(await page.locator('canvas').count(), 0);
  results.push('Static page loads without composition, recipe, fonts or canvas');

  await page.getByRole('button', { name: openName }).click();
  await page.locator('#artwork[data-state="ready"]').waitFor();
  assert.equal(requests.includes(`${url}/${runtimeBundle}`), true);
  assert.equal(await page.evaluate(fontCount), expectedFontCount);
  assert.equal(await page.locator('#artwork canvas').isVisible(), true);
  await page.getByRole('button', { name: 'Исходный кадр' }).click();
  // Wait for the async seek to commit by comparing against the generated poster.
  await page.waitForFunction(async () => {
    const canvas = document.querySelector('#artwork canvas');
    const poster = document.querySelector('#artwork img');
    await poster.decode();
    const reference = document.createElement('canvas');
    reference.width = canvas.width;
    reference.height = canvas.height;
    reference.getContext('2d').drawImage(poster, 0, 0, reference.width, reference.height);
    const a = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const b = reference.getContext('2d').getImageData(0, 0, reference.width, reference.height).data;
    return a.every((value, index) => value === b[index]);
  });
  const neutral = await page.evaluate(pixelHash);
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await page.waitForFunction((reference) => {
    const canvas = document.querySelector('#artwork canvas');
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    for (const value of pixels) hash = Math.imul(hash ^ value, 16777619);
    return hash >>> 0 !== reference;
  }, neutral);
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  // Allow the one in-flight frame to finish, then prove the paused canvas stays fixed.
  await page.waitForTimeout(250);
  const paused = await page.evaluate(pixelHash);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(pixelHash), paused);
  results.push(
    `${outlined ? 'Font-free outlines render' : 'Embedded font loads'}; neutral exactly matches poster; selected-layer motion changes pixels; pause holds`,
  );
  await page.screenshot({ path: join(root, 'desktop.png') });
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.waitForFunction(() => [...document.fonts].every((face) => !face.family.startsWith('ArtifactEmbedded')));
  for (let i = 0; i < 10; i++) {
    await page.getByRole('button', { name: openName }).click();
    await page.locator('#artwork[data-state="ready"]').waitFor();
    assert.equal(await page.evaluate(fontCount), expectedFontCount);
    await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await page.waitForFunction(() => [...document.fonts].every((face) => !face.family.startsWith('ArtifactEmbedded')));
    await page.waitForFunction(() => document.querySelectorAll('canvas').length === 0);
    assert.equal(await page.locator('canvas').count(), 0);
  }
  results.push('Ten open/play/close cycles release the font and canvas');
  assert.deepEqual(errors, []);
  assert.equal(
    requests.some((entry) => entry.includes('/@fs') || entry.includes('/packages/runtime/src')),
    false,
  );
  results.push('No browser errors or imports from repository sources');
  await context.close();

  const reduced = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  const reducedPage = await reduced.newPage();
  const reducedRequests = [];
  reducedPage.on('request', (request) => reducedRequests.push(request.url()));
  await reducedPage.goto(url);
  await reducedPage.getByRole('button', { name: openName }).click();
  await reducedPage.getByRole('status').filter({ hasText: 'уменьшение движения' }).waitFor();
  assert.equal(
    reducedRequests.some((entry) => /\.artifact|motion\.json/.test(entry)),
    false,
  );
  assert.equal(await reducedPage.evaluate(fontCount), 0);
  assert.equal(reducedRequests.includes(`${url}/${runtimeBundle}`), false);
  assert.equal(await reducedPage.locator('#artwork canvas').isVisible(), false);
  assert.equal(await reducedPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await reducedPage.screenshot({ path: join(root, 'mobile-reduced.png') });
  results.push('Mobile reduced motion keeps static artwork without loading composition or font');
  await reduced.close();

  const failure = await browser.newContext();
  const failurePage = await failure.newPage();
  await failurePage.route('**/viber.artifact', (route) => route.fulfill({ status: 503, body: 'Unavailable' }));
  await failurePage.goto(url);
  await failurePage.getByRole('button', { name: openName }).click();
  await failurePage.getByRole('status').filter({ hasText: 'Не удалось' }).waitFor();
  assert.equal(await failurePage.locator('#artwork img').isVisible(), true);
  assert.equal(await failurePage.locator('#artwork canvas').isVisible(), false);
  assert.equal(await failurePage.evaluate(fontCount), 0);
  results.push('Asset failure preserves the static image');
  await failure.close();
  if (outlined) {
    const composition = JSON.parse(await readFile(join(root, 'dist/viber.artifact'), 'utf8'));
    assert.equal(composition.document.fontAssets, undefined);
    assert.deepEqual(composition.manifest.fonts, []);
    assert.equal(
      composition.document.layers.some((layer) => layer.kind === 'text'),
      false,
    );
    const paths = composition.document.layers.filter((layer) =>
      composition.outlineConversion.layerIds.includes(layer.id),
    );
    assert.equal(paths.length, 4);
    for (const layer of paths) {
      const svg = Buffer.from(layer.src.split(',')[1], 'base64').toString();
      assert.match(svg, /<path\b/);
      assert.doesNotMatch(svg, /<text\b|@font-face|data:font|font-family/);
    }
    results.push('Four separate SVG path layers; no text nodes, embedded font assets or font requirements');
  } else {
    const invalidFont = await browser.newContext();
    const invalidFontPage = await invalidFont.newPage();
    const brokenComposition = JSON.parse(await readFile(join(root, 'dist/viber.artifact'), 'utf8'));
    brokenComposition.document.fontAssets[0].dataUrl = 'data:font/ttf;base64,AAAA';
    await invalidFontPage.route('**/viber.artifact', (route) => route.fulfill({ json: brokenComposition }));
    await invalidFontPage.goto(url);
    await invalidFontPage.getByRole('button', { name: openName }).click();
    await invalidFontPage.getByRole('status').filter({ hasText: 'Не удалось' }).waitFor();
    assert.equal(await invalidFontPage.locator('#artwork img').isVisible(), true);
    assert.equal(await invalidFontPage.evaluate(fontCount), 0);
    results.push('Corrupt embedded font fails explicitly without replacing the poster or leaking fonts');
    await invalidFont.close();
  }

  const delayed = await browser.newContext();
  const delayedPage = await delayed.newPage();
  let releaseRequest;
  const gate = new Promise((accept) => {
    releaseRequest = accept;
  });
  await delayedPage.route('**/viber.artifact', async (route) => {
    await gate;
    await route.continue().catch(() => {});
  });
  await delayedPage.goto(url);
  await delayedPage.getByRole('button', { name: openName }).click();
  await delayedPage.locator('#artwork[data-state="loading"]').waitFor();
  await delayedPage.getByRole('button', { name: 'Закрыть', exact: true }).click();
  releaseRequest();
  await delayedPage.getByRole('button', { name: openName }).click();
  await delayedPage.locator('#artwork[data-state="ready"]').waitFor();
  assert.equal(await delayedPage.evaluate(fontCount), expectedFontCount);
  await delayedPage.emulateMedia({ reducedMotion: 'reduce' });
  await delayedPage.getByRole('status').filter({ hasText: 'уменьшение движения' }).waitFor();
  await delayedPage.waitForFunction(() =>
    [...document.fonts].every((face) => !face.family.startsWith('ArtifactEmbedded')),
  );
  assert.equal(await delayedPage.locator('#artwork img').isVisible(), true);
  results.push(
    'Closing during load permits a clean reopen; changing reduced-motion preference releases the running font',
  );
  await delayed.close();
  await writeFile(
    join(root, 'verification.json'),
    `${JSON.stringify({ ...evidence, browser: await browser.version(), results }, null, 2)}\n`,
  );
  console.log(JSON.stringify({ ...evidence, results }, null, 2));
} finally {
  await browser.close();
  await new Promise((accept) => server.close(accept));
}
