import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initSync, render_effect } from '../../packages/artifact-core-web/generated/artifact_wasm.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(root, 'test-results/core-pilot/public-native');
const fixture = path.join(root, 'test-results/core-pilot/public-p01.artifact');
mkdirSync(output, { recursive: true });
initSync({ module: readFileSync(path.join(root, 'packages/artifact-core-web/generated/artifact_wasm_bg.wasm')) });
function run(exe, args) {
  const result = spawnSync(exe, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${exe} must pass`);
}
run(path.join(root, 'apps/macos/.build/model-check'), [fixture, path.join(output, 'model')]);
const png = path.join(output, 'public-p01.png');
run(path.join(root, 'apps/macos/.build/render-check'), [fixture, png, '1000']);
assert.deepEqual(Array.from(readFileSync(png).subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
const kernelPath = path.join(output, 'kernels.json');
run(path.join(root, 'apps/macos/.build/render-check'), ['--kernels', kernelPath]);
const native = JSON.parse(readFileSync(kernelPath, 'utf8'));
const input = Uint8Array.from({ length: 256 }, (_, i) => (i * 17 + 31) % 256);
for (const key of Object.keys(native)) {
  const config = JSON.stringify({ [key]: 38, tearSize: 4, scanlineWidth: 4 });
  assert.deepEqual(
    Array.from(render_effect(input, 8, 8, config, 4242)),
    native[key],
    `${key} Swift/WASM kernel parity`,
  );
}
console.log('PASS: P01-derived native model/render PNG and seven Swift/WASM effect kernels');
