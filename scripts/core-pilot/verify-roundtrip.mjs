import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { initSync, WebSession } from '../../packages/artifact-core-web/generated/artifact_wasm.js';

const root = new URL('../../', import.meta.url);
const output = new URL('test-results/core-pilot/roundtrip/', root);
const source = readFileSync(new URL('tests/fixtures/core-parity/viber.local/source.artifact', root), 'utf8');
const original = JSON.parse(source);
const layerId = 'layer-1780509894426-491';
const layerIndex = original.document.layers.findIndex((layer) => layer.id === layerId);
assert.ok(layerIndex >= 0);
assert.equal(original.document.layers[layerIndex].scanlines, 38);
mkdirSync(output, { recursive: true });
initSync({ module: readFileSync(new URL('packages/artifact-core-web/generated/artifact_wasm_bg.wasm', root)) });

function expected(amount) {
  const result = structuredClone(original);
  result.document.layers[layerIndex].scanlines = amount;
  return result;
}
function verify(json, amount, stage) {
  assert.deepEqual(JSON.parse(json), expected(amount), `${stage}: only Scanlines may change`);
}
function save(name, json) {
  const file = new URL(name, output);
  writeFileSync(file, json);
  return file.pathname;
}
function nativeSequence(input, name, initialAmount) {
  const report = new URL(name, output);
  const result = spawnSync(new URL('apps/macos/.build/conformance', root).pathname, [input, layerId, report.pathname], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  const stages = JSON.parse(readFileSync(report, 'utf8'));
  for (const [stage, json] of Object.entries(stages)) {
    verify(json, ['opened', 'undone'].includes(stage) ? initialAmount : 50, `Swift ${stage}`);
  }
  return stages;
}

const web = new WebSession(source);
let reopened;
try {
  assert.equal(web.set_scanlines(layerId, 44), true);
  const webJSON = web.export_json();
  verify(webJSON, 44, 'Web save');
  const webFile = save('web-44.artifact', webJSON);
  const native = nativeSequence(webFile, 'native-stages.json', 44);
  assert.equal(native.opened, webJSON, 'Swift opens the exact WASM serialization');
  const nativeFile = save('mac-50.artifact', native.reopened);

  reopened = new WebSession(readFileSync(nativeFile, 'utf8'));
  assert.equal(reopened.export_json(), native.reopened, 'WASM opens the exact Swift serialization');
  assert.equal(JSON.parse(reopened.summary_json()).canUndo, false, 'Opening a saved file starts fresh history');
  assert.equal(reopened.set_scanlines(layerId, 62), true);
  verify(reopened.export_json(), 62, 'Web second edit');
  assert.equal(reopened.undo(), true);
  assert.equal(reopened.export_json(), native.reopened, 'Web undo restores the Mac document exactly');
  assert.equal(reopened.redo(), true);
  const finalJSON = reopened.export_json();
  verify(finalJSON, 62, 'Web redo');
  const finalFile = save('web-return-62.artifact', finalJSON);
  const finalNative = nativeSequence(finalFile, 'native-return-stages.json', 62);
  assert.equal(finalNative.opened, finalJSON, 'The second Web save remains readable by Swift');

  const report = {
    result: 'passed',
    evidenceBoundary: 'WASM in Node and Swift/UniFFI CLI; does not prove browser or native GUI file dialogs',
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    sequence: [
      'source 38',
      'WASM save 44',
      'Swift open 44 / edit 50 / undo 44 / redo 50 / save',
      'WASM open 50 / edit 62 / undo 50 / redo 62 / save',
      'Swift reopen 62',
    ],
    preserved: ['all 15 layers', 'graph', 'editable text', 'embedded fonts', 'images', 'manifest', 'unknown fields'],
    packageEquality: 'Every field matches source except the intended Scanlines value',
  };
  save('report.json', `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  reopened?.free();
  web.free();
}
