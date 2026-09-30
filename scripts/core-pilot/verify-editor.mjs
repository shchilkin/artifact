import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { initSync, new_project, WebSession } from '../../packages/artifact-core-web/generated/artifact_wasm.js';

const root = new URL('../../', import.meta.url);
const out = new URL('test-results/core-pilot/editor/', root);
mkdirSync(out, { recursive: true });
function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: root, encoding: 'utf8' });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stdout + result.stderr);
}
initSync({ module: readFileSync(new URL('packages/artifact-core-web/generated/artifact_wasm_bg.wasm', root)) });
const input = new URL('tests/fixtures/core-parity/viber.local/source.artifact', root);
const source = readFileSync(input, 'utf8');
const original = JSON.parse(source);
const title = original.document.layers.find((l) => l.name === 'Вайбер Text').id;
const commands = [
  { type: 'edit_layer', id: title, patch: { name: 'Cover title', content: 'ВАЙБЕР 4', color: '#ffd166' } },
  { type: 'duplicate_layer', id: title, newId: 'editor-copy' },
  {
    type: 'edit_layer',
    id: 'editor-copy',
    patch: { content: 'SIDE B', size: 30, x: 0.5, y: 0.8, rotation: -8, visible: false },
  },
  { type: 'move_layer', id: 'editor-copy', delta: 1 },
  { type: 'add_layer', kind: 'fill', newId: 'editor-fill', afterId: 'editor-copy' },
  { type: 'edit_layer', id: 'editor-fill', patch: { color: '#182024', opacity: 12 } },
  { type: 'add_layer', kind: 'emoji', newId: 'editor-emoji', afterId: 'editor-fill' },
  { type: 'edit_layer', id: 'editor-emoji', patch: { emojis: ['⭐'], density: 3, minSz: 12, maxSz: 24, opacity: 30 } },
  { type: 'add_layer', kind: 'effect', newId: 'editor-effect', afterId: 'editor-emoji' },
  { type: 'edit_layer', id: 'editor-effect', patch: { scanlines: 12, grain: 3 } },
  { type: 'move_node', id: 'editor-effect', x: 530, y: 480 },
  { type: 'disconnect', to: 'editor-effect' },
  { type: 'connect', from: 'editor-emoji', to: 'editor-effect' },
  { type: 'delete_layer', id: 'editor-copy' },
];
writeFileSync(new URL('commands.json', out), JSON.stringify(commands));
const args = [
  input.pathname,
  title,
  new URL('rust.json', out).pathname,
  new URL('commands.json', out).pathname,
  'editor',
];
run('cargo', ['run', '--offline', '--locked', '-p', 'artifact-core', '--example', 'conformance', '--', ...args]);
args[2] = new URL('swift.json', out).pathname;
run(new URL('apps/macos/.build/conformance', root).pathname, args);
const session = new WebSession(source);
try {
  const states = [session.export_json()];
  for (const command of commands) {
    assert.equal(session.execute(JSON.stringify(command)), true);
    states.push(session.export_json());
  }
  const stages = { opened: states[0], changed: states.at(-1) };
  for (let i = states.length - 2; i >= 0; i--) {
    assert.equal(session.undo(), true);
    assert.equal(session.export_json(), states[i]);
  }
  stages.undone = session.export_json();
  for (let i = 1; i < states.length; i++) {
    assert.equal(session.redo(), true);
    assert.equal(session.export_json(), states[i]);
  }
  stages.redone = session.export_json();
  const reopened = new WebSession(stages.redone);
  stages.reopened = reopened.export_json();
  reopened.free();
  for (const adapter of ['rust', 'swift']) {
    const result = JSON.parse(readFileSync(new URL(`${adapter}.json`, out), 'utf8'));
    for (const key of Object.keys(stages)) assert.equal(result[key], stages[key], `${adapter}/${key}`);
  }
  assert.deepEqual(JSON.parse(stages.undone), original);
  writeFileSync(new URL('workspace.artifact', out), stages.reopened);
  // Send the WASM output to Swift, change its graph, then reopen that exact package in WASM.
  const next = [
    { type: 'connect', from: 'editor-effect', to: '__export__' },
    { type: 'move_node', id: '__export__', x: 810, y: 480 },
  ];
  writeFileSync(new URL('mac-commands.json', out), JSON.stringify(next));
  run(new URL('apps/macos/.build/conformance', root).pathname, [
    new URL('workspace.artifact', out).pathname,
    title,
    new URL('mac-return.json', out).pathname,
    new URL('mac-commands.json', out).pathname,
    'editor',
  ]);
  const returned = JSON.parse(readFileSync(new URL('mac-return.json', out), 'utf8'));
  assert.equal(returned.opened, stages.reopened);
  const webReturn = new WebSession(returned.reopened);
  assert.equal(webReturn.export_json(), returned.reopened);
  webReturn.free();
  writeFileSync(new URL('returned.artifact', out), returned.reopened);
} finally {
  session.free();
}
const blank = new WebSession(new_project());
blank.execute(JSON.stringify({ type: 'add_layer', kind: 'text', newId: 'hello' }));
blank.execute(
  JSON.stringify({ type: 'edit_layer', id: 'hello', patch: { content: 'NATIVE STUDIO', color: '#ff6b35', size: 48 } }),
);
writeFileSync(new URL('blank-text.artifact', out), blank.export_json());
blank.free();
for (const name of ['workspace', 'returned', 'blank-text'])
  run(new URL('apps/macos/.build/render-check', root).pathname, [
    new URL(`${name}.artifact`, out).pathname,
    new URL(`${name}.png`, out).pathname,
    '1000',
  ]);
const report = {
  result: 'passed',
  commands: commands.length,
  adapters: ['Rust', 'Swift/UniFFI', 'WASM'],
  everyWasmUndoRedoStateExact: true,
  allAdaptersByteIdentical: true,
  webMacWebRoundtrip: true,
  blankProjectNativeTextRender: true,
  gui: 'separate manual automation evidence',
};
writeFileSync(new URL('report.json', out), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
