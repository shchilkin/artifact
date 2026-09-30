import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { initSync, WebSession } from '../../packages/artifact-core-web/generated/artifact_wasm.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const { values } = parseArgs({ options: { fixture: { type: 'string' }, layer: { type: 'string' } } });
const output = path.join(root, 'test-results/core-pilot');
mkdirSync(output, { recursive: true });
initSync({ module: readFileSync(path.join(root, 'packages/artifact-core-web/generated/artifact_wasm_bg.wasm')) });

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} must succeed`);
}
run('cargo', ['test', '--locked', '--offline', '-p', 'artifact-core']);

const synthetic = {
  artifactPackage: 'project',
  manifest: { kind: 'artifact-project-package', version: 1, documentSchemaVersion: 3, future: ['keep'] },
  document: {
    schemaVersion: 3,
    global: { seed: 4242, aspect: '1:1', bg: 'transparent' },
    export: { format: 'png', scale: 3 },
    layers: [
      { id: 'scan', name: 'Scanlines', kind: 'effect', scanlines: 38, scanlineWidth: 4 },
      { id: 'title', name: 'Title', kind: 'text', content: 'ВАЙБЕР', x: 0.5446792221047079 },
    ],
    graph: { edges: [{ id: 'e', fromId: 'scan', toId: '__export__' }], positions: { scan: { x: 10, y: 20 } } },
    future: { payload: 'unchanged', number: 0.7856000000000005 },
  },
  futurePackage: { preserve: true },
};
const syntheticPath = path.join(output, 'synthetic.artifact');
writeFileSync(syntheticPath, JSON.stringify(synthetic));
const cases = [{ name: 'synthetic', input: syntheticPath, layer: 'scan' }];
if (values.fixture) {
  assert.ok(values.layer, '--layer is required with --fixture');
  cases.push({ name: 'supplied', input: path.resolve(values.fixture), layer: values.layer });
} else {
  const viber = path.join(root, 'tests/fixtures/core-parity/viber.local/source.artifact');
  if (existsSync(viber)) cases.push({ name: 'viber', input: viber, layer: 'layer-1780509894426-491' });
  else console.log('Private Viber fixture absent: checking synthetic input only.');
}

const report = [];
for (const item of cases) {
  const source = readFileSync(item.input, 'utf8');
  const original = JSON.parse(source);
  const expected = structuredClone(original);
  const index = expected.document.layers.findIndex((layer) => layer.id === item.layer);
  assert.ok(index >= 0 && expected.document.layers[index].scanlines === 38);
  expected.document.layers[index].scanlines = 50;
  const rustPath = path.join(output, `${item.name}-rust.json`);
  const swiftPath = path.join(output, `${item.name}-swift.json`);
  run('cargo', [
    'run',
    '--locked',
    '--offline',
    '-p',
    'artifact-core',
    '--example',
    'conformance',
    '--',
    item.input,
    item.layer,
    rustPath,
  ]);
  run(path.join(root, 'apps/macos/.build/conformance'), [item.input, item.layer, swiftPath]);

  const session = new WebSession(source);
  let reopened;
  try {
    const opened = session.export_json();
    assert.throws(() => session.set_scanlines(item.layer, Number.NaN));
    assert.throws(() => session.set_scanlines(item.layer, 101));
    assert.throws(() => session.set_scanlines('missing-layer', 50));
    assert.equal(session.export_json(), opened);
    assert.equal(JSON.parse(session.summary_json()).canUndo, false);
    assert.equal(session.set_scanlines(item.layer, 50), true);
    const changed = session.export_json();
    assert.equal(session.undo(), true);
    const undone = session.export_json();
    assert.equal(session.set_scanlines(item.layer, 38), false);
    assert.equal(session.redo(), true);
    const redone = session.export_json();
    reopened = new WebSession(redone);
    const wasm = { opened, changed, undone, redone, reopened: reopened.export_json() };
    const native = JSON.parse(readFileSync(rustPath, 'utf8'));
    const swift = JSON.parse(readFileSync(swiftPath, 'utf8'));
    for (const [stage, result] of Object.entries(wasm)) {
      assert.deepEqual(
        JSON.parse(result),
        ['opened', 'undone'].includes(stage) ? original : expected,
        `${item.name}: ${stage} matches the independent expected package`,
      );
      assert.equal(result, native[stage], `${item.name}: ${stage} Rust/WASM serialized output`);
      assert.equal(result, swift[stage], `${item.name}: ${stage} Swift/UniFFI serialized output`);
    }
    writeFileSync(path.join(output, `${item.name}-changed.artifact`), redone);
    writeFileSync(path.join(output, `${item.name}-restored.artifact`), undone);
    report.push({
      fixture: item.name,
      sourceSha256: createHash('sha256').update(source).digest('hex'),
      layers: original.document.layers.length,
      adapters: ['Rust', 'Swift/UniFFI', 'WASM'],
      stages: Object.keys(wasm),
      result: 'passed',
    });
  } finally {
    reopened?.free();
    session.free();
  }
}
assert.throws(() => new WebSession('{"artifactPackage":"project"}'));
writeFileSync(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
