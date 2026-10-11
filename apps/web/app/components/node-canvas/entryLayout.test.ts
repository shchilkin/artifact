import { describe, expect, it } from 'vitest';

import { type CanvasGraph, makeFillLayer, makeGraphMergeNode } from '../../types/config';
import { EXPORT_NODE_ID, estimateNodeHeight, organizeGraph } from '../../utils/nodeGraph';
import { layoutUnpositionedNodes, resolveOverlappingNodes } from './entryLayout';

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

describe('resolveOverlappingNodes', () => {
  const card = (id: string, x: number, y: number) => ({ id, x, y, width: 320, height: 400 });
  const stored = graph({
    a: { x: 0, y: 0 },
    b: { x: 100, y: 100 },
    m: { x: 600, y: 0 },
    [EXPORT_NODE_ID]: { x: 1200, y: 0 },
  });

  it('returns null when no cards intersect', () => {
    const rects = [card('a', 0, 0), card('b', 0, 500), card('m', 600, 0), card(EXPORT_NODE_ID, 1200, 0)];
    expect(resolveOverlappingNodes(stored, layers, '1:1', rects)).toBeNull();
  });

  it('moves only the card that overlaps a kept card, below every kept card', () => {
    const rects = [card('a', 0, 0), card('b', 100, 100), card('m', 600, 0), card(EXPORT_NODE_ID, 1200, 0)];
    const positions = resolveOverlappingNodes(stored, layers, '1:1', rects)?.positions;

    expect(positions?.a).toEqual({ x: 0, y: 0 });
    expect(positions?.m).toEqual({ x: 600, y: 0 });
    expect(positions?.[EXPORT_NODE_ID]).toEqual({ x: 1200, y: 0 });
    expect(positions?.b?.x).toBe(0);
    expect(positions?.b?.y).toBeGreaterThanOrEqual(400);
  });
});
