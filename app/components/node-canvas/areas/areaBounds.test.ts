import { describe, expect, it } from 'vitest';

import type { CanvasGraph } from '../../../types/config';
import { getGraphAreaBounds } from './areaBounds';

describe('getGraphAreaBounds', () => {
  const graph: CanvasGraph = {
    edges: [],
    positions: {
      a: { x: 100, y: 80 },
      b: { x: 520, y: 120 },
    },
    mergeNodes: [],
    colorNodes: [],
    areas: [{ id: 'area-1', name: 'Main branch', color: '#ff705f', nodeIds: ['a', 'b'] }],
  };

  it('wraps all nodes assigned to an area', () => {
    const [bounds] = getGraphAreaBounds(graph, [
      { id: 'a', position: { x: 100, y: 80 }, data: {}, measured: { width: 320, height: 300 } },
      { id: 'b', position: { x: 520, y: 120 }, data: {}, measured: { width: 340, height: 360 } },
    ]);

    expect(bounds).toMatchObject({
      x: 68,
      y: 28,
      width: 824,
      height: 480,
      nodeCount: 2,
    });
  });

  it('falls back to graph positions when live node data is unavailable', () => {
    const [bounds] = getGraphAreaBounds(graph, []);

    expect(bounds.nodeCount).toBe(2);
    expect(bounds.width).toBeGreaterThan(700);
  });

  it('omits empty areas', () => {
    const result = getGraphAreaBounds({ ...graph, areas: [{ ...graph.areas![0], nodeIds: ['missing'] }] }, []);

    expect(result).toHaveLength(0);
  });

  it('uses first area membership when legacy data contains overlapping nodes', () => {
    const result = getGraphAreaBounds(
      {
        ...graph,
        areas: [
          { id: 'area-1', name: 'Main branch', color: '#ff705f', nodeIds: ['a'] },
          { id: 'area-2', name: 'Other branch', color: '#8d5cff', nodeIds: ['a', 'b'] },
        ],
      },
      [],
    );

    expect(result.map((bounds) => [bounds.area.id, bounds.nodeCount])).toEqual([
      ['area-1', 1],
      ['area-2', 1],
    ]);
  });
});
