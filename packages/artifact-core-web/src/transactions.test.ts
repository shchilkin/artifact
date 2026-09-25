import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { initSync, WebSession } from '../generated/artifact_wasm.js';
import { beginTransaction, cancelTransaction, commitTransaction, updateTransaction } from './transactions';

const wasmPath = fileURLToPath(new URL('../generated/artifact_wasm_bg.wasm', import.meta.url));
const pngPath = fileURLToPath(new URL('../../../apps/web/public/girl_image_landing.png', import.meta.url));
const jpegPath = fileURLToPath(new URL('../../../crates/artifact-core/tests/fixtures/cold-image.jpg', import.meta.url));
beforeAll(() => initSync({ module: readFileSync(wasmPath) }));

function coldImageSources() {
  const png = `data:image/png;base64,${readFileSync(pngPath).toString('base64')}`;
  const small = readFileSync(jpegPath);
  const comment = Buffer.concat([Buffer.from([0xff, 0xfe, 0xff, 0xff]), Buffer.alloc(65_533, 0x78)]);
  const jpeg = `data:image/jpeg;base64,${Buffer.concat([small.subarray(0, 2), ...Array(18).fill(comment), small.subarray(2)]).toString('base64')}`;
  return { png, jpeg };
}

function open() {
  return new WebSession(
    JSON.stringify({
      artifactPackage: 'project',
      manifest: { kind: 'artifact-project-package', version: 1, documentSchemaVersion: 3, future: 'keep' },
      document: {
        schemaVersion: 3,
        global: { aspect: '1:1', bg: 'transparent', seed: 1 },
        export: { format: 'png', scale: 1 },
        layers: [{ id: 'title', kind: 'text', content: 'A', font: 'MONO' }],
        future: { keep: true },
      },
    }),
  );
}

describe('real WASM shared transactions', () => {
  it('accepts cold PNG add and JPEG source patch with one Undo, while guarding oversized batches', () => {
    const session = open();
    const { png, jpeg } = coldImageSources();
    expect(png.length).toBeGreaterThan(1024 * 1024);
    expect(jpeg.length).toBeGreaterThan(1024 * 1024);
    try {
      const original = JSON.parse(session.export_json());
      const transactionId = beginTransaction(session, 0).transactionId!;
      expect(
        updateTransaction(session, transactionId, [{ type: 'add_layer', kind: 'image', new_id: 'cold', src: png }]).ok,
      ).toBe(true);
      expect(
        updateTransaction(session, transactionId, [{ type: 'patch_layer', id: 'cold', patch: { locked: true } }]).ok,
      ).toBe(true);
      const beforeRejected = session.export_json();
      expect(
        updateTransaction(session, transactionId, [{ type: 'patch_layer', id: 'title', patch: { src: jpeg } }]).error
          ?.code,
      ).toBe('COMMAND_REJECTED');
      expect(
        updateTransaction(session, transactionId, [
          { type: 'patch_layer', id: 'cold', patch: { src: jpeg } },
          { type: 'patch_global', patch: { seed: 2 } },
        ]).error?.code,
      ).toBe('INVALID_ENVELOPE');
      expect(session.export_json()).toBe(beforeRejected);
      expect(
        updateTransaction(session, transactionId, [{ type: 'patch_layer', id: 'cold', patch: { src: jpeg } }]).ok,
      ).toBe(true);
      expect(commitTransaction(session, transactionId).revision).toBe(1);
      expect(JSON.parse(session.export_json()).document.layers[1].src).toBe(jpeg);
      expect(session.undo()).toBe(true);
      expect(JSON.parse(session.export_json())).toEqual(original);
      expect(session.redo()).toBe(true);
      expect(JSON.parse(session.export_json()).document.layers[1].src).toBe(jpeg);
    } finally {
      session.free();
    }
  });
  it('imports a font and changes its layer reference as one undoable action', () => {
    const session = open();
    try {
      const original = JSON.parse(session.export_json());
      const transactionId = beginTransaction(session, 0).transactionId!;
      const asset = updateTransaction(session, transactionId, [
        {
          type: 'edit_assets',
          collection: 'fontAssets',
          upsert: [{ id: 'native-font', dataUrl: 'data:font/ttf;base64,AA==', future: { keep: true } }],
        },
      ]);
      expect(asset.ok).toBe(true);
      expect(asset.changes.assets).toEqual(['fontAssets']);
      expect(
        updateTransaction(session, transactionId, [
          { type: 'patch_layer', id: 'title', patch: { font: 'artifact-font://native-font' } },
        ]).ok,
      ).toBe(true);
      expect(commitTransaction(session, transactionId).revision).toBe(1);
      expect(JSON.parse(session.summary_json())).toMatchObject({ undoCount: 1, redoCount: 0 });
      expect(JSON.parse(session.export_json()).document.fontAssets[0].future).toEqual({ keep: true });
      expect(session.undo()).toBe(true);
      expect(JSON.parse(session.summary_json())).toMatchObject({ undoCount: 0, redoCount: 1 });
      expect(JSON.parse(session.export_json())).toEqual(original);
      expect(session.redo()).toBe(true);
      expect(JSON.parse(session.summary_json())).toMatchObject({ undoCount: 1, redoCount: 0 });
      expect(JSON.parse(session.export_json()).document.layers[0].font).toBe('artifact-font://native-font');
    } finally {
      session.free();
    }
  });

  it('replaces a document while retaining package metadata and supports cancellation', () => {
    const session = open();
    try {
      const transactionId = beginTransaction(session, 0).transactionId!;
      const replacement = {
        schemaVersion: 3,
        global: { aspect: '4:5', bg: 'transparent', seed: 2 },
        export: { format: 'png', scale: 2 },
        layers: [{ id: 'new', kind: 'text', font: 'DISPLAY' }],
        future: { imported: true },
      };
      expect(updateTransaction(session, transactionId, [{ type: 'replace_document', document: replacement }]).ok).toBe(
        true,
      );
      expect(cancelTransaction(session, transactionId).changed).toBe(true);
      expect(JSON.parse(session.export_json()).document.future).toEqual({ keep: true });
      const second = beginTransaction(session, 0).transactionId!;
      expect(updateTransaction(session, second, [{ type: 'replace_document', document: replacement }]).ok).toBe(true);
      expect(commitTransaction(session, second).revision).toBe(1);
      const packageValue = JSON.parse(session.export_json());
      expect(packageValue.manifest.future).toBe('keep');
      expect(packageValue.document.future).toEqual({ imported: true });
      expect(session.undo()).toBe(true);
      expect(JSON.parse(session.export_json()).document.future).toEqual({ keep: true });
    } finally {
      session.free();
    }
  });

  it('rejects an empty graph edge ID during replacement without changing the draft', () => {
    const session = open();
    try {
      const original = JSON.parse(session.export_json());
      const transactionId = beginTransaction(session, 0).transactionId!;
      const document = { ...original.document, graph: { edges: [{ id: '', fromId: 'title', toId: '__export__' }] } };
      const result = updateTransaction(session, transactionId, [{ type: 'replace_document', document }]);
      expect(result.error?.code).toBe('INVALID_VALUE');
      expect(result.draftRevision).toBe(0);
      expect(JSON.parse(session.export_json())).toEqual(original);
      expect(cancelTransaction(session, transactionId).changed).toBe(false);
      expect(JSON.parse(session.summary_json()).undoCount).toBe(0);
    } finally {
      session.free();
    }
  });
});
