import { describe, expect, it } from 'vitest';

import type { CanvasGraph } from '../../types/config';
import { makeGraphScene3DNode } from '../../types/config';
import { prunePrimitiveViewStates } from './useEditorPrimitiveExportState';

const viewState = {
  rotationX: 12,
  rotationY: 34,
  zoom: 1.25,
  panX: 0.1,
  panY: -0.2,
};

function emptyGraph(partial: Partial<CanvasGraph> = {}): CanvasGraph {
  return {
    edges: [],
    positions: {},
    mergeNodes: [],
    colorNodes: [],
    ...partial,
  };
}

describe('useEditorPrimitiveExportState', () => {
  it('persists camera state for primitive, model, and 3D scene viewport ids', () => {
    const graph = emptyGraph({
      scene3dNodes: [makeGraphScene3DNode({ id: 'scene-a' })],
    });

    expect(
      prunePrimitiveViewStates(
        {
          'primitive-a': { ...viewState, rotationX: 10 },
          'model-a': { ...viewState, rotationX: 20 },
          'scene-a': { ...viewState, rotationX: 30 },
          stale: { ...viewState, rotationX: 40 },
        },
        [
          { id: 'primitive-a', kind: 'primitive' },
          { id: 'model-a', kind: 'model' },
          { id: 'fill-a', kind: 'fill' },
        ],
        graph,
      ),
    ).toEqual({
      'primitive-a': { ...viewState, rotationX: 10 },
      'model-a': { ...viewState, rotationX: 20 },
      'scene-a': { ...viewState, rotationX: 30 },
    });
  });
});
