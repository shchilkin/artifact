import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { initSync, WebSession } from '../../packages/artifact-core-web/generated/artifact_wasm.js';

const root = new URL('../../', import.meta.url);
const out = new URL('test-results/core-pilot/text/', root);
mkdirSync(out, { recursive: true });
const input = new URL('tests/fixtures/core-parity/viber.local/source.artifact', root).pathname;
const source = readFileSync(input, 'utf8');
const original = JSON.parse(source);
const index = original.document.layers.findIndex((l) => l.name === 'Вайбер Text');
assert.ok(index >= 0);
const id = original.document.layers[index].id;
const patch = { content: 'ВАЙБЕР 2', size: 96, color: '#ffcc66', x: 0.5, y: 0.15 };
const patchPath = new URL('patch.json', out).pathname;
writeFileSync(patchPath, JSON.stringify(patch));
const expected = structuredClone(original);
Object.assign(expected.document.layers[index], patch);
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8' });
  if (r.error) throw r.error;
  assert.equal(r.status, 0, r.stderr);
};
run('cargo', [
  'run',
  '--locked',
  '--offline',
  '-p',
  'artifact-core',
  '--example',
  'conformance',
  '--',
  input,
  id,
  new URL('rust.json', out).pathname,
  patchPath,
]);
run(new URL('apps/macos/.build/conformance', root).pathname, [
  input,
  id,
  new URL('swift.json', out).pathname,
  patchPath,
]);
initSync({ module: readFileSync(new URL('packages/artifact-core-web/generated/artifact_wasm_bg.wasm', root)) });
const s = new WebSession(source);
try {
  const stages = { opened: s.export_json() };
  assert.equal(s.set_text(id, JSON.stringify(patch)), true);
  stages.changed = s.export_json();
  s.undo();
  stages.undone = s.export_json();
  assert.equal(s.set_text(id, '{}'), false);
  s.redo();
  stages.redone = s.export_json();
  const reopened = new WebSession(stages.redone);
  try {
    stages.reopened = reopened.export_json();
  } finally {
    reopened.free();
  }
  const rust = JSON.parse(readFileSync(new URL('rust.json', out), 'utf8'));
  const swift = JSON.parse(readFileSync(new URL('swift.json', out), 'utf8'));
  for (const [stage, json] of Object.entries(stages)) {
    assert.deepEqual(JSON.parse(json), ['opened', 'undone'].includes(stage) ? original : expected);
    assert.equal(json, rust[stage]);
    assert.equal(json, swift[stage]);
  }
  writeFileSync(new URL('changed.artifact', out), stages.changed);
  writeFileSync(new URL('restored.artifact', out), stages.undone);
  // Real sequential handoff: WASM edit -> Swift open/edit/save -> WASM reopen.
  const secondPatch = { content: 'ВАЙБЕР\nДЖО', size: 70, color: '#aaffcc', x: 0.51, y: 0.2 };
  writeFileSync(new URL('mac-patch.json', out), JSON.stringify(secondPatch));
  run(new URL('apps/macos/.build/conformance', root).pathname, [
    new URL('changed.artifact', out).pathname,
    id,
    new URL('mac-roundtrip.json', out).pathname,
    new URL('mac-patch.json', out).pathname,
  ]);
  const native = JSON.parse(readFileSync(new URL('mac-roundtrip.json', out), 'utf8'));
  assert.equal(native.opened, stages.changed);
  const returned = new WebSession(native.reopened);
  try {
    Object.assign(expected.document.layers[index], secondPatch);
    assert.deepEqual(JSON.parse(returned.export_json()), expected);
    writeFileSync(new URL('returned.artifact', out), returned.export_json());
  } finally {
    returned.free();
  }
  for (const name of ['changed', 'restored', 'returned'])
    run(new URL('apps/macos/.build/render-check', root).pathname, [
      new URL(`${name}.artifact`, out).pathname,
      new URL(`${name}.png`, out).pathname,
      '3000',
    ]);
  assert.deepEqual(
    readFileSync(new URL('restored.png', out)),
    readFileSync(new URL('test-results/core-pilot/viber-native-3000.png', root)),
  );
  assert.notDeepEqual(readFileSync(new URL('changed.png', out)), readFileSync(new URL('restored.png', out)));
  const report = {
    result: 'passed',
    layer: id,
    fields: Object.keys(patch),
    adapters: ['Rust', 'Swift/UniFFI', 'WASM'],
    allUneditedFieldsPreserved: true,
    undoRestoresNativePngExactly: true,
    sequentialRoundtrip: true,
    multilineNativeRender: true,
    evidenceBoundary: 'Adapter and native renderer checks; separate GUI verification required',
  };
  writeFileSync(new URL('report.json', out), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  s.free();
}
