import { describe, expect, it } from 'vitest';

import type { CanvasGraph } from '../../types/config';
import { EXPORT_NODE_ID } from '../../utils/nodeGraph';
import { inputPortForAddedAction, resolveEdgeInsertion, resolveNearestEdgeInsertionTarget } from './graphInsertion';

const graph: CanvasGraph = {
  edges: [
    { id: 'e-fill-text', fromId: 'fill-a', fromPort: 'out', toId: 'text-a', toPort: 'bg' },
    { id: 'e-text-export', fromId: 'text-a', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
  ],
  positions: {
    'fill-a': { x: 0, y: 80 },
    'text-a': { x: 500, y: 80 },
    [EXPORT_NODE_ID]: { x: 1000, y: 80 },
  },
  mergeNodes: [],
  colorNodes: [],
  repeatNodes: [],
};

describe('graphInsertion', () => {
  it('maps add actions to the input port used by inserted nodes', () => {
    expect(inputPortForAddedAction({ kind: 'effect', preset: 'pixelate' })).toBe('in');
    expect(inputPortForAddedAction({ kind: 'color' })).toBe('in');
    expect(inputPortForAddedAction({ kind: 'repeatPreset', preset: 'stickerGrid' })).toBe('in');
    expect(inputPortForAddedAction({ kind: 'merge' })).toBe('a');
    expect(inputPortForAddedAction({ kind: 'layer', layerKind: 'text' })).toBe('bg');
    expect(inputPortForAddedAction({ kind: 'noisePreset', preset: 'crtDirt' })).toBe('bg');
  });

  it('converts an edge into a replace-edge insertion config', () => {
    expect(resolveEdgeInsertion({ kind: 'effect', preset: 'grain' }, graph.edges[0])).toEqual({
      sourceId: 'fill-a',
      targetId: 'text-a',
      targetPort: 'bg',
      replaceEdgeId: 'e-fill-text',
    });
  });

  it('resolves the nearest edge to a graph-space drop point', () => {
    const target = resolveNearestEdgeInsertionTarget({
      action: { kind: 'effect', preset: 'scanlines' },
      graph,
      nodes: [
        { id: 'fill-a', position: { x: 0, y: 80 }, measured: { width: 320, height: 360 } },
        { id: 'text-a', position: { x: 500, y: 80 }, measured: { width: 320, height: 360 } },
        { id: EXPORT_NODE_ID, position: { x: 1000, y: 80 }, measured: { width: 320, height: 360 } },
      ],
      point: { x: 410, y: 260 },
      threshold: 64,
    });

    expect(target?.edge.id).toBe('e-fill-text');
    expect(target?.insertion).toMatchObject({ replaceEdgeId: 'e-fill-text', sourceId: 'fill-a', targetId: 'text-a' });
  });

  it('returns null when the drop point is not close enough to an edge', () => {
    expect(
      resolveNearestEdgeInsertionTarget({
        action: { kind: 'effect', preset: 'scanlines' },
        graph,
        nodes: [],
        point: { x: 410, y: 640 },
        threshold: 64,
      }),
    ).toBeNull();
  });
});
