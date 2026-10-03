import { describe, expect, it } from 'vitest';

import {
  type CanvasDocument,
  type CanvasGraph,
  makeEffectPresetLayer,
  makeFillLayer,
  makeGraphColorNode,
  makeImageLayer,
} from '../types/config';
import { createGraphNodeRenderCache } from './graphNodeRenderCache';
import { EXPORT_NODE_ID, inferLinearGraph } from './nodeGraph';

const SIZE = { width: 280, height: 280 };

function makeDoc(layers: CanvasDocument['layers'], graph?: CanvasGraph): CanvasDocument {
  return {
    global: { bg: '#120020', seed: 7, aspect: '1:1' },
    layers,
    graph: graph ?? inferLinearGraph(layers),
    export: { format: 'png', scale: 1, target: 'cover' },
  };
}

function keysFor(doc: CanvasDocument, imageCache = new Map<string, HTMLImageElement>()) {
  const cache = createGraphNodeRenderCache(doc, doc.graph!, imageCache, new Map(), SIZE);
  return { cache, key: (id: string) => cache.entryKey?.(id) };
}

describe('createGraphNodeRenderCache', () => {
  const fill = makeFillLayer({ id: 'fill', color: '#ff0000' });
  const grain = makeEffectPresetLayer('grain', { id: 'grain', grain: 12 });
  const scanlines = makeEffectPresetLayer('scanlines', { id: 'scanlines', scanlines: 20 });

  it('keeps upstream keys and changes the edited node and everything downstream', () => {
    const before = keysFor(makeDoc([fill, grain, scanlines]));
    const after = keysFor(makeDoc([fill, { ...grain, grain: 40 }, scanlines]));

    expect(after.key('fill')).toBe(before.key('fill'));
    expect(after.key('grain')).not.toBe(before.key('grain'));
    expect(after.key('scanlines')).not.toBe(before.key('scanlines'));
    expect(after.key(EXPORT_NODE_ID)).not.toBe(before.key(EXPORT_NODE_ID));
  });

  it('does not change keys for edits outside a node’s upstream branch', () => {
    const color = makeGraphColorNode({ id: 'color' });
    const graph = inferLinearGraph([fill, grain]);
    const docBefore = makeDoc([fill, grain], { ...graph, colorNodes: [color] });
    const docAfter = makeDoc([fill, grain], { ...graph, colorNodes: [{ ...color, hue: 40 }] });

    expect(keysFor(docAfter).key('grain')).toBe(keysFor(docBefore).key('grain'));
  });

  it('puts shared render inputs in the namespace', () => {
    const doc = makeDoc([fill, grain]);
    const reseeded = { ...doc, global: { ...doc.global, seed: 8 } };

    expect(keysFor(reseeded).cache.namespace).not.toBe(keysFor(doc).cache.namespace);
    expect(keysFor(reseeded).key('fill')).toBe(keysFor(doc).key('fill'));
  });

  it('changes an image node key when its image finishes loading', () => {
    const image = makeImageLayer('artifact-asset://cover', { id: 'cover' });
    const doc = makeDoc([image, grain]);
    const loaded = new Map([['artifact-asset://cover', { naturalWidth: 64, naturalHeight: 32 } as HTMLImageElement]]);

    expect(keysFor(doc, loaded).key('cover')).not.toBe(keysFor(doc).key('cover'));
    expect(keysFor(doc, loaded).key('grain')).not.toBe(keysFor(doc).key('grain'));
  });

  it('changes keys when an input edge moves to another source', () => {
    const graph = inferLinearGraph([fill, grain, scanlines]);
    const rewired: CanvasGraph = {
      ...graph,
      edges: graph.edges.map((edge) => (edge.toId === 'scanlines' ? { ...edge, fromId: 'fill' } : edge)),
    };

    expect(keysFor(makeDoc([fill, grain, scanlines], rewired)).key('scanlines')).not.toBe(
      keysFor(makeDoc([fill, grain, scanlines], graph)).key('scanlines'),
    );
  });

  it('never reuses unknown nodes across render sessions', () => {
    const doc = makeDoc([fill]);
    const first = keysFor(doc).key('missing-node');
    const second = keysFor(doc).key('missing-node');

    expect(first).not.toBe(second);
  });
});
