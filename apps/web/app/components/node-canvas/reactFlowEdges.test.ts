import { describe, expect, it } from 'vitest';
import type { CanvasGraph } from '../../types/config';
import { toRFEdges } from './reactFlowEdges';

function makeGraph(): CanvasGraph {
  return {
    edges: [
      { id: 'e-layer-merge', fromId: 'layer-a', fromPort: 'out', toId: 'merge-a', toPort: 'a' },
      { id: 'e-merge-color', fromId: 'merge-a', fromPort: 'out', toId: 'color-a', toPort: 'in' },
      { id: 'e-color-export', fromId: 'color-a', fromPort: 'out', toId: '__export__', toPort: 'in' },
    ],
    positions: {},
    mergeNodes: [{ id: 'merge-a', name: 'Merge', blendMode: 'source-over', opacity: 100 }],
    colorNodes: [{ id: 'color-a', name: 'Color', contrast: 100, brightness: 100, saturation: 100, hue: 0 }],
  };
}

describe('toRFEdges', () => {
  it('maps serializable graph edges to React Flow edge handles', () => {
    expect(toRFEdges(makeGraph())).toMatchObject([
      {
        id: 'e-layer-merge',
        source: 'layer-a',
        sourceHandle: 'out',
        target: 'merge-a',
        targetHandle: 'a',
        type: 'smoothstep',
      },
      {
        id: 'e-merge-color',
        source: 'merge-a',
        sourceHandle: 'out',
        target: 'color-a',
        targetHandle: 'in',
        type: 'smoothstep',
      },
      {
        id: 'e-color-export',
        source: 'color-a',
        sourceHandle: 'out',
        target: '__export__',
        targetHandle: 'in',
        type: 'smoothstep',
      },
    ]);
  });

  it('uses distinct visual colors for layer, merge, and color outputs', () => {
    const [layerEdge, mergeEdge, colorEdge] = toRFEdges(makeGraph());

    expect(layerEdge?.style?.stroke).toBe('oklch(64% 0.22 305)');
    expect(mergeEdge?.style?.stroke).toBe('oklch(74% 0.17 152)');
    expect(colorEdge?.style?.stroke).toBe('oklch(72% 0.18 195)');
  });
});
