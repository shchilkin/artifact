import { describe, expect, it } from 'vitest';
import {
  type CanvasGraph,
  makeFillLayer,
  makeGraphColorNode,
  makeGraphMergeNode,
  makeTextLayer,
} from '../../types/config';
import { EXPORT_NODE_ID } from '../../utils/nodeGraph';
import { buildLayerDisplayItems } from './layerDisplayItems';

describe('buildLayerDisplayItems', () => {
  it('groups area-backed layers and graph helpers in display order', () => {
    const fill = makeFillLayer({ id: 'fill-a', name: 'Fill A' });
    const text = makeTextLayer({ id: 'text-a', name: 'Text A' });
    const area = {
      id: 'area-a',
      name: 'Area A',
      color: '#ff6b5a',
      nodeIds: ['text-a', 'merge-a', EXPORT_NODE_ID],
    };
    const graph: CanvasGraph = {
      edges: [],
      positions: {},
      mergeNodes: [makeGraphMergeNode({ id: 'merge-a', name: 'Merge A' })],
      colorNodes: [makeGraphColorNode({ id: 'color-a', name: 'Color A' })],
      areas: [area],
    };
    const items = buildLayerDisplayItems([text, fill], new Map([['text-a', [area]]]), graph);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      type: 'area',
      area: { id: 'area-a' },
      layers: [{ id: 'text-a' }],
      graphHelpers: [
        { id: 'merge-a', kind: 'merge', label: 'merge' },
        { id: EXPORT_NODE_ID, kind: 'export', label: 'output' },
      ],
    });
    expect(items[1]).toMatchObject({ type: 'layer', layer: { id: 'fill-a' }, areas: [] });
  });
});
