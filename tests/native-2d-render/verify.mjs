import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const root = path.resolve(import.meta.dirname, '../..');
const fixtureDir = path.join(root, 'tests/fixtures/native-2d');
const renderCheck = process.env.ARTIFACT_NATIVE_RENDER_CHECK ?? path.join(root, 'apps/macos/.build/render-check');
const outputDir = mkdtempSync(path.join(tmpdir(), 'artifact-native-render-'));
const webReference = JSON.parse(readFileSync(path.join(fixtureDir, 'web-reference.json')));
const document = (name) => JSON.parse(readFileSync(path.join(fixtureDir, `${name}.artifact.json`)));
const expected = (name) =>
  webReference.documents.find((item) => item.fixture.endsWith(`${name}.artifact.json`)).exported;

async function render(doc, width, height, name) {
  const project = {
    artifactPackage: 'project',
    manifest: { kind: 'artifact-project-package', version: 1, documentSchemaVersion: 3 },
    document: doc,
  };
  const source = path.join(outputDir, `${name}.artifact`);
  const png = path.join(outputDir, `${name}.png`);
  writeFileSync(source, JSON.stringify(project));
  const result = spawnSync(renderCheck, [source, png, `${width}x${height}`], { encoding: 'utf8', timeout: 3000 });
  assert.equal(result.status, 0, result.stderr);
  const image = await loadImage(png);
  assert.equal(image.width, width);
  assert.equal(image.height, height);
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, width, height).data;
}

function sample(pixels, width, x, y) {
  return Array.from(pixels.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
}

function inkBounds(pixels, width, height) {
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (
        pixels[i + 3] > 128 &&
        Math.max(Math.abs(pixels[i] - 23), Math.abs(pixels[i + 1] - 37), Math.abs(pixels[i + 2] - 58)) > 16
      ) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

for (const [aspect, width, height] of [
  ['1:1', 1000, 1000],
  ['4:5', 1080, 1350],
  ['9:16', 1080, 1920],
  ['16:9', 1920, 1080],
]) {
  const doc = document('alpha-nonsquare');
  doc.global.aspect = aspect;
  const pixels = await render(doc, width, height, `aspect-${aspect.replace(':', '-')}`);
  assert.deepEqual(sample(pixels, width, 0, 0), [0, 0, 0, 0]);
}

const alpha = await render(document('alpha-nonsquare'), 1080, 1350, 'alpha');
assert.deepEqual(sample(alpha, 1080, 540, 675), expected('alpha-nonsquare').samples.center);
assert.deepEqual(sample(alpha, 1080, 1079, 1349), [0, 0, 0, 0]);

const blend = await render(document('blend-modes'), 1000, 1000, 'blends');
const expectedBlend = expected('blend-modes').samples.center;
for (const [actual, web] of sample(blend, 1000, 500, 500).map((channel, index) => [channel, expectedBlend[index]])) {
  assert.ok(Math.abs(actual - web) <= 2, `blend center ${actual} vs ${web}`);
}

const text = await render(document('text-font'), 1000, 1000, 'text');
const actualInk = inkBounds(text, 1000, 1000);
const webInk = expected('text-font').textInkBounds.canonicalBasePixels;
for (const key of ['x', 'y', 'width', 'height']) {
  assert.ok(Math.abs(actualInk[key] - webInk[key]) <= 2, `text ${key}: ${actualInk[key]} vs ${webInk[key]}`);
}

const tile = createCanvas(2, 2);
const tileContext = tile.getContext('2d');
for (const [x, y, color] of [
  [0, 0, '#ff0000'],
  [1, 0, '#00ff00'],
  [0, 1, '#0000ff'],
  [1, 1, '#ffffff'],
]) {
  tileContext.fillStyle = color;
  tileContext.fillRect(x, y, 1, 1);
}
const tiledDoc = document('alpha-nonsquare');
tiledDoc.layers[0].src = `data:image/png;base64,${tile.toBuffer('image/png').toString('base64')}`;
tiledDoc.layers[0].fit = 'tile';
tiledDoc.layers[0].scaleX = 5;
tiledDoc.layers[0].scaleY = 4.4;
const tiled = await render(tiledDoc, 1080, 1350, 'tile');
assert.deepEqual(sample(tiled, 1080, 5, 5), sample(tiled, 1080, 25, 5));
assert.deepEqual(sample(tiled, 1080, 5, 5), sample(tiled, 1080, 5, 27));
assert.deepEqual(sample(tiled, 1080, 5, 5), [255, 0, 0, 255]);

const subpixel = createCanvas(1, 1);
const subpixelContext = subpixel.getContext('2d');
subpixelContext.fillStyle = '#ff0000';
subpixelContext.fillRect(0, 0, 1, 1);
const tinyTileDoc = document('alpha-nonsquare');
tinyTileDoc.layers[0].src = `data:image/png;base64,${subpixel.toBuffer('image/png').toString('base64')}`;
tinyTileDoc.layers[0].fit = 'tile';
tinyTileDoc.layers[0].scaleX = 0.01;
tinyTileDoc.layers[0].scaleY = 0.01;
const tinyTile = await render(tinyTileDoc, 1080, 1350, 'subpixel-tile');
assert.deepEqual(sample(tinyTile, 1080, 540, 675), [255, 0, 0, 255]);

console.log(
  `Native 2D render foundation passed: four aspects, alpha, five blends, embedded text, normal/subpixel tile. Outputs: ${outputDir}`,
);
