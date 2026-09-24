import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initSync, WebSession } from '../../packages/artifact-core-web/generated/artifact_wasm.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const scratch = mkdtempSync(path.join(tmpdir(), 'artifact-p03-conformance-'));
const run = (file, args) => {
  const result = spawnSync(file, args, { cwd: root, encoding: 'utf8', env: process.env });
  if (result.status !== 0) throw new Error(`${file} failed: ${result.stderr || result.stdout}`);
};
const digest = (text) => createHash('sha256').update(text).digest('hex').slice(0, 12);
const canonical = (value) =>
  JSON.stringify(value, (_, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );

try {
  run('cargo', ['build', '--locked', '--offline', '-p', 'artifact-core', '--example', 'command_conformance']);
  const common = [
    '-O',
    '-target',
    'arm64-apple-macosx14.0',
    '-I',
    'apps/macos/Generated',
    '-Xcc',
    '-fmodule-map-file=apps/macos/Generated/artifact_ffiFFI.modulemap',
    '-module-cache-path',
    path.join(scratch, 'module-cache'),
    'apps/macos/Generated/artifact_ffi.swift',
    'target/release/libartifact_ffi.a',
    '-framework',
    'Security',
    '-framework',
    'SystemConfiguration',
  ];
  const swiftBinary = path.join(scratch, 'command-conformance-swift');
  run('xcrun', ['swiftc', ...common, 'tests/core-commands/CommandConformance.swift', '-o', swiftBinary]);
  initSync({ module: readFileSync(path.join(root, 'packages/artifact-core-web/generated/artifact_wasm_bg.wasm')) });

  const fixtures = [
    'text-font',
    'alpha-nonsquare',
    'alpha-jpeg',
    'blend-modes',
    'branch-merge-mask-repeat',
    'source-families',
    'graph-utilities',
    'hundred-node',
  ];
  const cases = fixtures.map((name) => ({
    name,
    document: JSON.parse(readFileSync(path.join(root, `tests/fixtures/native-2d/${name}.artifact.json`), 'utf8')),
  }));
  cases.push({
    name: 'large-referenced-asset',
    document: {
      schemaVersion: 3,
      global: { aspect: '1:1', bg: 'transparent', seed: 7 },
      layers: [
        {
          id: 'asset',
          kind: 'image',
          src: 'artifact-asset://two-megabyte-reference',
          visible: true,
          locked: false,
          x: 0.5,
          y: 0.5,
          unknown: { payloadMarker: 'preserve' },
        },
      ],
      export: { format: 'png', scale: 1, target: 'cover' },
      unknownDocument: 'x'.repeat(2 * 1024 * 1024),
    },
  });
  cases.push({
    name: 'cold-structure-embedded-asset',
    document: {
      schemaVersion: 3,
      global: { aspect: '1:1', bg: 'transparent', seed: 9 },
      layers: [
        {
          id: 'image',
          kind: 'image',
          src: `data:image/png;base64,${'A'.repeat(2 * 1024 * 1024)}`,
          visible: true,
          locked: false,
          unknown: { nested: null },
        },
      ],
      export: { format: 'png', scale: 1, target: 'cover' },
      coldStructureConformance: true,
    },
  });
  for (const { name, document } of cases) {
    const packageText = JSON.stringify({
      artifactPackage: 'project',
      manifest: {
        kind: 'artifact-project-package',
        version: 1,
        documentSchemaVersion: 3,
      },
      document,
    });
    const first = document.layers[0];
    const commands = [
      { type: 'patch_layer', id: first.id, patch: { visible: first.visible !== false ? false : true } },
      { type: 'patch_global', patch: { aspect: document.global.aspect === '4:5' ? '1:1' : '4:5' } },
      { type: 'patch_export', patch: { format: document.export.format === 'jpeg' ? 'png' : 'jpeg' } },
    ];
    if (name === 'branch-merge-mask-repeat') {
      commands.push(
        {
          type: 'graph',
          action: {
            kind: 'patch_node',
            id: document.graph.repeatNodes[0].id,
            patch: { count: document.graph.repeatNodes[0].count + 1 },
          },
        },
        {
          type: 'graph',
          action: {
            kind: 'patch_node',
            id: document.graph.maskNodes[0].id,
            patch: { invert: !document.graph.maskNodes[0].invert },
          },
        },
      );
    }
    if (name === 'graph-utilities') {
      for (const [list, field] of [
        ['colorNodes', 'saturation'],
        ['transformNodes', 'rotation'],
        ['grimeShadowNodes', 'spread'],
      ]) {
        const node = document.graph[list][0];
        commands.push({
          type: 'graph',
          action: { kind: 'patch_node', id: node.id, patch: { [field]: node[field] + 1 } },
        });
      }
    }
    const input = path.join(scratch, `${name}.artifact`);
    const commandFile = path.join(scratch, `${name}.commands.json`);
    const rustFile = path.join(scratch, `${name}.rust.json`);
    const swiftFile = path.join(scratch, `${name}.swift.json`);
    writeFileSync(input, packageText);
    writeFileSync(commandFile, JSON.stringify(commands));
    run(path.join(root, 'target/debug/examples/command_conformance'), [input, commandFile, rustFile]);
    run(swiftBinary, [input, commandFile, swiftFile]);
    const rust = JSON.parse(readFileSync(rustFile, 'utf8'));
    const swift = JSON.parse(readFileSync(swiftFile, 'utf8'));
    const webSession = new WebSession(packageText);
    const opened = webSession.export_json();
    const begin = webSession.begin_transaction_json(JSON.stringify({ version: 1, expectedRevision: 0 }));
    const noopUpdate = webSession.update_transaction_json(
      JSON.stringify({
        version: 1,
        transactionId: 1,
        commands: [
          { type: 'patch_global', patch: { aspect: document.global.aspect === '1:1' ? '4:5' : '1:1' } },
          { type: 'patch_global', patch: { aspect: document.global.aspect } },
        ],
      }),
    );
    const update = webSession.update_transaction_json(JSON.stringify({ version: 1, transactionId: 1, commands }));
    const draft = webSession.export_json();
    const commit = webSession.commit_transaction_json(JSON.stringify({ version: 1, transactionId: 1 }));
    const committed = webSession.export_json();
    assert.equal(webSession.undo(), true);
    const undone = webSession.export_json();
    assert.equal(webSession.redo(), true);
    const redone = webSession.export_json();
    const graphPlan = webSession.graph_plan_json('__export__');
    const reopenedSession = new WebSession(webSession.export_durable_json());
    const reopened = reopenedSession.export_json();
    reopenedSession.free();
    const stale = webSession.cancel_transaction_json(JSON.stringify({ version: 1, transactionId: 1 }));
    const cancelBegin = webSession.begin_transaction_json(
      JSON.stringify({ version: 1, expectedRevision: Number(webSession.revision()) }),
    );
    const cancelUpdate = webSession.update_transaction_json(
      JSON.stringify({
        version: 1,
        transactionId: 2,
        commands: [{ type: 'patch_global', patch: { seed: document.global.seed + 2 } }],
      }),
    );
    const cancelDraft = webSession.export_json();
    const failed = webSession.update_transaction_json(
      JSON.stringify({
        version: 1,
        transactionId: 2,
        commands: [
          {
            type: 'bridge',
            capability: 'web:layer-property',
            target: { scope: 'layer_field', id: first.id, field: 'cancelledNull' },
            value: null,
          },
          { type: 'patch_global', patch: { aspect: 'invalid' } },
        ],
      }),
    );
    const failedDraft = webSession.export_json();
    const cancel = webSession.cancel_transaction_json(JSON.stringify({ version: 1, transactionId: 2 }));
    const cancelled = webSession.export_json();
    assert.equal(
      webSession.execute(JSON.stringify({ type: 'edit_layer', id: first.id, patch: { name: 'P03 legacy' } })),
      true,
    );
    const legacy = webSession.export_json();
    const mixedBegin = webSession.begin_transaction_json(
      JSON.stringify({ version: 1, expectedRevision: Number(webSession.revision()) }),
    );
    const mixedUpdate = webSession.update_transaction_json(
      JSON.stringify({
        version: 1,
        transactionId: 3,
        commands: [{ type: 'patch_global', patch: { seed: document.global.seed + 3 } }],
      }),
    );
    const mixedCommit = webSession.commit_transaction_json(JSON.stringify({ version: 1, transactionId: 3 }));
    const mixedAfter = webSession.export_json();
    assert.equal(webSession.undo(), true);
    const mixedUndoTransaction = webSession.export_json();
    assert.equal(webSession.undo(), true);
    const mixedUndoLegacy = webSession.export_json();
    assert.equal(webSession.redo(), true);
    const mixedRedoLegacy = webSession.export_json();
    assert.equal(webSession.redo(), true);
    const mixedRedoTransaction = webSession.export_json();
    let structureUpdate = '';
    let structureCommit = '';
    let structureUndo = '';
    let structureRedo = '';
    if (document.coldStructureConformance) {
      const current = JSON.parse(webSession.export_json()).document;
      const bridge = {
        type: 'bridge_structure',
        capability: 'web:structure',
        layers: [...current.layers, { id: 'p03-model', kind: 'model', unknown: { nested: null } }],
        graph: {
          present: true,
          value: {
            edges: [{ id: 'p03-edge', fromId: 'p03-model', toId: '__export__' }],
            positions: {},
            mergeNodes: [],
            colorNodes: [],
            unknown: { nested: null },
          },
        },
      };
      webSession.begin_transaction_json(
        JSON.stringify({ version: 1, expectedRevision: Number(webSession.revision()) }),
      );
      structureUpdate = webSession.update_transaction_json(
        JSON.stringify({ version: 1, transactionId: 4, commands: [bridge] }),
      );
      structureCommit = webSession.commit_transaction_json(JSON.stringify({ version: 1, transactionId: 4 }));
      assert.equal(webSession.undo(), true);
      structureUndo = webSession.export_json();
      assert.equal(webSession.redo(), true);
      structureRedo = webSession.export_json();
    }
    webSession.free();
    const wasm = {
      opened,
      begin,
      noopUpdate,
      update,
      draft,
      commit,
      committed,
      undone,
      redone,
      reopened,
      stale,
      cancelBegin,
      cancelUpdate,
      cancelDraft,
      failed,
      failedDraft,
      cancel,
      cancelled,
      legacy,
      mixedBegin,
      mixedUpdate,
      mixedCommit,
      mixedAfter,
      mixedUndoTransaction,
      mixedUndoLegacy,
      mixedRedoLegacy,
      mixedRedoTransaction,
      structureUpdate,
      structureCommit,
      structureUndo,
      structureRedo,
      graphPlan,
    };
    for (const [stage, value] of Object.entries(wasm)) {
      const comparable = stage === 'structureRedo' && value ? canonical(JSON.parse(value)) : value;
      const rustComparable =
        stage === 'structureRedo' && rust[stage] ? canonical(JSON.parse(rust[stage])) : rust[stage];
      const swiftComparable =
        stage === 'structureRedo' && swift[stage] ? canonical(JSON.parse(swift[stage])) : swift[stage];
      assert.equal(
        digest(comparable),
        digest(rustComparable),
        `${name} ${stage}: Rust/WASM (${digest(comparable)} vs ${digest(rustComparable)})`,
      );
      assert.equal(
        digest(comparable),
        digest(swiftComparable),
        `${name} ${stage}: Swift/WASM (${digest(comparable)} vs ${digest(swiftComparable)})`,
      );
    }
    assert.equal(undone, opened, `${name}: Undo`);
    assert.equal(redone, committed, `${name}: Redo`);
    assert.equal(reopened, committed, `${name}: reopen`);
    assert.equal(JSON.parse(update).ok, true, `${name}: update accepted`);
    assert.equal(JSON.parse(noopUpdate).changed, false, `${name}: net-zero update is unchanged`);
    assert.equal(JSON.parse(noopUpdate).draftRevision, 0, `${name}: net-zero update does not advance draft`);
    assert.equal(JSON.parse(commit).changed, true, `${name}: commit changed`);
    assert.equal(failedDraft, cancelDraft, `${name}: failed batch restored previous draft`);
    assert.equal(cancelled, redone, `${name}: cancel restored durable state`);
    assert.equal(JSON.parse(cancel).changed, true, `${name}: cancel reports restoration`);
    assert.deepEqual(JSON.parse(cancel).changes.global, ['seed'], `${name}: cancel changed field`);
    if (document.coldStructureConformance) {
      assert.equal(JSON.parse(structureUpdate).ok, true, `${name}: cold structure update`);
      assert.equal(JSON.parse(structureCommit).changed, true, `${name}: cold structure commit`);
      assert.equal(structureUndo, mixedRedoTransaction, `${name}: cold structure undo`);
      assert.equal(JSON.parse(structureRedo).document.layers.at(-1).kind, 'model');
    }
    assert.equal(mixedUndoTransaction, legacy, `${name}: Undo new transaction`);
    assert.equal(mixedUndoLegacy, redone, `${name}: Undo legacy edit`);
    assert.equal(mixedRedoLegacy, legacy, `${name}: Redo legacy edit`);
    assert.equal(mixedRedoTransaction, mixedAfter, `${name}: Redo new transaction`);
    console.log(`${name}: Rust/WASM/Swift ${digest(committed)}`);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
