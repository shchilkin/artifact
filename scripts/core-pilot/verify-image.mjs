import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { initSync, WebSession } from '../../packages/artifact-core-web/generated/artifact_wasm.js';

const root = new URL('../../', import.meta.url);
const out = new URL('test-results/core-pilot/image/', root);
mkdirSync(out, { recursive: true });
const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { cwd: root, encoding: 'utf8' });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stdout + result.stderr);
};
run(new URL('apps/macos/.build/image-check', root).pathname, [out.pathname]);
const input = new URL('tests/fixtures/core-parity/viber.local/source.artifact', root).pathname;
const source = readFileSync(input, 'utf8');
const original = JSON.parse(source);
const index = original.document.layers.findIndex((layer) => layer.name === 'Parental Advisory Label');
assert.ok(index >= 0);
const id = original.document.layers[index].id;
const src = `data:image/png;base64,${readFileSync(new URL('replacement.png', out)).toString('base64')}`;
const patch = { src, x: 0.22, y: 0.78, scaleX: 1.5, scaleY: 1.2, rotation: 25 };
writeFileSync(new URL('patch.json', out), JSON.stringify(patch));
const expected = structuredClone(original);
Object.assign(expected.document.layers[index], patch);
const args = [input, id, new URL('rust.json', out).pathname, new URL('patch.json', out).pathname, 'image'];
run('cargo', ['run', '--locked', '--offline', '-p', 'artifact-core', '--example', 'conformance', '--', ...args]);
args[2] = new URL('swift.json', out).pathname;
run(new URL('apps/macos/.build/conformance', root).pathname, args);
initSync({ module: readFileSync(new URL('packages/artifact-core-web/generated/artifact_wasm_bg.wasm', root)) });
const session = new WebSession(source);
try {
  const stages = { opened: session.export_json() };
  assert.equal(session.set_image(id, JSON.stringify(patch)), true);
  stages.changed = session.export_json();
  session.undo();
  stages.undone = session.export_json();
  assert.equal(session.set_image(id, '{}'), false);
  session.redo();
  stages.redone = session.export_json();
  const reopened = new WebSession(stages.redone);
  try {
    stages.reopened = reopened.export_json();
  } finally {
    reopened.free();
  }
  const rust = JSON.parse(readFileSync(new URL('rust.json', out), 'utf8'));
  const swift = JSON.parse(readFileSync(new URL('swift.json', out), 'utf8'));
  for (const [name, json] of Object.entries(stages)) {
    assert.deepEqual(JSON.parse(json), ['opened', 'undone'].includes(name) ? original : expected);
    assert.equal(json, rust[name]);
    assert.equal(json, swift[name]);
  }
  writeFileSync(new URL('changed.artifact', out), stages.changed);
  writeFileSync(new URL('restored.artifact', out), stages.undone);
  // A second replacement plus a transform in Swift, then reopen in WASM.
  const second = {
    src: `data:image/png;base64,${readFileSync(new URL('transparent.png', out)).toString('base64')}`,
    rotation: -15,
    x: 0.25,
  };
  writeFileSync(new URL('mac-patch.json', out), JSON.stringify(second));
  run(new URL('apps/macos/.build/conformance', root).pathname, [
    new URL('changed.artifact', out).pathname,
    id,
    new URL('mac-roundtrip.json', out).pathname,
    new URL('mac-patch.json', out).pathname,
    'image',
  ]);
  const native = JSON.parse(readFileSync(new URL('mac-roundtrip.json', out), 'utf8'));
  assert.equal(native.opened, stages.changed);
  const returned = new WebSession(native.reopened);
  try {
    Object.assign(expected.document.layers[index], second);
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
    adapters: ['Rust', 'Swift/UniFFI', 'WASM'],
    allUneditedFieldsPreserved: true,
    replacementAndTransformAtomic: true,
    sequentialRoundtrip: true,
    undoRestoresNativePNGExactly: true,
    nativeImport: ['PNG alpha', 'JPEG EXIF orientation', 'invalid file rejection'],
    evidenceBoundary: 'Adapter and native importer/renderer checks; GUI verification separate',
  };
  writeFileSync(new URL('report.json', out), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  session.free();
}
