import type { NodeChange, Node as RFNode } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { retainNodeMeasurements, sameNodeList, stableNodeChanges } from './nodeChanges';

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

describe('retainNodeMeasurements', () => {
  it('keeps React Flow measurements when canonical nodes are rebuilt', () => {
    const next: RFNode = {
      id: 'node-a',
      type: 'layerNode',
      position: { x: 20, y: 30 },
      data: {},
    };

    expect(retainNodeMeasurements([next], [node], { width: 320, height: 360 })).toEqual([
      {
        ...next,
        measured: { width: 320, height: 220 },
      },
    ]);
  });

  it('seeds new nodes with a fallback measurement until ResizeObserver reports real dimensions', () => {
    const next: RFNode = {
      id: 'node-b',
      type: 'layerNode',
      position: { x: 20, y: 30 },
      data: {},
    };

    expect(retainNodeMeasurements([next], [], { width: 320, height: 360 })).toEqual([
      {
        ...next,
        measured: { width: 320, height: 360 },
      },
    ]);
  });
});

describe('sameNodeList', () => {
  it('treats rebuilt nodes with equivalent shallow data as unchanged', () => {
    const connected = { sources: new Set<string>(), targets: new Set<string>() };
    const first: RFNode = {
      ...node,
      data: { layer: { id: 'layer-a' }, connected, selected: true },
      selected: true,
    };
    const rebuilt: RFNode = {
      ...node,
      data: { layer: first.data.layer, connected, selected: true },
      selected: true,
    };

    expect(sameNodeList([first], [rebuilt])).toBe(true);
  });

  it('detects real selection and data changes', () => {
    expect(sameNodeList([node], [{ ...node, selected: true }])).toBe(false);
    expect(sameNodeList([node], [{ ...node, data: { changed: true } }])).toBe(false);
  });
});
