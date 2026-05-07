import { describe, expect, it } from 'vitest';
import { makeEmojiLayer, makeFillLayer, makeTextLayer } from '../types/config';
import type { CanvasGraph } from '../types/config';
import { EXPORT_NODE_ID, resolveRenderOrder, resolveUpstreamRenderLayers, splitEdgeWithNode } from './nodeGraph';

describe('resolveUpstreamRenderLayers', () => {
  it('returns only the layers reachable from a target merge node in render order', () => {
    const fill = makeFillLayer({ id: 'fill-1' });
    const text = makeTextLayer({ id: 'text-1' });
    const emoji = makeEmojiLayer({ id: 'emoji-1' });
    const graph: CanvasGraph = {
      edges: [
        { id: 'e-fill-merge', fromId: fill.id, fromPort: 'out', toId: 'merge-1', toPort: 'a' },
        { id: 'e-text-emoji', fromId: text.id, fromPort: 'out', toId: emoji.id, toPort: 'bg' },
        { id: 'e-emoji-merge', fromId: emoji.id, fromPort: 'out', toId: 'merge-1', toPort: 'b' },
      ],
      positions: {},
      mergeNodes: [{ id: 'merge-1', name: 'Merge', blendMode: 'source-over', opacity: 100 }],
    };

    expect(resolveUpstreamRenderLayers('merge-1', graph, [fill, text, emoji]).map((layer) => layer.id))
      .toEqual([fill.id, text.id, emoji.id]);
  });
});

describe('resolveRenderOrder', () => {
  it('ignores disconnected layers when walking the export path', () => {
    const fill = makeFillLayer({ id: 'fill-1' });
    const emoji = makeEmojiLayer({ id: 'emoji-1' });
    const orphan = makeTextLayer({ id: 'text-1' });
    const graph: CanvasGraph = {
      edges: [
        { id: 'e-fill-emoji', fromId: fill.id, fromPort: 'out', toId: emoji.id, toPort: 'bg' },
        { id: 'e-emoji-export', fromId: emoji.id, fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {},
      mergeNodes: [],
    };

    expect(resolveRenderOrder(graph, [fill, emoji, orphan]).slice(0, 2).map((layer) => layer.id))
      .toEqual([fill.id, emoji.id]);
  });
});

describe('splitEdgeWithNode', () => {
  it('replaces an edge with source->node and node->target edges', () => {
    const fill = makeFillLayer({ id: 'fill-1' });
    const text = makeTextLayer({ id: 'text-1' });
    const graph: CanvasGraph = {
      edges: [
        { id: 'e-fill-text', fromId: fill.id, fromPort: 'out', toId: text.id, toPort: 'bg' },
      ],
      positions: {},
      mergeNodes: [],
    };

    const next = splitEdgeWithNode(graph, 'e-fill-text', 'fx-1', 'in');

    expect(next.edges).toEqual([
      { id: 'e-fill-text__before', fromId: fill.id, fromPort: 'out', toId: 'fx-1', toPort: 'in' },
      { id: 'e-fill-text__after', fromId: 'fx-1', fromPort: 'out', toId: text.id, toPort: 'bg' },
    ]);
  });
});
