import type { NodeChange, Node as RFNode } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { stableNodeChanges } from './nodeChanges';

const node: RFNode = {
  id: 'node-a',
  type: 'layerNode',
  position: { x: 0, y: 0 },
  measured: { width: 320, height: 220 },
  resizing: false,
  data: {},
};

describe('stableNodeChanges', () => {
  it('keeps position and selection changes live for drag responsiveness', () => {
    const changes: NodeChange[] = [
      { id: 'node-a', type: 'position', position: { x: 20, y: 30 }, dragging: true },
      { id: 'node-a', type: 'select', selected: true },
    ];

    expect(stableNodeChanges(changes, [node])).toEqual(changes);
  });

  it('drops repeated dimension changes that match measured node size', () => {
    const changes: NodeChange[] = [
      { id: 'node-a', type: 'dimensions', dimensions: { width: 320, height: 220 }, resizing: false },
    ];

    expect(stableNodeChanges(changes, [node])).toEqual([]);
  });

  it('keeps real dimension changes so React Flow can initialize handles and bounds', () => {
    const changes: NodeChange[] = [
      { id: 'node-a', type: 'dimensions', dimensions: { width: 340, height: 220 }, resizing: false },
    ];

    expect(stableNodeChanges(changes, [node])).toEqual(changes);
  });
});
