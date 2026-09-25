import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const root = path.resolve(import.meta.dirname, '../..');
const fixtures = path.join(root, 'tests/fixtures/native-2d/p09');
const renderer = process.env.ARTIFACT_NATIVE_RENDER_CHECK ?? path.join(root, 'apps/macos/.build/render-check');
const referenceDir = process.env.ARTIFACT_P09_WEB_REFERENCE_DIR ?? path.join(fixtures, 'web-reference');
const manifest = JSON.parse(readFileSync(path.join(fixtures, 'web-reference-manifest.json')));
const output = process.env.ARTIFACT_P09_OUTPUT_DIR ?? path.join(root, 'test-results/native-2d-graph');
mkdirSync(output, { recursive: true });
const sizes = { '1:1': [1000, 1000], '4:5': [1080, 1350], '9:16': [1080, 1920], '16:9': [1920, 1080] };

async function pixels(file) {
  const image = await loadImage(file);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  return {
    width: image.width,
    height: image.height,
    pixels: context.getImageData(0, 0, image.width, image.height).data,
  };
}
function histogram(data) {
  let transparent = 0,
    translucent = 0,
    opaque = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] === 0) transparent++;
    else if (data[i] === 255) opaque++;
    else translucent++;
  }
  return { transparent, translucent, opaque };
}
function bounds(data, width, height, threshold = 8) {
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] <= threshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  return maxX < minX ? null : { minX, minY, maxX, maxY };
}
function percentile(counts, total, fraction) {
  let passed = 0;
  for (let delta = 0; delta < counts.length; delta++) {
    passed += counts[delta];
    if (passed >= total * fraction) return delta;
  }
  return 255;
}
function interiorDifference(actual, expected, width, height) {
  const rgbCounts = new Uint32Array(256),
    alphaCounts = new Uint32Array(256);
  const edgeRgbCounts = new Uint32Array(256),
    edgeAlphaCounts = new Uint32Array(256);
  let rgbCount = 0,
    alphaCount = 0,
    rgbSum = 0,
    alphaSum = 0;
  let edgeRgbCount = 0,
    edgeAlphaCount = 0,
    edgeRgbSum = 0,
    edgeAlphaSum = 0;
  const stable = (data, x, y, center) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (Math.abs(data[((y + dy) * width + x + dx) * 4 + 3] - center) > 2) return false;
      }
    return true;
  };
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4,
        a = actual[i + 3],
        b = expected[i + 3];
      if (a <= 16 || b <= 16 || !stable(actual, x, y, a) || !stable(expected, x, y, b)) {
        if (a > 0 || b > 0) {
          const alpha = Math.abs(a - b);
          edgeAlphaCounts[alpha]++;
          edgeAlphaCount++;
          edgeAlphaSum += alpha;
          if (a > 8 && b > 8)
            for (let channel = 0; channel < 3; channel++) {
              const delta = Math.abs(actual[i + channel] - expected[i + channel]);
              edgeRgbCounts[delta]++;
              edgeRgbCount++;
              edgeRgbSum += delta;
            }
        }
        continue;
      }
      const alpha = Math.abs(a - b);
      alphaCounts[alpha]++;
      alphaCount++;
      alphaSum += alpha;
      for (let channel = 0; channel < 3; channel++) {
        const delta = Math.abs(actual[i + channel] - expected[i + channel]);
        rgbCounts[delta]++;
        rgbCount++;
        rgbSum += delta;
      }
    }
  return {
    pixels: alphaCount,
    rgbMAE: rgbCount ? rgbSum / rgbCount : null,
    rgbP99: rgbCount ? percentile(rgbCounts, rgbCount, 0.99) : null,
    alphaMAE: alphaCount ? alphaSum / alphaCount : null,
    alphaP99: alphaCount ? percentile(alphaCounts, alphaCount, 0.99) : null,
    edge: {
      pixels: edgeAlphaCount,
      rgbMAE: edgeRgbCount ? edgeRgbSum / edgeRgbCount : null,
      rgbP99: edgeRgbCount ? percentile(edgeRgbCounts, edgeRgbCount, 0.99) : null,
      alphaMAE: edgeAlphaCount ? edgeAlphaSum / edgeAlphaCount : null,
      alphaP99: edgeAlphaCount ? percentile(edgeAlphaCounts, edgeAlphaCount, 0.99) : null,
    },
  };
}
function difference(actual, expected) {
  let alphaTotal = 0,
    rgbTotal = 0,
    alphaMax = 0,
    rgbMax = 0;
  let rgbCount = 0;
  for (let i = 0; i < actual.length; i += 4) {
    const alpha = Math.abs(actual[i + 3] - expected[i + 3]);
    alphaTotal += alpha;
    alphaMax = Math.max(alphaMax, alpha);
    if (actual[i + 3] > 8 && expected[i + 3] > 8) {
      for (let c = 0; c < 3; c++) {
        const delta = Math.abs(actual[i + c] - expected[i + c]);
        rgbTotal += delta;
        rgbMax = Math.max(rgbMax, delta);
        rgbCount++;
      }
    }
  }
  return { alphaMAE: alphaTotal / (actual.length / 4), alphaMax, rgbMAE: rgbCount ? rgbTotal / rgbCount : 0, rgbMax };
}

