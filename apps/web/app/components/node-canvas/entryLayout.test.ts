import { describe, expect, it } from 'vitest';

import { type CanvasGraph, makeFillLayer, makeGraphMergeNode } from '../../types/config';
import { EXPORT_NODE_ID, estimateNodeHeight, organizeGraph } from '../../utils/nodeGraph';
import { layoutUnpositionedNodes, nodeRectsIntersect } from './entryLayout';

const layers = [makeFillLayer({ id: 'a', name: 'A' }), makeFillLayer({ id: 'b', name: 'B' })];

function graph(positions: CanvasGraph['positions']): CanvasGraph {
  return {
    edges: [
      { id: 'e-a', fromId: 'a', fromPort: 'out', toId: 'm', toPort: 'a' },
      { id: 'e-b', fromId: 'b', fromPort: 'out', toId: 'm', toPort: 'b' },
      { id: 'e-m', fromId: 'm', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
    ],
    positions,
    mergeNodes: [makeGraphMergeNode({ id: 'm', name: 'Merge' })],
    colorNodes: [],
  };
}

describe('layoutUnpositionedNodes', () => {
  it('leaves a graph whose nodes all have stored positions alone', () => {
    const stored = graph({
      a: { x: 0, y: 0 },
      b: { x: 0, y: 500 },
      m: { x: 500, y: 0 },
      [EXPORT_NODE_ID]: { x: 1000, y: 0 },
    });
    expect(layoutUnpositionedNodes(stored, layers, '1:1')).toBeNull();
  });

  it('runs the auto layout when no node has a stored position', () => {
    const empty = graph({});
    expect(layoutUnpositionedNodes(empty, layers, '1:1')).toEqual(organizeGraph(empty, layers, '1:1'));
  });

  it('keeps stored positions and places unpositioned nodes below them', () => {
    const partial = graph({ a: { x: 40, y: 0 }, m: { x: 500, y: 200 }, [EXPORT_NODE_ID]: { x: 1000, y: 0 } });
    const positions = layoutUnpositionedNodes(partial, layers, '1:1')?.positions;

    expect(positions?.a).toEqual({ x: 40, y: 0 });
    expect(positions?.m).toEqual({ x: 500, y: 200 });
    expect(positions?.[EXPORT_NODE_ID]).toEqual({ x: 1000, y: 0 });
    expect(positions?.b?.x).toBe(40);
    expect(positions?.b?.y).toBeGreaterThanOrEqual(200 + estimateNodeHeight('1:1'));
  });
});

describe('nodeRectsIntersect', () => {
  const rect = (id: string, x: number, y: number) => ({ id, x, y, width: 100, height: 100 });

  it('detects overlapping rectangles', () => {
    expect(nodeRectsIntersect([rect('a', 0, 0), rect('b', 50, 50)])).toBe(true);
  });

  it('ignores separate and edge-touching rectangles', () => {
    expect(nodeRectsIntersect([rect('a', 0, 0), rect('b', 100, 0), rect('c', 0, 200)])).toBe(false);
  });
});
