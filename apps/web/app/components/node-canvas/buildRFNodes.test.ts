import { describe, expect, it } from 'vitest';

import type { CanvasDocument, CanvasGraph, Layer } from '../../types/config';
import { buildRFNodes } from './buildRFNodes';

function graphFixture(): CanvasGraph {
  return {
    edges: [],
    positions: { future: { x: 12, y: 34 } },
    mergeNodes: [],
    colorNodes: [],
  };
}

function documentWithLayer(layer: Layer): CanvasDocument {
  return {
    schemaVersion: 1,
    global: { bg: 'transparent', seed: 1, aspect: '1:1' },
    layers: [layer],
    export: { format: 'png', scale: 1, target: 'cover' },
  };
}

describe('buildRFNodes', () => {
  it('uses a fallback node for unsupported runtime layer kinds', () => {
    const nodes = buildRFNodes(
      documentWithLayer({ id: 'future', name: 'Future Node', kind: 'futureThing' } as unknown as Layer),
      graphFixture(),
      new Set(),
      null,
      new Set(),
      { sources: new Set(), targets: new Set() },
      {},
      {},
    );

    expect(nodes[0]).toMatchObject({
      id: 'future',
      type: 'fallbackNode',
      position: { x: 12, y: 34 },
      data: { id: 'future', name: 'Future Node', label: 'futureThing' },
    });
  });
});
