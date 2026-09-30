import { readFileSync } from 'node:fs';
import { trySharedLayerPatch, warmSharedCommands } from '@artifact/core-web/commands';
import { beforeAll, describe, expect, it } from 'vitest';
import { initSync } from '../../../../packages/artifact-core-web/generated/artifact_wasm';
import { type CanvasDocument, makeFillLayer, makeImageLayer, makeTextLayer } from '../types/config';
import { renameLayerInDocument, toggleLayerVisibilityInDocument, updateLayerInDocument } from './documentCommands';
import { createBlankDocument } from './documentPersistence';

beforeAll(async () => {
  // Use the real compiled Rust engine. Only load bytes locally instead of fetch.
  initSync({
    module: readFileSync(
      new URL('../../../../packages/artifact-core-web/generated/artifact_wasm_bg.wasm', import.meta.url),
    ),
  });
  expect(await warmSharedCommands()).toBe(true);
});

describe('production document commands with the shared Rust core', () => {
  it('edits through WASM while preserving the document, graph and other layer references', () => {
    const text = makeTextLayer();
    const fill = makeFillLayer();
    const doc: CanvasDocument = { ...createBlankDocument(), layers: [fill, text] };
    const patch = { content: 'WEB + MAC', x: 0.2, y: 0.75, size: 48, color: '#ff6b35' };
    expect(trySharedLayerPatch(text, patch)).toEqual({ ...text, ...patch });
    const edited = updateLayerInDocument(doc, text.id, patch);
    expect(edited.layers[1]).toEqual({ ...text, ...patch });
    expect(edited.layers[0]).toBe(fill);
    expect(edited.global).toBe(doc.global);
    expect(edited.graph).toBe(doc.graph);
    expect(doc.layers[1]).toBe(text);
    expect(renameLayerInDocument(edited, text.id, ' Title ').layers[1].name).toBe('Title');
    expect(toggleLayerVisibilityInDocument(edited, text.id).layers[1].visible).toBe(!text.visible);
  });
  it('keeps local asset references and all unrelated image fields portable', () => {
    const image = makeImageLayer('artifact-asset://local-image');
    const patch = { x: 0.4, rotation: 25, scaleY: 0.8 };
    expect(trySharedLayerPatch(image, patch)).toEqual({ ...image, ...patch });
    expect(trySharedLayerPatch(image, patch)?.src).toBe(image.src);
  });
  it('preserves existing Web-only controls and ranges without imposing pilot limits', () => {
    const image = makeImageLayer('artifact-asset://before');
    const doc: CanvasDocument = { ...createBlankDocument(), layers: [image] };
    const patch = { src: 'artifact-asset://after', x: 8 };
    expect(trySharedLayerPatch(image, patch)).toBeNull();
    expect(updateLayerInDocument(doc, image.id, patch).layers[0]).toEqual({ ...image, ...patch });
  });
});
