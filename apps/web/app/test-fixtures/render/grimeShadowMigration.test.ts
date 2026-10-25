import { describe, expect, it } from 'vitest';
import { type CanvasDocument, makeDocument, makeFillLayer, makeTextLayer } from '../../types/config';
import { normalizeDocument } from '../../utils/documentPersistence';
import { EXPORT_NODE_ID, graphNodesById } from '../../utils/nodeGraph';
import { makeGraphGrimeShadowNode } from '../../utils/nodeKinds';
import { renderGraphTarget } from '../../utils/renderer';

function legacyDoc(shadow: ReturnType<typeof makeGraphGrimeShadowNode>): CanvasDocument {
  const text = makeTextLayer({ id: 'title', content: 'A', size: 220, color: '#ffffff' });
  return makeDocument({
    schemaVersion: 17,
    global: { bg: 'transparent', seed: 4242, aspect: '1:1' },
    layers: [makeFillLayer({ id: 'ground', color: '#7a5' }), text],
    graph: {
      edges: [
        { id: 'e1', fromId: 'title', fromPort: 'out', toId: shadow.id, toPort: 'in' },
        { id: 'e2', fromId: shadow.id, fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {},
      nodes: graphNodesById(shadow),
    },
    export: { format: 'png', scale: 1, target: 'cover' },
  });
}

describe('Grime Shadow node to Shadow effect migration', () => {
  it.each([
    ['grime', makeGraphGrimeShadowNode({ id: 'shadow-a', seedOffset: 7 })],
    ['drop', makeGraphGrimeShadowNode({ id: 'shadow-b', layers: 1, grime: 0, jitter: 0, blur: 6 })],
    ['shadow only', makeGraphGrimeShadowNode({ id: 'shadow-c', shadowOnly: true })],
  ])('renders the same pixels after migrating a %s shadow', async (_name, node) => {
    const legacy = legacyDoc(node);
    const migrated = normalizeDocument(JSON.parse(JSON.stringify(legacy)));
    const before = await renderGraphTarget(legacy, legacy.graph, EXPORT_NODE_ID, 180, 180, new Map());
    const after = await renderGraphTarget(migrated, migrated.graph, EXPORT_NODE_ID, 180, 180, new Map());

    const textAlone = await renderGraphTarget(legacy, legacy.graph, 'title', 180, 180, new Map());
    expect(before.getContext('2d')!.getImageData(0, 0, 180, 180).data).not.toEqual(
      textAlone.getContext('2d')!.getImageData(0, 0, 180, 180).data,
    );
    expect(migrated.graph.nodes[node.id]).toBeUndefined();
    expect(migrated.layers.find((layer) => layer.id === node.id)?.kind).toBe('effect');
    expect(after.getContext('2d')!.getImageData(0, 0, 180, 180).data).toEqual(
      before.getContext('2d')!.getImageData(0, 0, 180, 180).data,
    );
  });
});