const results = [];
for (const name of [
  'color',
  'color-translucent-clipping',
  'transform',
  'transform-nonsquare',
  'grime-shadow',
  'repeat',
  'repeat-random-jitter',
  'mask',
  'mask-expanded-feathered',
  'merge',
  'combined',
  'mask-no-mask-input',
  'merge-no-b-input',
  'merge-empty',
  'export-empty-transparent',
  'stack-reordered',
  'shared-upstream',
]) {
  const document = JSON.parse(readFileSync(path.join(fixtures, `${name}.artifact.json`)));
  const inputBytes = readFileSync(path.join(fixtures, `${name}.artifact.json`));
  const entryManifest = manifest.files[name];
  assert.ok(entryManifest, `${name}: missing independent Web reference manifest`);
  assert.equal(
    createHash('sha256')
      .update(JSON.stringify(JSON.parse(inputBytes)))
      .digest('hex'),
    entryManifest.inputValueSha256,
    `${name}: fixture value changed since Web capture`,
  );
  const [width, height] = sizes[document.global.aspect];
  const input = path.join(output, `${name}.artifact`),
    png = path.join(output, `${name}.png`);
  writeFileSync(
    input,
    JSON.stringify({
      artifactPackage: 'project',
      manifest: { kind: 'artifact-project-package', version: 1, documentSchemaVersion: 3 },
      document,
    }),
  );
  const command = spawnSync(renderer, [input, png, `${width}x${height}`], { encoding: 'utf8', timeout: 20000 });
  assert.equal(command.status, 0, `${name}: ${command.stderr}`);
  if (name === 'repeat-random-jitter') {
    const repeated = path.join(output, `${name}-repeat.png`);
    const second = spawnSync(renderer, [input, repeated, `${width}x${height}`], { encoding: 'utf8', timeout: 20000 });
    assert.equal(second.status, 0, `${name}: second seeded render failed: ${second.stderr}`);
    assert.equal(
      createHash('sha256').update(readFileSync(png)).digest('hex'),
      createHash('sha256').update(readFileSync(repeated)).digest('hex'),
      `${name}: seeded render changed across runs`,
    );
  }
  const native = await pixels(png);
  assert.equal(native.width, width);
  assert.equal(native.height, height);
  const entry = { name, dimensions: [width, height], nativeAlpha: histogram(native.pixels) };
  const reference = path.join(referenceDir, `${name}.png`);
  assert.equal(
    createHash('sha256').update(readFileSync(reference)).digest('hex'),
    entryManifest.pngSha256,
    `${name}: Web reference changed`,
  );
  const web = await pixels(reference);
  assert.deepEqual([web.width, web.height], [width, height]);
  entry.webAlpha = histogram(web.pixels);
  entry.delta = difference(native.pixels, web.pixels);
  entry.interior = interiorDifference(native.pixels, web.pixels, width, height);
  entry.nativeBounds = bounds(native.pixels, width, height);
  entry.webBounds = bounds(web.pixels, width, height);
  if (entry.nativeBounds && entry.webBounds && name !== 'grime-shadow') {
    for (const axis of ['minX', 'minY', 'maxX', 'maxY']) {
      assert.ok(
        Math.abs(entry.nativeBounds[axis] - entry.webBounds[axis]) <= 1,
        `${name}: ${axis} differs by more than one pixel`,
      );
    }
  }
  assert.ok(
    entry.interior.pixels > 1000 || name === 'merge-empty' || name === 'export-empty-transparent',
    `${name}: no stable painted interior`,
  );
  if (entry.interior.pixels > 0) {
    assert.ok(entry.interior.rgbMAE <= 4, `${name}: painted RGB MAE ${entry.interior.rgbMAE}`);
    assert.ok(entry.interior.rgbP99 <= 16, `${name}: painted RGB p99 ${entry.interior.rgbP99}`);
    assert.ok(entry.interior.alphaP99 <= 2, `${name}: painted alpha p99 ${entry.interior.alphaP99}`);
  }
  if (name === 'repeat-random-jitter') {
    // Angle/position RNG order moves copy silhouettes when it diverges.
    assert.ok(entry.delta.alphaMAE <= 1, `${name}: seeded copy geometry diverged from Web`);
  }
  if (name === 'merge-empty' || name === 'export-empty-transparent') {
    assert.equal(entry.nativeAlpha.transparent, width * height, `${name} must be transparent`);
  }
  results.push(entry);
}
for (const [sourceName, width, height, targets] of [
  [
    'combined',
    1920,
    1080,
    [
      ['branch-repeat', 'repeat'],
      ['branch-mask', 'mask'],
      ['branch-merge', 'merge'],
    ],
  ],
  [
    'graph-utilities',
    1000,
    1000,
    [
      ['utility-color', 'color'],
      ['utility-transform', 'transform'],
      ['utility-shadow', 'grime-shadow'],
    ],
  ],
]) {
  const document = JSON.parse(
    readFileSync(
      path.join(sourceName === 'combined' ? fixtures : path.dirname(fixtures), `${sourceName}.artifact.json`),
    ),
  );
  const input = path.join(output, `${sourceName}-targets.artifact`);
  writeFileSync(
    input,
    JSON.stringify({
      artifactPackage: 'project',
      manifest: { kind: 'artifact-project-package', version: 1, documentSchemaVersion: 3 },
      document,
    }),
  );
  for (const [id, fixtureName] of targets) {
    const png = path.join(output, `target-${id}.png`);
    const command = spawnSync(renderer, [input, png, `${width}x${height}`, `--target=${id}`], {
      encoding: 'utf8',
      timeout: 20000,
    });
    assert.equal(command.status, 0, `${id}: ${command.stderr}`);
    assert.equal(
      createHash('sha256').update(readFileSync(png)).digest('hex'),
      createHash('sha256')
        .update(readFileSync(path.join(output, `${fixtureName}.png`)))
        .digest('hex'),
      `${id}: node target differed from the same export recipe`,
    );
  }
}
console.log(JSON.stringify(results, null, 2));
