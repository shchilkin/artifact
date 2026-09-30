import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { initSync, render_effect } from '../../packages/artifact-core-web/generated/artifact_wasm.js';

const root = new URL('../../', import.meta.url);
const output = new URL('test-results/core-pilot/', root);
const run = (args) => {
  const result = spawnSync(new URL('apps/macos/.build/render-check', root).pathname, args, {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0);
};
initSync({ module: readFileSync(new URL('packages/artifact-core-web/generated/artifact_wasm_bg.wasm', root)) });
run(['--kernels', new URL('kernels-swift.json', output).pathname]);
const native = JSON.parse(readFileSync(new URL('kernels-swift.json', output), 'utf8'));
const input = Uint8Array.from({ length: 256 }, (_, i) => (i * 17 + 31) % 256);
for (const key of Object.keys(native)) {
  const config = JSON.stringify({ [key]: 38, tearSize: 4, scanlineWidth: 4 });
  assert.deepEqual(
    Array.from(render_effect(input, 8, 8, config, 4242)),
    native[key],
    `${key}: Swift/WASM pixel parity`,
  );
}
const paths = [
  'tests/fixtures/core-parity/viber.local/source.artifact',
  'test-results/core-pilot/viber-changed.artifact',
  'test-results/core-pilot/viber-restored.artifact',
];
const names = ['viber-native-3000.png', 'viber-native-changed-3000.png', 'viber-native-restored-3000.png'];
for (let i = 0; i < paths.length; i++) run([paths[i], new URL(names[i], output).pathname, '3000']);
const images = await Promise.all(
  [
    new URL('tests/fixtures/core-parity/viber.local/chrome-export-3000.png', root),
    ...names.map((n) => new URL(n, output)),
  ].map((url) => loadImage(url.pathname)),
);
const pixels = images.map((image) => {
  assert.equal(image.width, 3000);
  assert.equal(image.height, 3000);
  const canvas = createCanvas(3000, 3000);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, 3000, 3000).data;
});
function compare(a, b) {
  let sum = 0;
  let max = 0;
  let changed = 0;
  for (let i = 0; i < a.length; i += 4) {
    let different = false;
    for (let c = 0; c < 4; c++) {
      const delta = Math.abs(a[i + c] - b[i + c]);
      sum += delta;
      max = Math.max(max, delta);
      different ||= delta > 0;
    }
    if (different) changed++;
  }
  return { meanAbsoluteRGBA: sum / a.length, maxChannelDelta: max, changedPixels: changed, totalPixels: a.length / 4 };
}
const report = {
  kernels: 'all seven Swift/WASM exact match',
  nativeVsChrome: compare(pixels[0], pixels[1]),
  nativeUndo: compare(pixels[1], pixels[3]),
  nativeEdit: compare(pixels[1], pixels[2]),
  baselineAcceptance: 'Diagnostic only: assess composition using the visual criteria in docs/web-macos-viber-pilot.md',
};
assert.equal(report.nativeUndo.changedPixels, 0, 'Undo restores every rendered pixel');
assert.ok(report.nativeEdit.changedPixels > 0, 'Editing Scanlines changes the rendered image');
writeFileSync(new URL('render-comparison.json', output), `${JSON.stringify(report, null, 2)}\n`);
const canvas = createCanvas(1400, 750);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#171512';
ctx.fillRect(0, 0, 1400, 750);
ctx.fillStyle = 'white';
ctx.font = '22px sans-serif';
ctx.fillText('Chrome reference', 20, 32);
ctx.fillText('Native Rust + CoreText', 720, 32);
ctx.drawImage(images[0], 0, 50, 700, 700);
ctx.drawImage(images[1], 700, 50, 700, 700);
writeFileSync(new URL('render-comparison.png', output), canvas.toBuffer('image/png'));
console.log(JSON.stringify(report, null, 2));
