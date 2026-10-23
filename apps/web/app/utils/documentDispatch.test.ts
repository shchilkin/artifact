import { describe, expect, it } from 'vitest';
import { type CanvasDocument, DEFAULT_EXPORT, makeDocument, makeFillLayer, makeImageLayer } from '../types/config';
import { GRAPH_EDIT_HISTORY, runDocumentCommand } from './documentDispatch';
import { createDocumentHistoryState, documentHistoryReducer } from './documentHistory';

function doc(): CanvasDocument {
  return makeDocument({
    global: { bg: '#000000', seed: 1, aspect: '1:1' },
    layers: [makeFillLayer({ id: 'fill' }), makeImageLayer('data:image/png;base64,AAA', { id: 'image' })],
    export: DEFAULT_EXPORT,
  });
}

describe('runDocumentCommand', () => {
  it('declares the history policy per command, not per caller', () => {
    expect(runDocumentCommand(doc(), { type: 'toggleLayerVisibility', id: 'fill' }).mode).toBe('snapshot');
    expect(runDocumentCommand(doc(), { type: 'updateLayer', id: 'fill', patch: { opacity: 40 } }).mode).toBe(
      'debounce',
    );
    expect(runDocumentCommand(doc(), { type: 'renameArea', areaId: 'none', name: 'x' }).mode).toBe('snapshot');
  });

  it('gives each graph edit kind its policy, and only automatic placement is silent', () => {
    const silent = Object.entries(GRAPH_EDIT_HISTORY).filter(([, mode]) => mode === 'silent');
    expect(silent.map(([kind]) => kind)).toEqual(['place']);
    const current = doc();
    expect(runDocumentCommand(current, { type: 'editGraph', graph: current.graph, edit: 'connect' }).mode).toBe(
      'snapshot',
    );
  });

  it('selects an added layer and reports removed ids', () => {
    const layer = makeFillLayer({ id: 'added' });
    expect(runDocumentCommand(doc(), { type: 'addLayer', layer }).select).toBe('added');
    expect(runDocumentCommand(doc(), { type: 'deleteNodes', ids: ['fill'] }).removed).toEqual(['fill']);
  });

  it('keeps a document that changed while its assets were stored', () => {
    const source = doc();
    const edited = { ...source, global: { ...source.global, seed: 9 } };
    const stored = { ...source, layers: [] };
    expect(runDocumentCommand(edited, { type: 'storeDocumentAssets', source, stored }).doc).toBe(edited);
    expect(runDocumentCommand(source, { type: 'storeDocumentAssets', source, stored }).doc).toBe(stored);
  });

  it('moves placed cards in history entries too, so undo does not bring back the old layout', () => {
    const start = doc();
    let state = createDocumentHistoryState(start);
    const renamed = runDocumentCommand(start, { type: 'renameLayer', id: 'fill', name: 'Base' });
    state = documentHistoryReducer(state, { type: 'commit', doc: renamed.doc, mode: 'snapshot' });

    const placedGraph = { ...renamed.doc.graph, positions: { ...renamed.doc.graph.positions, fill: { x: 40, y: 90 } } };
    const placed = runDocumentCommand(state.doc, { type: 'editGraph', graph: placedGraph, edit: 'place' });
    expect(placed.mode).toBe('silent');
    state = documentHistoryReducer(state, { type: 'commit', doc: placed.doc, mode: 'silent', amend: placed.amend });

    const undone = documentHistoryReducer(state, { type: 'undo' });
    expect(undone.doc.layers[0].name).not.toBe('Base');
    expect(undone.doc.graph.positions.fill).toEqual({ x: 40, y: 90 });
  });

  it('swaps a stored image source in history entries that still embed it', () => {
    const start = doc();
    let state = createDocumentHistoryState(start);
    const moved = runDocumentCommand(start, { type: 'updateLayer', id: 'fill', patch: { opacity: 10 } });
    state = documentHistoryReducer(state, { type: 'commit', doc: moved.doc, mode: 'snapshot' });
    const stored = runDocumentCommand(state.doc, {
      type: 'storeImageAsset',
      id: 'image',
      src: 'artifact-asset://image-1',
      previousSrc: 'data:image/png;base64,AAA',
    });
    state = documentHistoryReducer(state, { type: 'commit', doc: stored.doc, mode: 'silent', amend: stored.amend });

    const image = (d: CanvasDocument) => d.layers.find((layer) => layer.id === 'image');
    expect(image(state.doc)).toMatchObject({ src: 'artifact-asset://image-1' });
    expect(image(state.past[0].doc)).toMatchObject({ src: 'artifact-asset://image-1' });
  });
});
